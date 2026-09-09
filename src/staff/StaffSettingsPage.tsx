import { FormEvent, useEffect, useState } from "react";
import { PasswordInput } from "../components/PasswordInput";
import { apiGetAuth, apiSend } from "../lib/api";

type Settings = {
  id: string;
  workspaceName: string | null;
  siteDisplayName: string | null;
  publicSiteUrl: string | null;
  announcementEmail: string | null;
  adminNotifyEmails: string | null;
  smtpHost: string | null;
  smtpPort: number | null;
  smtpSecure: boolean;
  smtpUser: string | null;
  mailFrom: string | null;
  hasSmtpPassword: boolean;
  billingEnabled: boolean;
  stripePublishableKey: string | null;
  checkoutMembershipName: string | null;
  checkoutRegistrationFeeName: string | null;
  checkoutMembershipPence: number;
  checkoutRegistrationFeePence: number;
  invoiceLegalName: string | null;
  invoiceVatNumber: string | null;
  invoiceAddress: string | null;
  invoiceFooterNote: string | null;
  hasStripeSecret: boolean;
  hasStripeWebhookSecret: boolean;
  googleAnalyticsMeasurementId: string | null;
  googleAnalyticsPropertyId: string | null;
  hasGoogleAnalyticsServiceAccount: boolean;
  recaptchaEnabled: boolean;
  recaptchaSiteKey: string | null;
  hasRecaptchaSecret: boolean;
  xeroConnected: boolean;
  xeroTenantId: string | null;
};

export function StaffSettingsPage() {
  const [settings, setSettings] = useState<Settings | null>(null);
  const [workspaceName, setWorkspaceName] = useState("");
  const [siteDisplayName, setSiteDisplayName] = useState("");
  const [publicSiteUrl, setPublicSiteUrl] = useState("");
  const [announcementEmail, setAnnouncementEmail] = useState("");
  const [adminNotifyEmails, setAdminNotifyEmails] = useState("");
  const [smtpHost, setSmtpHost] = useState("");
  const [smtpPort, setSmtpPort] = useState("");
  const [smtpSecure, setSmtpSecure] = useState(false);
  const [smtpUser, setSmtpUser] = useState("");
  const [smtpPass, setSmtpPass] = useState("");
  const [clearSmtpPassword, setClearSmtpPassword] = useState(false);
  const [mailFrom, setMailFrom] = useState("");
  const [testEmailTo, setTestEmailTo] = useState("");
  const [testEmailPending, setTestEmailPending] = useState(false);
  const [testEmailResult, setTestEmailResult] = useState<{ ok: boolean; message: string } | null>(null);
  const [billingEnabled, setBillingEnabled] = useState(false);
  const [stripePublishableKey, setStripePublishableKey] = useState("");
  const [stripeSecretKey, setStripeSecretKey] = useState("");
  const [stripeWebhookSecret, setStripeWebhookSecret] = useState("");
  const [checkoutMembershipName, setCheckoutMembershipName] = useState("");
  const [checkoutRegistrationFeeName, setCheckoutRegistrationFeeName] =
    useState("");
  const [checkoutMembershipPence, setCheckoutMembershipPence] = useState("");
  const [checkoutRegistrationFeePence, setCheckoutRegistrationFeePence] =
    useState("");
  const [invoiceLegalName, setInvoiceLegalName] = useState("");
  const [invoiceVatNumber, setInvoiceVatNumber] = useState("");
  const [invoiceAddress, setInvoiceAddress] = useState("");
  const [invoiceFooterNote, setInvoiceFooterNote] = useState("");
  const [gaMeasurementId, setGaMeasurementId] = useState("");
  const [gaPropertyId, setGaPropertyId] = useState("");
  const [gaServiceAccountJson, setGaServiceAccountJson] = useState("");
  const [turnstileEnabled, setTurnstileEnabled] = useState(false);
  const [turnstileSiteKey, setTurnstileSiteKey] = useState("");
  const [turnstileSecretKey, setTurnstileSecretKey] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [loading, setLoading] = useState(true);
  const [xeroStatus, setXeroStatus] = useState<{ connected: boolean; tenantId: string | null } | null>(null)
  const [ xeroDisconnecting, setXeroDisconnecting ] = useState(false);

  useEffect(() => {
    apiGetAuth<{ settings: Settings }>("/api/admin/organization-settings")
      .then((d) => {
        const s = d.settings;
        setSettings(s);
        setWorkspaceName(s.workspaceName ?? "");
        setSiteDisplayName(s.siteDisplayName ?? "");
        setPublicSiteUrl(s.publicSiteUrl ?? "");
        setAnnouncementEmail(s.announcementEmail ?? "");
        setAdminNotifyEmails(s.adminNotifyEmails ?? "");
        setSmtpHost(s.smtpHost ?? "");
        setSmtpPort(s.smtpPort != null ? String(s.smtpPort) : "");
        setSmtpSecure(Boolean(s.smtpSecure));
        setSmtpUser(s.smtpUser ?? "");
        setSmtpPass("");
        setClearSmtpPassword(false);
        setMailFrom(s.mailFrom ?? "");
        setBillingEnabled(Boolean(s.billingEnabled));
        setStripePublishableKey(s.stripePublishableKey ?? "");
        setStripeSecretKey("");
        setStripeWebhookSecret("");
        setCheckoutMembershipName(s.checkoutMembershipName ?? "");
        setCheckoutRegistrationFeeName(s.checkoutRegistrationFeeName ?? "");
        setCheckoutMembershipPence(String(s.checkoutMembershipPence ?? 8000));
        setCheckoutRegistrationFeePence(
          String(s.checkoutRegistrationFeePence ?? 1500)
        );
        setInvoiceLegalName(s.invoiceLegalName ?? "");
        setInvoiceVatNumber(s.invoiceVatNumber ?? "");
        setInvoiceAddress(s.invoiceAddress ?? "");
        setInvoiceFooterNote(s.invoiceFooterNote ?? "");
        setGaMeasurementId(s.googleAnalyticsMeasurementId ?? "");
        setGaPropertyId(s.googleAnalyticsPropertyId ?? "");
        setGaServiceAccountJson("");
        setTurnstileEnabled(Boolean(s.recaptchaEnabled));
        setTurnstileSiteKey(s.recaptchaSiteKey ?? "");
        setTurnstileSecretKey("");
      })
      .catch((e) => setError(e instanceof Error ? e.message : "Failed"))
      .finally(() => setLoading(false));
      apiGetAuth<{ connected: boolean; tenantId: string | null }>("/api/admin/xero-status")
        .then((d) => setXeroStatus(d))
        .catch((e) => setXeroStatus(e instanceof Error ? { connected: false, tenantId: null } : { connected: false, tenantId: null }));
  }, []);

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    setSaved(false);
    try {
      const body: Record<string, unknown> = {
        workspaceName: workspaceName.trim() || null,
        siteDisplayName: siteDisplayName.trim() || null,
        publicSiteUrl: publicSiteUrl.trim().replace(/\/$/, "") || null,
        announcementEmail: announcementEmail.trim() || null,
        adminNotifyEmails: adminNotifyEmails.trim() || null,
        smtpHost: smtpHost.trim() || null,
        smtpSecure,
        smtpUser: smtpUser.trim() || null,
        mailFrom: mailFrom.trim() || null,
      };
      const portNum = smtpPort.trim() ? parseInt(smtpPort.trim(), 10) : NaN;
      body.smtpPort =
        smtpPort.trim() === ""
          ? null
          : Number.isFinite(portNum)
            ? portNum
            : null;
      if (smtpPass.trim()) {
        body.smtpPass = smtpPass.trim();
      }
      if (clearSmtpPassword) {
        body.clearSmtpPassword = true;
      }
      body.billingEnabled = billingEnabled;
      body.stripePublishableKey = stripePublishableKey.trim() || null;
      if (stripeSecretKey.trim()) body.stripeSecretKey = stripeSecretKey.trim();
      if (stripeWebhookSecret.trim()) body.stripeWebhookSecret = stripeWebhookSecret.trim();
      body.checkoutMembershipName = checkoutMembershipName.trim() || null;
      body.checkoutRegistrationFeeName =
        checkoutRegistrationFeeName.trim() || null;

      const membershipPenceNum = checkoutMembershipPence.trim()
        ? parseInt(checkoutMembershipPence.trim(), 10)
        : NaN;
      body.checkoutMembershipPence = Number.isFinite(membershipPenceNum)
        ? membershipPenceNum
        : 8000;

      const registrationFeePenceNum = checkoutRegistrationFeePence.trim()
        ? parseInt(checkoutRegistrationFeePence.trim(), 10)
        : NaN;
      body.checkoutRegistrationFeePence = Number.isFinite(
        registrationFeePenceNum
      )
        ? registrationFeePenceNum
        : 1500;
      body.invoiceLegalName = invoiceLegalName.trim() || null;
      body.invoiceVatNumber = invoiceVatNumber.trim() || null;
      body.invoiceAddress = invoiceAddress.trim() || null;
      body.invoiceFooterNote = invoiceFooterNote.trim() || null;

      body.googleAnalyticsMeasurementId = gaMeasurementId.trim() || null;
      body.googleAnalyticsPropertyId = gaPropertyId.trim() || null;
      if (gaServiceAccountJson.trim()) {
        body.googleAnalyticsServiceAccountJson = gaServiceAccountJson.trim();
      }

      body.recaptchaEnabled = turnstileEnabled;
      body.recaptchaSiteKey = turnstileSiteKey.trim() || null;
      if (turnstileSecretKey.trim()) {
        body.recaptchaSecretKey = turnstileSecretKey.trim();
      }

      const d = await apiSend<{ settings: Settings }>(
        "/api/admin/organization-settings/save",
        {
          method: "POST",
          body: JSON.stringify(body),
        }
      );
      setSettings(d.settings);
      setSmtpPass("");
      setClearSmtpPassword(false);
      setStripeSecretKey("");
      setStripeWebhookSecret("");
      setSaved(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Save failed");
    }
  };

  if (loading && !settings) {
    return <p className="text-slate-500">Loading…</p>;
  }

  const onXeroConnect = async () => {
    try {
      const data = await apiGetAuth<{ url: string }>("/api/admin/xero-consent-url");
      window.location.href = data.url;
    } catch {
      alert("Could not start Xero connection. Please try again.");
    }
  };

  const onXeroDisconnect = async () => {
    if (!confirm("Disconnect Xero? Invoices will stop being created until you reconnect.")) return;
    setXeroDisconnecting(true);
    try {
      await apiSend("/api/admin/xero-disconnect", { method: "POST" });
      setXeroStatus({ connected: false, tenantId: null });
    } finally {
      setXeroDisconnecting(false);
    }
  };

  return (
    <div>
      <h1 className="font-display text-2xl font-semibold text-white">
        Settings
      </h1>
      <p className="mt-2 text-sm text-slate-400">
        Site name, public URL, and outbound email — stored in the database.
        Environment variables still override SMTP when set on the server.
      </p>

      <form
        onSubmit={onSubmit}
        className="mt-8 max-w-3xl space-y-8 rounded-2xl border border-white/10 bg-ink-900/40 p-6"
      >
        {error ? <p className="text-sm text-red-300">{error}</p> : null}
        {saved ? <p className="text-sm text-emerald-400">Saved.</p> : null}

        <section className="space-y-4">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-400">
            Brand &amp; URLs
          </h2>
          <div>
            <label className="block text-sm font-medium text-slate-300">
              Site / product name
            </label>
            <input
              value={siteDisplayName}
              onChange={(e) => setSiteDisplayName(e.target.value)}
              placeholder="Trader Watchdog"
              className="mt-1 w-full rounded-xl border border-white/10 bg-ink-950 px-4 py-3 text-white"
            />
            <p className="mt-1 text-xs text-slate-500">
              Shown in the public header, member portal, staff area, and email
              subjects. If empty, falls back to workspace name below, then
              “Trader Watchdog”.
            </p>
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-300">
              Workspace label (internal)
            </label>
            <input
              value={workspaceName}
              onChange={(e) => setWorkspaceName(e.target.value)}
              placeholder="e.g. Ops UK"
              className="mt-1 w-full rounded-xl border border-white/10 bg-ink-950 px-4 py-3 text-white"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-300">
              Public site URL
            </label>
            <input
              value={publicSiteUrl}
              onChange={(e) => setPublicSiteUrl(e.target.value)}
              placeholder="https://verify.example.com"
              className="mt-1 w-full rounded-xl border border-white/10 bg-ink-950 px-4 py-3 text-white"
            />
            <p className="mt-1 text-xs text-slate-500">
              Used in email links and public site metadata. Overrides{" "}
              <code className="rounded bg-white/10 px-1">PUBLIC_SITE_URL</code>{" "}
              when set.
            </p>
          </div>
        </section>

        <section className="space-y-4 border-t border-white/10 pt-8">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-400">
            Notifications
          </h2>
          <div>
            <label className="block text-sm font-medium text-slate-300">
              Notification emails (comma-separated)
            </label>
            <input
              value={adminNotifyEmails}
              onChange={(e) => setAdminNotifyEmails(e.target.value)}
              placeholder="ops@example.com, alerts@example.com"
              className="mt-1 w-full rounded-xl border border-white/10 bg-ink-950 px-4 py-3 text-white"
            />
            <p className="mt-1 text-xs text-slate-500">
              Receives system emails (leads, applications, etc.). Overrides the
              single ops email below when set. The{" "}
              <code className="rounded bg-white/10 px-1">ADMIN_NOTIFY_EMAILS</code>{" "}
              env var overrides both.
            </p>
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-300">
              Announcement / ops email (single)
            </label>
            <input
              type="email"
              value={announcementEmail}
              onChange={(e) => setAnnouncementEmail(e.target.value)}
              placeholder="ops@example.com"
              className="mt-1 w-full rounded-xl border border-white/10 bg-ink-950 px-4 py-3 text-white"
            />
          </div>
        </section>

        <section className="space-y-4 border-t border-white/10 pt-8">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-400">
            Billing &amp; Stripe
          </h2>
          <p className="text-xs leading-relaxed text-slate-500">
            Checkout is available when billing is enabled and a Stripe secret key
            exists here or in the <code className="rounded bg-white/10 px-1">STRIPE_SECRET_KEY</code> env var.
            The publishable key is displayed to applicants on the checkout page.
          </p>
          <label className="flex cursor-pointer items-center gap-2">
            <input
              type="checkbox"
              checked={billingEnabled}
              onChange={(e) => setBillingEnabled(e.target.checked)}
              className="h-4 w-4 rounded border-slate-600 bg-ink-950 text-brand-500"
            />
            <span className="text-sm text-slate-300">
              Enable online billing and checkout links
            </span>
          </label>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="sm:col-span-2">
              <label className="block text-sm font-medium text-slate-300">
                Stripe publishable key
              </label>
              <input
                value={stripePublishableKey}
                onChange={(e) => setStripePublishableKey(e.target.value)}
                autoComplete="off"
                placeholder="pk_live_..."
                className="mt-1 w-full rounded-xl border border-white/10 bg-ink-950 px-4 py-3 text-white"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-300">
                Stripe secret key
              </label>
              <PasswordInput
                value={stripeSecretKey}
                onChange={(e) => setStripeSecretKey(e.target.value)}
                placeholder={
                  settings?.hasStripeSecret
                    ? "•••••••• (leave blank to keep)"
                    : "sk_live_... (required)"
                }
                autoComplete="new-password"
                className="mt-1 w-full rounded-xl border border-white/10 bg-ink-950 px-4 py-3 text-white"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-300">
                Stripe webhook signing secret
              </label>
              <PasswordInput
                value={stripeWebhookSecret}
                onChange={(e) => setStripeWebhookSecret(e.target.value)}
                placeholder={
                  settings?.hasStripeWebhookSecret
                    ? "•••••••• (leave blank to keep)"
                    : "whsec_... (from Stripe webhook destination)"
                }
                autoComplete="new-password"
                className="mt-1 w-full rounded-xl border border-white/10 bg-ink-950 px-4 py-3 text-white"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-300">
                Membership label
              </label>
              <input
                value={checkoutMembershipName}
                onChange={(e) => setCheckoutMembershipName(e.target.value)}
                placeholder="Trader Watchdog annual portal fee"
                className="mt-1 w-full rounded-xl border border-white/10 bg-ink-950 px-4 py-3 text-white"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-300">
                Registration fee label
              </label>
              <input
                value={checkoutRegistrationFeeName}
                onChange={(e) => setCheckoutRegistrationFeeName(e.target.value)}
                placeholder="Trader Watchdog registration and admin checks"
                className="mt-1 w-full rounded-xl border border-white/10 bg-ink-950 px-4 py-3 text-white"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-300">
                Membership charge (pence, no VAT)
              </label>
              <input
                value={checkoutMembershipPence}
                onChange={(e) => setCheckoutMembershipPence(e.target.value)}
                inputMode="numeric"
                placeholder="8000"
                className="mt-1 w-full rounded-xl border border-white/10 bg-ink-950 px-4 py-3 text-white"
              />
              <p className="mt-1 text-xs text-slate-500">
                Example: £80 charges as 8000 pence.
              </p>
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-300">
                Registration fee charge (pence, no VAT)
              </label>
              <input
                value={checkoutRegistrationFeePence}
                onChange={(e) => setCheckoutRegistrationFeePence(e.target.value)}
                inputMode="numeric"
                placeholder="1500"
                className="mt-1 w-full rounded-xl border border-white/10 bg-ink-950 px-4 py-3 text-white"
              />
              <p className="mt-1 text-xs text-slate-500">
                Example: £15 charges as 1500 pence.
              </p>
            </div>
          </div>
        </section>

        <section className="space-y-4 border-t border-white/10 pt-8">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-400">
            Outbound email (SMTP)
          </h2>
          <p className="text-xs leading-relaxed text-slate-500">
            If set here, the server uses these values unless{" "}
            <code className="rounded bg-white/10 px-1">SMTP_HOST</code> (etc.)
            is defined in the environment — env wins for host, port, user, and
            password when present.
          </p>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="sm:col-span-2">
              <label className="block text-sm font-medium text-slate-300">
                SMTP host
              </label>
              <input
                value={smtpHost}
                onChange={(e) => setSmtpHost(e.target.value)}
                placeholder="smtp.example.com"
                className="mt-1 w-full rounded-xl border border-white/10 bg-ink-950 px-4 py-3 text-white"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-300">
                Port
              </label>
              <input
                value={smtpPort}
                onChange={(e) => setSmtpPort(e.target.value)}
                placeholder="587"
                inputMode="numeric"
                className="mt-1 w-full rounded-xl border border-white/10 bg-ink-950 px-4 py-3 text-white"
              />
            </div>
            <label className="flex cursor-pointer items-center gap-2 pt-8 sm:pt-6">
              <input
                type="checkbox"
                checked={smtpSecure}
                onChange={(e) => setSmtpSecure(e.target.checked)}
                className="h-4 w-4 rounded border-slate-600 bg-ink-950 text-brand-500"
              />
              <span className="text-sm text-slate-300">
                SSL/TLS (e.g. port 465)
              </span>
            </label>
            <div>
              <label className="block text-sm font-medium text-slate-300">
                Username
              </label>
              <input
                value={smtpUser}
                onChange={(e) => setSmtpUser(e.target.value)}
                autoComplete="off"
                className="mt-1 w-full rounded-xl border border-white/10 bg-ink-950 px-4 py-3 text-white"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-300">
                New password
              </label>
              <PasswordInput
                value={smtpPass}
                onChange={(e) => setSmtpPass(e.target.value)}
                placeholder={
                  settings?.hasSmtpPassword
                    ? "•••••••• (leave blank to keep)"
                    : "Optional"
                }
                autoComplete="new-password"
                className="mt-1 w-full rounded-xl border border-white/10 bg-ink-950 px-4 py-3 text-white"
              />
            </div>
            {settings?.hasSmtpPassword ? (
              <label className="flex cursor-pointer items-center gap-2 sm:col-span-2">
                <input
                  type="checkbox"
                  checked={clearSmtpPassword}
                  onChange={(e) => setClearSmtpPassword(e.target.checked)}
                  className="h-4 w-4 rounded border-slate-600 bg-ink-950 text-brand-500"
                />
                <span className="text-sm text-slate-400">
                  Clear stored SMTP password
                </span>
              </label>
            ) : null}
            <div className="sm:col-span-2">
              <label className="block text-sm font-medium text-slate-300">
                From (sender)
              </label>
              <input
                value={mailFrom}
                onChange={(e) => setMailFrom(e.target.value)}
                placeholder="Acme Verify &lt;noreply@example.com&gt;"
                className="mt-1 w-full rounded-xl border border-white/10 bg-ink-950 px-4 py-3 text-white"
              />
            </div>
            <div className="sm:col-span-2">
              <label className="block text-sm font-medium text-slate-300">
                Send a test email
              </label>
              <p className="mt-1 text-xs text-slate-400">
                Send a test message to confirm SMTP is working. Save your settings first.
              </p>
              <div className="mt-2 flex gap-2">
                <input
                  type="email"
                  value={testEmailTo}
                  onChange={(e) => { setTestEmailTo(e.target.value); setTestEmailResult(null); }}
                  placeholder="you@example.com"
                  className="min-w-0 flex-1 rounded-xl border border-white/10 bg-ink-950 px-4 py-2.5 text-sm text-white"
                />
                <button
                  type="button"
                  disabled={testEmailPending || !testEmailTo.includes("@")}
                  onClick={async () => {
                    setTestEmailPending(true);
                    setTestEmailResult(null);
                    try {
                      await apiSend("/api/admin/organization-settings/test-email", {
                        method: "POST",
                        headers: { "Content-Type": "application/json" },
                        body: JSON.stringify({ to: testEmailTo }),
                      });
                      setTestEmailResult({ ok: true, message: "Test email sent — check your inbox." });
                    } catch (err) {
                      setTestEmailResult({ ok: false, message: err instanceof Error ? err.message : "Send failed." });
                    } finally {
                      setTestEmailPending(false);
                    }
                  }}
                  className="shrink-0 rounded-xl bg-slate-700 px-4 py-2.5 text-sm font-semibold text-white hover:bg-slate-600 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {testEmailPending ? "Sending…" : "Send test"}
                </button>
              </div>
              {testEmailResult ? (
                <p className={`mt-2 text-xs ${testEmailResult.ok ? "text-green-400" : "text-red-400"}`}>
                  {testEmailResult.message}
                </p>
              ) : null}
            </div>
          </div>
        </section>

        <section className="space-y-4 border-t border-white/10 pt-8">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-400">
            Invoice Compliance
          </h2>
          <p className="text-xs leading-relaxed text-slate-500">
            These values are added to the paid Stripe invoice PDF that is emailed as the payment receipt. Stripe hosted payment receipts still use your Stripe dashboard public business details.
          </p>
          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <label className="block text-sm font-medium text-slate-300">
                Legal business name
              </label>
              <input
                value={invoiceLegalName}
                onChange={(e) => setInvoiceLegalName(e.target.value)}
                placeholder="Trader Watchdog Ltd"
                className="mt-1 w-full rounded-xl border border-white/10 bg-ink-950 px-4 py-3 text-white"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-300">
                VAT registration number
              </label>
              <input
                value={invoiceVatNumber}
                onChange={(e) => setInvoiceVatNumber(e.target.value)}
                placeholder="GB 123 4567 89"
                className="mt-1 w-full rounded-xl border border-white/10 bg-ink-950 px-4 py-3 text-white"
              />
            </div>
            <div className="sm:col-span-2">
              <label className="block text-sm font-medium text-slate-300">
                Invoice address
              </label>
              <textarea
                value={invoiceAddress}
                onChange={(e) => setInvoiceAddress(e.target.value)}
                rows={3}
                placeholder="4th Floor Office, 205 Regent Street, London W1B 4HB"
                className="mt-1 w-full rounded-xl border border-white/10 bg-ink-950 px-4 py-3 text-white"
              />
            </div>
            <div className="sm:col-span-2">
              <label className="block text-sm font-medium text-slate-300">
                Additional footer note
              </label>
              <textarea
                value={invoiceFooterNote}
                onChange={(e) => setInvoiceFooterNote(e.target.value)}
                rows={3}
                placeholder="Company number 17173750"
                className="mt-1 w-full rounded-xl border border-white/10 bg-ink-950 px-4 py-3 text-white"
              />
              <p className="mt-1 text-xs text-slate-500">
                Optional extra text for legal wording or Companies House details shown on the PDF footer.
              </p>
            </div>
          </div>
        </section>

        {/* Google Analytics */}
        <section className="space-y-4">
          <h2 className="text-xs font-semibold uppercase tracking-wider text-slate-500">
            Google Analytics
          </h2>

          <div className="space-y-1">
            <label className="block text-sm font-medium text-slate-300">
              Measurement ID
              <span className="ml-1 text-xs font-normal text-slate-500">(e.g. G-XXXXXXXXXX — loads the tracking tag on the public site)</span>
            </label>
            <input
              type="text"
              value={gaMeasurementId}
              onChange={(e) => setGaMeasurementId(e.target.value)}
              placeholder="G-XXXXXXXXXX"
              className="w-full rounded-xl border border-white/12 bg-ink-950 px-3 py-2.5 text-sm text-white placeholder:text-slate-600 focus:border-brand-400 focus:outline-none focus:ring-2 focus:ring-brand-500/30"
            />
          </div>

          <div className="space-y-1">
            <label className="block text-sm font-medium text-slate-300">
              Property ID
              <span className="ml-1 text-xs font-normal text-slate-500">(numeric ID — used to pull live traffic stats into the Analytics page)</span>
            </label>
            <input
              type="text"
              value={gaPropertyId}
              onChange={(e) => setGaPropertyId(e.target.value)}
              placeholder="123456789"
              className="w-full rounded-xl border border-white/12 bg-ink-950 px-3 py-2.5 text-sm text-white placeholder:text-slate-600 focus:border-brand-400 focus:outline-none focus:ring-2 focus:ring-brand-500/30"
            />
          </div>

          <div className="space-y-1">
            <label className="block text-sm font-medium text-slate-300">
              Service account JSON
              <span className="ml-1 text-xs font-normal text-slate-500">(paste the full JSON key — required for the Data API traffic stats)</span>
            </label>
            <textarea
              value={gaServiceAccountJson}
              onChange={(e) => setGaServiceAccountJson(e.target.value)}
              rows={4}
              placeholder={settings?.hasGoogleAnalyticsServiceAccount ? "Key already saved — paste a new one to replace it" : "Paste the full contents of the service account .json key file"}
              className="w-full rounded-xl border border-white/12 bg-ink-950 px-3 py-2.5 text-sm text-white placeholder:text-slate-600 focus:border-brand-400 focus:outline-none focus:ring-2 focus:ring-brand-500/30"
            />
            {settings?.hasGoogleAnalyticsServiceAccount ? (
              <p className="text-xs text-emerald-400">Service account key is saved.</p>
            ) : null}
          </div>
        </section>

        {/* Cloudflare Turnstile */}
        <section className="space-y-4">
          <h2 className="text-xs font-semibold uppercase tracking-wider text-slate-500">
            Cloudflare Turnstile (bot protection)
          </h2>

          <label className="flex cursor-pointer items-center gap-3">
            <input
              type="checkbox"
              checked={turnstileEnabled}
              onChange={(e) => setTurnstileEnabled(e.target.checked)}
              className="h-4 w-4 rounded border-white/20 accent-brand-500"
            />
            <span className="text-sm font-medium text-slate-300">Enable Turnstile on the Join form</span>
          </label>

          <div className="space-y-1">
            <label className="block text-sm font-medium text-slate-300">
              Site Key
              <span className="ml-1 text-xs font-normal text-slate-500">(public — shown in the browser)</span>
            </label>
            <input
              type="text"
              value={turnstileSiteKey}
              onChange={(e) => setTurnstileSiteKey(e.target.value)}
              placeholder="0x4AAAAAAA..."
              className="w-full rounded-xl border border-white/12 bg-ink-950 px-3 py-2.5 text-sm text-white placeholder:text-slate-600 focus:border-brand-400 focus:outline-none focus:ring-2 focus:ring-brand-500/30"
            />
          </div>

          <div className="space-y-1">
            <label className="block text-sm font-medium text-slate-300">
              Secret Key
              <span className="ml-1 text-xs font-normal text-slate-500">
                {settings?.hasRecaptchaSecret ? "Already saved — paste a new one to replace" : "Paste your Cloudflare Turnstile secret key"}
              </span>
            </label>
            <PasswordInput
              value={turnstileSecretKey}
              onChange={(e) => setTurnstileSecretKey(e.target.value)}
              placeholder={settings?.hasRecaptchaSecret ? "Secret key already saved" : "0x4AAAAAAA..."}
              className="w-full rounded-xl border border-white/12 bg-ink-950 px-3 py-2.5 text-sm text-white placeholder:text-slate-600 focus:border-brand-400 focus:outline-none focus:ring-2 focus:ring-brand-500/30"
            />
            {settings?.hasRecaptchaSecret ? (
              <p className="text-xs text-emerald-400">Secret key is saved.</p>
            ) : null}
          </div>
        </section>

        <button
          type="submit"
          className="rounded-xl bg-brand-500 px-4 py-2.5 text-sm font-semibold text-white hover:bg-brand-400"
        >
          Save settings
        </button>
      </form>
            <div className="mt-8 max-w-3xl space-y-4 rounded-2xl border border-white/10 bg-ink-900/40 p-6">
        <h2 className="text-lg font-semibold text-white">Xero</h2>
        {xeroStatus === null ? (
          <p className="text-sm text-slate-400">Loading…</p>
        ) : xeroStatus.connected ? (
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-emerald-400">Connected</p>
              <p className="mt-1 text-xs text-slate-400">Tenant ID: {xeroStatus.tenantId}</p>
            </div>
            <div className="flex gap-3">
              <button onClick={onXeroConnect} className="rounded-lg bg-white/10 px-4 py-2 text-sm text-white hover:bg-white/20">
                Reconnect
              </button>
              <button
                onClick={onXeroDisconnect}
                disabled={xeroDisconnecting}
                className="rounded-lg bg-red-500/20 px-4 py-2 text-sm text-red-300 hover:bg-red-500/30 disabled:opacity-50"
              >
                Disconnect
              </button>
            </div>
          </div>
        ) : (
          <div className="flex items-center justify-between">
            <p className="text-sm text-slate-400">Not connected</p>
            <button onClick={onXeroConnect} className="rounded-lg bg-emerald-600 px-4 py-2 text-sm text-white hover:bg-emerald-500">
              Connect Xero
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
