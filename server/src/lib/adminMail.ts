import nodemailer from "nodemailer";
import { Resend } from "resend";
import type { PrismaClient } from "@prisma/client";

type EmailAttachment = {
  filename: string;
  content: Buffer;
  contentType: string;
};

async function sendViaResend(
  apiKey: string,
  opts: { from: string; to: string; subject: string; text: string; html?: string; attachments?: EmailAttachment[] }
): Promise<void> {
  const resend = new Resend(apiKey);
  const result = await resend.emails.send({
    from: opts.from,
    to: opts.to.split(/,\s*/).map((s) => s.trim()).filter(Boolean),
    subject: opts.subject,
    text: opts.text,
    ...(opts.html ? { html: opts.html } : {}),
    ...(opts.attachments?.length ? { attachments: opts.attachments.map(a => ({ filename: a.filename, content: a.content })) } : {}),
  });
  if (result.error) {
    throw new Error(`Resend: ${result.error.message}`);
  }
}

function buildEmailHtml(textBody: string, footerImageUrl: string): string {
  const lines = textBody
    .split("\n")
    .map((l) => (l.trim() === "" ? "<br>" : `${l.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")}<br>`))
    .join("\n");
  return `<!DOCTYPE html><html><body style="font-family:Arial,sans-serif;font-size:14px;color:#333;max-width:600px;margin:0 auto;padding:20px;"><div style="line-height:1.6;">${lines}</div><div style="margin-top:24px;border-top:1px solid #eee;padding-top:16px;"><img src="${footerImageUrl}" alt="Trader Watchdog Support Team" style="max-width:100%;height:auto;" /></div></body></html>`;
}

let cachedTransport: nodemailer.Transporter | null | undefined;

/** Call after saving SMTP settings in the database. */
export function invalidateSmtpTransportCache(): void {
  cachedTransport = undefined;
}

async function getOrgSmtp(prisma: PrismaClient) {
  return prisma.organizationSettings.findUnique({
    where: { id: "default" },
    select: {
      smtpHost: true,
      smtpPort: true,
      smtpSecure: true,
      smtpUser: true,
      smtpPass: true,
      mailFrom: true,
    },
  });
}

async function getTransport(
  prisma: PrismaClient
): Promise<nodemailer.Transporter | null> {
  if (cachedTransport !== undefined) return cachedTransport;
  const org = await getOrgSmtp(prisma);
  const host =
    process.env.SMTP_HOST?.trim() || org?.smtpHost?.trim() || "";
  if (!host) {
    cachedTransport = null;
    return null;
  }
  const portRaw =
    process.env.SMTP_PORT?.trim() ||
    (org?.smtpPort != null ? String(org.smtpPort) : "");
  const port = Number(portRaw || "587") || 587;
  const secureEnv = process.env.SMTP_SECURE?.trim().toLowerCase();
  const secure =
    secureEnv === "true" ||
    secureEnv === "1" ||
    (org?.smtpSecure ?? false) ||
    port === 465;
  const user = process.env.SMTP_USER?.trim() || org?.smtpUser?.trim() || "";
  const pass = process.env.SMTP_PASS?.trim() || org?.smtpPass?.trim() || "";
  cachedTransport = nodemailer.createTransport({
    host,
    port,
    secure,
    ...(user || pass
      ? {
          auth: {
            user: user || "",
            pass: pass || "",
          },
        }
      : {}),
  });
  return cachedTransport;
}

const EMAIL_FOOTER = [
  "",
  "--",
  "The Admin Team",
  "admin@traderwatchdog.co.uk",
  "www.traderwatchdog.co.uk",
  "",
  "Trader Watchdog Ltd. Company number 17173750",
  "4th Floor Office, 205 Regent St, London W1B 4HB",
].join("\n");

export async function getBrandName(prisma: PrismaClient): Promise<string> {
  const s = await prisma.organizationSettings.findUnique({
    where: { id: "default" },
    select: { siteDisplayName: true, workspaceName: true },
  });
  const name =
    s?.siteDisplayName?.trim() ||
    s?.workspaceName?.trim() ||
    "";
  return name || "Trader Watchdog";
}

async function mailFrom(prisma: PrismaClient): Promise<string> {
  const env = process.env.MAIL_FROM?.trim();
  if (env) return env;
  const org = await prisma.organizationSettings.findUnique({
    where: { id: "default" },
    select: { mailFrom: true },
  });
  const raw = org?.mailFrom?.trim();
  if (raw) return raw;
  const brand = await getBrandName(prisma);
  return `${brand} <noreply@localhost>`;
}

async function resolveRecipients(prisma: PrismaClient): Promise<string[]> {
  const envList = process.env.ADMIN_NOTIFY_EMAILS?.trim();
  if (envList) {
    return envList
      .split(/[,;]+/)
      .map((s) => s.trim().toLowerCase())
      .filter(Boolean);
  }
  const org = await prisma.organizationSettings.findUnique({
    where: { id: "default" },
    select: {
      adminNotifyEmails: true,
      announcementEmail: true,
    },
  });
  const multi = org?.adminNotifyEmails?.trim();
  if (multi) {
    return multi
      .split(/[,;]+/)
      .map((s) => s.trim().toLowerCase())
      .filter(Boolean);
  }
  const a = org?.announcementEmail?.trim().toLowerCase();
  if (a) return [a];
  const contact = process.env.CONTACT_EMAIL?.trim().toLowerCase();
  if (contact) return [contact];
  return [];
}

function resolveRedirectRecipients(): string[] {
  const envList = process.env.EMAIL_REDIRECT_TO?.trim();
  if (!envList) return [];
  return envList
    .split(/[,;]+/)
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean);
}

function redirectedText(originalTo: string, text: string): string {
  return [`[Email redirect active] Original recipient: ${originalTo}`, "", text].join(
    "\n"
  );
}

export async function publicSiteBase(prisma: PrismaClient): Promise<string> {
  const org = await prisma.organizationSettings.findUnique({
    where: { id: "default" },
    select: { publicSiteUrl: true },
  });
  const fromDb = org?.publicSiteUrl?.trim();
  const fromEnv = process.env.PUBLIC_SITE_URL?.trim();
  const u = fromDb || fromEnv || "";
  return u.replace(/\/$/, "") || "http://localhost:5173";
}

/**
 * Sends a plain-text email to ops addresses when SMTP + at least one recipient exist.
 * Pass `overrideTo` to send to a specific address instead (used for SMTP testing).
 */
export async function sendAdminEmail(
  prisma: PrismaClient,
  opts: { subject: string; text: string; overrideTo?: string; attachments?: EmailAttachment[] }
): Promise<void> {
  const resendKey = process.env.RESEND_API_KEY?.trim();
  const transport = resendKey ? null : await getTransport(prisma);
  if (!resendKey && !transport) {
    if (opts.overrideTo) {
      throw new Error("Email is not configured. Set RESEND_API_KEY or save SMTP settings first.");
    }
    console.warn(
      "[admin-mail] Skipped admin email: email is not configured"
    );
    return;
  }
  let to: string[];
  if (opts.overrideTo) {
    to = [opts.overrideTo];
  } else {
    const redirectedTo = resolveRedirectRecipients();
    to = redirectedTo.length > 0 ? redirectedTo : await resolveRecipients(prisma);
    if (to.length === 0) {
      console.warn(
        "[admin-mail] Skipped (no recipients): set EMAIL_REDIRECT_TO for test routing, ADMIN_NOTIFY_EMAILS env, Staff -> Settings notification emails / ops email, or CONTACT_EMAIL"
      );
      return;
    }
  }
  const brand = await getBrandName(prisma);
  const from = await mailFrom(prisma);
  const subject = opts.subject.startsWith("[")
    ? opts.subject
    : `[${brand}] ${opts.subject}`;
  const text = opts.overrideTo ? opts.text : (
    resolveRedirectRecipients().length > 0
      ? redirectedText("admin notification list", opts.text)
      : opts.text
  );
  if (resendKey) {
    await sendViaResend(resendKey, {
      from,
      to: to.join(", "),
      subject,
      text,
      attachments: opts.attachments,
    });
  } else {
    await transport!.sendMail({
      from,
      to: to.join(", "),
      subject,
      text,
      ...(opts.attachments ? { attachments: opts.attachments } : {}),
    });
  }
}

export async function sendApplicantEmail(
  prisma: PrismaClient,
  opts: { to: string; subject: string; text: string; attachments?: EmailAttachment[] }
): Promise<void> {
  const resendKey = process.env.RESEND_API_KEY?.trim();
  const transport = resendKey ? null : await getTransport(prisma);
  if (!resendKey && !transport) {
    console.warn(
      `[admin-mail] Skipped applicant email to ${opts.to || "(blank)"}: email is not configured`
    );
    return;
  }
  const originalTo = opts.to.trim().toLowerCase();
  if (!originalTo) {
    console.warn("[admin-mail] Skipped applicant email: recipient address is blank");
    return;
  }
  const redirectedTo = resolveRedirectRecipients();
  const to = redirectedTo.length > 0 ? redirectedTo.join(", ") : originalTo;
  const brand = await getBrandName(prisma);
  const from = await mailFrom(prisma);
  const subject = opts.subject.startsWith("[")
    ? opts.subject
    : `[${brand}] ${opts.subject}`;
  const body = (redirectedTo.length > 0 ? redirectedText(originalTo, opts.text) : opts.text) + EMAIL_FOOTER;
  const siteBase = await publicSiteBase(prisma);
  const html = buildEmailHtml(body, `${siteBase}/email-footer.png`);
  if (resendKey) {
    await sendViaResend(resendKey, { from, to, subject, text: body, html, attachments: opts.attachments });
  } else {
    await transport!.sendMail({ from, to, subject, text: body, html, ...(opts.attachments ? { attachments: opts.attachments } : {}) });

  }
}

export function notifyAdminsFireAndForget(
  prisma: PrismaClient,
  subject: string,
  text: string
): void {
  void sendAdminEmail(prisma, { subject, text }).catch((e) => {
    console.error("[admin-mail] send failed", e);
  });
}

export function notifyNewApplication(
  prisma: PrismaClient,
  row: {
    id: string;
    company: string;
    trade: string;
    email: string;
    phone?: string | null;
    postcode: string;
  }
): void {
  void (async () => {
    const base = await publicSiteBase(prisma);
    const text = [
      "A new membership application was submitted.",
      "",
      `Company: ${row.company}`,
      `Trade: ${row.trade}`,
      `Email: ${row.email}`,
      row.phone ? `Phone: ${row.phone}` : null,
      `Postcode: ${row.postcode}`,
      "",
      `Review: ${base}/staff/applications`,
      `Application id: ${row.id}`,
    ].filter(Boolean).join("\n");
    notifyAdminsFireAndForget(
      prisma,
      `New application — ${row.company}`,
      text
    );
  })();
}

export function notifyApplicationDecision(
  prisma: PrismaClient,
  row: {
    id: string;
    company: string;
    trade: string;
    email: string;
    status: string;
  }
): void {
  void (async () => {
    const base = await publicSiteBase(prisma);
    const text = [
      `Application status is now ${row.status}.`,
      "",
      `Company: ${row.company}`,
      `Trade: ${row.trade}`,
      `Applicant email: ${row.email}`,
      "",
      `Open: ${base}/staff/applications`,
      `Application id: ${row.id}`,
    ].join("\n");
    notifyAdminsFireAndForget(
      prisma,
      `Application ${row.status} — ${row.company}`,
      text
    );
  })();
}

export function notifyApplicantSubmissionReceived(
  prisma: PrismaClient,
  row: {
    id: string;
    company: string;
    traderName?: string | null;
    trade: string;
    email: string;
  }
): void {
  void (async () => {
    const traderName = row.traderName?.trim() || row.company;
    const supportEmail = "admin@traderwatchdog.co.uk";
    const text = [
      `Hi ${traderName},`,
      "",
      "Welcome to Trader Watchdog - great to have you with us. You've taken a big step toward showing customers you're genuine, insured, and accountable.",
      "",
      "The next step is identity verification. If Sumsub is enabled for your application, you will receive a separate secure verification link by email and you can also return to your application status page at any time to continue.",
      "",
      "Once your identity verification is complete, our team will review your application. If it is approved, we will then invite you to pay the registration fee and first annual portal fee together.",
      "",
      `If you ever need help, just email us at ${supportEmail}.`,
      "",
      "Thanks again for joining us,",
      "The Trader Watchdog Team",
    ].join("\n");

    await sendApplicantEmail(prisma, {
      to: row.email,
      subject: "Welcome to Trader Watchdog - Let's Get You Verified",
      text,
    });
  })().catch((e) => {
    console.error("[admin-mail] applicant submission send failed", e);
  });
}

export function notifyApplicantVerificationOutcome(
  prisma: PrismaClient,
  row: {
    traderName?: string | null;
    company: string;
    email: string;
    status: "APPROVED" | "REJECTED";
    failureReason?: string | null;
    profileSlug?: string | null;
    applicationId?: string | null;
  }
): void {
  void (async () => {
    const base = await publicSiteBase(prisma);
    const memberLoginUrl = `${base}/member/login`;
    const joinUrl = row.applicationId
      ? `${base}/join?app=${row.applicationId}&email=${encodeURIComponent(row.email)}`
      : null;
    const traderName = row.traderName?.trim() || row.company;

    const subject =
      row.status === "APPROVED"
        ? "Identity Verification Complete - Application Under Review"
        : "We Couldn't Complete Your Verification";

    const text =
      row.status === "APPROVED"
        ? [
            `Hi ${traderName},`,
            "",
            "Your identity verification is complete — thank you for completing that step.",
            "",
            joinUrl
              ? `Your application status page has been updated and Trader Watchdog will now complete the final application review:\n${joinUrl}`
              : "Your application status page has been updated and Trader Watchdog will now complete the final application review.",
            "",
            "If your application is approved, we will email you the final activation payment step. If it is not approved, no charge will be taken.",
            "",
            "If you need anything in the meantime, just reply to this email.",
            "The Trader Watchdog Team",
          ].join("\n")
        : [
            `Hi ${traderName},`,
            "",
            "We've reviewed your documents but unfortunately couldn't verify your account because:",
            row.failureReason
              ? `- ${row.failureReason}`
              : "- We still need corrected or additional evidence before we can approve the verification.",
            "",
            "If you can provide updated or correct documents, we're happy to review again.",
            "If you need help, just reply to this email.",
            "The Trader Watchdog Team",
          ].join("\n");

    await sendApplicantEmail(prisma, {
      to: row.email,
      subject,
      text,
    });
  })().catch((e) => {
    console.error("[admin-mail] applicant verification send failed", e);
  });
}

export function notifyApplicantApprovedForPayment(
  prisma: PrismaClient,
  row: {
    traderName?: string | null;
    company: string;
    email: string;
    registrationFeePaid: boolean;
    applicationId: string;
    mandateOnFile?: boolean;
  }
): void {
  void (async () => {
    const base = await publicSiteBase(prisma);
    const joinUrl = `${base}/join?app=${row.applicationId}&email=${encodeURIComponent(row.email)}`;
    const traderName = row.traderName?.trim() || row.company;
    const nextStep = row.mandateOnFile
      ? "Your registration fee is already paid. We have submitted your annual portal fee payment via the Direct Debit you set up — no further action is needed. Your public profile and member login will be created automatically once the payment clears (usually 3–5 working days)."
      : row.registrationFeePaid
        ? "Your registration fee is confirmed. The final step is to pay the annual portal fee. Use the secure link below to complete this — once payment is confirmed, your public profile and member login will be created."
        : "Use the secure link below to pay the registration fee and first annual portal fee together. Once payment is confirmed, your public profile and member login will be created.";
    const continueSection =
      row.mandateOnFile
        ? ""
        : `\nComplete your payment here:\n${joinUrl}\n`;
    const text = [
      `Hi ${traderName},`,
      "",
      "Good news - your Trader Watchdog application has been approved.",
      "",
      nextStep,
      continueSection,
      "If you need help, just reply to this email.",
      "The Trader Watchdog Team",
    ].join("\n");

    await sendApplicantEmail(prisma, {
      to: row.email,
      subject: "Your Application Has Been Approved - Activation Payment Ready",
      text,
    });
  })().catch((e) => {
    console.error("[admin-mail] applicant approval send failed", e);
  });
}

export function notifyApplicantVerificationLink(
  prisma: PrismaClient,
  row: {
    traderName?: string | null;
    company: string;
    email: string;
    verificationUrl: string;
  }
): void {
  void (async () => {
    const traderName = row.traderName?.trim() || row.company;
    const brand = await getBrandName(prisma);
    const text = [
      `Hi ${traderName},`,
      "",
      `Your ${brand} identity verification is now ready.`,
      "",
      "Please complete your verification using the secure link below. You will need to:",
      "  • Take a photo of a government-issued ID (passport or driving licence)",
      "  • Take a short selfie to confirm your likeness",
      "  • Provide proof of your business address",
      "",
      `Start verification: ${row.verificationUrl}`,
      "",
      "The link is valid for 24 hours. If it has expired, you can request a new one from your application status page.",
      "",
      "Once verification is complete, your application status page will update with the next step.",
      "",
      "If you need help, just reply to this email.",
      `The ${brand} Team`,
    ].join("\n");

    await sendApplicantEmail(prisma, {
      to: row.email,
      subject: `Action Required: Complete Your ${brand} Identity Verification`,
      text,
    });
  })().catch((e) => {
    console.error("[admin-mail] applicant verification link send failed", e);
  });
}

export function notifyMemberWelcome(
  prisma: PrismaClient,
  row: {
    email: string;
    name: string;
    temporaryPassword: string;
  }
): void {
  void (async () => {
    const base = await publicSiteBase(prisma);
    const loginUrl = `${base}/member/login`;
    const brand = await getBrandName(prisma);
    const text = [
      `Hi ${row.name},`,
      "",
      `Your ${brand} member portal account is ready.`,
      "",
      "Sign in using the details below:",
      `  Email:    ${row.email}`,
      `  Password: ${row.temporaryPassword}`,
      "",
      `Log in here: ${loginUrl}`,
      "",
      "In the portal you can also find QR code assets to add to your website and printed materials.",
      "",
      "You will be asked to set a new password after your first sign-in. Save the password above before logging in.",
      "",
      "If you need any help, just reply to this email.",
      `The ${brand} Team`,
    ].join("\n");
    await sendApplicantEmail(prisma, {
      to: row.email,
      subject: "Your member portal is ready — sign-in details inside",
      text,
    });
  })().catch((e) => {
    console.error("[admin-mail] member welcome send failed", e);
  });
}

export async function sendPasswordResetEmail(
  prisma: PrismaClient,
  toEmail: string,
  name: string,
  resetUrl: string
): Promise<void> {
  const resendKey = process.env.RESEND_API_KEY?.trim();
  const transport = resendKey ? null : await getTransport(prisma);
  if (!resendKey && !transport) return;
  const brand = await getBrandName(prisma);
  const from = await mailFrom(prisma);
  const subject = `Reset your ${brand} password`;
  const text = [
    `Hi ${name},`,
    "",
    `Someone requested a password reset for your ${brand} member portal account.`,
    "",
    "Reset your password using the link below (expires in 1 hour):",
    resetUrl,
    "",
    "If you did not request this, you can safely ignore this email — your password will not change.",
    "",
    `The ${brand} Team`,
  ].join("\n") + EMAIL_FOOTER;
  const siteBase = await publicSiteBase(prisma);
  const html = buildEmailHtml(text, `${siteBase}/email-footer.png`);
  if (resendKey) {
    await sendViaResend(resendKey, { from, to: toEmail, subject, text, html });
  } else {
    await transport!.sendMail({ from, to: toEmail, subject, text, html });
  }
}

export function notifySubscriptionRenewed(
  prisma: PrismaClient,
  row: {
    traderName?: string | null;
    email: string;
    renewedUntil: Date;
  }
): void {
  void (async () => {
    const traderName = row.traderName?.trim() || "there";
    const renewedUntil = row.renewedUntil.toLocaleDateString("en-GB");
    const text = [
      `Hi ${traderName},`,
      "",
      "Your subscription has successfully renewed. Thanks for continuing to be part of Trader Watchdog - we're glad to have you with us.",
      "",
      `Your membership is now active until ${renewedUntil}.`,
      "",
      "If you need anything, we're here.",
      "The Trader Watchdog Team",
    ].join("\n");

    await sendApplicantEmail(prisma, {
      to: row.email,
      subject: "Your Subscription Has Renewed",
      text,
    });
  })().catch((e) => {
    console.error("[admin-mail] renewal confirmation send failed", e);
  });
}

export async function sendXeroInvoiceToTrader(
  prisma: PrismaClient,
  opts: {
    traderName: string;
    email: string;
    pdfBuffer: Buffer;
    invoiceDescription: string;
  }
): Promise<void> {
  const brand = await getBrandName(prisma);
  const text = [
    `Dear ${opts.traderName},`,
    "",
    `Thank you for your payment. Please find your payment receipt attached for: ${opts.invoiceDescription}.`,
    "",
    "Please keep this for your records.",
    "",
    `The ${brand} Team`,
  ].join("\n");

  await sendApplicantEmail(prisma, {
    to: opts.email,
    subject: `Your Payment Receipt — ${opts.invoiceDescription}`,
    text,
    attachments: [{
      filename: "receipt.pdf",
      content: opts.pdfBuffer,
      contentType: "application/pdf",
    }],
  });
}  
