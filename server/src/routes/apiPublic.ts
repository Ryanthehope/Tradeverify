import { randomUUID } from "crypto";
import fs from "fs";
import path from "path";
import type { Express, Request, Response } from "express";
import { Router } from "express";
import multer from "multer";
import { prisma } from "../db.js";
import {
  ALLOWED_APPLICATION_DOC_MIME,
  MAX_APPLICATION_DOC_BYTES,
  MAX_APPLICATION_FILES,
  persistApplicationDocuments,
  removeApplicationUploadDir,
} from "../lib/applicationDocuments.js";
import {
  billingReady,
  getOrgBilling,
  getStripeSecretKey,
} from "../lib/billingSettings.js";
// import { buildMemberBadgeSvgFromRow, buildTradeVerifyBadgeSvg } from "../lib/memberBadgeSvg.js";
import { memberProfileLogoFilePath } from "../lib/memberProfileLogoPaths.js";
import { orgBrandingFilePath } from "../lib/orgBrandingPaths.js";
// import { findMembersMatchingJobTrade, isValidJobTradeSlug, jobTradeLabelForSlug, JOB_TRADE_CATEGORIES } from "../lib/jobPostTradeRouting.js";
// import { isMemberPublicListingVisible } from "../lib/memberMembership.js";
import { guideToPublic, memberToPublic } from "../lib/memberSerialize.js";
import { verifyRecaptchaV2 } from "../lib/verifyRecaptcha.js";
import {
  getBrandName,
  notifyNewApplication,
  notifyNewLead,
  publicSiteBase,
} from "../lib/adminMail.js";

const router = Router();

router.get("/site-meta", async (_req, res) => {
  try {
    const brandName = await getBrandName(prisma);
    const publicSiteUrl = await publicSiteBase(prisma);
    const row = await prisma.organizationSettings.findUnique({
      where: { id: "default" },
      select: { googleAnalyticsMeasurementId: true },
    });
    const googleAnalyticsMeasurementId =
      row?.googleAnalyticsMeasurementId?.trim() || null;
    res.json({ brandName, publicSiteUrl, googleAnalyticsMeasurementId });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: "Could not load site configuration" });
  }
});

/** Fields required to decide if a member profile is shown on the public site. */
const MEMBER_PUBLIC_VISIBILITY_SELECT = {
  membershipUnlimited: true,
  membershipBillingType: true,
  membershipExpiresAt: true,
  stripeSubscriptionStatus: true,
} as const;

/** Public diagnostic: open in a browser when the site shows "Could not load members". */
router.get("/health", async (_req, res) => {
  try {
    await prisma.$queryRawUnsafe("SELECT 1");
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error("[health] database connection failed", e);
    res.status(503).json({
      ok: false,
      step: "connect",
      detail: msg,
      hint:
        "Check server/.env DATABASE_URL (SQLite: file:/absolute/path/to/app.db). Run: npx prisma db push on the server.",
    });
    return;
  }
  try {
    const memberCount = await prisma.member.count();
    res.json({
      ok: true,
      database: "connected",
      memberTable: true,
      memberCount,
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error("[health] member table", e);
    res.status(503).json({
      ok: false,
      step: "member_table",
      detail: msg,
      hint: "Run on the server: cd server && npx prisma db push",
    });
  }
});

const appApplyUpload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: MAX_APPLICATION_DOC_BYTES,
    files: MAX_APPLICATION_FILES,
  },
  fileFilter: (_req, file, cb) => {
    if (ALLOWED_APPLICATION_DOC_MIME.has(file.mimetype)) {
      cb(null, true);
      return;
    }
    cb(new Error("Only PDF and common image types are allowed"));
  },
});

function isApplicationMultipart(req: { headers: { "content-type"?: string } }) {
  return (req.headers["content-type"] || "").includes("multipart/form-data");
}

router.get("/public-config", async (_req, res) => {
  const contactEmail =
    process.env.CONTACT_EMAIL?.trim() ||
    process.env.PUBLIC_CONTACT_EMAIL?.trim() ||
    null;
  try {
    const s = await getOrgBilling();
    const stripeOk = Boolean(await getStripeSecretKey());
    res.json({
      recaptchaSiteKey:
        s.recaptchaEnabled && s.recaptchaSiteKey?.trim()
          ? s.recaptchaSiteKey.trim()
          : null,
      billingAvailable: billingReady(s) && stripeOk,
      contactEmail,
      hasBrandingLogo: Boolean(s.brandingLogoStoredName?.trim()),
      invoiceLegalName: s.invoiceLegalName?.trim() || null,
      // jobTradeCategories: JOB_TRADE_CATEGORIES, // removed
    });
  } catch (e) {
    console.error(e);
    /** Billing/DB issues must not hide contact email (still useful for Contact page). */
    res.json({
      recaptchaSiteKey: null,
      billingAvailable: false,
      contactEmail,
      hasBrandingLogo: false,
      invoiceLegalName: null,
      // jobTradeCategories: JOB_TRADE_CATEGORIES, // removed
    });
  }
});

/** Organization logo for invoices / site (PNG or JPEG). */
router.get("/public/branding/logo", async (_req, res) => {
  try {
    const s = await getOrgBilling();
    if (!s.brandingLogoStoredName?.trim()) {
      res.status(404).end();
      return;
    }
    const abs = orgBrandingFilePath(s.brandingLogoStoredName);
    const resolved = path.resolve(abs);
    if (!fs.existsSync(resolved)) {
      res.status(404).end();
      return;
    }
    res.setHeader("Cache-Control", "public, max-age=3600");
    const ext = path.extname(resolved).toLowerCase();
    res.type(ext === ".png" ? "image/png" : "image/jpeg");
    res.sendFile(resolved);
  } catch (e) {
    console.error(e);
    res.status(500).end();
  }
});

/** Confirms a join session still matches a row (both id + email required). */
router.post("/applications/verify", async (req, res) => {
  try {
    const applicationId = String(req.body?.applicationId ?? "").trim();
    const email = String(req.body?.email ?? "").trim().toLowerCase();
    if (!applicationId || !email) {
      res.status(400).json({ error: "applicationId and email are required" });
      return;
    }
    const row = await prisma.application.findUnique({
      where: { id: applicationId },
    });
    const exists = Boolean(
      row && row.email.toLowerCase() === email.toLowerCase()
    );
    res.json({ exists });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: "Could not verify application" });
  }
});

/** Applicant-facing status for /join (id + email must match). */
router.post("/applications/applicant-summary", async (req, res) => {
  let billingAvailable = false;
  try {
    const s = await getOrgBilling();
    const stripeOk = Boolean(await getStripeSecretKey());
    billingAvailable = billingReady(s) && stripeOk;
  } catch {
    billingAvailable = false;
  }
  try {
    const applicationId = String(req.body?.applicationId ?? "").trim();
    const email = String(req.body?.email ?? "").trim().toLowerCase();
    if (!applicationId || !email) {
      res.status(400).json({ error: "applicationId and email are required" });
      return;
    }
    const row = await prisma.application.findUnique({
      where: { id: applicationId },
    });
    if (!row || row.email.toLowerCase() !== email) {
      res.json({
        exists: false,
        billingAvailable,
        canCheckout: false,
        hasPayment: false,
        profileLive: false,
        oneTimePassword: null,
      });
      return;
    }
    const hasPayment =
      Boolean(row.fastTrackPaidAt) || Boolean(row.membershipSubscribed);
    const profileLive = Boolean(row.createdMemberId);
    const canCheckout =
      billingAvailable &&
      row.status === "APPROVED" &&
      !hasPayment &&
      !profileLive;
    const now = new Date();
    const oneTimePassword =
      profileLive &&
      row.pendingPortalPassword &&
      row.pendingPortalPasswordExpires &&
      row.pendingPortalPasswordExpires > now
        ? row.pendingPortalPassword
        : null;
    res.json({
      exists: true,
      status: String(row.status),
      billingAvailable,
      canCheckout,
      hasPayment,
      profileLive,
      oneTimePassword,
    });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: "Could not load application status" });
  }
});

async function forwardApplicationWebhook(payload: Record<string, unknown>) {
  const url = process.env.APPLICATION_WEBHOOK_URL?.trim();
  if (!url) return;
  const secret = process.env.APPLICATION_WEBHOOK_SECRET?.trim();
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (secret) headers.Authorization = `Bearer ${secret}`;
  try {
    await fetch(url, {
      method: "POST",
      headers,
      body: JSON.stringify(payload),
    });
  } catch (e) {
    console.warn("[Trader Watchdog] application webhook forward failed", e);
  }
}

router.post(
  "/applications",
  (req, res, next) => {
    if (!isApplicationMultipart(req)) {
      next();
      return;
    }
    appApplyUpload.array("files", MAX_APPLICATION_FILES)(req, res, (err) => {
      if (err instanceof multer.MulterError) {
        if (err.code === "LIMIT_FILE_SIZE") {
          res
            .status(400)
            .json({ error: "A file is too large (max 10 MB each)" });
          return;
        }
        if (err.code === "LIMIT_FILE_COUNT") {
          res.status(400).json({
            error: `At most ${MAX_APPLICATION_FILES} files per application`,
          });
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
  },
  async (req, res) => {
    try {
      const company = String(req.body?.company ?? "").trim();
      const trade = String(req.body?.trade ?? "").trim();
      const email = String(req.body?.email ?? "").trim().toLowerCase();
      const postcode = String(req.body?.postcode ?? "").trim();
      const recaptchaToken = req.body?.recaptchaToken as string | undefined;
      if (!company || !trade || !email || !postcode) {
        res.status(400).json({
          error: "company, trade, email, and postcode are required",
        });
        return;
      }

      const org = await getOrgBilling();
      if (org.recaptchaEnabled) {
        const secret =
          process.env.RECAPTCHA_SECRET_KEY?.trim() ||
          org.recaptchaSecretKey?.trim();
        if (!secret) {
          res.status(500).json({ error: "reCAPTCHA is misconfigured" });
          return;
        }
        const ok = await verifyRecaptchaV2(secret, recaptchaToken);
        if (!ok) {
          res.status(400).json({ error: "reCAPTCHA verification failed" });
          return;
        }
      }

      const files = isApplicationMultipart(req)
        ? ((req.files as Express.Multer.File[]) ?? [])
        : [];

      let row: Awaited<ReturnType<typeof prisma.application.create>> | null =
        null;
      try {
        row = await prisma.application.create({
          data: { company, trade, email, postcode },
        });
        await persistApplicationDocuments(row.id, files);
      } catch (persistErr) {
        if (row) {
          await prisma.application.delete({ where: { id: row.id } }).catch(() => {});
          await removeApplicationUploadDir(row.id);
        }
        throw persistErr;
      }

      void forwardApplicationWebhook({
        source: "Trader Watchdog-join",
        company,
        trade,
        email,
        postcode,
        submittedAt: row.createdAt.toISOString(),
        id: row.id,
        documentCount: files.length,
      });
      notifyNewApplication(prisma, {
        id: row.id,
        company: row.company,
        trade: row.trade,
        email: row.email,
        postcode: row.postcode,
      });
      const stripeOk = Boolean(await getStripeSecretKey());
      const billingAvailable = billingReady(org) && stripeOk;
      res.status(201).json({
        application: {
          id: row.id,
          company: row.company,
          trade: row.trade,
          email: row.email,
          postcode: row.postcode,
          status: row.status,
          createdAt: row.createdAt.toISOString(),
        },
        billingAvailable,
      });
    } catch (e) {
      console.error(e);
      res.status(500).json({ error: "Could not save application" });
    }
  }
);

router.get("/members", async (_req, res) => {
  try {
    const rows = await prisma.member.findMany({ orderBy: { name: "asc" } });
    res.json({ members: rows.map(memberToPublic) });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: "Could not load members" });
  }
});

// Badge SVG endpoints removed

function decodeSlugParam(raw: string): string {
  let slug = String(raw ?? "").trim();
  try {
    slug = decodeURIComponent(slug);
  } catch {
    /* keep raw */
  }
  return slug;
}

async function memberProfileLogoGetHandler(
  req: Request<{ slug: string }>,
  res: Response
): Promise<void> {
  try {
    // Member reviews endpoints removed
        return;
      }
      // recaptcha check removed
    }

    // removed unreachable review handler code

// removed unreachable review endpoints

/** Contact this trade — creates a lead tied to the member (shown in their portal). */
// Member inquiry endpoints removed

/** Public availability calendar for a verified member profile */
// Member availability endpoints removed

/** Homeowner job request — staff lead + one lead per matching verified trade (by category). */
// Job post endpoints removed

async function memberBySlugHandler(
  req: Request<{ slug: string }>,
  res: Response
): Promise<void> {
  try {
    const m = await prisma.member.findUnique({
      where: { slug: req.params.slug },
    });
    if (!m || !isMemberPublicListingVisible(m)) {
      res.status(404).json({ error: "Not found" });
      return;
    }
    res.json({ member: memberToPublic(m) });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: "Could not load member" });
  }
}

router.get("/members/by-slug/:slug", memberBySlugHandler);
router.get("/members/by_slug/:slug", memberBySlugHandler);

router.get("/guides", async (_req, res) => {
  try {
    const rows = await prisma.guide.findMany({ orderBy: { title: "asc" } });
    res.json({ guides: rows.map((g) => guideToPublic(g)) });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: "Could not load guides" });
  }
});

async function guideBySlugHandler(
  req: Request<{ slug: string }>,
  res: Response
): Promise<void> {
  try {
    const g = await prisma.guide.findUnique({
      where: { slug: req.params.slug },
    });
    if (!g) {
      res.status(404).json({ error: "Not found" });
      return;
    }
    res.json({ guide: guideToPublic(g) });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: "Could not load guide" });
  }
}

router.get("/guides/by-slug/:slug", guideBySlugHandler);
router.get("/guides/by_slug/:slug", guideBySlugHandler);

export default router;
