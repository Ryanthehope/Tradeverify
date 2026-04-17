import { FormEvent, useCallback, useEffect, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import {
  getRecaptchaToken,
  submitApplication,
} from "../lib/submitApplication";

const apiBase = () =>
  (import.meta.env.VITE_API_URL as string | undefined)?.trim() ?? "";

const JOIN_STORAGE_KEY = "Trader Watchdog_join_apply";

type ApplicantSummary = {
  exists: boolean;
  status?: string;
  billingAvailable: boolean;
  canCheckout: boolean;
  hasPayment: boolean;
  profileLive: boolean;
  /** Shown until first portal login or expiry; not stored in the browser. */
  oneTimePassword: string | null;
};

export function Join() {
  const [searchParams, setSearchParams] = useSearchParams();
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [sent, setSent] = useState(false);
  const [sentVia, setSentVia] = useState<"api" | "webhook" | "mailto" | null>(
    null
  );
  const [applicationId, setApplicationId] = useState<string | null>(null);
  const [savedEmail, setSavedEmail] = useState("");
  const [recaptchaSiteKey, setRecaptchaSiteKey] = useState<string | null>(null);
  const [checkoutLoading, setCheckoutLoading] = useState<
    "fast" | "member" | null
  >(null);
  const [sessionChecked, setSessionChecked] = useState(false);
  const [applicantSummary, setApplicantSummary] =
    useState<ApplicantSummary | null>(null);
  /** First applicant-summary fetch finished for this applicationId (avoids clearing before we know they can pay). */
  const [applicantSummaryReady, setApplicantSummaryReady] = useState(false);

  const paidNotice = searchParams.get("paid");
  const cancelled = searchParams.get("cancelled");

  const applyStoredJoinSession = useCallback(
    (p: { applicationId: string; email: string }) => {
      setSent(true);
      setSentVia("api");
      setApplicationId(p.applicationId);
      setSavedEmail(p.email);
    },
    []
  );

  useEffect(() => {
    let cancelled = false;
    const run = async () => {
      let raw: string | null = null;
      try {
        raw = sessionStorage.getItem(JOIN_STORAGE_KEY);
      } catch {
        /* ignore */
      }
      if (!raw) {
        if (!cancelled) setSessionChecked(true);
        return;
      }
      let parsed: {
        applicationId?: string;
        email?: string;
        billingAvailable?: boolean;
      };
      try {
        parsed = JSON.parse(raw) as typeof parsed;
      } catch {
        try {
          sessionStorage.removeItem(JOIN_STORAGE_KEY);
        } catch {
          /* ignore */
        }
        if (!cancelled) setSessionChecked(true);
        return;
      }
      const { applicationId, email } = parsed;
      if (!applicationId?.trim() || !email?.trim()) {
        if (!cancelled) setSessionChecked(true);
        return;
      }
      const id = applicationId.trim();
      const em = email.trim().toLowerCase();
      try {
        const res = await fetch(`${apiBase()}/api/applications/verify`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ applicationId: id, email: em }),
        });
        const data = (await res.json().catch(() => ({}))) as {
          exists?: boolean;
        };
        if (cancelled) return;
        if (res.ok && data.exists) {
          applyStoredJoinSession({
            applicationId: id,
            email: em,
          });
        } else {
          /** Deleted app, wrong email, bad response, or offline — drop stale client session. */
          try {
            sessionStorage.removeItem(JOIN_STORAGE_KEY);
          } catch {
            /* ignore */
          }
        }
      } catch {
        if (cancelled) return;
        try {
          sessionStorage.removeItem(JOIN_STORAGE_KEY);
        } catch {
          /* ignore */
        }
      } finally {
        if (!cancelled) setSessionChecked(true);
      }
    };
    void run();
    return () => {
      cancelled = true;
    };
  }, [applyStoredJoinSession]);

  const refreshApplicantSummary = useCallback(async () => {
    if (!applicationId || !savedEmail) return;
    try {
      const res = await fetch(`${apiBase()}/api/applications/applicant-summary`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          applicationId,
          email: savedEmail,
        }),
      });
      const data = (await res.json().catch(() => ({}))) as Partial<ApplicantSummary>;
      if (!res.ok || typeof data.exists !== "boolean") return;
      const summary: ApplicantSummary = {
        exists: data.exists,
        status: data.status,
        billingAvailable: Boolean(data.billingAvailable),
        canCheckout: Boolean(data.canCheckout),
        hasPayment: Boolean(data.hasPayment),
        profileLive: Boolean(data.profileLive),
        oneTimePassword:
          typeof data.oneTimePassword === "string" && data.oneTimePassword
            ? data.oneTimePassword
            : null,
      };
      setApplicantSummary(summary);
    } catch {
      /* ignore */
    }
  }, [applicationId, savedEmail]);

  useEffect(() => {
    if (!sent || sentVia !== "api" || !applicationId || !savedEmail) {
      setApplicantSummaryReady(false);
      return;
    }
    setApplicantSummaryReady(false);
    let cancelled = false;
    const runFirst = async () => {
      await refreshApplicantSummary();
      if (!cancelled) setApplicantSummaryReady(true);
    };
    void runFirst();
    const t = setInterval(() => void refreshApplicantSummary(), 30_000);
    return () => {
      cancelled = true;
      clearInterval(t);
    };
  }, [
    sent,
    sentVia,
    applicationId,
    savedEmail,
    refreshApplicantSummary,
    paidNotice,
  ]);

  useEffect(() => {
    fetch(`${apiBase()}/api/public-config`)
      .then((r) => r.json())
      .then((d: { recaptchaSiteKey?: string | null }) => {
        if (d.recaptchaSiteKey) setRecaptchaSiteKey(d.recaptchaSiteKey);
      })
      .catch(() => {});
  }, []);

  useEffect(() => {
    if (!recaptchaSiteKey) return;
    if (document.querySelector('script[src*="google.com/recaptcha"]')) return;
    const s = document.createElement("script");
    s.src = "https://www.google.com/recaptcha/api.js";
    s.async = true;
    s.defer = true;
    document.body.appendChild(s);
  }, [recaptchaSiteKey]);

  useEffect(() => {
    if (paidNotice === "fast_track" || paidNotice === "membership") {
      const t = setTimeout(() => {
        setSearchParams((p) => {
          const n = new URLSearchParams(p);
          n.delete("paid");
          n.delete("app");
          return n;
        });
      }, 8000);
      return () => clearTimeout(t);
    }
  }, [paidNotice, setSearchParams]);

  const onSubmit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setFormError(null);
    const fd = new FormData(e.currentTarget);
    const company = String(fd.get("company") ?? "").trim();
    const trade = String(fd.get("trade") ?? "").trim();
    const email = String(fd.get("email") ?? "").trim();
    const postcode = String(fd.get("postcode") ?? "").trim();
    const filesRaw = fd.getAll("files").filter((x): x is File => x instanceof File);
    const files = filesRaw.filter((f) => f.size > 0);

    const recaptchaToken = recaptchaSiteKey
      ? getRecaptchaToken()
      : undefined;
    if (recaptchaSiteKey && !recaptchaToken) {
      setFormError("Please tick the box to confirm you're not a robot.");
      return;
    }

    setSubmitting(true);
    const result = await submitApplication(
      {
        company,
        trade,
        email,
        postcode,
        submittedAt: new Date().toISOString(),
        recaptchaToken,
      },
      files
    );
    setSubmitting(false);

    if (!result.ok) {
      setFormError(result.message);
      return;
    }
    setApplicantSummary(null);
    setApplicantSummaryReady(false);
    setSentVia(result.via);
    setSent(true);
    if (result.applicationId) setApplicationId(result.applicationId);
    const emailNorm = email.toLowerCase();
    setSavedEmail(emailNorm);
    if (result.applicationId && result.via === "api") {
      try {
        sessionStorage.setItem(
          JOIN_STORAGE_KEY,
          JSON.stringify({
            applicationId: result.applicationId,
            email: emailNorm,
            billingAvailable: Boolean(result.billingAvailable),
          })
        );
      } catch {
        /* ignore */
      }
    }
    if (recaptchaSiteKey) {
      try {
        window.grecaptcha?.reset?.();
      } catch {
        /* ignore */
      }
    }
  };

  const clearJoinSession = () => {
    try {
      sessionStorage.removeItem(JOIN_STORAGE_KEY);
    } catch {
      /* ignore */
    }
    setSent(false);
    setSentVia(null);
    setApplicationId(null);
    setSavedEmail("");
    setFormError(null);
    setApplicantSummary(null);
    setApplicantSummaryReady(false);
  };

  const startCheckout = async (kind: "fast" | "member") => {
    if (!applicationId || !savedEmail) return;
    setCheckoutLoading(kind);
    setFormError(null);
    try {
      const path =
        kind === "fast"
          ? "/api/billing/checkout-fast-track"
          : "/api/billing/checkout-membership";
      const res = await fetch(`${apiBase()}${path}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ applicationId, email: savedEmail }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setFormError(
          typeof data?.error === "string"
            ? data.error
            : "Could not start checkout"
        );
        return;
      }
      if (data.url) {
        window.location.href = data.url as string;
      }
    } catch {
      setFormError("Network error starting checkout.");
    } finally {
      setCheckoutLoading(null);
    }
  };

  const inbox = import.meta.env.VITE_APPLICATION_INBOX_EMAIL?.trim();

  /**
   * Only offer a fresh application when it won’t drop an in-flight approval/payment.
   * (Strict `status === "APPROVED"` missed some cases; positive allow-list is safer.)
   */
  const applicantStatus = String(applicantSummary?.status ?? "").toUpperCase();
  const showSubmitAnother =
    sentVia === "api" &&
    applicantSummaryReady &&
    applicantSummary != null &&
    !applicantSummary.canCheckout &&
    !applicantSummary.profileLive &&
    (applicantStatus === "DECLINED" ||
      (applicantSummary.exists && applicantStatus !== "APPROVED"));

  return (
    <main className="border-b border-white/5 pb-24">
      <div className="border-b border-white/5 bg-gradient-to-br from-brand-950/50 to-ink-950 py-12 sm:py-16">
        <div className="mx-auto max-w-2xl px-4 text-center sm:px-6">
          <p className="text-sm font-semibold uppercase tracking-wider text-brand-300">
            For tradespeople
          </p>
          <h1 className="mt-2 font-display text-3xl font-bold text-white sm:text-4xl">
            Apply for Trader Watchdog
          </h1>
          <p className="mt-4 text-slate-400">
            Independent verification for your business. We review your
            application first; once approved, you can pay here to go live —{" "}
            <strong className="text-white">£15/month</strong> membership or a
            one-off <strong className="text-white">£40 fast-track</strong> if
            you want your listing prioritised at that stage.
          </p>
        </div>
      </div>

      <div className="mx-auto max-w-xl px-4 pt-12 sm:px-6">
        {cancelled ? (
          <div className="mb-6 rounded-xl border border-amber-500/30 bg-amber-500/10 px-4 py-3 text-sm text-amber-100">
            Checkout was cancelled. When you&apos;re ready, complete payment from
            this page (after approval).
          </div>
        ) : null}
        {paidNotice === "fast_track" ? (
          <div className="mb-6 rounded-xl border border-emerald-500/30 bg-emerald-500/10 px-4 py-3 text-sm text-emerald-100">
            Fast-track payment received. We&apos;re creating your Trader Watchdog
            listing — refresh in a moment or check your email.
          </div>
        ) : null}
        {paidNotice === "membership" ? (
          <div className="mb-6 rounded-xl border border-emerald-500/30 bg-emerald-500/10 px-4 py-3 text-sm text-emerald-100">
            Subscription started — thank you. Your member profile should appear
            shortly; you can log in with your work email once it&apos;s ready.
          </div>
        ) : null}

        {!sessionChecked ? (
          <div className="rounded-2xl border border-white/10 bg-ink-900/50 p-8 text-center text-sm text-slate-500">
            Loading…
          </div>
        ) : sent ? (
          <div className="rounded-2xl border border-emerald-500/30 bg-emerald-500/10 p-8 text-center">
            <p className="font-display text-lg font-semibold text-white">
              Application received
            </p>
            {sentVia === "api" ? (
              applicantSummary?.profileLive ? (
                <p className="mt-2 text-sm text-slate-400">
                  Your public listing is live and your member portal is ready.
                  {applicantSummary?.oneTimePassword ? (
                    <>
                      {" "}
                      Use the one-time password below for your first sign-in,
                      then you&apos;ll choose a new password.
                    </>
                  ) : (
                    <>
                      {" "}
                      Sign in with the password you chose (or the one Trader Watchdog
                      gave you if you haven&apos;t changed it yet).
                    </>
                  )}
                </p>
              ) : (
                <>
                  <p className="mt-2 text-sm text-slate-400">
                    Your application is saved. Our team will run vetting
                    (insurance, identity, and trade checks) and email you when
                    you&apos;re approved. After approval, return to this page to
                    pay membership or fast-track — your public listing and
                    member login are created when payment completes.
                  </p>
                  <p className="mt-3 text-xs text-slate-500">
                    Tip: bookmark this tab or keep your confirmation email so you
                    can open this page again easily.
                  </p>
                </>
              )
            ) : sentVia === "mailto" ? (
              <p className="mt-2 text-sm text-slate-400">
                Your email app should open with a pre-filled message. Send it to
                complete your application. If nothing opened, email{" "}
                {inbox ? (
                  <a
                    href={`mailto:${inbox}`}
                    className="text-brand-300 hover:text-brand-200"
                  >
                    {inbox}
                  </a>
                ) : (
                  "us"
                )}{" "}
                with your business name, trade, and postcode.
              </p>
            ) : (
              <p className="mt-2 text-sm text-slate-400">
                Thank you. Our team will review your details and contact you at
                the work email you provided.
              </p>
            )}

            {sentVia === "api" && applicationId ? (
              <div className="mt-8 space-y-4 text-left">
                {applicantSummary?.exists &&
                applicantSummary.status === "DECLINED" ? (
                  <div className="rounded-2xl border border-amber-500/25 bg-amber-500/10 p-4 text-sm text-amber-100/95">
                    This application was not approved. If you think this is a
                    mistake, reply to the email from our team or use{" "}
                    <Link
                      to="/contact"
                      className="font-medium text-amber-200 underline decoration-amber-500/40"
                    >
                      Contact
                    </Link>
                    .
                  </div>
                ) : null}
                {applicantSummary?.exists && applicantSummary.profileLive ? (
                  <div className="rounded-2xl border border-emerald-500/25 bg-emerald-500/10 p-6 text-sm text-emerald-100/95">
                    <p className="font-semibold text-white">
                      Your Trader Watchdog profile is live
                    </p>
                    <p className="mt-2 text-emerald-100/85">
                      Sign in with your work email:{" "}
                      <span className="text-white">{savedEmail}</span>
                    </p>
                    {applicantSummary.oneTimePassword ? (
                      <div className="mt-4 rounded-xl border border-white/10 bg-ink-950/70 p-4 text-left">
                        <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                          One-time password
                        </p>
                        <p className="mt-2 break-all font-mono text-base text-white">
                          {applicantSummary.oneTimePassword}
                        </p>
                        <p className="mt-2 text-xs text-slate-500">
                          Save this now — it disappears after you sign in or
                          after 14 days. You will be asked to set a new password
                          before using the portal.
                        </p>
                        <button
                          type="button"
                          onClick={() =>
                            void navigator.clipboard.writeText(
                              applicantSummary.oneTimePassword ?? ""
                            )
                          }
                          className="mt-3 rounded-lg bg-white/10 px-3 py-1.5 text-xs font-medium text-white hover:bg-white/15"
                        >
                          Copy password
                        </button>
                      </div>
                    ) : (
                      <p className="mt-3 text-xs text-slate-500">
                        No one-time password is shown here after your{" "}
                        <strong className="text-slate-400">first successful</strong>{" "}
                        portal login (it is removed for security), or if this
                        listing was set up before passwords were shown on this
                        page. Use the password you set at first login; forgot it?{" "}
                        <Link
                          to="/contact"
                          className="text-brand-300 hover:text-brand-200"
                        >
                          Contact
                        </Link>{" "}
                        Trader Watchdog.
                      </p>
                    )}
                    <Link
                      to="/login"
                      className="mt-4 inline-flex rounded-xl bg-white px-4 py-2.5 text-sm font-semibold text-ink-900 hover:bg-slate-100"
                    >
                      Log in
                    </Link>
                  </div>
                ) : null}
                {applicantSummary?.exists &&
                applicantSummary.hasPayment &&
                !applicantSummary.profileLive &&
                applicantSummary.status === "APPROVED" ? (
                  <div className="rounded-2xl border border-white/10 bg-ink-950/60 p-6 text-sm text-slate-400">
                    <p className="font-medium text-white">Payment received</p>
                    <p className="mt-2">
                      We&apos;re finalising your member profile. This usually
                      takes under a minute — this page updates automatically, or
                      refresh shortly.
                    </p>
                  </div>
                ) : null}
                {applicantSummary?.exists &&
                applicantSummary.hasPayment &&
                !applicantSummary.profileLive &&
                applicantSummary.status &&
                applicantSummary.status !== "APPROVED" ? (
                  <div className="rounded-2xl border border-amber-500/20 bg-amber-500/5 p-6 text-sm text-amber-100/90">
                    <p className="font-medium text-amber-100">
                      Payment on file
                    </p>
                    <p className="mt-2 text-amber-100/80">
                      Your card payment is recorded. Your listing is created
                      after Trader Watchdog approves your application; this page will
                      update when you&apos;re approved and we&apos;ve finished
                      setup.
                    </p>
                  </div>
                ) : null}
                {applicantSummary?.canCheckout ? (
                  <div className="rounded-2xl border border-white/10 bg-ink-950/60 p-6">
                    <p className="text-sm font-semibold text-white">
                      You&apos;re approved — complete payment
                    </p>
                    <p className="mt-1 text-xs text-slate-500">
                      Secure card checkout. Use the same email as on your
                      application ({savedEmail}).
                    </p>
                    <p className="mt-3 text-xs text-slate-600">
                      Use this page to pay. Starting another application clears
                      this link until that new application is approved.
                    </p>
                    <div className="mt-4 flex flex-col gap-3 sm:flex-row">
                      <button
                        type="button"
                        disabled={checkoutLoading !== null}
                        onClick={() => startCheckout("fast")}
                        className="flex-1 rounded-xl bg-amber-500 py-3 text-sm font-semibold text-ink-900 hover:bg-amber-400 disabled:opacity-50"
                      >
                        {checkoutLoading === "fast"
                          ? "Redirecting…"
                          : "Fast-track £40"}
                      </button>
                      <button
                        type="button"
                        disabled={checkoutLoading !== null}
                        onClick={() => startCheckout("member")}
                        className="flex-1 rounded-xl bg-brand-600 py-3 text-sm font-semibold text-white hover:bg-brand-500 disabled:opacity-50"
                      >
                        {checkoutLoading === "member"
                          ? "Redirecting…"
                          : "£15/month membership"}
                      </button>
                    </div>
                  </div>
                ) : null}
                {applicantSummary?.exists &&
                applicantSummary.status === "APPROVED" &&
                !applicantSummary.canCheckout &&
                !applicantSummary.hasPayment &&
                !applicantSummary.profileLive &&
                !applicantSummary.billingAvailable ? (
                  <div className="rounded-2xl border border-amber-500/20 bg-amber-500/5 p-4 text-sm text-amber-100/90">
                    You&apos;re approved, but online card payment isn&apos;t
                    available right now. Please use{" "}
                    <Link
                      to="/contact"
                      className="font-medium text-amber-200 underline"
                    >
                      Contact
                    </Link>{" "}
                    to arrange payment.
                  </div>
                ) : null}
                {sentVia === "api" &&
                applicantSummary === null &&
                savedEmail &&
                applicationId ? (
                  <p className="text-center text-xs text-slate-500">
                    Checking approval and payment status…
                  </p>
                ) : null}
              </div>
            ) : null}

            <div className="mt-6 flex flex-col items-center gap-3 sm:flex-row sm:justify-center">
              <Link
                to="/"
                className="inline-flex rounded-full bg-white px-6 py-2.5 text-sm font-semibold text-ink-900 hover:bg-slate-100"
              >
                Back to home
              </Link>
              {showSubmitAnother ? (
                <button
                  type="button"
                  onClick={clearJoinSession}
                  className="text-sm font-medium text-slate-400 underline decoration-white/20 underline-offset-4 hover:text-slate-300"
                >
                  Submit another application
                </button>
              ) : null}
            </div>
          </div>
        ) : (
          <form className="space-y-5" onSubmit={onSubmit}>
            {formError ? (
              <div
                className="rounded-xl border border-amber-500/30 bg-amber-500/10 px-4 py-3 text-sm text-amber-100"
                role="alert"
              >
                {formError}
              </div>
            ) : null}
            <div>
              <label
                htmlFor="company"
                className="block text-sm font-medium text-slate-300"
              >
                Business name
              </label>
              <input
                id="company"
                name="company"
                required
                className="mt-1.5 w-full rounded-xl border border-white/10 bg-ink-900 px-4 py-3 text-white placeholder:text-slate-500 focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-500/40"
                placeholder="Smith & Co Plumbing"
              />
            </div>
            <div>
              <label
                htmlFor="trade"
                className="block text-sm font-medium text-slate-300"
              >
                Trade / specialism
              </label>
              <input
                id="trade"
                name="trade"
                required
                className="mt-1.5 w-full rounded-xl border border-white/10 bg-ink-900 px-4 py-3 text-white placeholder:text-slate-500 focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-500/40"
                placeholder="Gas engineer"
              />
            </div>
            <div>
              <label
                htmlFor="email"
                className="block text-sm font-medium text-slate-300"
              >
                Work email
              </label>
              <input
                id="email"
                name="email"
                type="email"
                required
                className="mt-1.5 w-full rounded-xl border border-white/10 bg-ink-900 px-4 py-3 text-white placeholder:text-slate-500 focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-500/40"
                placeholder="you@yourbusiness.co.uk"
              />
            </div>
            <div>
              <label
                htmlFor="postcode"
                className="block text-sm font-medium text-slate-300"
              >
                Main operating postcode
              </label>
              <input
                id="postcode"
                name="postcode"
                required
                className="mt-1.5 w-full rounded-xl border border-white/10 bg-ink-900 px-4 py-3 text-white placeholder:text-slate-500 focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-500/40"
                placeholder="BS1 5TR"
              />
            </div>
            <div>
              <label
                htmlFor="files"
                className="block text-sm font-medium text-slate-300"
              >
                Supporting documents (optional)
              </label>
              <p className="mt-1 text-xs text-slate-500">
                PDF or images, up to 8 files, 10 MB each — e.g. insurance
                certificate, accreditations.
              </p>
              <input
                id="files"
                name="files"
                type="file"
                multiple
                accept=".pdf,application/pdf,image/jpeg,image/png,image/webp,image/gif"
                className="mt-2 block w-full text-sm text-slate-400 file:mr-3 file:rounded-lg file:border-0 file:bg-white/10 file:px-3 file:py-2 file:text-sm file:font-medium file:text-white hover:file:bg-white/15"
              />
            </div>
            {recaptchaSiteKey ? (
              <div
                className="g-recaptcha"
                data-sitekey={recaptchaSiteKey}
              />
            ) : null}
            <button
              type="submit"
              disabled={submitting}
              className="w-full rounded-xl bg-brand-600 py-3.5 text-sm font-semibold text-white shadow-lg shadow-brand-900/30 hover:bg-brand-500 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {submitting ? "Submitting…" : "Submit application"}
            </button>
          </form>
        )}
      </div>
    </main>
  );
}
