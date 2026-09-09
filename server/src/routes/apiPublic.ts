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
} from "../lib/billingSettings.js";
import { getStripeSecretKey } from "../lib/stripeClient.js";
// import { buildMemberBadgeSvgFromRow, buildTraderWatchdogBadgeSvg } from "../lib/memberBadgeSvg.js";
import { isMemberPublicListingVisible } from "../lib/memberMembership.js";
import { orgBrandingFilePath } from "../lib/orgBrandingPaths.js";
import { guideToPublic, memberToPublic } from "../lib/memberSerialize.js";
import { verifyRecaptchaV2 } from "../lib/verifyRecaptcha.js";
import {
  getBrandName,
  notifyApplicantSubmissionReceived,
  notifyNewApplication,
  notifyApplicantVerificationLink,
  publicSiteBase,
} from "../lib/adminMail.js";
import { checkoutLineConfig } from "../lib/billingSettings.js";
import { clampCheckoutPence } from "../lib/billingSettings.js";
import { getLaunchWindow } from "../lib/launchWindow.js";
import { findReusableRegistrationFeePaidAt } from "../lib/reusableRegistrationFee.js";
import { ensureSumsubApplicantForApplication } from "../lib/ensureSumsubApplicant.js";
import { generateSumsubWebSdkLink, isSumsubConfigured } from "../lib/sumsub.js";

const router = Router();

function sumsubPublicError(error: unknown): { status: number; message: string } {
  const message = error instanceof Error ? error.message : String(error);

  if (message.includes("Sumsub configuration is incomplete")) {
    return {
      status: 500,
      message: "Identity verification is not configured correctly right now.",
    };
  }

  if (message.startsWith("Sumsub request failed:")) {
    if (message.includes(" 401 ") || message.includes(" 403 ")) {
      return {
        status: 502,
        message: "Identity verification is configured incorrectly. Check the Sumsub app token and secret key.",
      };
    }
    if (message.includes(" 404 ")) {
      return {
        status: 502,
        message: "Identity verification could not start because the Sumsub level name is invalid or missing.",
      };
    }
    if (message.includes(" 429 ")) {
      return {
        status: 503,
        message: "Identity verification is temporarily busy. Please try again in a moment.",
      };
    }
    return {
      status: 502,
      message: "Identity verification provider is currently unavailable. Please try again in a moment.",
    };
  }

  return {
    status: 500,
    message: "Could not create verification link",
  };
}

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

function parseBooleanish(value: unknown): boolean {
  if (typeof value === "boolean") return value;
  if (typeof value !== "string") return false;
  const normalized = value.trim().toLowerCase();
  return normalized === "true" || normalized === "1" || normalized === "on";
}

type PublicOrgRuntimeConfig = {
  billingEnabled: boolean;
  recaptchaEnabled: boolean;
  recaptchaSiteKey: string | null;
  recaptchaSecretKey: string | null;
  brandingLogoStoredName: string | null;
  invoiceLegalName: string | null;
  checkoutMembershipName: string | null;
  checkoutMembershipPence: number | null;
};

async function getPublicOrgRuntimeConfig(): Promise<PublicOrgRuntimeConfig> {
  const row = await prisma.organizationSettings.findUnique({
    where: { id: "default" },
    select: {
      billingEnabled: true,
      recaptchaEnabled: true,
      recaptchaSiteKey: true,
      recaptchaSecretKey: true,
      brandingLogoStoredName: true,
      invoiceLegalName: true,
      checkoutMembershipName: true,
      checkoutMembershipPence: true,
    },
  });

  return {
    billingEnabled: row?.billingEnabled ?? false,
    recaptchaEnabled: row?.recaptchaEnabled ?? false,
    recaptchaSiteKey: row?.recaptchaSiteKey ?? null,
    recaptchaSecretKey: row?.recaptchaSecretKey ?? null,
    brandingLogoStoredName: row?.brandingLogoStoredName ?? null,
    invoiceLegalName: row?.invoiceLegalName ?? null,
    checkoutMembershipName: row?.checkoutMembershipName ?? null,
    checkoutMembershipPence: row?.checkoutMembershipPence ?? null,
  };
}

async function safeStripeReady() {
  try {
    return Boolean(await getStripeSecretKey());
  } catch {
    return false;
  }
}

router.get("/public-config", async (_req, res) => {
  const contactEmail =
    process.env.CONTACT_EMAIL?.trim() ||
    process.env.PUBLIC_CONTACT_EMAIL?.trim() ||
    null;
  try {
    const s = await getPublicOrgRuntimeConfig();
    const stripeOk = await safeStripeReady();
    const lines = checkoutLineConfig(s);
    const baseMembershipPence = lines.membershipPence;

    res.json({
      recaptchaSiteKey:
        s.recaptchaEnabled && s.recaptchaSiteKey?.trim()
          ? s.recaptchaSiteKey.trim()
          : null,
      billingAvailable: billingReady(s) && stripeOk,
      contactEmail,
      hasBrandingLogo: Boolean(s.brandingLogoStoredName?.trim()),
      invoiceLegalName: s.invoiceLegalName?.trim() || null,
      registrationFeePricePence: lines.registrationFeePence,
      membershipPricePence: lines.membershipPence,
      baseMembershipPricePence: baseMembershipPence,
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
    });
  }
});

/** Organization logo for invoices / site (PNG or JPEG). */
router.get("/public/branding/logo", async (_req, res) => {
  try {
    const s = await getPublicOrgRuntimeConfig();
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
      select: { email: true },
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
  const sumsubEnabled = isSumsubConfigured();
  let billingAvailable = false;
  try {
    const s = await getPublicOrgRuntimeConfig();
    const stripeOk = await safeStripeReady();
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
    let row = await prisma.application.findUnique({
      where: { id: applicationId },
      select: {
        email: true,
        status: true,
        verificationStatus: true,
        registrationFeePaidAt: true,
        membershipSubscribed: true,
        membershipAutoChargeInitiatedAt: true,
        createdMemberId: true,
        pendingPortalPassword: true,
        pendingPortalPasswordExpires: true,
      },
    });
    if (!row || row.email.toLowerCase() !== email) {
      res.json({
        exists: false,
        billingAvailable,
        canCheckoutRegistrationFee: false,
        canCheckoutMembership: false,
        hasRegistrationFeePayment: false,
        hasMembershipPayment: false,
        profileLive: false,
        oneTimePassword: null,
      });
      return;
    }
    const hasRegistrationFeePayment = Boolean(row.registrationFeePaidAt);
    const hasMembershipPayment =
      Boolean(row.membershipSubscribed);  
    const profileLive = Boolean(row.createdMemberId);
    const verificationStatus = String(row.verificationStatus ?? "NOT_STARTED");
    // True when an off-session GC payment was created on approval but the
    // Bacs confirmation webhook hasn't fired yet (~3-5 working days).
    const membershipAutoChargePending =
      Boolean(row.membershipAutoChargeInitiatedAt) &&
      !hasMembershipPayment &&
      !profileLive;
    const canCheckoutRegistrationFee =
      false;
    const canCheckoutMembership =
      billingAvailable &&
      row.status === "APPROVED" &&
      !hasMembershipPayment &&
      !membershipAutoChargePending &&
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
      verificationStatus,
      billingAvailable,
      canCheckoutRegistrationFee,
      canCheckoutMembership,
      membershipAutoChargePending,
      hasRegistrationFeePayment,
      hasMembershipPayment,
      profileLive,
      oneTimePassword,
    });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: "Could not load application status" });
  }
});

/**
 * Applicant-facing: get (or create) a Sumsub verification link.
 * Authenticated by applicationId + email match.
 */
router.post("/applications/verification-link", async (req, res) => {
  try {
    if (!isSumsubConfigured()) {
      res.status(400).json({ error: "Identity verification is currently unavailable" });
      return;
    }
    const applicationId = String(req.body?.applicationId ?? "").trim();
    const email = String(req.body?.email ?? "").trim().toLowerCase();
    if (!applicationId || !email) {
      res.status(400).json({ error: "applicationId and email are required" });
      return;
    }
    let row = await prisma.application.findUnique({
      where: { id: applicationId },
      select: { email: true, status: true, verificationStatus: true },
    });
    if (!row || row.email.toLowerCase() !== email) {
      res.status(404).json({ error: "Application not found" });
      return;
    }
    if (row.status === "DECLINED") {
      res.status(400).json({ error: "This application is closed" });
      return;
    }
    if (row.verificationStatus === "APPROVED") {
      res.status(400).json({ error: "Identity verification is already complete" });
      return;
    }
    const ensured = await ensureSumsubApplicantForApplication(prisma, applicationId);
    if (ensured.kind === "not_found") {
      res.status(404).json({ error: "Application not found" });
      return;
    }
    const siteBase = await publicSiteBase(prisma).catch(() => process.env.PUBLIC_SITE_URL?.trim() ?? "");
    const redirectUrl = siteBase
      ? `${siteBase}/join?app=${encodeURIComponent(applicationId)}&email=${encodeURIComponent(email)}`
      : undefined;
    const link = await generateSumsubWebSdkLink({
      userId: ensured.externalUserId,
      email: ensured.email,
      phone: ensured.phone,
      lang: "en",
      redirectUrl,
    });
    res.json({ url: link.url });
  } catch (e) {
    console.error(e);
    const failure = sumsubPublicError(e);
    res.status(failure.status).json({ error: failure.message });
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
      const legalStructure = String(req.body?.legalStructure ?? "").trim();
      const tradingAddress = String(req.body?.tradingAddress ?? "").trim();
      const trade = String(req.body?.trade ?? "").trim();
      const employeeCountRaw = String(req.body?.employeeCount ?? "").trim();
      const employeeCount = employeeCountRaw
        ? Number.parseInt(employeeCountRaw, 10)
        : 1;
      const identifiablePerson = String(req.body?.identifiablePerson ?? "").trim();
      const identifiablePersonAddress = String(
        req.body?.identifiablePersonAddress ?? ""
      ).trim();
      const email = String(req.body?.email ?? "").trim().toLowerCase();
      const phone = String(req.body?.phone ?? "").trim();
      const postcode = String(req.body?.postcode ?? "").trim();
      const wasteCarrierRequired = String(
        req.body?.wasteCarrierRequired ?? ""
      ).trim();
      const wasteCarrierNumber = String(req.body?.wasteCarrierNumber ?? "").trim();
      const gasSafeRequired = String(req.body?.gasSafeRequired ?? "").trim();
      const gasSafeNumber = String(req.body?.gasSafeNumber ?? "").trim();
      const niceicRequired = String(req.body?.niceicRequired ?? "").trim();
      const niceicNumber = String(req.body?.niceicNumber ?? "").trim();
      const icoRequired = String(req.body?.icoRequired ?? "").trim();
      const icoNumber = String(req.body?.icoNumber ?? "").trim();
      const businessDescription = String(
        req.body?.businessDescription ?? ""
      ).trim();
      const documentsConfirmed = parseBooleanish(req.body?.documentsConfirmed);
      const agreementAccepted = parseBooleanish(req.body?.agreementAccepted);
      const enquiriesAccepted = parseBooleanish(req.body?.enquiriesAccepted);
      const recaptchaToken = req.body?.recaptchaToken as string | undefined;
      if (!company || !trade || !email || !phone) {
        res.status(400).json({
          error: "company, trade, email, and phone are required",
        });
        return;
      }
      if (employeeCountRaw && (!Number.isInteger(employeeCount) || employeeCount < 1)) {
        res.status(400).json({
          error: "Please enter the number of employees, including yourself.",
        });
        return;
      }

      const hasExtendedFields = Boolean(
        legalStructure ||
          tradingAddress ||
          employeeCountRaw ||
          identifiablePerson ||
          identifiablePersonAddress ||
          wasteCarrierRequired ||
          wasteCarrierNumber ||
          gasSafeRequired ||
          gasSafeNumber ||
          niceicRequired ||
          niceicNumber ||
          icoRequired ||
          icoNumber ||
          businessDescription ||
          Object.prototype.hasOwnProperty.call(req.body ?? {}, "documentsConfirmed") ||
          Object.prototype.hasOwnProperty.call(req.body ?? {}, "agreementAccepted") ||
          Object.prototype.hasOwnProperty.call(req.body ?? {}, "enquiriesAccepted")
      );

      if (
        hasExtendedFields &&
        (!legalStructure ||
          !tradingAddress ||
          !identifiablePerson ||
          !identifiablePersonAddress ||
          !wasteCarrierRequired ||
          !gasSafeRequired ||
            !niceicRequired ||
          !icoRequired)
      ) {
        res.status(400).json({
          error:
            "Please complete the business structure, address, identifiable person, and licence requirement fields.",
        });
        return;
      }

      if (
        hasExtendedFields &&
        (!documentsConfirmed || !agreementAccepted || !enquiriesAccepted)
      ) {
        res.status(400).json({
          error: "Please confirm the required declaration boxes before submitting.",
        });
        return;
      }

      const org = await getPublicOrgRuntimeConfig();
      if (org.recaptchaEnabled) {
        const secret =
          process.env.TURNSTILE_SECRET_KEY?.trim() ||
          process.env.RECAPTCHA_SECRET_KEY?.trim() ||
          org.recaptchaSecretKey?.trim();
        if (!secret) {
          res.status(500).json({ error: "Turnstile is misconfigured" });
          return;
        }
        const verification = await verifyRecaptchaV2(secret, recaptchaToken);
        if (!verification.ok) {
          console.warn("[turnstile] verification failed", {
            errorCodes: verification.errorCodes,
            hostname: verification.hostname,
          });
          if (verification.errorCodes.includes("invalid-input-secret")) {
            res.status(500).json({
              error: "Turnstile secret key does not match the site key configured for this form.",
            });
            return;
          }
          if (
            verification.errorCodes.includes("timeout-or-duplicate") ||
            verification.errorCodes.includes("missing-input-response") ||
            verification.errorCodes.includes("invalid-input-response")
          ) {
            res.status(400).json({
              error: "Bot verification expired or was not accepted. Please tick the box again and resubmit.",
            });
            return;
          }
          res.status(400).json({ error: "Bot verification failed. Please tick the box again and resubmit." });
          return;
        }
      }

      const files = isApplicationMultipart(req)
        ? ((req.files as Express.Multer.File[]) ?? [])
        : [];

      const reusableRegistrationFeePaidAt =
        await findReusableRegistrationFeePaidAt(email);

      let row: Awaited<ReturnType<typeof prisma.application.create>> | null =
        null;
      try {
        row = await prisma.application.create({
          data: {
            company,
            legalStructure: legalStructure || null,
            tradingAddress: tradingAddress || null,
            trade,
            employeeCount,
            identifiablePerson: identifiablePerson || null,
            identifiablePersonAddress: identifiablePersonAddress || null,
            email,
            phone,
            postcode,
            wasteCarrierRequired: wasteCarrierRequired || null,
            wasteCarrierNumber: wasteCarrierNumber || null,
            gasSafeRequired: gasSafeRequired || null,
            gasSafeNumber: gasSafeNumber || null,
            niceicRequired: niceicRequired || null,
            niceicNumber: niceicNumber || null,
            icoRequired: icoRequired || null,
            icoNumber: icoNumber || null,
            businessDescription: businessDescription || null,
            documentsConfirmed,
            agreementAccepted,
            enquiriesAccepted,
            registrationFeePaidAt: reusableRegistrationFeePaidAt,
          },
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
        legalStructure,
        tradingAddress,
        trade,
        employeeCount,
        identifiablePerson,
        identifiablePersonAddress,
        email,
        phone,
        postcode,
        wasteCarrierRequired,
        wasteCarrierNumber,
        gasSafeRequired,
        gasSafeNumber,
        niceicRequired,
        niceicNumber,
        icoRequired,
        icoNumber,
        businessDescription,
        documentsConfirmed,
        agreementAccepted,
        enquiriesAccepted,
        submittedAt: row.createdAt.toISOString(),
        id: row.id,
        documentCount: files.length,
      });
      notifyNewApplication(prisma, {
        id: row.id,
        company: row.company,
        trade: row.trade,
        email: row.email,
        phone: row.phone,
        postcode: row.postcode,
      });
      notifyApplicantSubmissionReceived(prisma, {
        id: row.id,
        company: row.company,
        traderName: row.identifiablePerson,
        trade: row.trade,
        email: row.email,
      });
      if (isSumsubConfigured()) {
        void (async () => {
          try {
            const ensured = await ensureSumsubApplicantForApplication(prisma, row.id);
            if (ensured.kind !== "not_found") {
              const siteBase = await publicSiteBase(prisma).catch(() => process.env.PUBLIC_SITE_URL?.trim() ?? "");
              const redirectUrl = siteBase
                ? `${siteBase}/join?app=${encodeURIComponent(row.id)}&email=${encodeURIComponent(row.email)}`
                : undefined;
              const link = await generateSumsubWebSdkLink({
                userId: ensured.externalUserId,
                email: ensured.email,
                phone: ensured.phone,
                lang: "en",
                redirectUrl,
              });
              notifyApplicantVerificationLink(prisma, {
                traderName: row.identifiablePerson,
                company: row.company,
                email: row.email,
                verificationUrl: link.url,
              });
            }
          } catch (err) {
            console.error("[public apply] auto-sumsub link failed", err);
          }
        })();
      }
      const stripeOk = await safeStripeReady();
      const billingAvailable = billingReady(org) && stripeOk;
      res.status(201).json({
        application: {
          id: row.id,
          company: row.company,
          trade: row.trade,
          email: row.email,
          phone: row.phone,
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
    const rows = await prisma.member.findMany({
      orderBy: { name: "asc" },
      include: {
        insurancePolicies: {
          select: { type: true, status: true },
          where: { status: { not: "expired" } },
        },
        sourceApplication: {
          select: {
            tradingAddress: true,
            identifiablePersonAddress: true,
          },
        },
      },
    });
    res.json({
      members: rows
        .filter((member) => isMemberPublicListingVisible(member))
        .map(memberToPublic),
    });
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

async function memberBySlugHandler(
  req: Request<{ slug: string }>,
  res: Response
): Promise<void> {
  try {
    const m = await prisma.member.findUnique({
      where: { slug: req.params.slug },
      include: {
        insurancePolicies: {
          select: { type: true, status: true },
          where: { status: { not: "expired" } },
        },
        sourceApplication: {
          select: {
            tradingAddress: true,
            identifiablePersonAddress: true,
          },
        },
      },
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
