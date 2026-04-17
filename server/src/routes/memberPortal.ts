import { Router } from "express";
import { randomUUID } from "crypto";
import fs from "fs";
import path from "path";
import bcrypt from "bcryptjs";
import multer from "multer";
import { prisma } from "../db.js";
import {
  billingReady,
  checkoutLineConfig,
  getOrgBilling,
  getStripeClient,
} from "../lib/billingSettings.js";
import { documentIssuerFromMember } from "../lib/documentIssuer.js";
import { memberProfileLogoFilePath, memberProfileLogoDir } from "../lib/memberProfileLogoPaths.js";
import { memberToPublic } from "../lib/memberSerialize.js";
// import { isMemberPublicListingVisible, membershipSummaryForMember } from "../lib/memberMembership.js";
import { requireMember } from "../middleware/requireMember.js";
import { requireMemberMembershipActive } from "../middleware/requireMemberMembershipActive.js";
// import memberCrmRoutes from "./memberCrmRoutes.js";

const UPLOAD_ROOT =
  process.env.MEMBER_UPLOAD_DIR?.trim() ||
  path.join(process.cwd(), "uploads", "member-documents");

const ALLOWED_DOC_MIME = new Set([
  "application/pdf",
  "image/png",
  "image/jpeg",
  "image/webp",
  "image/gif",
]);

const MAX_DOC_BYTES = 10 * 1024 * 1024;

function memberDocDir(memberId: string) {
  return path.join(UPLOAD_ROOT, memberId);
}

function ensureMemberDocDir(memberId: string) {
  const dir = memberDocDir(memberId);
  fs.mkdirSync(dir, { recursive: true });
  return dir;
}

const docStorage = multer.diskStorage({
  destination: (req, _file, cb) => {
    const memberId = (req as unknown as { memberId: string }).memberId;
    try {
      cb(null, ensureMemberDocDir(memberId));
    } catch (e) {
      cb(e as Error, UPLOAD_ROOT);
    }
  },
  filename: (_req, file, cb) => {
    const ext = path.extname(file.originalname || "").slice(0, 12) || "";
    cb(null, `${randomUUID()}${ext}`);
  },
});

const docUpload = multer({
  storage: docStorage,
  limits: { fileSize: MAX_DOC_BYTES },
  fileFilter: (_req, file, cb) => {
    if (ALLOWED_DOC_MIME.has(file.mimetype)) {
      cb(null, true);
      return;
    }
    cb(new Error("Only PDF and common image types are allowed"));
  },
});

const profileLogoUpload = multer({
  storage: multer.diskStorage({
    destination: (req, _file, cb) => {
      const memberId = (req as unknown as { memberId: string }).memberId;
      cb(null, memberProfileLogoDir(memberId));
    },
    filename: (_req, file, cb) => {
      const ext = path.extname(file.originalname || "").toLowerCase();
      const useExt = [".png", ".jpg", ".jpeg", ".webp"].includes(ext)
        ? ext
        : ".png";
      cb(null, `${randomUUID()}${useExt}`);
    },
  }),
  limits: { fileSize: 2 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    if (
      file.mimetype === "image/png" ||
      file.mimetype === "image/jpeg" ||
      file.mimetype === "image/webp"
    ) {
      cb(null, true);
      return;
    }
    cb(new Error("Use PNG, JPEG, or WebP for your profile logo"));
  },
});

const router = Router();
router.use(requireMember);

async function siteOrigin(req: {
  get: (h: string) => string | undefined;
}) {
  const fromHeader = req.get("origin")?.trim();
  if (fromHeader) return fromHeader.replace(/\/$/, "");
  const org = await prisma.organizationSettings.findUnique({
    where: { id: "default" },
    select: { publicSiteUrl: true },
  });
  const fromDb = org?.publicSiteUrl?.trim();
  const fromEnv = process.env.PUBLIC_SITE_URL?.trim();
  const u = fromDb || fromEnv || "http://localhost:5173";
  return u.replace(/\/$/, "");
}

router.get("/me", async (req, res) => {
  try {
    const memberId = (req as unknown as { memberId: string }).memberId;
    const m = await prisma.member.findUnique({ where: { id: memberId } });
    if (!m) {
      res.status(404).json({ error: "Account not found" });
      return;
    }
    const profile = memberToPublic(m);
    const membership = membershipSummaryForMember({
      membershipUnlimited: m.membershipUnlimited,
      membershipBillingType: m.membershipBillingType,
      membershipExpiresAt: m.membershipExpiresAt,
      stripeSubscriptionStatus: m.stripeSubscriptionStatus,
    });
    const profileLive = isMemberPublicListingVisible({
      membershipUnlimited: m.membershipUnlimited,
      membershipBillingType: m.membershipBillingType,
      membershipExpiresAt: m.membershipExpiresAt,
      stripeSubscriptionStatus: m.stripeSubscriptionStatus,
    });
    res.json({
      memberId: m.id,
      profile,
      profileLive,
      loginEmail: m.loginEmail,
      publicProfileUrl: `/m/${m.slug}`,
      mustChangePassword: m.mustChangePassword,
      membership,
      documentBranding: {
        ...documentIssuerFromMember(m),
        documentAccentHex: m.documentAccentHex?.trim() || null,
        documentLayout:
          m.documentLayout === "bold" ? "bold" : "standard",
        invoiceAddress: m.invoiceAddress ?? "",
        invoiceBankDetails: m.invoiceBankDetails ?? "",
        invoicePhone: m.invoicePhone ?? "",
        invoiceEmail: m.invoiceEmail ?? "",
        vatNumber: m.vatNumber ?? "",
        vatRegistered: Boolean(m.vatRegistered),
      },
    });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: "Could not load profile" });
  }
});

router.post("/membership/stripe-checkout", async (req, res) => {
  try {
    const memberId = (req as unknown as { memberId: string }).memberId;
    const m = await prisma.member.findUnique({ where: { id: memberId } });
    if (!m?.loginEmail?.trim()) {
      res.status(400).json({ error: "No login email on file" });
      return;
    }
    const settings = await getOrgBilling();
    if (!billingReady(settings)) {
      res.status(400).json({ error: "Online billing is not enabled" });
      return;
    }
    const stripe = await getStripeClient();
    if (!stripe) {
      res.status(400).json({ error: "Stripe is not configured" });
      return;
    }
    const origin = await siteOrigin(req);
    const lines = checkoutLineConfig(settings);
    const session = await stripe.checkout.sessions.create({
      mode: "subscription",
      ...(m.stripeCustomerId
        ? { customer: m.stripeCustomerId }
        : { customer_email: m.loginEmail.trim().toLowerCase() }),
      line_items: [
        {
          price_data: {
            currency: "gbp",
            product_data: { name: lines.membershipName },
            unit_amount: lines.membershipPence,
            recurring: { interval: "month" },
          },
          quantity: 1,
        },
      ],
      success_url: `${origin}/member/membership?checkout=success`,
      cancel_url: `${origin}/member/membership?checkout=cancelled`,
      metadata: {
        checkoutKind: "member_portal_subscription",
        memberId,
      },
      subscription_data: {
        metadata: {
          memberId,
          checkoutKind: "member_portal_subscription",
        },
      },
    });
    if (!session.url) {
      res.status(500).json({ error: "Could not create checkout session" });
      return;
    }
    res.json({ url: session.url });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: "Could not start checkout" });
  }
});

router.post(
  "/profile-logo",
  requireMemberMembershipActive,
  (req, res, next) => {
    profileLogoUpload.single("logo")(req, res, (err: unknown) => {
      if (err) {
        res.status(400).json({
          error: err instanceof Error ? err.message : "Upload failed",
        });
        return;
      }
      next();
    });
  },
  async (req, res) => {
    try {
      const memberId = (req as unknown as { memberId: string }).memberId;
      const file = (req as { file?: { filename: string } }).file;
      if (!file?.filename) {
        res.status(400).json({ error: "logo file is required (field name: logo)" });
        return;
      }
      const existing = await prisma.member.findUnique({
        where: { id: memberId },
        select: { profileLogoStoredName: true },
      });
      if (existing?.profileLogoStoredName) {
        try {
          fs.unlink(
            memberProfileLogoFilePath(memberId, existing.profileLogoStoredName),
            () => {}
          );
        } catch {
          /* ignore */
        }
      }
      const updated = await prisma.member.update({
        where: { id: memberId },
        data: { profileLogoStoredName: file.filename },
      });
      res.json({ profile: memberToPublic(updated) });
    } catch (e) {
      console.error(e);
      res.status(500).json({ error: "Could not save logo" });
    }
  }
);

router.delete("/profile-logo", requireMemberMembershipActive, async (req, res) => {
  try {
    const memberId = (req as unknown as { memberId: string }).memberId;
    const existing = await prisma.member.findUnique({
      where: { id: memberId },
      select: { profileLogoStoredName: true },
    });
    if (existing?.profileLogoStoredName) {
      try {
        fs.unlink(
          memberProfileLogoFilePath(memberId, existing.profileLogoStoredName),
          () => {}
        );
      } catch {
        /* ignore */
      }
    }
    const updated = await prisma.member.update({
      where: { id: memberId },
      data: { profileLogoStoredName: null },
    });
    res.json({ profile: memberToPublic(updated) });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: "Could not remove logo" });
  }
});

/** Fields members may update themselves (verification data stays staff-only) */
router.put("/profile", requireMemberMembershipActive, async (req, res) => {
  try {
    const memberId = (req as unknown as { memberId: string }).memberId;
    const {
      name,
      trade,
      location,
      blurb,
      documentAccentHex,
      invoiceAddress,
      invoiceBankDetails,
      invoicePhone,
      invoiceEmail,
      vatNumber,
      vatRegistered,
      documentLayout,
    } = req.body ?? {};
    if (
      name === undefined ||
      trade === undefined ||
      location === undefined ||
      blurb === undefined
    ) {
      res.status(400).json({
        error: "name, trade, location, and blurb are required",
      });
      return;
    }
    const hexRaw =
      documentAccentHex !== undefined
        ? String(documentAccentHex).trim()
        : undefined;
    if (
      hexRaw !== undefined &&
      hexRaw !== "" &&
      !/^#[0-9A-Fa-f]{6}$/.test(hexRaw)
    ) {
      res.status(400).json({
        error:
          "Accent colour must be a hex value like #0d9488 (6 digits after #)",
      });
      return;
    }
    const m = await prisma.member.update({
      where: { id: memberId },
      data: {
        name: String(name).trim(),
        trade: String(trade).trim(),
        location: String(location).trim(),
        blurb: String(blurb).trim(),
        ...(documentAccentHex !== undefined
          ? {
              documentAccentHex:
                hexRaw === "" ? null : hexRaw!.toLowerCase(),
            }
          : {}),
        ...(invoiceAddress !== undefined
          ? {
              invoiceAddress:
                String(invoiceAddress ?? "").trim() || null,
            }
          : {}),
        ...(invoiceBankDetails !== undefined
          ? {
              invoiceBankDetails:
                String(invoiceBankDetails ?? "").trim() || null,
            }
          : {}),
        ...(invoicePhone !== undefined
          ? { invoicePhone: String(invoicePhone ?? "").trim() || null }
          : {}),
        ...(invoiceEmail !== undefined
          ? { invoiceEmail: String(invoiceEmail ?? "").trim() || null }
          : {}),
        ...(vatNumber !== undefined
          ? { vatNumber: String(vatNumber ?? "").trim() || null }
          : {}),
        ...(vatRegistered !== undefined
          ? { vatRegistered: Boolean(vatRegistered) }
          : {}),
        ...(documentLayout !== undefined
          ? {
              documentLayout: (() => {
                const v = String(documentLayout ?? "")
                  .trim()
                  .toLowerCase();
                if (v === "bold" || v === "standard") return v;
                return null;
              })(),
            }
          : {}),
      },
    });
    res.json({ profile: memberToPublic(m) });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: "Could not update profile" });
  }
});

router.post("/change-password", async (req, res) => {
  try {
    const memberId = (req as unknown as { memberId: string }).memberId;
    const current = String(req.body?.currentPassword ?? "");
    const next = String(req.body?.newPassword ?? "");
    if (!current || !next) {
      res.status(400).json({ error: "Current and new passwords are required" });
      return;
    }
    if (next.length < 10) {
      res
        .status(400)
        .json({ error: "New password must be at least 10 characters" });
      return;
    }
    const m = await prisma.member.findUnique({ where: { id: memberId } });
    if (!m?.passwordHash) {
      res.status(400).json({ error: "Portal password is not set" });
      return;
    }
    const ok = await bcrypt.compare(current, m.passwordHash);
    if (!ok) {
      res.status(401).json({ error: "Current password is incorrect" });
      return;
    }
    const passwordHash = await bcrypt.hash(next, 12);
    await prisma.$transaction([
      prisma.member.update({
        where: { id: memberId },
        data: { passwordHash, mustChangePassword: false },
      }),
      prisma.application.updateMany({
        where: { createdMemberId: memberId },
        data: {
          pendingPortalPassword: null,
          pendingPortalPasswordExpires: null,
        },
      }),
    ]);
    res.json({ ok: true });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: "Could not change password" });
  }
});

router.get("/documents", requireMemberMembershipActive, async (req, res) => {
  try {
    const memberId = (req as unknown as { memberId: string }).memberId;
    const rows = await prisma.memberDocument.findMany({
      where: { memberId },
      orderBy: { createdAt: "desc" },
    });
    res.json({
      documents: rows.map((d) => ({
        id: d.id,
        originalName: d.originalName,
        mimeType: d.mimeType,
        sizeBytes: d.sizeBytes,
        createdAt: d.createdAt.toISOString(),
      })),
    });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: "Could not list documents" });
  }
});

router.post("/documents", requireMemberMembershipActive, (req, res, next) => {
  docUpload.single("file")(req, res, (err) => {
    if (err instanceof multer.MulterError) {
      if (err.code === "LIMIT_FILE_SIZE") {
        res.status(400).json({ error: "File too large (max 10 MB)" });
        return;
      }
      res.status(400).json({ error: err.message });
      return;
    }
    if (err) {
      res.status(400).json({
        error: err instanceof Error ? err.message : "Upload failed",
      });
      return;
    }
    next();
  });
}, async (req, res) => {
  try {
    const memberId = (req as unknown as { memberId: string }).memberId;
    const file = req.file;
    if (!file) {
      res.status(400).json({ error: "file is required" });
      return;
    }
    const row = await prisma.memberDocument.create({
      data: {
        memberId,
        storedName: file.filename,
        originalName: file.originalname.slice(0, 255) || "upload",
        mimeType: file.mimetype,
        sizeBytes: file.size,
      },
    });
    res.status(201).json({
      document: {
        id: row.id,
        originalName: row.originalName,
        mimeType: row.mimeType,
        sizeBytes: row.sizeBytes,
        createdAt: row.createdAt.toISOString(),
      },
    });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: "Could not save document" });
  }
});

router.get(
  "/documents/:id/file",
  requireMemberMembershipActive,
  async (req, res) => {
    try {
    const memberId = (req as unknown as { memberId: string }).memberId;
    const doc = await prisma.memberDocument.findFirst({
      where: { id: req.params.id, memberId },
    });
    if (!doc) {
      res.status(404).json({ error: "Not found" });
      return;
    }
    const filePath = path.join(memberDocDir(memberId), doc.storedName);
    const resolved = path.resolve(filePath);
    const base = path.resolve(memberDocDir(memberId));
    if (!resolved.startsWith(base) || !fs.existsSync(resolved)) {
      res.status(404).json({ error: "Not found" });
      return;
    }
    res.setHeader(
      "Content-Disposition",
      `attachment; filename="${encodeURIComponent(doc.originalName).replace(/'/g, "%27")}"`
    );
    res.type(doc.mimeType);
    res.sendFile(resolved);
    } catch (e) {
      console.error(e);
      res.status(500).json({ error: "Could not download file" });
    }
  }
);

async function invoiceBrandingPayload() {
  const org = await getOrgBilling();
  return {
    hasLogo: Boolean(org.brandingLogoStoredName?.trim()),
    legalName: org.invoiceLegalName?.trim() || null,
    vatNumber: org.invoiceVatNumber?.trim() || null,
    address: org.invoiceAddress?.trim() || null,
    footerNote: org.invoiceFooterNote?.trim() || null,
  };
}

/** Stripe invoices & Customer Portal (read-only list; payment method changes in Stripe). */
router.get("/invoices", async (req, res) => {
  try {
    const memberId = (req as unknown as { memberId: string }).memberId;
    const branding = await invoiceBrandingPayload();
    const m = await prisma.member.findUnique({
      where: { id: memberId },
      select: { stripeCustomerId: true },
    });
    if (!m?.stripeCustomerId?.trim()) {
      res.json({
        invoices: [] as Array<Record<string, unknown>>,
        stripeCustomerId: null as string | null,
        branding,
      });
      return;
    }
    const stripe = await getStripeClient();
    if (!stripe) {
      res.status(503).json({ error: "Billing is not configured" });
      return;
    }
    const list = await stripe.invoices.list({
      customer: m.stripeCustomerId,
      limit: 36,
    });
    res.json({
      stripeCustomerId: m.stripeCustomerId,
      branding,
      invoices: list.data.map((inv) => ({
        id: inv.id,
        number: inv.number,
        status: inv.status,
        amountDue: inv.amount_due,
        amountPaid: inv.amount_paid,
        total: inv.total,
        currency: inv.currency,
        created: inv.created,
        hostedInvoiceUrl: inv.hosted_invoice_url,
        invoicePdf: inv.invoice_pdf,
      })),
    });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: "Could not load invoices" });
  }
});

router.post("/billing-portal", async (req, res) => {
  try {
    const memberId = (req as unknown as { memberId: string }).memberId;
    const m = await prisma.member.findUnique({
      where: { id: memberId },
      select: { stripeCustomerId: true },
    });
    if (!m?.stripeCustomerId?.trim()) {
      res.status(400).json({
        error:
          "No Stripe billing profile yet. Pay for membership online first, or contact TradeVerify.",
      });
      return;
    }
    const stripe = await getStripeClient();
    if (!stripe) {
      res.status(503).json({ error: "Billing is not configured" });
      return;
    }
    const origin = await siteOrigin(req);
    const session = await stripe.billingPortal.sessions.create({
      customer: m.stripeCustomerId,
      return_url: `${origin}/member/billing`,
    });
    if (!session.url) {
      res.status(500).json({ error: "Could not start billing portal" });
      return;
    }
    res.json({ url: session.url });
  } catch (e) {
    console.error(e);
    res.status(500).json({
      error:
        "Could not open billing portal. Enable the Customer Portal in your Stripe Dashboard (Settings → Billing → Customer portal).",
    });
  }
});

router.delete(
  "/documents/:id",
  requireMemberMembershipActive,
  async (req, res) => {
    try {
    const memberId = (req as unknown as { memberId: string }).memberId;
    const doc = await prisma.memberDocument.findFirst({
      where: { id: req.params.id, memberId },
    });
    if (!doc) {
      res.status(404).json({ error: "Not found" });
      return;
    }
    const filePath = path.join(memberDocDir(memberId), doc.storedName);
    await prisma.memberDocument.delete({ where: { id: doc.id } });
    fs.unlink(filePath, () => {});
    res.status(204).send();
    } catch (e) {
      console.error(e);
      res.status(500).json({ error: "Could not delete document" });
    }
  }
);

/** Insurance */
router.get("/insurance", requireMemberMembershipActive, async (req, res) => {
  try {
    const memberId = (req as unknown as { memberId: string }).memberId;
    const policies = await prisma.insurance.findMany({
      where: { memberId },
      orderBy: { expiryDate: "asc" },
    });
    res.json({
      policies: policies.map((p) => ({
        id: p.id,
        type: p.type,
        provider: p.provider,
        policyNumber: p.policyNumber,
        expiryDate: p.expiryDate.toISOString(),
        graceExpiryDate: p.graceExpiryDate?.toISOString() ?? null,
        status: p.status,
        alertsSent: p.alertsSent,
        lastAlertSentAt: p.lastAlertSentAt?.toISOString() ?? null,
        updatedAt: p.updatedAt.toISOString(),
      })),
    });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: "Could not list insurance policies" });
  }
});

// router.use(memberCrmRoutes);

export default router;
