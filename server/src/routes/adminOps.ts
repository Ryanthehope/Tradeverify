import fs from "fs";
import bcrypt from "bcryptjs";
import type { Request, Response } from "express";
import { Router } from "express";
import type { ApplicationStatus, Prisma } from "@prisma/client";
import { prisma } from "../db.js";
import {
  mergeVettingStateFromDb,
  mergeVettingStateFromInput,
  vettingStateToPrismaJson,
} from "../lib/applicationVettingState.js";
import { applicationDocumentResolvedPath } from "../lib/applicationDocuments.js";
import { tryProvisionMemberForApplication } from "../lib/provisionMemberFromApplication.js";
import { sanitizeNullableDbString } from "../lib/sanitizeDbText.js";
import { getOrgBilling, checkoutLineConfig } from "../lib/billingSettings.js";
import { getStripeClient } from "../lib/stripeClient.js";
import { provisionIfApplicationPaid } from "../lib/provisionAfterApplicationPayment.js";
import { parseManualMembershipExpiryInput } from "../lib/membershipExpiryInput.js";
import { fetchGa4OverviewReport } from "../lib/ga4DataApi.js";
import { buildXeroClient, buildConsentUrlAndStore } from "../lib/xeroClient.js";
import {
  invalidateSmtpTransportCache,
  notifyApplicationDecision,
  notifyApplicantApprovedForPayment,
  notifyApplicantVerificationOutcome,
  notifyApplicantVerificationLink,
  notifyMemberWelcome,
  sendXeroInvoiceToTrader,
  sendAdminEmail,
  publicSiteBase,
} from "../lib/adminMail.js";
import { ensureSumsubApplicantForApplication } from "../lib/ensureSumsubApplicant.js";
import {
  generateSumsubWebSdkLink,
  isSumsubConfigured,
} from "../lib/sumsub.js";
import {
  buildSumsubVerificationUpdate,
} from "../lib/sumsubVerificationSync.js";
import {
  parseApplicationXeroInvoiceRefs,
  retryApplicationXeroInvoice,
} from "../lib/applicationXeroInvoices.js";
import { createStripeInvoicePdf } from "../lib/stripeInvoice.js";

const router = Router();

async function ensureOrgSettings() {
  return prisma.organizationSettings.upsert({
    where: { id: "default" },
    create: { id: "default" },
    update: {},
  });
}

const inboxUnreadCount = 0;

function sameUtcDay(date: Date, other: Date) {
  return date.toISOString().slice(0, 10) === other.toISOString().slice(0, 10);
}

function describeApplicationReceipt(args: {
  checkoutKind: string | null | undefined;
  amountPence: number;
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

function settledValue<T>(
  result: PromiseSettledResult<T>,
  label: string,
  fallback: T
): T {
  if (result.status === "fulfilled") {
    return result.value;
  }
  console.error(`[dashboard] ${label} failed`, result.reason);
  return fallback;
}

const ADMIN_APPLICATION_FULL_SELECT = {
  id: true,
  company: true,
  legalStructure: true,
  tradingAddress: true,
  trade: true,
  employeeCount: true,
  identifiablePerson: true,
  identifiablePersonAddress: true,
  email: true,
  phone: true,
  postcode: true,
  wasteCarrierRequired: true,
  wasteCarrierNumber: true,
  gasSafeRequired: true,
  gasSafeNumber: true,
  niceicRequired: true,
  niceicNumber: true,
  icoRequired: true,
  icoNumber: true,
  businessDescription: true,
  documentsConfirmed: true,
  agreementAccepted: true,
  enquiriesAccepted: true,
  status: true,
  notes: true,
  vettingChecklist: true,
  vettingState: true,
  approvedAt: true,
  registrationFeePaidAt: true,
  membershipSubscribed: true,
  manualMembershipExpiresAt: true,
  verificationProvider: true,
  verificationStatus: true,
  verificationSubmittedAt: true,
  verificationApprovedAt: true,
  verificationRejectedAt: true,
  verificationProviderApplicantId: true,
  verificationProviderSessionId: true,
  verificationFailureReason: true,
  addressVerificationStatus: true,
  addressVerificationApprovedAt: true,
  addressVerificationRejectedAt: true,
  addressVerificationFailureReason: true,
  addressVerificationMatchedAddress: true,
  addressVerificationMatchedApplication: true,
  approvedByStaffName: true,
  pendingPortalPassword: true,
  pendingPortalPasswordExpires: true,
  xeroInvoiceId: true,
  xeroInvoiceFailed: true,
  paymentDiscountCode: true,
  createdAt: true,
  updatedAt: true,
  createdMemberId: true,
  documents: {
    orderBy: { createdAt: "desc" as const },
    select: {
      id: true,
      originalName: true,
      mimeType: true,
      sizeBytes: true,
      createdAt: true,
    },
  },
  createdMember: {
    select: {
      id: true,
      slug: true,
      tvId: true,
      membershipBillingType: true,
      membershipExpiresAt: true,
    },
  },
} as const;
const ADMIN_APPLICATION_FALLBACK_SELECT = {
  id: true,
  company: true,
  trade: true,
  email: true,
  postcode: true,
  status: true,
  notes: true,
  vettingChecklist: true,
  vettingState: true,
  approvedAt: true,
  membershipSubscribed: true,
  manualMembershipExpiresAt: true,
  createdAt: true,
  updatedAt: true,
  createdMemberId: true,
  documents: {
    orderBy: { createdAt: "desc" as const },
    select: {
      id: true,
      originalName: true,
      mimeType: true,
      sizeBytes: true,
      createdAt: true,
    },
  },
  createdMember: {
    select: {
      id: true,
      slug: true,
      tvId: true,
      membershipBillingType: true,
      membershipExpiresAt: true,
    },
  },
} as const;

const ADMIN_APPLICATION_MUTATION_SELECT = {
  id: true,
  company: true,
  identifiablePerson: true,
  trade: true,
  email: true,
  phone: true,
  status: true,
  createdAt: true,
  createdMemberId: true,
  registrationFeePaidAt: true,
  membershipSubscribed: true,
  manualMembershipExpiresAt: true,
  stripeCustomerId: true,
  stripePaymentMethodId: true,
  membershipAutoChargeInitiatedAt: true,
  verificationProvider: true,
  verificationStatus: true,
  xeroInvoiceId: true,
  xeroInvoiceFailed: true,
} as const;

router.get("/dashboard", async (_req, res) => {
  try {
    const [
      membersTotalResult,
      membersPortalResult,
      guidesTotalResult,
      applicationsPendingResult,
      settingsResult,
      recentAppsResult,
      recentMembersResult,
      recentGuidesResult,
    ] = await Promise.allSettled([
      prisma.member.count(),
      prisma.member.count({
        where: { loginEmail: { not: null }, passwordHash: { not: null } },
      }),
      prisma.guide.count(),
      prisma.application.count({ where: { status: "PENDING" } }),
      ensureOrgSettings(),
      prisma.application.findMany({
        orderBy: { createdAt: "desc" },
        take: 8,
        select: { id: true, company: true, status: true, createdAt: true },
      }),
      prisma.member.findMany({
        orderBy: { updatedAt: "desc" },
        take: 8,
        select: { id: true, name: true, updatedAt: true },
      }),
      prisma.guide.findMany({
        orderBy: { updatedAt: "desc" },
        take: 8,
        select: { id: true, title: true, updatedAt: true },
      }),
    ]);

    const membersTotal = settledValue(membersTotalResult, "membersTotal", 0);
    const membersPortal = settledValue(
      membersPortalResult,
      "membersPortal",
      0
    );
    const guidesTotal = settledValue(guidesTotalResult, "guidesTotal", 0);
    const applicationsPending = settledValue(
      applicationsPendingResult,
      "applicationsPending",
      0
    );
    const settings = settledValue(settingsResult, "organizationSettings", {
      revenueMtdCents: 0,
      outstandingCents: 0,
    } as Awaited<ReturnType<typeof ensureOrgSettings>>);
    const recentApps = settledValue(recentAppsResult, "recentApps", [] as Array<{
      id: string;
      company: string;
      status: string;
      createdAt: Date;
    }>);
    const recentMembers = settledValue(
      recentMembersResult,
      "recentMembers",
      [] as Array<{ id: string; name: string; updatedAt: Date }>
    );
    const recentGuides = settledValue(
      recentGuidesResult,
      "recentGuides",
      [] as Array<{ id: string; title: string; updatedAt: Date }>
    );

    type Act = { at: string; label: string; href: string };
    const activity: Act[] = [
      ...recentApps.map((a) => ({
        at: a.createdAt.toISOString(),
        label: `Application: ${a.company} (${a.status})`,
        href: "/staff/applications",
      })),
      ...recentMembers.map((m) => ({
        at: m.updatedAt.toISOString(),
        label: `Member updated: ${m.name}`,
        href: `/staff/members/${m.id}`,
      })),
      ...recentGuides.map((g) => ({
        at: g.updatedAt.toISOString(),
        label: `Article updated: ${g.title}`,
        href: `/staff/guides/${g.id}`,
      })),
    ]
      .sort((x, y) => (x.at < y.at ? 1 : -1))
      .slice(0, 15);

    const revenueMtdCents = settings.revenueMtdCents;
    const outstandingCents = settings.outstandingCents;
    const financialSource = "fallback";
    const financialError: string | null = null;

    res.json({
      membersTotal,
      membersPortalEnabled: membersPortal,
      guidesTotal,
      applicationsPending,
      revenueMtdCents,
      outstandingCents,
      financialSource,
      financialError,
      inboxUnread: inboxUnreadCount,
      activity,
    });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: "Could not load dashboard" });
  }
});

function publicOrgSettings(s: Awaited<ReturnType<typeof ensureOrgSettings>>) {
  const lines = checkoutLineConfig(s);
  return {
    ...s,
    checkoutMembershipPence: lines.membershipPence,
    checkoutRegistrationFeePence: lines.registrationFeePence,
    stripeSecretKey: null as string | null,
    stripeWebhookSecret: null as string | null,
    recaptchaSecretKey: null as string | null,
    smtpPass: null as string | null,
    googleAnalyticsServiceAccountJson: null as string | null,
    hasStripeSecret: Boolean(s.stripeSecretKey?.trim()),
    hasStripeWebhookSecret: Boolean(s.stripeWebhookSecret?.trim()),
    hasRecaptchaSecret: Boolean(s.recaptchaSecretKey?.trim()),
    hasSmtpPassword: Boolean(s.smtpPass?.trim()),
    hasGoogleAnalyticsServiceAccount: Boolean(
      s.googleAnalyticsServiceAccountJson?.trim()
    ),
  };
};

router.get("/organization-settings", async (_req, res) => {
  try {
    const s = await ensureOrgSettings();
    res.json({ settings: publicOrgSettings(s) });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: "Could not load settings" });
  }
});

async function patchOrganizationSettings(
  req: Request,
  res: Response
): Promise<void> {
  try {
    const body = req.body ?? {};
    const workspaceName =
      typeof body.workspaceName === "string"
        ? body.workspaceName.trim() || null
        : undefined;
    const announcementEmail =
      typeof body.announcementEmail === "string"
        ? body.announcementEmail.trim() || null
        : undefined;
    const siteDisplayName =
      typeof body.siteDisplayName === "string"
        ? body.siteDisplayName.trim() || null
        : undefined;
    const publicSiteUrl =
      typeof body.publicSiteUrl === "string"
        ? body.publicSiteUrl.trim().replace(/\/$/, "") || null
        : undefined;
    const adminNotifyEmails =
      typeof body.adminNotifyEmails === "string"
        ? body.adminNotifyEmails.trim() || null
        : undefined;
    const smtpHost =
      typeof body.smtpHost === "string"
        ? body.smtpHost.trim() || null
        : undefined;
    let smtpPort: number | null | undefined = undefined;
    if (Object.prototype.hasOwnProperty.call(body, "smtpPort")) {
      const raw = body.smtpPort as unknown;
      if (raw === null || raw === "") {
        smtpPort = null;
      } else if (typeof raw === "number" && Number.isFinite(raw)) {
        smtpPort = Math.floor(raw);
      } else if (typeof raw === "string") {
        const t = raw.trim();
        if (t === "") smtpPort = null;
        else {
          const n = Math.floor(Number(t));
          smtpPort = Number.isFinite(n) ? n : null;
        }
      }
    }
    const smtpSecure =
      typeof body.smtpSecure === "boolean" ? body.smtpSecure : undefined;
    const smtpUser =
      typeof body.smtpUser === "string"
        ? body.smtpUser.trim() || null
        : undefined;
    const mailFrom =
      typeof body.mailFrom === "string"
        ? body.mailFrom.trim() || null
        : undefined;
    const smtpPassRaw = body.smtpPass;
    const smtpPass =
      typeof smtpPassRaw === "string" && smtpPassRaw.trim()
        ? smtpPassRaw.trim()
        : undefined;
    const clearSmtpPassword = body.clearSmtpPassword === true;

    const billingEnabled =
      typeof body.billingEnabled === "boolean"
        ? body.billingEnabled
        : undefined;
    const checkoutMembershipName =
      typeof body.checkoutMembershipName === "string"
        ? body.checkoutMembershipName.trim() || null
        : undefined;
    const checkoutRegistrationFeeName =
      typeof body.checkoutRegistrationFeeName === "string"
        ? body.checkoutRegistrationFeeName.trim() || null
        : undefined;
    const checkoutMembershipPence =
      typeof body.checkoutMembershipPence === "number" &&
      Number.isFinite(body.checkoutMembershipPence)
        ? Math.floor(body.checkoutMembershipPence)
        : undefined;
    const checkoutRegistrationFeePence =
      typeof body.checkoutRegistrationFeePence === "number" &&
      Number.isFinite(body.checkoutRegistrationFeePence)
        ? Math.floor(body.checkoutRegistrationFeePence)
        : undefined;
    const recaptchaEnabled =
      typeof body.recaptchaEnabled === "boolean"
        ? body.recaptchaEnabled
        : undefined;
    const recaptchaSiteKey =
      typeof body.recaptchaSiteKey === "string"
        ? body.recaptchaSiteKey.trim() || null
        : undefined;
    const recaptchaSecretKey =
      typeof body.recaptchaSecretKey === "string"
        ? body.recaptchaSecretKey.trim() || null
        : undefined;
    const staffRequire2fa =
      typeof body.staffRequire2fa === "boolean"
        ? body.staffRequire2fa
        : undefined;

    const invoiceLegalName =
      typeof body.invoiceLegalName === "string"
        ? body.invoiceLegalName.trim() || null
        : undefined;
    const invoiceVatNumber =
      typeof body.invoiceVatNumber === "string"
        ? body.invoiceVatNumber.trim() || null
        : undefined;
    const invoiceAddress =
      typeof body.invoiceAddress === "string"
        ? body.invoiceAddress.trim() || null
        : undefined;
    const invoiceFooterNote =
      typeof body.invoiceFooterNote === "string"
        ? body.invoiceFooterNote.trim() || null
        : undefined;

    let googleAnalyticsMeasurementId: string | null | undefined = undefined;
    if (Object.prototype.hasOwnProperty.call(body, "googleAnalyticsMeasurementId")) {
      const raw = body.googleAnalyticsMeasurementId;
      if (raw === null || raw === "") {
        googleAnalyticsMeasurementId = null;
      } else if (typeof raw === "string") {
        const t = raw.replace(/\s/g, "").trim();
        if (!t) {
          googleAnalyticsMeasurementId = null;
        } else if (/^G-[A-Z0-9]+$/i.test(t)) {
          googleAnalyticsMeasurementId = t.toUpperCase();
        } else {
          res.status(400).json({
            error:
              "Invalid Google Analytics Measurement ID. Use your GA4 ID (format G-XXXXXXXXXX).",
          });
          return;
        }
      }
    }

    let googleAnalyticsPropertyId: string | null | undefined = undefined;
    if (Object.prototype.hasOwnProperty.call(body, "googleAnalyticsPropertyId")) {
      const raw = body.googleAnalyticsPropertyId;
      if (raw === null || raw === "") {
        googleAnalyticsPropertyId = null;
      } else if (typeof raw === "string") {
        const t = raw.replace(/\s/g, "");
        if (!t) {
          googleAnalyticsPropertyId = null;
        } else if (/^\d{5,12}$/.test(t)) {
          googleAnalyticsPropertyId = t;
        } else {
          res.status(400).json({
            error:
              "GA4 Property ID must be numeric only (find it under GA4 → Admin → Property settings).",
          });
          return;
        }
      }
    }

    let googleAnalyticsServiceAccountJson: string | null | undefined = undefined;
    if (
      Object.prototype.hasOwnProperty.call(body, "googleAnalyticsServiceAccountJson")
    ) {
      const raw = body.googleAnalyticsServiceAccountJson;
      if (raw === null || raw === "") {
        googleAnalyticsServiceAccountJson = null;
      } else if (typeof raw === "string") {
        const t = raw.trim();
        if (!t) {
          googleAnalyticsServiceAccountJson = null;
        } else {
          try {
            const o = JSON.parse(t) as Record<string, unknown>;
            if (
              typeof o.private_key !== "string" ||
              typeof o.client_email !== "string"
            ) {
              res.status(400).json({
                error:
                  "Service account JSON must include client_email and private_key (paste the full file from Google Cloud).",
              });
              return;
            }
            googleAnalyticsServiceAccountJson = t;
          } catch {
            res.status(400).json({
              error: "Service account JSON is not valid JSON.",
            });
            return;
          }
        }
      }
    }

    const secretPatch: Record<string, string | null | undefined> = {};

    const stripeSecretKeyRaw = body.stripeSecretKey;
    const stripeSecretKey =
      typeof stripeSecretKeyRaw === "string"
        ? stripeSecretKeyRaw.trim() || null
        : undefined;
    if (stripeSecretKey !== undefined) {
      secretPatch.stripeSecretKey = stripeSecretKey;
    }

    const stripePublishableKeyRaw = body.stripePublishableKey;
    const stripePublishableKey =
      typeof stripePublishableKeyRaw === "string"
        ? stripePublishableKeyRaw.trim() || null
        : undefined;

    const stripeWebhookSecretRaw = body.stripeWebhookSecret;
    const stripeWebhookSecret =
      typeof stripeWebhookSecretRaw === "string"
        ? stripeWebhookSecretRaw.trim() || null
        : undefined;
    if (stripeWebhookSecret !== undefined) {
      secretPatch.stripeWebhookSecret = stripeWebhookSecret;
    }

    if (recaptchaSecretKey !== undefined) {
      secretPatch.recaptchaSecretKey = recaptchaSecretKey;
    }
    if (clearSmtpPassword) {
      secretPatch.smtpPass = null;
    } else if (smtpPass !== undefined) {
      secretPatch.smtpPass = smtpPass;
    }

    const s = await prisma.organizationSettings.upsert({
      where: { id: "default" },
      create: {
        id: "default",
        ...(workspaceName !== undefined ? { workspaceName } : {}),
        ...(siteDisplayName !== undefined ? { siteDisplayName } : {}),
        ...(publicSiteUrl !== undefined ? { publicSiteUrl } : {}),
        ...(announcementEmail !== undefined ? { announcementEmail } : {}),
        ...(adminNotifyEmails !== undefined ? { adminNotifyEmails } : {}),
        ...(smtpHost !== undefined ? { smtpHost } : {}),
        ...(smtpPort !== undefined ? { smtpPort } : {}),
        ...(smtpSecure !== undefined ? { smtpSecure } : {}),
        ...(smtpUser !== undefined ? { smtpUser } : {}),
        ...(mailFrom !== undefined ? { mailFrom } : {}),
        ...(billingEnabled !== undefined ? { billingEnabled } : {}),
        ...(stripePublishableKey !== undefined ? { stripePublishableKey } : {}),
        ...(checkoutMembershipName !== undefined
          ? { checkoutMembershipName }
          : {}),
        ...(checkoutRegistrationFeeName !== undefined
          ? { checkoutRegistrationFeeName }
          : {}),
        ...(checkoutMembershipPence !== undefined
          ? { checkoutMembershipPence }
          : {}),
        ...(checkoutRegistrationFeePence !== undefined
          ? { checkoutRegistrationFeePence }
          : {}),
        ...secretPatch,
        ...(recaptchaEnabled !== undefined ? { recaptchaEnabled } : {}),
        ...(recaptchaSiteKey !== undefined ? { recaptchaSiteKey } : {}),
        ...(staffRequire2fa !== undefined ? { staffRequire2fa } : {}),
        ...(invoiceLegalName !== undefined ? { invoiceLegalName } : {}),
        ...(invoiceVatNumber !== undefined ? { invoiceVatNumber } : {}),
        ...(invoiceAddress !== undefined ? { invoiceAddress } : {}),
        ...(invoiceFooterNote !== undefined ? { invoiceFooterNote } : {}),
        ...(googleAnalyticsMeasurementId !== undefined
          ? { googleAnalyticsMeasurementId }
          : {}),
        ...(googleAnalyticsPropertyId !== undefined
          ? { googleAnalyticsPropertyId }
          : {}),
        ...(googleAnalyticsServiceAccountJson !== undefined
          ? { googleAnalyticsServiceAccountJson }
          : {}),
      },
      update: {
        ...(workspaceName !== undefined ? { workspaceName } : {}),
        ...(siteDisplayName !== undefined ? { siteDisplayName } : {}),
        ...(publicSiteUrl !== undefined ? { publicSiteUrl } : {}),
        ...(announcementEmail !== undefined ? { announcementEmail } : {}),
        ...(adminNotifyEmails !== undefined ? { adminNotifyEmails } : {}),
        ...(smtpHost !== undefined ? { smtpHost } : {}),
        ...(smtpPort !== undefined ? { smtpPort } : {}),
        ...(smtpSecure !== undefined ? { smtpSecure } : {}),
        ...(smtpUser !== undefined ? { smtpUser } : {}),
        ...(mailFrom !== undefined ? { mailFrom } : {}),
        ...(billingEnabled !== undefined ? { billingEnabled } : {}),
        ...(stripePublishableKey !== undefined ? { stripePublishableKey } : {}),
        ...(checkoutMembershipName !== undefined
          ? { checkoutMembershipName }
          : {}),
        ...(checkoutRegistrationFeeName !== undefined
          ? { checkoutRegistrationFeeName }
          : {}),
        ...(checkoutMembershipPence !== undefined
          ? { checkoutMembershipPence }
          : {}),
        ...(checkoutRegistrationFeePence !== undefined
          ? { checkoutRegistrationFeePence }
          : {}),
        ...secretPatch,
        ...(recaptchaEnabled !== undefined ? { recaptchaEnabled } : {}),
        ...(recaptchaSiteKey !== undefined ? { recaptchaSiteKey } : {}),
        ...(staffRequire2fa !== undefined ? { staffRequire2fa } : {}),
        ...(invoiceLegalName !== undefined ? { invoiceLegalName } : {}),
        ...(invoiceVatNumber !== undefined ? { invoiceVatNumber } : {}),
        ...(invoiceAddress !== undefined ? { invoiceAddress } : {}),
        ...(invoiceFooterNote !== undefined ? { invoiceFooterNote } : {}),
        ...(googleAnalyticsMeasurementId !== undefined
          ? { googleAnalyticsMeasurementId }
          : {}),
        ...(googleAnalyticsPropertyId !== undefined
          ? { googleAnalyticsPropertyId }
          : {}),
        ...(googleAnalyticsServiceAccountJson !== undefined
          ? { googleAnalyticsServiceAccountJson }
          : {}),
      },
    });
    invalidateSmtpTransportCache();
    res.json({ settings: publicOrgSettings(s) });
  } catch (e) {
    console.error(e);
    const detail = e instanceof Error ? e.message : String(e);
    res.status(500).json({
      error: "Could not save settings",
      detail,
    });
  }
}

router.patch("/organization-settings", patchOrganizationSettings);
/** POST alias: some reverse proxies/WAFs block PATCH; same body as PATCH. */
router.post("/organization-settings", patchOrganizationSettings);
/** Prefer this URL in the app: avoids proxies that return 406 on POST to the same path as GET. */
router.post("/organization-settings/save", patchOrganizationSettings);

router.post("/organization-settings/test-email", async (req, res) => {
  try {
    const to = String(req.body?.to ?? "").trim().toLowerCase();
    if (!to || !to.includes("@")) {
      res.status(400).json({ error: "A valid recipient email address is required." });
      return;
    }
    const result = await sendAdminEmail(prisma, {
      subject: "SMTP test",
      text: `This is a test email confirming SMTP is working correctly.\n\nSent: ${new Date().toISOString()}`,
      overrideTo: to,
    });
    res.json({ ok: true });
  } catch (e) {
    console.error("[test-email]", e);
    const detail = e instanceof Error ? e.message : String(e);
    res.status(500).json({ error: `Send failed: ${detail}` });
  }
});

router.get("/analytics-summary", async (_req, res) => {
  try {
    const byTrade = await prisma.member.groupBy({
      by: ["trade"],
      _count: { id: true },
      orderBy: { _count: { id: "desc" } },
    });
    const [membersTotal, guidesTotal, applicationsByStatus] = await Promise.all([
      prisma.member.count(),
      prisma.guide.count(),
      prisma.application.groupBy({
        by: ["status"],
        _count: { id: true },
      }),
    ]);
    const org = await ensureOrgSettings();
    res.json({
      membersTotal,
      guidesTotal,
      membersByTrade: byTrade.map((r) => ({
        trade: r.trade,
        count: r._count.id,
      })),
      applicationsByStatus: applicationsByStatus.map((r) => ({
        status: r.status,
        count: r._count.id,
      })),
      googleAnalyticsMeasurementId:
        org.googleAnalyticsMeasurementId?.trim() || null,
    });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: "Could not load analytics" });
  }
});

/** GA4 Data API — env and/or Integrations (DB) credentials. */
router.get("/analytics-ga-report", async (_req, res) => {
  try {
    const org = await ensureOrgSettings();
    const report = await fetchGa4OverviewReport(org);
    res.json(report);
  } catch (e) {
    console.error(e);
    res.status(500).json({
      error: "Could not load Google Analytics report",
      detail: e instanceof Error ? e.message : String(e),
    });
  }
});
/** Applications */
function serializeAdminApplication(a: {
  createdAt: Date;
  updatedAt: Date;
  approvedAt: Date | null;
  registrationFeePaidAt: Date | null;
  manualMembershipExpiresAt?: Date | null;
  verificationProvider?: string | null;
  verificationStatus?: string | null;
  verificationSubmittedAt?: Date | null;
  verificationApprovedAt?: Date | null;
  verificationRejectedAt?: Date | null;
  verificationProviderApplicantId?: string | null;
  verificationProviderSessionId?: string | null;
  verificationFailureReason?: string | null;
  addressVerificationStatus?: string | null;
  addressVerificationApprovedAt?: Date | null;
  addressVerificationRejectedAt?: Date | null;
  addressVerificationFailureReason?: string | null;
  addressVerificationMatchedAddress?: string | null;
  addressVerificationMatchedApplication?: boolean | null;
  approvedByStaffName?: string | null;
  pendingPortalPassword?: string | null;
  pendingPortalPasswordExpires?: Date | null;
  xeroInvoiceId?: string | null;
  xeroInvoiceFailed?: boolean;
  vettingState: unknown;
  notes: string | null;
  vettingChecklist: string | null;
  documents: Array<{
    id: string;
    originalName: string;
    mimeType: string;
    sizeBytes: number;
    createdAt: Date;
  }>;
  createdMember?: {
    id: string;
    slug: string;
    tvId: string;
    membershipBillingType?: string | null;
    membershipExpiresAt?: Date | null;
  } | null;
}) {
  const {
    documents,
    createdMember,
    notes,
    vettingChecklist,
    approvedAt,
    createdAt,
    updatedAt,
    registrationFeePaidAt,
    manualMembershipExpiresAt: _manualMExp,
    verificationProvider,
    verificationStatus,
    verificationSubmittedAt,
    verificationApprovedAt,
    verificationRejectedAt,
    verificationProviderApplicantId,
    verificationProviderSessionId,
    verificationFailureReason,
    addressVerificationStatus,
    addressVerificationApprovedAt,
    addressVerificationRejectedAt,
    addressVerificationFailureReason,
    addressVerificationMatchedAddress,
    addressVerificationMatchedApplication,
    vettingState,
    approvedByStaffName,
    pendingPortalPassword: _pendingPw,
    pendingPortalPasswordExpires: _pendingPwExp,
    xeroInvoiceId,
    xeroInvoiceFailed,
    ...rest
  } = a;
  return {
    ...rest,
    approvedByStaffName: approvedByStaffName ?? null,
    xeroInvoiceId: xeroInvoiceId ?? null,
    xeroInvoiceFailed: Boolean(xeroInvoiceFailed),
    xeroInvoices: parseApplicationXeroInvoiceRefs(xeroInvoiceId),
    notes: sanitizeNullableDbString(notes),
    vettingChecklist: sanitizeNullableDbString(vettingChecklist),
    vettingState: mergeVettingStateFromDb(vettingState),
    createdAt: createdAt.toISOString(),
    updatedAt: updatedAt.toISOString(),
    approvedAt: approvedAt?.toISOString() ?? null,
    registrationFeePaidAt: registrationFeePaidAt?.toISOString() ?? null,
    manualMembershipExpiresAt:
      a.manualMembershipExpiresAt?.toISOString() ?? null,
    verificationProvider: verificationProvider ?? null,
    verificationStatus: verificationStatus ?? "NOT_STARTED",
    verificationSubmittedAt: verificationSubmittedAt?.toISOString() ?? null,
    verificationApprovedAt: verificationApprovedAt?.toISOString() ?? null,
    verificationRejectedAt: verificationRejectedAt?.toISOString() ?? null,
    verificationProviderApplicantId: verificationProviderApplicantId ?? null,
    verificationProviderSessionId: verificationProviderSessionId ?? null,
    verificationFailureReason: verificationFailureReason ?? null,
    addressVerificationStatus: addressVerificationStatus ?? "NOT_STARTED",
    addressVerificationApprovedAt:
      addressVerificationApprovedAt?.toISOString() ?? null,
    addressVerificationRejectedAt:
      addressVerificationRejectedAt?.toISOString() ?? null,
    addressVerificationFailureReason:
      addressVerificationFailureReason ?? null,
    addressVerificationMatchedAddress:
      addressVerificationMatchedAddress ?? null,
    addressVerificationMatchedApplication:
      addressVerificationMatchedApplication ?? null,
    createdMember: createdMember
      ? {
          id: createdMember.id,
          slug: createdMember.slug,
          tvId: createdMember.tvId,
          membershipBillingType: createdMember.membershipBillingType ?? null,
          membershipExpiresAt:
            createdMember.membershipExpiresAt?.toISOString() ?? null,
        }
      : null,
    documents: documents.map((d) => ({
      id: d.id,
      originalName: d.originalName,
      mimeType: d.mimeType,
      sizeBytes: d.sizeBytes,
      createdAt: d.createdAt.toISOString(),
    })),
  };
}

router.get("/applications", async (_req, res) => {
  try {
    const rows = await prisma.application.findMany({
      orderBy: { createdAt: "desc" },
      select: ADMIN_APPLICATION_FULL_SELECT,
    });
    res.json({
      applications: rows.map((a) => serializeAdminApplication(a)),
      sumsubEnabled: isSumsubConfigured(),
    });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: "Could not list applications" });
  }
});

router.patch("/applications/:id", async (req, res) => {
  try {
    const before = await prisma.application.findUnique({
      where: { id: req.params.id },
      select: ADMIN_APPLICATION_MUTATION_SELECT,
    });
    if (!before) {
      res.status(404).json({ error: "Not found" });
      return;
    }

    const { status, notes } = req.body ?? {};
    const allowed: ApplicationStatus[] = [
      "PENDING",
      "REVIEWING",
      "CONTACTED",
      "APPROVED",
      "DECLINED",
    ];
    const { vettingChecklist, vettingState: vettingStateBody } = req.body ?? {};
    const staffId = (req as Request & { staffId?: string }).staffId;

    const data: {
      status?: ApplicationStatus;
      notes?: string | null;
      vettingChecklist?: string | null;
      vettingState?: Prisma.InputJsonValue;
      approvedAt?: Date | null;
      approvedByStaffName?: string | null;
    } = {};
    if (status !== undefined) {
      const s = String(status) as ApplicationStatus;
      if (!allowed.includes(s)) {
        res.status(400).json({ error: "Invalid status" });
        return;
      }
      data.status = s;
    }
    if (notes !== undefined) {
      data.notes = String(notes).trim() || null;
    }
    if (vettingChecklist !== undefined) {
      data.vettingChecklist = String(vettingChecklist).trim() || null;
    }
    if (vettingStateBody !== undefined) {
      data.vettingState = vettingStateToPrismaJson(
        mergeVettingStateFromInput(vettingStateBody)
      );
    }

    const transitioningToApproved =
      data.status === "APPROVED" && before.status !== "APPROVED";
    const transitioningFromApproved =
      data.status !== undefined &&
      data.status !== "APPROVED" &&
      before.status === "APPROVED";

    if (transitioningToApproved) {
      data.approvedAt = new Date();
      if (staffId) {
        const staffRow = await prisma.staff.findUnique({
          where: { id: staffId },
          select: { name: true },
        });
        data.approvedByStaffName = (staffRow?.name ?? "").split(" ")[0].trim() || null;
      }
    }
    if (transitioningFromApproved) {
      data.approvedAt = null;
      data.approvedByStaffName = null;
    }

    if (
      transitioningToApproved &&
      before.verificationProvider === "sumsub" &&
      isSumsubConfigured() &&
      before.verificationStatus !== "APPROVED"
    ) {
      res.status(400).json({
        error:
          "Identity verification (Sumsub) must be completed and approved before the application can be approved.",
      });
      return;
    }

    if (transitioningToApproved && !before.createdMemberId) {
      const taken = await prisma.member.findFirst({
        where: { loginEmail: before.email.trim().toLowerCase() },
        select: { id: true },
      });
      if (taken) {
        res.status(400).json({
          error:
            "This work email already has a member portal login. Free or change that account first, then approve.",
        });
        return;
      }
    }

    await prisma.application.update({
      where: { id: req.params.id },
      data,
    });

    const full = await prisma.application.findUnique({
      where: { id: req.params.id },
      select: ADMIN_APPLICATION_FULL_SELECT,
    });
    if (!full) {
      res.status(404).json({ error: "Not found" });
      return;
    }

    // After approval: auto-charge membership from existing mandate, or provision if already paid
    if (transitioningToApproved) {
      // Attempt to provision if both fees were already paid before approval (edge case)
      const prov = await provisionIfApplicationPaid(prisma, req.params.id);
      if (prov.ok && prov.newlyCreated) {
        notifyMemberWelcome(prisma, { email: prov.email, name: prov.name, temporaryPassword: prov.temporaryPassword });
      }

      // Auto-charge membership via Stripe off-session PaymentIntent if not yet subscribed
      let autoChargeSucceeded = false;
      if (
        before.stripeCustomerId &&
        before.stripePaymentMethodId &&
        before.registrationFeePaidAt &&
        !before.membershipSubscribed &&
        !before.membershipAutoChargeInitiatedAt
      ) {
        try {
          const stripe = await getStripeClient();
          const billing = await getOrgBilling();
          const { membershipPence, membershipName } = checkoutLineConfig(billing);
          if (stripe) {
            await stripe.paymentIntents.create({
              amount: membershipPence,
              currency: "gbp",
              customer: before.stripeCustomerId,
              payment_method: before.stripePaymentMethodId,
              off_session: true,
              confirm: true,
              description: membershipName,
              metadata: {
                checkoutKind: "membership",
                applicationId: req.params.id,
                source: "auto_charge",
              },
            });
            autoChargeSucceeded = true;
            await prisma.application.update({
              where: { id: req.params.id },
              data: { membershipAutoChargeInitiatedAt: new Date() },
            });
          }
        } catch (err) {
          console.error("[approval] Stripe auto-charge membership failed", err);
          // Don't block the approval if this fails
        }
      }

      // Send approval email only if the member wasn't just provisioned.
      // If prov.newlyCreated is true, notifyMemberWelcome already covers the notification.
      if (!(prov.ok && prov.newlyCreated)) {
        notifyApplicantApprovedForPayment(prisma, {
          traderName: full.identifiablePerson,
          company: full.company,
          email: full.email,
          registrationFeePaid: Boolean(full.registrationFeePaidAt),
          applicationId: full.id,
          mandateOnFile: autoChargeSucceeded,
        });
      }
    }

    if (
      data.status !== undefined &&
      before.status !== data.status &&
      (data.status === "APPROVED" || data.status === "DECLINED")
    ) {
      notifyApplicationDecision(prisma, {
        id: full.id,
        company: full.company,
        trade: full.trade,
        email: full.email,
        status: full.status,
      });
    }

    res.json({
      application: serializeAdminApplication(full),
      memberProvisioned: null,
    });
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
    if (
      typeof e === "object" &&
      e &&
      "code" in e &&
      (e as { code?: string }).code === "NOT_FOUND"
    ) {
      res.status(404).json({ error: "Not found" });
      return;
    }
    res.status(400).json({ error: "Could not update application" });
  }
});


router.post("/applications/:id/sumsub-applicant", async (req, res) => {
  try {
    if (!isSumsubConfigured()) {
      res.status(400).json({ error: "Sumsub is not configured" });
      return;
    }
    const id = req.params.id;

    const ensured = await ensureSumsubApplicantForApplication(prisma, id);
    if (ensured.kind === "not_found") {
      res.status(404).json({ error: "Not found" });
      return;
    }

    res.json({
      applicantId: ensured.applicantId,
      inspectionId: ensured.inspectionId ?? null,
      externalUserId: ensured.externalUserId,
      reused: ensured.kind === "existing",
    });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: "Could not create Sumsub applicant" });
  }
});

router.post("/applications/:id/sumsub-link", async (req, res) => {
  try {
    if (!isSumsubConfigured()) {
      res.status(400).json({ error: "Sumsub is not configured" });
      return;
    }
    const id = req.params.id;
    const ensured = await ensureSumsubApplicantForApplication(prisma, id);
    if (ensured.kind === "not_found") {
      res.status(404).json({ error: "Not found" });
      return;
    }

    const siteBase = await publicSiteBase(prisma).catch(() => process.env.PUBLIC_SITE_URL?.trim() ?? "");
    const link = await generateSumsubWebSdkLink({
      userId: ensured.externalUserId,
      email: ensured.email,
      phone: ensured.phone,
      lang: "en",
      redirectUrl: siteBase
        ? `${siteBase}/join?app=${encodeURIComponent(id)}&email=${encodeURIComponent(ensured.email)}`
        : undefined,
    });

    // Email the link to the applicant rather than returning it to the admin.
    // The admin's browser must not open the Sumsub URL — it is the trader's selfie.
    const application = await prisma.application.findUnique({
      where: { id },
      select: { identifiablePerson: true, company: true },
    });
    const traderName = application?.identifiablePerson ?? application?.company ?? "Applicant";
    await notifyApplicantVerificationLink(prisma, {
      traderName,
      company: application?.company ?? "",
      email: ensured.email,
      verificationUrl: link.url,
    });

    res.json({
      emailed: true,
      email: ensured.email,
      applicantId: ensured.applicantId,
      inspectionId: ensured.inspectionId ?? null,
      externalUserId: ensured.externalUserId,
      reused: ensured.kind === "existing",
    });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: "Could not create Sumsub launch link" });
  }
});

router.post("/applications/:id/sumsub-sync", async (req, res) => {
  try {
    if (!isSumsubConfigured()) {
      res.status(400).json({ error: "Sumsub is not configured" });
      return;
    }
    const id = req.params.id;
    const application = await prisma.application.findUnique({
      where: { id },
      select: {
        id: true,
        company: true,
        identifiablePerson: true,
        email: true,
        createdMemberId: true,
        identifiablePersonAddress: true,
        verificationStatus: true,
        verificationSubmittedAt: true,
        verificationProviderApplicantId: true,
        verificationProviderSessionId: true,
        createdMember: {
          select: { slug: true },
        },
      },
    });
    if (!application) {
      res.status(404).json({ error: "Not found" });
      return;
    }
    if (!application.verificationProviderApplicantId) {
      res.status(400).json({ error: "No Sumsub applicant is recorded yet" });
      return;
    }

    const verificationData = await buildSumsubVerificationUpdate(application, {
      applicantId: application.verificationProviderApplicantId,
    });

    await prisma.application.update({
      where: { id: application.id },
      data: verificationData,
    });

    if (application.createdMemberId) {
      await prisma.member.update({
        where: { id: application.createdMemberId },
        data: verificationData,
      });
    }

    if (
      verificationData.verificationStatus &&
      verificationData.verificationStatus !== application.verificationStatus &&
      (verificationData.verificationStatus === "APPROVED" ||
        verificationData.verificationStatus === "REJECTED")
    ) {
      notifyApplicantVerificationOutcome(prisma, {
        traderName: application.identifiablePerson,
        company: application.company,
        email: application.email,
        status: verificationData.verificationStatus,
        failureReason: verificationData.verificationFailureReason ?? null,
        profileSlug: application.createdMember?.slug ?? null,
      });
    }

    const full = await prisma.application.findUnique({
      where: { id },
      select: ADMIN_APPLICATION_FULL_SELECT,
    });

    res.json({
      reviewStatus: verificationData.verificationStatus ?? null,
      application: full ? serializeAdminApplication(full) : undefined,
    });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: "Could not sync Sumsub status" });
  }
});
/** Retry member creation after payment has been recorded. Requires APPROVED + recorded payment. */
router.post("/applications/:id/provision-member", async (req, res) => {
  try {
    const id = req.params.id;
    const before = await prisma.application.findUnique({
      where: { id },
      select: ADMIN_APPLICATION_MUTATION_SELECT,
    });
    if (!before) {
      res.status(404).json({ error: "Not found" });
      return;
    }
    if (before.status !== "APPROVED") {
      res.status(400).json({ error: "Application must be approved first" });
      return;
    }
    if (!before.registrationFeePaidAt && !before.membershipSubscribed) {
      res.status(400).json({
        error:
          "No payment is recorded yet. The listing is created when the applicant completes checkout, or retry here after payment is confirmed.",
      });
      return;
    }
    const prov = await tryProvisionMemberForApplication(prisma, id);
    if (prov.kind === "email_in_use") {
      res.status(400).json({
        error: `The email ${prov.email} is already used for a member portal.`,
      });
      return;
    }
    if (prov.kind === "membership_expiry_missing") {
      res.status(400).json({
        error:
          "Membership payment is recorded without an expiry date. Re-save the membership payment before creating the profile.",
      });
      return;
    }
    if (prov.kind === "not_approved") {
      res.status(400).json({ error: "Application is not approved" });
      return;
    }
    let memberProvisioned: {
      temporaryPassword?: string;
      member: { id: string; slug: string; tvId: string };
      alreadyProvisioned?: boolean;
    } | null = null;
    if (prov.kind === "created") {
      memberProvisioned = {
        temporaryPassword: prov.temporaryPassword,
        member: prov.member,
      };
      notifyMemberWelcome(prisma, {
        email: before.email.trim().toLowerCase(),
        name: (before.identifiablePerson?.trim() || before.company).trim(),
        temporaryPassword: prov.temporaryPassword,
      });
    } else if (prov.kind === "already_linked") {
      memberProvisioned = {
        member: prov.member,
        alreadyProvisioned: true,
      };
    }
    const full = await prisma.application.findUnique({
      where: { id },
      select: ADMIN_APPLICATION_FULL_SELECT,
    });
    res.json({
      memberProvisioned,
      application: full ? serializeAdminApplication(full) : undefined,
    });
  } catch (e: unknown) {
    console.error(e);
    if (
      typeof e === "object" &&
      e &&
      "code" in e &&
      (e as { code?: string }).code === "NOT_FOUND"
    ) {
      res.status(404).json({ error: "Not found" });
      return;
    }
    res.status(500).json({ error: "Could not create member profile" });
  }
});

router.post("/applications/:id/resend-receipt", async (req, res) => {
  try {
    const id = req.params.id;
    const application = await prisma.application.findUnique({
      where: { id },
      select: {
        id: true,
        company: true,
        email: true,
        stripeCustomerId: true,
        registrationFeePaidAt: true,
        membershipSubscribed: true,
      },
    });
    if (!application) {
      res.status(404).json({ error: "Not found" });
      return;
    }
    if (!application.stripeCustomerId) {
      res.status(400).json({
        error:
          "No Stripe customer is recorded for this application, so a receipt cannot be regenerated automatically.",
      });
      return;
    }
    if (!application.registrationFeePaidAt && !application.membershipSubscribed) {
      res.status(400).json({
        error: "No Stripe payment is recorded on this application yet.",
      });
      return;
    }

    const stripe = await getStripeClient();
    if (!stripe) {
      res.status(400).json({ error: "Stripe is not configured" });
      return;
    }

    const query = `metadata['applicationId']:'${id}' AND status:'succeeded'`;
    const results = await stripe.paymentIntents.search({
      query,
      limit: 10,
    });
    const paymentIntent = results.data.find((pi) => {
      const kind = pi.metadata?.checkoutKind;
      return kind === "registration_fee" || kind === "membership";
    });
    if (!paymentIntent) {
      res.status(404).json({
        error:
          "No successful Stripe payment was found for this application. Manual payments need a separate receipt process.",
      });
      return;
    }

    const paidAt = new Date(paymentIntent.created * 1000);
    const { description, invoiceDescription } = describeApplicationReceipt({
      checkoutKind: paymentIntent.metadata?.checkoutKind,
      amountPence: paymentIntent.amount_received || paymentIntent.amount,
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
    if (!pdf) {
      res.status(500).json({
        error: "The receipt PDF could not be generated for this payment.",
      });
      return;
    }

    await sendXeroInvoiceToTrader(prisma, {
      traderName: application.company || "Trader",
      email: application.email,
      pdfBuffer: pdf,
      invoiceDescription,
    });

    res.json({
      ok: true,
      emailedTo: application.email,
      invoiceDescription,
      paymentReference: paymentIntent.id,
    });
  } catch (e: unknown) {
    console.error("[admin] receipt resend failed", e);
    const detail = e instanceof Error ? e.message : String(e);
    res.status(500).json({
      error: "Could not resend receipt",
      detail,
    });
  }
});

/**
 * Record payment received outside Stripe checkout (bank transfer, cash, phone, etc.).
 * Same outcome as a successful Checkout webhook: flags + provision when eligible.
 */
router.post("/applications/:id/record-manual-payment", async (req, res) => {
  try {
    const id = req.params.id;
    const type = String(req.body?.type ?? "").trim();
    if (type !== "registration_fee" && type !== "membership") {
      res
        .status(400)
        .json({ error: "type must be registration_fee or membership" });
      return;
    }
    const before = await prisma.application.findUnique({
      where: { id },
      select: ADMIN_APPLICATION_MUTATION_SELECT,
    });
    if (!before) {
      res.status(404).json({ error: "Not found" });
      return;
    }
    if (before.status !== "APPROVED") {
      res.status(400).json({ error: "Application must be approved first" });
      return;
    }
    if (type === "registration_fee") {
      if (before.registrationFeePaidAt) {
        res.status(400).json({ error: "Registration fee is already recorded" });
        return;
      }
      await prisma.application.update({
        where: { id },
        data: { registrationFeePaidAt: new Date() },
      });
    } else {
      const exp = parseManualMembershipExpiryInput(
        req.body?.membershipExpiresAt
      );
      const memberRow = before.createdMemberId
        ? await prisma.member.findUnique({
            where: { id: before.createdMemberId },
            select: { id: true, membershipBillingType: true },
          })
        : null;
      if (!before.membershipSubscribed) {
        if (!exp) {
          res.status(400).json({
            error:
              "membershipExpiresAt is required for manual membership (YYYY-MM-DD or ISO date)",
          });
          return;
        }
        await prisma.application.update({
          where: { id },
          data: {
            membershipSubscribed: true,
            manualMembershipExpiresAt: exp,
          },
        });
        if (memberRow) {
          await prisma.member.update({
            where: { id: memberRow.id },
            data: {
              membershipBillingType: "manual",
              membershipExpiresAt: exp,
              membershipRenewalPricePence: null,
            },
          });
        }
      } else {
        if (!exp) {
          res.status(400).json({
            error:
              "membershipExpiresAt is required to update manual membership expiry",
          });
          return;
        }
        if (before.manualMembershipExpiresAt == null) {
          res.status(400).json({
            error:
              "This membership does not yet have a manual expiry date. Enter a new expiry date to continue.",
          });
          return;
        }
        await prisma.application.update({
          where: { id },
          data: { manualMembershipExpiresAt: exp },
        });
        if (memberRow) {
          await prisma.member.update({
            where: { id: memberRow.id },
            data: {
              membershipBillingType: "manual",
              membershipExpiresAt: exp,
              membershipRenewalPricePence: null,
            },
          });
        }
      }
    }

    const prov = await provisionIfApplicationPaid(prisma, id);
    let memberProvisioned: {
      temporaryPassword?: string;
      member: { id: string; slug: string; tvId: string };
      alreadyProvisioned?: boolean;
    } | null = null;
    if (!prov.ok && prov.reason === "email_in_use") {
      const app = await prisma.application.findUnique({
        where: { id },
        select: { email: true },
      });
      res.status(400).json({
        error: `The email ${app?.email ?? "(unknown)"} is already used for a member portal.`,
      });
      return;
    }
    if (!prov.ok && prov.reason === "membership_expiry_missing") {
      res.status(400).json({
        error:
          "Membership payment is recorded without an expiry date. Enter an expiry date and try again.",
      });
      return;
    }
    if (!prov.ok && prov.reason === "not_approved") {
      res.status(400).json({ error: "Application is not approved" });
      return;
    }
    if (prov.ok && prov.newlyCreated) {
      memberProvisioned = {
        temporaryPassword: prov.temporaryPassword,
        member: (
          await prisma.application.findUnique({
            where: { id },
            select: {
              createdMember: {
                select: { id: true, slug: true, tvId: true },
              },
            },
          })
        )?.createdMember ?? { id: "", slug: "", tvId: "" },
      };
      notifyMemberWelcome(prisma, {
        email: before.email.trim().toLowerCase(),
        name: (before.identifiablePerson?.trim() || before.company).trim(),
        temporaryPassword: prov.temporaryPassword,
      });
    } else if (!prov.ok && prov.reason === "already_provisioned") {
      const linked = before.createdMemberId
        ? await prisma.member.findUnique({
            where: { id: before.createdMemberId },
            select: { id: true, slug: true, tvId: true },
          })
        : null;
      if (linked) {
        memberProvisioned = {
          member: linked,
          alreadyProvisioned: true,
        };
      }
    }
    const full = await prisma.application.findUnique({
      where: { id },
      select: ADMIN_APPLICATION_FULL_SELECT,
    });
    res.json({
      memberProvisioned,
      application: full ? serializeAdminApplication(full) : undefined,
    });
  } catch (e: unknown) {
    console.error(e);
    if (
      typeof e === "object" &&
      e &&
      "code" in e &&
      (e as { code?: string }).code === "NOT_FOUND"
    ) {
      res.status(404).json({ error: "Not found" });
      return;
    }
    res.status(500).json({ error: "Could not record manual payment" });
  }
});

router.post("/applications/:id/retry-xero-invoice", async (req, res) => {
  try {
    const id = req.params.id;
    const type = String(req.body?.type ?? "").trim();
    if (type !== "registration_fee" && type !== "membership") {
      res.status(400).json({ error: "type must be registration_fee or membership" });
      return;
    }
    const retried = await retryApplicationXeroInvoice(id, type);
    const full = await prisma.application.findUnique({
      where: { id },
      select: ADMIN_APPLICATION_FULL_SELECT,
    });
    res.json({
      retried,
      application: full ? serializeAdminApplication(full) : undefined,
    });
  } catch (e: unknown) {
    console.error(e);
    const message = e instanceof Error ? e.message : "Could not retry Xero invoices";
    if (message === "Application not found") {
      res.status(404).json({ error: message });
      return;
    }
    if (
      message === "A Xero invoice is already stored for that payment" ||
      message === "Registration fee is not recorded on this application" ||
      message === "Membership payment is not recorded on this application"
    ) {
      res.status(400).json({ error: message });
      return;
    }
    res.status(500).json({ error: message });
  }
});

router.get(
  "/applications/:applicationId/documents/:documentId/file",
  async (req, res) => {
    try {
      const doc = await prisma.applicationDocument.findFirst({
        where: {
          id: req.params.documentId,
          applicationId: req.params.applicationId,
        },
      });
      if (!doc) {
        res.status(404).json({ error: "Not found" });
        return;
      }
      const resolved = applicationDocumentResolvedPath(
        doc.applicationId,
        doc.storedName
      );
      if (!resolved || !fs.existsSync(resolved)) {
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
  }
);

/** ── Staff accounts management ─────────────────────────── */

router.get("/staff", async (_req, res) => {
  try {
    const rows = await prisma.staff.findMany({
      orderBy: { createdAt: "asc" },
      select: { id: true, name: true, email: true, createdAt: true },
    });
    res.json({ staff: rows.map((s) => ({ ...s, createdAt: s.createdAt.toISOString() })) });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: "Could not list staff" });
  }
});

router.post("/staff", async (req, res) => {
  try {
    const name = String(req.body?.name ?? "").trim();
    const email = String(req.body?.email ?? "").trim().toLowerCase();
    const password = String(req.body?.password ?? "").replace(/[\r\n]+/g, "").trim();
    if (!name) {
      res.status(400).json({ error: "Name is required" });
      return;
    }
    if (!email || !email.includes("@")) {
      res.status(400).json({ error: "A valid email is required" });
      return;
    }
    if (password.length < 8) {
      res.status(400).json({ error: "Password must be at least 8 characters" });
      return;
    }
    const existing = await prisma.staff.findUnique({ where: { email } });
    if (existing) {
      res.status(400).json({ error: "A staff account with that email already exists" });
      return;
    }
    const hash = await bcrypt.hash(password, 12);
    const created = await prisma.staff.create({
      data: { name, email, password: hash },
      select: { id: true, name: true, email: true, createdAt: true },
    });
    res.status(201).json({ staff: { ...created, createdAt: created.createdAt.toISOString() } });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: "Could not create staff account" });
  }
});

router.patch("/staff/:id", async (req, res) => {
  try {
    const { id } = req.params;
    const requestingStaffId = (req as Request & { staffId?: string }).staffId;
    const name = typeof req.body?.name === "string" ? req.body.name.trim() || null : undefined;
    const email = typeof req.body?.email === "string" ? req.body.email.trim().toLowerCase() || null : undefined;
    const newPassword = typeof req.body?.password === "string"
      ? req.body.password.replace(/[\r\n]+/g, "").trim() || null
      : null;

    const target = await prisma.staff.findUnique({ where: { id }, select: { id: true } });
    if (!target) {
      res.status(404).json({ error: "Staff member not found" });
      return;
    }

    const data: { name?: string; email?: string; password?: string } = {};
    if (name !== undefined && name !== null) data.name = name;
    if (email !== undefined && email !== null) {
      if (!email.includes("@")) {
        res.status(400).json({ error: "Invalid email address" });
        return;
      }
      const taken = await prisma.staff.findFirst({ where: { email, NOT: { id } } });
      if (taken) {
        res.status(400).json({ error: "That email is already used by another staff account" });
        return;
      }
      data.email = email;
    }
    if (newPassword) {
      if (newPassword.length < 8) {
        res.status(400).json({ error: "Password must be at least 8 characters" });
        return;
      }
      data.password = await bcrypt.hash(newPassword, 12);
    }

    const updated = await prisma.staff.update({
      where: { id },
      data,
      select: { id: true, name: true, email: true, createdAt: true },
    });
    res.json({ staff: { ...updated, createdAt: updated.createdAt.toISOString() } });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: "Could not update staff account" });
  }
});

router.delete("/staff/:id", async (req, res) => {
  try {
    const { id } = req.params;
    const requestingStaffId = (req as Request & { staffId?: string }).staffId;
    if (requestingStaffId === id) {
      res.status(400).json({ error: "You cannot delete your own account" });
      return;
    }
    const total = await prisma.staff.count();
    if (total <= 1) {
      res.status(400).json({ error: "Cannot delete the last staff account" });
      return;
    }
    await prisma.staff.delete({ where: { id } });
    res.json({ ok: true });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: "Could not delete staff account" });
  }
});

router.get("/xero-status", async (_req, res) => {
  try {
    const settings = await prisma.organizationSettings.findUnique({
      where: { id: "default" },
      select: { xeroTenantId: true, xeroTokenSetJson: true },
    });
    res.json({
      connected: Boolean(settings?.xeroTenantId && settings?.xeroTokenSetJson),
      tenantId: settings?.xeroTenantId ?? null,
    });
  } catch (e) {
    res.status(500).json({ error: "Could not read Xero status" });
  }
});

router.post("/xero-disconnect", async (_req, res) => {
  try {
    await prisma.organizationSettings.update({
      where: { id: "default" },
      data: { xeroTokenSetJson: null, xeroTenantId: null },
    });
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ error: "Could not disconnect Xero" });
  }
});

router.get("/xero-consent-url", async (_req, res) => {
  try {
    const url = await buildConsentUrlAndStore();
    res.json({ url });
  } catch (e) {
    res.status(500).json({ error: "Could not build Xero consent URL" });
  }
});

export default router;
