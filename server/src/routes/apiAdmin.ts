import type { Request, Response } from "express";
import { Router } from "express";
import type { Prisma } from "@prisma/client";
import { prisma } from "../db.js";
import { deleteApplicationById } from "../lib/applicationDelete.js";
import {
  parseApplicationXeroInvoiceRefs,
  retryApplicationXeroInvoice,
} from "../lib/applicationXeroInvoices.js";
import { hashPortalPassword } from "../lib/portalCredentials.js";
import { getStripeClient } from "../lib/stripeClient.js";
import { createStripeInvoicePdf } from "../lib/stripeInvoice.js";
import { createPaidXeroInvoice, fetchXeroInvoicePDF } from "../lib/xeroInvoice.js";
import { guideToPublic, memberToPublic } from "../lib/memberSerialize.js";
import { parseManualMembershipExpiryInput } from "../lib/membershipExpiryInput.js";
import {
  defaultUploadPath,
  resolveStoredUploadPath,
  uploadPathCandidates,
} from "../lib/uploadPaths.js";
import { requireStaff } from "../middleware/requireStaff.js";
import adminOps from "./adminOps.js";
import { registerStaff2faRoutes } from "./staff2fa.js";
import fs from "fs";
import path from "path";

const router = Router();
router.use(requireStaff);
registerStaff2faRoutes(router);

/** Registered on this router (before adminOps) so DELETE is never dropped by nested router / hosting quirks. */
async function applicationDeleteHandler(
  req: Request<{ id: string }>,
  res: Response
) {
  try {
    const result = await deleteApplicationById(req.params.id);
    if (result === "not_found") {
      res.status(404).json({ error: "Not found" });
      return;
    }
    res.status(204).send();
  } catch (e: unknown) {
    console.error(e);
    if (
      typeof e === "object" &&
      e &&
      "code" in e &&
      (e as { code?: string }).code === "P2025"
    ) {
      res.status(404).json({ error: "Not found" });
      return;
    }
    res.status(500).json({ error: "Could not delete application" });
  }
}

router.delete("/applications/:id", applicationDeleteHandler);
router.post("/applications/:id/delete", applicationDeleteHandler);

router.use(adminOps);

function parseChecks(body: unknown): string[] | null {
  if (Array.isArray(body)) return body.map(String).filter(Boolean);
  if (typeof body === "string") {
    const lines = body
      .split("\n")
      .map((l) => l.trim())
      .filter(Boolean);
    return lines.length ? lines : null;
  }
  return null;
}

function parseGuideBody(body: unknown): string[] | null {
  return parseChecks(body);
}

function sameUtcDay(date: Date, other: Date) {
  return date.toISOString().slice(0, 10) === other.toISOString().slice(0, 10);
}

function describeApplicationReceipt(args: {
  checkoutKind: string | null | undefined;
  paidAt: Date;
  registrationFeePaidAt: Date | null | undefined;
}) {
  const paidAtLabel = args.paidAt.toLocaleDateString("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
  const registrationPaidSameDay =
    args.registrationFeePaidAt != null && sameUtcDay(args.registrationFeePaidAt, args.paidAt);

  if (args.checkoutKind === "registration_fee") {
    return {
      description: "Registration Fee",
      invoiceDescription: "Registration Fee",
    };
  }

  if (args.checkoutKind === "membership") {
    if (registrationPaidSameDay) {
      return {
        description: `Registration Fee and Annual Portal Fee (${paidAtLabel})`,
        invoiceDescription: "Registration Fee and Annual Portal Fee",
      };
    }
    return {
      description: `Annual Portal Fee (${paidAtLabel})`,
      invoiceDescription: "Annual Portal Fee",
    };
  }

  return {
    description: `Trader Watchdog payment (${paidAtLabel})`,
    invoiceDescription: "Trader Watchdog Payment",
  };
}

async function buildApplicationStripeReceiptPdf(
  applicationId: string,
  preferredKind?: "registration_fee" | "membership"
) {
  const application = await prisma.application.findUnique({
    where: { id: applicationId },
    select: {
      id: true,
      company: true,
      email: true,
      stripeCustomerId: true,
      registrationFeePaidAt: true,
      membershipSubscribed: true,
    },
  });
  if (!application?.stripeCustomerId) return null;
  if (!application.registrationFeePaidAt && !application.membershipSubscribed) return null;

  const stripe = await getStripeClient();
  if (!stripe) return null;

  const results = await stripe.paymentIntents.search({
    query: `metadata['applicationId']:'${applicationId}' AND status:'succeeded'`,
    limit: 10,
  });
  const paymentIntent =
    results.data.find((pi) => pi.metadata?.checkoutKind === preferredKind) ??
    results.data.find((pi) => {
      const kind = pi.metadata?.checkoutKind;
      return kind === "registration_fee" || kind === "membership";
    });
  if (!paymentIntent) return null;

  const paidAt = new Date(paymentIntent.created * 1000);
  const { description, invoiceDescription } = describeApplicationReceipt({
    checkoutKind: paymentIntent.metadata?.checkoutKind,
    paidAt,
    registrationFeePaidAt: application.registrationFeePaidAt,
  });
  const pdf = await createStripeInvoicePdf(stripe, {
    stripeCustomerId: application.stripeCustomerId,
    description,
    amountPence: paymentIntent.amount_received || paymentIntent.amount,
    reference: paymentIntent.id,
    paidAt,
    receivedFromName: application.company || "Trader",
    receivedFromEmail: application.email,
  });
  if (!pdf) return null;

  return {
    pdf,
    invoiceDescription,
  };
}

async function buildMemberStripeReceiptPdf(memberId: string) {
  const member = await prisma.member.findUnique({
    where: { id: memberId },
    select: {
      id: true,
      name: true,
      loginEmail: true,
      invoiceEmail: true,
      membershipExpiresAt: true,
      stripeCustomerId: true,
    },
  });
  if (!member?.stripeCustomerId) return null;

  const stripe = await getStripeClient();
  if (!stripe) return null;

  const results = await stripe.paymentIntents.search({
    query: `metadata['memberId']:'${memberId}' AND status:'succeeded'`,
    limit: 10,
  });
  const paymentIntent = results.data.find(
    (pi) => pi.metadata?.checkoutKind === "member_portal_renewal"
  );
  if (!paymentIntent) return null;

  const paidAt = new Date(paymentIntent.created * 1000);
  const endLabel = member.membershipExpiresAt
    ? member.membershipExpiresAt.toLocaleDateString("en-GB", {
        day: "numeric",
        month: "short",
        year: "numeric",
      })
    : null;
  const paidAtLabel = paidAt.toLocaleDateString("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
  const description = endLabel
    ? `Annual Portal Fee Renewal (${paidAtLabel} – ${endLabel})`
    : `Annual Portal Fee Renewal (${paidAtLabel})`;
  const pdf = await createStripeInvoicePdf(stripe, {
    stripeCustomerId: member.stripeCustomerId,
    description,
    amountPence: paymentIntent.amount_received || paymentIntent.amount,
    reference: paymentIntent.id,
    paidAt,
    receivedFromName: member.name,
    receivedFromEmail: member.invoiceEmail?.trim() || member.loginEmail?.trim() || undefined,
  });
  if (!pdf) return null;

  return { pdf };
}

async function ensureMemberRenewalXeroInvoice(memberId: string) {
  const member = await prisma.member.findUnique({
    where: { id: memberId },
    select: {
      id: true,
      name: true,
      loginEmail: true,
      invoiceEmail: true,
      invoiceAddress: true,
      membershipExpiresAt: true,
      stripeCustomerId: true,
      xeroInvoiceId: true,
    },
  });
  if (!member) return null;
  if (member.xeroInvoiceId?.trim()) return member.xeroInvoiceId.trim();
  if (!member.stripeCustomerId) return null;

  const stripe = await getStripeClient();
  if (!stripe) return null;

  const results = await stripe.paymentIntents.search({
    query: `metadata['memberId']:'${memberId}' AND status:'succeeded'`,
    limit: 10,
  });
  const paymentIntent = results.data.find(
    (pi) => pi.metadata?.checkoutKind === "member_portal_renewal"
  );
  if (!paymentIntent) return null;

  const paidAt = new Date(paymentIntent.created * 1000);
  const endLabel = member.membershipExpiresAt
    ? member.membershipExpiresAt.toLocaleDateString("en-GB", {
        day: "numeric",
        month: "short",
        year: "numeric",
      })
    : null;
  const paidAtLabel = paidAt.toLocaleDateString("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
  const description = endLabel
    ? `Annual Portal Fee Renewal (${paidAtLabel} – ${endLabel})`
    : `Annual Portal Fee Renewal (${paidAtLabel})`;

  const xeroId = await createPaidXeroInvoice({
    contactName: member.name,
    contactEmail: member.invoiceEmail?.trim() || member.loginEmail?.trim() || "",
    contactAddress: member.invoiceAddress,
    description,
    amountPence: paymentIntent.amount_received || paymentIntent.amount,
    reference: paymentIntent.id,
    paidAt,
  });

  await prisma.member.update({
    where: { id: memberId },
    data: {
      xeroInvoiceId: xeroId ?? undefined,
      xeroInvoiceFailed: !xeroId,
    },
  });

  return xeroId;
}

/** Members */
router.get("/members", async (_req, res) => {
  try {
    const rows = await prisma.member.findMany({
      orderBy: { updatedAt: "desc" },
    });
    res.json({
      members: rows.map((m) => ({
        id: m.id,
        ...memberToPublic(m),
        loginEmail: m.loginEmail,
        portalEnabled: Boolean(m.loginEmail && m.passwordHash),
        membershipUnlimited: m.membershipUnlimited,
        membershipBillingType: m.membershipBillingType,
        membershipExpiresAt: m.membershipExpiresAt?.toISOString() ?? null,
        createdAt: m.createdAt.toISOString(),
        updatedAt: m.updatedAt.toISOString(),
      })),
    });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: "Could not list members" });
  }
});

router.get("/members/:id", async (req, res) => {
  try {
    const m = await prisma.member.findUnique({
      where: { id: req.params.id },
      include: {
        documents: {
          orderBy: { createdAt: "desc" },
          select: {
            id: true,
            originalName: true,
            mimeType: true,
            sizeBytes: true,
            createdAt: true,
          },
        },
        sourceApplication: {
          select: {
            id: true,
            xeroInvoiceId: true,
            registrationFeePaidAt: true,
            membershipSubscribed: true,
            documents: {
              orderBy: { createdAt: "asc" },
              select: {
                id: true,
                originalName: true,
                mimeType: true,
                sizeBytes: true,
                createdAt: true,
              },
            },
          },
        },
      },
    });
    if (!m) {
      res.status(404).json({ error: "Not found" });
      return;
    }
    res.json({
      member: {
        id: m.id,
        ...memberToPublic(m),
        loginEmail: m.loginEmail,
        portalEnabled: Boolean(m.loginEmail && m.passwordHash),
        membershipUnlimited: m.membershipUnlimited,
        membershipBillingType: m.membershipBillingType,
        membershipExpiresAt: m.membershipExpiresAt?.toISOString() ?? null,
        hasMemberStripeBilling: Boolean(m.stripeCustomerId),
        memberDocuments: m.documents.map((doc) => ({
          id: doc.id,
          originalName: doc.originalName,
          mimeType: doc.mimeType,
          sizeBytes: doc.sizeBytes,
          createdAt: doc.createdAt.toISOString(),
        })),
        sourceApplicationId: m.sourceApplication?.id ?? null,
        xeroInvoiceId: m.xeroInvoiceId ?? null,
        sourceApplicationXeroInvoices: m.sourceApplication
          ? parseApplicationXeroInvoiceRefs(m.sourceApplication.xeroInvoiceId)
          : {
              registration_fee: null,
              membership: null,
            },
        sourceApplicationHasRegistrationFeePayment: Boolean(
          m.sourceApplication?.registrationFeePaidAt
        ),
        sourceApplicationHasMembershipPayment: Boolean(
          m.sourceApplication?.membershipSubscribed
        ),
        sourceApplicationDocuments:
          m.sourceApplication?.documents.map((doc) => ({
            id: doc.id,
            originalName: doc.originalName,
            mimeType: doc.mimeType,
            sizeBytes: doc.sizeBytes,
            createdAt: doc.createdAt.toISOString(),
          })) ?? [],
        createdAt: m.createdAt.toISOString(),
        updatedAt: m.updatedAt.toISOString(),
      },
    });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: "Could not load member" });
  }
});

router.get("/members/:memberId/documents/:documentId/file", async (req, res) => {
  try {
    const doc = await prisma.memberDocument.findFirst({
      where: {
        id: req.params.documentId,
        memberId: req.params.memberId,
      },
    });
    if (!doc) {
      res.status(404).json({ error: "Not found" });
      return;
    }
    const uploadRoot =
      process.env.MEMBER_UPLOAD_DIR?.trim() ||
      defaultUploadPath("member-documents");
    const candidateRoots = process.env.MEMBER_UPLOAD_DIR?.trim()
      ? [uploadRoot]
      : uploadPathCandidates("member-documents");
    let resolved: string | null = null;
    resolved = resolveStoredUploadPath(
      candidateRoots.map((candidateRoot) => path.resolve(candidateRoot, doc.memberId)),
      doc.storedName
    );
    if (!resolved) {
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
    res.status(500).json({ error: "Could not load file" });
  }
});

router.get("/applications/:id/xero-invoices/:kind/file", async (req, res) => {
  try {
    const kind = String(req.params.kind ?? "").trim();
    if (kind !== "registration_fee" && kind !== "membership") {
      res.status(400).json({ error: "kind must be registration_fee or membership" });
      return;
    }

    const application = await prisma.application.findUnique({
      where: { id: req.params.id },
      select: {
        company: true,
        xeroInvoiceId: true,
      },
    });
    if (!application) {
      res.status(404).json({ error: "Not found" });
      return;
    }

    let invoiceId = parseApplicationXeroInvoiceRefs(application.xeroInvoiceId)[kind];
    let pdf = invoiceId ? await fetchXeroInvoicePDF(invoiceId) : null;

    if (!pdf && !invoiceId) {
      try {
        const retried = await retryApplicationXeroInvoice(req.params.id, kind);
        invoiceId = retried.invoiceId;
        pdf = invoiceId ? await fetchXeroInvoicePDF(invoiceId) : null;
      } catch (retryError) {
        console.error("[admin] xero invoice generation fallback failed", retryError);
      }
    }

    if (!pdf) {
      pdf = (await buildApplicationStripeReceiptPdf(req.params.id, kind))?.pdf ?? null;
    }
    if (!pdf) {
      res.status(502).json({
        error:
          "Could not fetch the Xero invoice PDF, generate a missing Xero invoice, or regenerate a Stripe payment receipt for this payment",
      });
      return;
    }

    const safeCompany = (application.company || "trader")
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "") || "trader";
    const label = kind === "registration_fee" ? "registration-fee" : "membership";

    res.setHeader("Content-Type", "application/pdf");
    res.setHeader(
      "Content-Disposition",
      `attachment; filename="${safeCompany}-${label}-invoice.pdf"`
    );
    res.send(pdf);
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: "Could not download invoice" });
  }
});

router.get("/members/:id/xero-invoice/file", async (req, res) => {
  try {
    const member = await prisma.member.findUnique({
      where: { id: req.params.id },
      select: {
        name: true,
        xeroInvoiceId: true,
      },
    });
    if (!member) {
      res.status(404).json({ error: "Not found" });
      return;
    }
    let invoiceId = member.xeroInvoiceId?.trim() || null;
    let pdf = invoiceId ? await fetchXeroInvoicePDF(invoiceId) : null;

    if (!pdf && !invoiceId) {
      try {
        invoiceId = await ensureMemberRenewalXeroInvoice(req.params.id);
        pdf = invoiceId ? await fetchXeroInvoicePDF(invoiceId) : null;
      } catch (retryError) {
        console.error("[admin] member renewal xero invoice generation fallback failed", retryError);
      }
    }

    if (!pdf) {
      pdf = (await buildMemberStripeReceiptPdf(req.params.id))?.pdf ?? null;
    }
    if (!pdf) {
      res.status(502).json({
        error:
          "Could not fetch the Xero invoice PDF, generate a missing renewal invoice in Xero, or regenerate a Stripe payment receipt",
      });
      return;
    }

    const safeName = (member.name || "member")
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "") || "member";

    res.setHeader("Content-Type", "application/pdf");
    res.setHeader(
      "Content-Disposition",
      `attachment; filename="${safeName}-renewal-invoice.pdf"`
    );
    res.send(pdf);
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: "Could not download invoice" });
  }
});

router.post("/members", async (req, res) => {
  try {
    const {
      slug,
      tvId,
      name,
      trade,
      location,
      checks,
      verifiedSince,
      blurb,
      loginEmail,
      portalPassword,
    } = req.body ?? {};
    const checkList = parseChecks(checks);
    if (
      !slug ||
      !tvId ||
      !name ||
      !trade ||
      !location ||
      !checkList?.length ||
      !verifiedSince ||
      !blurb
    ) {
      res.status(400).json({
        error:
          "slug, tvId, name, trade, location, checks (array or newline list), verifiedSince, and blurb are required",
      });
      return;
    }
    const portalPw = String(portalPassword ?? "").trim();
    const portalEmail = String(loginEmail ?? "")
      .trim()
      .toLowerCase();
    if (portalPw && !portalEmail) {
      res.status(400).json({
        error: "Portal login email is required when setting a portal password",
      });
      return;
    }
    const m = await prisma.member.create({
      data: {
        slug: String(slug).trim(),
        tvId: String(tvId).trim(),
        name: String(name).trim(),
        trade: String(trade).trim(),
        location: String(location).trim(),
        checks: checkList,
        verifiedSince: String(verifiedSince).trim(),
        blurb: String(blurb).trim(),
        ...(portalPw && portalEmail
          ? {
              loginEmail: portalEmail,
              passwordHash: await hashPortalPassword(portalPw),
            }
          : {}),
      },
    });
    res.status(201).json({
      member: {
        id: m.id,
        ...memberToPublic(m),
        loginEmail: m.loginEmail,
        portalEnabled: Boolean(m.loginEmail && m.passwordHash),
      },
    });
  } catch (e: unknown) {
    console.error(e);
    const msg =
      typeof e === "object" && e && "code" in e && (e as { code?: string }).code === "P2002"
        ? "A member with this slug or Trader Watchdog ID already exists"
        : "Could not create member";
    res.status(400).json({ error: msg });
  }
});

router.put("/members/:id", async (req, res) => {
  try {
    const {
      slug,
      tvId,
      name,
      trade,
      location,
      checks,
      verifiedSince,
      blurb,
      loginEmail,
      portalPassword,
      disablePortal,
    } = req.body ?? {};
    const checkList = parseChecks(checks);
    if (
      !slug ||
      !tvId ||
      !name ||
      !trade ||
      !location ||
      !checkList?.length ||
      !verifiedSince ||
      !blurb
    ) {
      res.status(400).json({ error: "All fields are required for update" });
      return;
    }

    const portalPw = String(portalPassword ?? "").trim();
    const portalEmailRaw =
      loginEmail !== undefined
        ? String(loginEmail).trim().toLowerCase() || null
        : undefined;
    const portalOff = Boolean(disablePortal);

    const portalPatch: {
      loginEmail?: string | null;
      passwordHash?: string | null;
    } = {};

    const {
      membershipUnlimited,
      membershipAccessMode,
      membershipExpiresAt,
    } = req.body ?? {};

    const membershipPatch: Prisma.MemberUpdateInput = {};

    if (typeof membershipUnlimited === "boolean") {
      membershipPatch.membershipUnlimited = membershipUnlimited;
    }

    const accessMode =
      typeof membershipAccessMode === "string"
        ? membershipAccessMode.trim().toLowerCase()
        : "";

    if (accessMode === "legacy") {
      membershipPatch.membershipBillingType = null;
      membershipPatch.membershipExpiresAt = null;
    } else if (accessMode === "manual") {
      const exp = parseManualMembershipExpiryInput(membershipExpiresAt);
      if (!exp) {
        res.status(400).json({
          error:
            "membershipExpiresAt (YYYY-MM-DD or ISO) is required for manual access mode",
        });
        return;
      }
      membershipPatch.membershipBillingType = "manual";
      membershipPatch.membershipExpiresAt = exp;
    }

    if (portalOff) {
      portalPatch.loginEmail = null;
      portalPatch.passwordHash = null;
    } else if (portalPw) {
      const em =
        portalEmailRaw ??
        (
          await prisma.member.findUnique({
            where: { id: req.params.id },
            select: { loginEmail: true },
          })
        )?.loginEmail;
      if (!em) {
        res.status(400).json({
          error:
            "Set a portal login email before assigning a password, or include loginEmail in this request",
        });
        return;
      }
      portalPatch.passwordHash = await hashPortalPassword(portalPw);
      if (portalEmailRaw) portalPatch.loginEmail = portalEmailRaw;
    } else if (portalEmailRaw !== undefined) {
      portalPatch.loginEmail = portalEmailRaw;
      if (!portalEmailRaw) portalPatch.passwordHash = null;
    }

    const m = await prisma.member.update({
      where: { id: req.params.id },
      data: {
        slug: String(slug).trim(),
        tvId: String(tvId).trim(),
        name: String(name).trim(),
        trade: String(trade).trim(),
        location: String(location).trim(),
        checks: checkList,
        verifiedSince: String(verifiedSince).trim(),
        blurb: String(blurb).trim(),
        ...portalPatch,
        ...membershipPatch,
      },
    });
    res.json({
      member: {
        id: m.id,
        ...memberToPublic(m),
        loginEmail: m.loginEmail,
        portalEnabled: Boolean(m.loginEmail && m.passwordHash),
        membershipUnlimited: m.membershipUnlimited,
        membershipBillingType: m.membershipBillingType,
        membershipExpiresAt: m.membershipExpiresAt?.toISOString() ?? null,
      },
    });
  } catch (e: unknown) {
    console.error(e);
    const msg =
      typeof e === "object" && e && "code" in e && (e as { code?: string }).code === "P2002"
        ? "Slug or Trader Watchdog ID conflicts with another member"
        : "Could not update member";
    res.status(400).json({ error: msg });
  }
});

router.delete("/members/:id", async (req, res) => {
  try {
    await prisma.member.delete({ where: { id: req.params.id } });
    res.status(204).send();
  } catch (e: unknown) {
    console.error(e);
    if (
      typeof e === "object" &&
      e &&
      "code" in e &&
      (e as { code?: string }).code === "P2025"
    ) {
      res.status(404).json({ error: "Not found" });
      return;
    }
    res.status(500).json({ error: "Could not delete member" });
  }
});

/** Insurance */
router.get("/insurance/all", async (_req, res) => {
  try {
    const policies = await prisma.insurance.findMany({
      include: {
        member: {
          select: {
            id: true,
            name: true,
          }
        }
      },
      orderBy: { updatedAt: "desc" }
    });
    
    res.json({
      policies: policies.map((p) => ({
        id: p.id,
        memberId: p.memberId,
        memberName: p.member.name,
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
      totalCount: policies.length,
    });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: "Could not list insurance policies" });
  }
});

/** Guides */
router.get("/guides", async (_req, res) => {
  try {
    const rows = await prisma.guide.findMany({ orderBy: { updatedAt: "desc" } });
    res.json({
      guides: rows.map((g) => ({
        id: g.id,
        ...guideToPublic(g),
        createdAt: g.createdAt.toISOString(),
        updatedAt: g.updatedAt.toISOString(),
      })),
    });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: "Could not list guides" });
  }
});

router.get("/guides/:id", async (req, res) => {
  try {
    const g = await prisma.guide.findUnique({ where: { id: req.params.id } });
    if (!g) {
      res.status(404).json({ error: "Not found" });
      return;
    }
    res.json({
      guide: {
        id: g.id,
        ...guideToPublic(g),
        createdAt: g.createdAt.toISOString(),
        updatedAt: g.updatedAt.toISOString(),
      },
    });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: "Could not load guide" });
  }
});

router.post("/guides", async (req, res) => {
  try {
    const { slug, title, excerpt, readTime, body } = req.body ?? {};
    const paragraphs = parseGuideBody(body);
    if (!slug || !title || !excerpt || !readTime || !paragraphs?.length) {
      res.status(400).json({
        error:
          "slug, title, excerpt, readTime, and body (array of strings or newline-separated paragraphs) are required",
      });
      return;
    }
    const g = await prisma.guide.create({
      data: {
        slug: String(slug).trim(),
        title: String(title).trim(),
        excerpt: String(excerpt).trim(),
        readTime: String(readTime).trim(),
        body: paragraphs,
      },
    });
    res.status(201).json({ guide: { id: g.id, ...guideToPublic(g) } });
  } catch (e: unknown) {
    console.error(e);
    const msg =
      typeof e === "object" && e && "code" in e && (e as { code?: string }).code === "P2002"
        ? "A guide with this slug already exists"
        : "Could not create guide";
    res.status(400).json({ error: msg });
  }
});

router.put("/guides/:id", async (req, res) => {
  try {
    const { slug, title, excerpt, readTime, body } = req.body ?? {};
    const paragraphs = parseGuideBody(body);
    if (!slug || !title || !excerpt || !readTime || !paragraphs?.length) {
      res.status(400).json({ error: "All fields are required" });
      return;
    }
    const g = await prisma.guide.update({
      where: { id: req.params.id },
      data: {
        slug: String(slug).trim(),
        title: String(title).trim(),
        excerpt: String(excerpt).trim(),
        readTime: String(readTime).trim(),
        body: paragraphs,
      },
    });
    res.json({ guide: { id: g.id, ...guideToPublic(g) } });
  } catch (e: unknown) {
    console.error(e);
    const msg =
      typeof e === "object" && e && "code" in e && (e as { code?: string }).code === "P2002"
        ? "Slug conflicts with another guide"
        : "Could not update guide";
    res.status(400).json({ error: msg });
  }
});

router.delete("/guides/:id", async (req, res) => {
  try {
    await prisma.guide.delete({ where: { id: req.params.id } });
    res.status(204).send();
  } catch (e: unknown) {
    console.error(e);
    if (
      typeof e === "object" &&
      e &&
      "code" in e &&
      (e as { code?: string }).code === "P2025"
    ) {
      res.status(404).json({ error: "Not found" });
      return;
    }
    res.status(500).json({ error: "Could not delete guide" });
  }
});

router.get("/me", async (req, res) => {
  try {
    const id = (req as Request & { staffId: string }).staffId;
    const staff = await prisma.staff.findUnique({ where: { id } });
    if (!staff) {
      res.status(401).json({ error: "Staff account not found" });
      return;
    }
    res.json({
      staff: {
        id: staff.id,
        email: staff.email,
        name: staff.name,
        totpEnabled: staff.totpEnabled,
      },
    });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: "Could not load profile" });
  }
});

export default router;
