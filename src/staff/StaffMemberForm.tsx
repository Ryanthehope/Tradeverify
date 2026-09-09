import { FormEvent, useEffect, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { PasswordInput } from "../components/PasswordInput";
import { apiGetAuth, apiGetAuthBlob, apiSend } from "../lib/api";

type InsurancePolicy = {
  id: string;
  type: string;
  provider: string | null;
  policyNumber: string | null;
  expiryDate: string;
  status: "active" | "expiring_soon" | "in_grace" | "expired";
  alertsSent?: {
    "30days"?: string;
    "14days"?: string;
  } | null;
};

type ComplianceRecord = {
  id: string;
  memberId: string;
  type: string;
  referenceNumber: string | null;
  expiryDate: string | null;
  notes: string | null;
  sourceDocumentKind: "member" | "application" | null;
  sourceDocumentId: string | null;
  createdAt: string;
  updatedAt: string;
};

type ApplicationDoc = {
  id: string;
  originalName: string;
  mimeType: string;
  sizeBytes: number;
  createdAt: string;
};

type MemberDoc = {
  id: string;
  originalName: string;
  mimeType: string;
  sizeBytes: number;
  createdAt: string;
};

type SourceApplicationXeroInvoices = {
  registration_fee: string | null;
  membership: string | null;
};

function formatBytes(n: number) {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / (1024 * 1024)).toFixed(1)} MB`;
}

function insuranceDaysUntil(dateStr: string) {
  const target = new Date(dateStr);
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  target.setHours(0, 0, 0, 0);
  return Math.floor((target.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
}

function insuranceReminderText(policy: InsurancePolicy) {
  const days = insuranceDaysUntil(policy.expiryDate);
  const alert30Sent = Boolean(policy.alertsSent?.["30days"]);
  const alert14Sent = Boolean(policy.alertsSent?.["14days"]);

  if (days > 30) return "30-day reminder pending";
  if (days > 14) return alert30Sent ? "30-day reminder sent" : "30-day reminder due now";
  if (days >= 0) {
    if (alert14Sent) return "14-day reminder sent";
    if (alert30Sent) return "14-day reminder due now";
    return "30-day and 14-day reminders due now";
  }
  return "Reminder window passed";
}

export function StaffMemberForm() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const isNew = id === "new" || !id;
  const [slug, setSlug] = useState("");
  const [tvId, setTvId] = useState("");
  const [name, setName] = useState("");
  const [trade, setTrade] = useState("");
  const [location, setLocation] = useState("");
  const [checksText, setChecksText] = useState("");
  const [verifiedSince, setVerifiedSince] = useState("");
  const [blurb, setBlurb] = useState("");
  const [loginEmail, setLoginEmail] = useState("");
  const [portalPassword, setPortalPassword] = useState("");
  const [disablePortal, setDisablePortal] = useState(false);
  const [portalEnabled, setPortalEnabled] = useState(false);

  const [portalMembershipUnlimited, setPortalMembershipUnlimited] =
    useState(false);
  const [portalAccessMode, setPortalAccessMode] = useState<"legacy" | "manual">(
    "legacy"
  );
  const [portalExpiresAt, setPortalExpiresAt] = useState("");

  const [loading, setLoading] = useState(!isNew);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Insurance
  const [policies, setPolicies] = useState<InsurancePolicy[]>([]);
  const [insType, setInsType] = useState("");
  const [insProvider, setInsProvider] = useState("");
  const [insPolicyNumber, setInsPolicyNumber] = useState("");
  const [insExpiry, setInsExpiry] = useState("");
  const [insAdding, setInsAdding] = useState(false);
  const [insError, setInsError] = useState<string | null>(null);
  const [complianceRecords, setComplianceRecords] = useState<ComplianceRecord[]>([]);
  const [complianceType, setComplianceType] = useState("");
  const [complianceReferenceNumber, setComplianceReferenceNumber] = useState("");
  const [complianceExpiry, setComplianceExpiry] = useState("");
  const [complianceNotes, setComplianceNotes] = useState("");
  const [complianceSourceKey, setComplianceSourceKey] = useState("");
  const [complianceAdding, setComplianceAdding] = useState(false);
  const [complianceError, setComplianceError] = useState<string | null>(null);
  const [memberDocuments, setMemberDocuments] = useState<MemberDoc[]>([]);
  const [sourceApplicationId, setSourceApplicationId] = useState<string | null>(null);
  const [sourceApplicationDocuments, setSourceApplicationDocuments] = useState<ApplicationDoc[]>([]);
  const [receiptBusy, setReceiptBusy] = useState(false);
  const [invoiceBusy, setInvoiceBusy] = useState<
    "registration_fee" | "membership" | "renewal" | null
  >(null);
  const [memberXeroInvoiceId, setMemberXeroInvoiceId] = useState<string | null>(null);
  const [hasMemberStripeBilling, setHasMemberStripeBilling] = useState(false);
  const [sourceApplicationXeroInvoices, setSourceApplicationXeroInvoices] = useState<SourceApplicationXeroInvoices>({
    registration_fee: null,
    membership: null,
  });
  const [sourceApplicationHasRegistrationFeePayment, setSourceApplicationHasRegistrationFeePayment] =
    useState(false);
  const [sourceApplicationHasMembershipPayment, setSourceApplicationHasMembershipPayment] =
    useState(false);

  useEffect(() => {
    if (isNew || !id) {
      setLoading(false);
      return;
    }
    let cancelled = false;
    (async () => {
      try {
        const data = await apiGetAuth<{
          member: {
            slug: string;
            tvId: string;
            name: string;
            trade: string;
            location: string;
            checks: string[];
            verifiedSince: string;
            blurb: string;
            loginEmail: string | null;
            portalEnabled?: boolean;
            membershipUnlimited?: boolean;
            membershipBillingType?: string | null;
            membershipExpiresAt?: string | null;
            memberDocuments?: MemberDoc[];
            xeroInvoiceId?: string | null;
            hasMemberStripeBilling?: boolean;
            sourceApplicationId?: string | null;
            sourceApplicationXeroInvoices?: SourceApplicationXeroInvoices;
            sourceApplicationHasRegistrationFeePayment?: boolean;
            sourceApplicationHasMembershipPayment?: boolean;
            sourceApplicationDocuments?: ApplicationDoc[];
          };
        }>(`/api/admin/members/${id}`);
        if (cancelled) return;
        const m = data.member;
        setSlug(m.slug);
        setTvId(m.tvId);
        setName(m.name);
        setTrade(m.trade);
        setLocation(m.location);
        setChecksText(m.checks.join("\n"));
        setVerifiedSince(m.verifiedSince);
        setBlurb(m.blurb);
        setLoginEmail(m.loginEmail ?? "");
        setPortalEnabled(Boolean(m.portalEnabled));
        setPortalMembershipUnlimited(Boolean(m.membershipUnlimited));
        const bt = (m.membershipBillingType ?? "").trim().toLowerCase();
        const mode = bt === "manual" ? "manual" : "legacy";
        setPortalAccessMode(mode);
        setPortalExpiresAt(
          m.membershipExpiresAt ? m.membershipExpiresAt.slice(0, 10) : ""
        );
        setMemberDocuments(m.memberDocuments ?? []);
        setMemberXeroInvoiceId(m.xeroInvoiceId ?? null);
        setHasMemberStripeBilling(Boolean(m.hasMemberStripeBilling));
        setSourceApplicationId(m.sourceApplicationId ?? null);
        setSourceApplicationXeroInvoices(
          m.sourceApplicationXeroInvoices ?? {
            registration_fee: null,
            membership: null,
          }
        );
        setSourceApplicationHasRegistrationFeePayment(
          Boolean(m.sourceApplicationHasRegistrationFeePayment)
        );
        setSourceApplicationHasMembershipPayment(
          Boolean(m.sourceApplicationHasMembershipPayment)
        );
        setSourceApplicationDocuments(m.sourceApplicationDocuments ?? []);

        // Load insurance policies and staff compliance records.
        const [insData, complianceData] = await Promise.all([
          apiGetAuth<InsurancePolicy[]>(`/api/insurance/${id}`),
          apiGetAuth<ComplianceRecord[]>(`/api/compliance-records/${id}`),
        ]);
        if (!cancelled) {
          setPolicies(insData);
          setComplianceRecords(complianceData);
        }
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : "Load failed");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [id, isNew]);

  const addPolicy = async () => {
    if (!insType.trim() || !insExpiry) {
      setInsError("Type and expiry date are required.");
      return;
    }
    setInsAdding(true);
    setInsError(null);
    try {
      const created = await apiSend<InsurancePolicy>("/api/insurance", {
        method: "POST",
        body: JSON.stringify({
          memberId: id,
          type: insType.trim(),
          provider: insProvider.trim() || null,
          policyNumber: insPolicyNumber.trim() || null,
          expiryDate: insExpiry,
        }),
      });
      setPolicies((p) => [...p, created]);
      setInsType("");
      setInsProvider("");
      setInsPolicyNumber("");
      setInsExpiry("");
    } catch (e) {
      setInsError(e instanceof Error ? e.message : "Could not add policy");
    } finally {
      setInsAdding(false);
    }
  };

  const deletePolicy = async (policyId: string) => {
    if (!confirm("Delete this insurance policy? This cannot be undone.")) return;
    try {
      await apiSend(`/api/insurance/${policyId}`, { method: "DELETE" });
      setPolicies((p) => p.filter((x) => x.id !== policyId));
    } catch (e) {
      alert(e instanceof Error ? e.message : "Could not delete policy");
    }
  };

  const addComplianceRecord = async () => {
    if (!id) return;
    if (!complianceType.trim()) {
      setComplianceError("Type is required.");
      return;
    }
    setComplianceAdding(true);
    setComplianceError(null);
    try {
      const [sourceDocumentKind = "", sourceDocumentId = ""] = complianceSourceKey.split(":");
      const created = await apiSend<ComplianceRecord>("/api/compliance-records", {
        method: "POST",
        body: JSON.stringify({
          memberId: id,
          type: complianceType.trim(),
          referenceNumber: complianceReferenceNumber.trim() || null,
          expiryDate: complianceExpiry.trim() || null,
          notes: complianceNotes.trim() || null,
          sourceDocumentKind: sourceDocumentKind || null,
          sourceDocumentId: sourceDocumentId || null,
        }),
      });
      setComplianceRecords((current) => [...current, created]);
      setComplianceType("");
      setComplianceReferenceNumber("");
      setComplianceExpiry("");
      setComplianceNotes("");
      setComplianceSourceKey("");
    } catch (e) {
      setComplianceError(
        e instanceof Error ? e.message : "Could not add compliance record"
      );
    } finally {
      setComplianceAdding(false);
    }
  };

  const deleteComplianceRecord = async (recordId: string) => {
    if (!confirm("Delete this compliance record? This cannot be undone.")) {
      return;
    }
    try {
      await apiSend(`/api/compliance-records/${recordId}`, { method: "DELETE" });
      setComplianceRecords((current) => current.filter((record) => record.id !== recordId));
    } catch (e) {
      alert(e instanceof Error ? e.message : "Could not delete compliance record");
    }
  };

  const linkedComplianceDocument = (record: ComplianceRecord) => {
    if (!record.sourceDocumentKind || !record.sourceDocumentId) return null;
    if (record.sourceDocumentKind === "member") {
      const doc = memberDocuments.find((candidate) => candidate.id === record.sourceDocumentId);
      return doc ? { kind: "member" as const, doc } : null;
    }
    const doc = sourceApplicationDocuments.find((candidate) => candidate.id === record.sourceDocumentId);
    return doc ? { kind: "application" as const, doc } : null;
  };

  const openComplianceLinkedDocument = async (record: ComplianceRecord) => {
    const linked = linkedComplianceDocument(record);
    if (!linked) return;
    if (linked.kind === "member") {
      await openMemberDocument(linked.doc);
      return;
    }
    await openSourceApplicationDocument(linked.doc);
  };

  const complianceSourceOptions = [
    ...sourceApplicationDocuments.map((doc) => ({
      key: `application:${doc.id}`,
      label: `Application upload: ${doc.originalName}`,
    })),
    ...memberDocuments.map((doc) => ({
      key: `member:${doc.id}`,
      label: `Member portal upload: ${doc.originalName}`,
    })),
  ];

  const openSourceApplicationDocument = async (doc: ApplicationDoc) => {
    if (!sourceApplicationId) return;
    try {
      const blob = await apiGetAuthBlob(
        `/api/admin/applications/${sourceApplicationId}/documents/${doc.id}/file`
      );
      const url = URL.createObjectURL(blob);
      window.open(url, "_blank", "noopener,noreferrer");
      window.setTimeout(() => URL.revokeObjectURL(url), 60_000);
    } catch (e) {
      alert(e instanceof Error ? e.message : "Could not open document");
    }
  };

  const openMemberDocument = async (doc: MemberDoc) => {
    if (!id) return;
    try {
      const blob = await apiGetAuthBlob(
        `/api/admin/members/${id}/documents/${doc.id}/file`
      );
      const url = URL.createObjectURL(blob);
      window.open(url, "_blank", "noopener,noreferrer");
      window.setTimeout(() => URL.revokeObjectURL(url), 60_000);
    } catch (e) {
      alert(e instanceof Error ? e.message : "Could not open document");
    }
  };

  const resendReceipt = async () => {
    if (!sourceApplicationId) return;
    setReceiptBusy(true);
    try {
      const d = await apiSend<{
        ok: true;
        emailedTo: string;
        invoiceDescription: string;
        paymentReference: string;
      }>(`/api/admin/applications/${sourceApplicationId}/resend-receipt`, {
        method: "POST",
      });
      alert(
        `Receipt resent to ${d.emailedTo} for ${d.invoiceDescription}. Reference: ${d.paymentReference}`
      );
    } catch (e) {
      alert(e instanceof Error ? e.message : "Could not resend receipt");
    } finally {
      setReceiptBusy(false);
    }
  };

  const downloadApplicationInvoice = async (
    kind: "registration_fee" | "membership"
  ) => {
    if (!sourceApplicationId) return;
    setInvoiceBusy(kind);
    try {
      const blob = await apiGetAuthBlob(
        `/api/admin/applications/${sourceApplicationId}/xero-invoices/${kind}/file`
      );
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = `${name || "trader"}-${kind}-invoice.pdf`;
      document.body.appendChild(anchor);
      anchor.click();
      anchor.remove();
      window.setTimeout(() => URL.revokeObjectURL(url), 60_000);
    } catch (e) {
      alert(e instanceof Error ? e.message : "Could not download invoice");
    } finally {
      setInvoiceBusy(null);
    }
  };

  const downloadMemberRenewalInvoice = async () => {
    if (!id || !memberXeroInvoiceId) return;
    setInvoiceBusy("renewal");
    try {
      const blob = await apiGetAuthBlob(`/api/admin/members/${id}/xero-invoice/file`);
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = `${name || "member"}-renewal-invoice.pdf`;
      document.body.appendChild(anchor);
      anchor.click();
      anchor.remove();
      window.setTimeout(() => URL.revokeObjectURL(url), 60_000);
    } catch (e) {
      alert(e instanceof Error ? e.message : "Could not download invoice");
    } finally {
      setInvoiceBusy(null);
    }
  };

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    const checks = checksText
      .split("\n")
      .map((l) => l.trim())
      .filter(Boolean);
    if (!checks.length) {
      setError("Add at least one check (one per line).");
      return;
    }
    const basePayload = {
      slug,
      tvId,
      name,
      trade,
      location,
      checks,
      verifiedSince,
      blurb,
    };
    const portalPw = portalPassword.trim();
    const emailTrim = loginEmail.trim().toLowerCase();

    if (isNew) {
      if (portalPw && !emailTrim) {
        setError("Portal login email is required when setting a portal password.");
        return;
      }
    } else {
      if (
        portalAccessMode === "manual" &&
        !portalExpiresAt.trim()
      ) {
        setError(
          "Access end date is required for manual access mode."
        );
        return;
      }
      if (disablePortal) {
        /* ok */
      } else if (portalPw && !emailTrim) {
        setError("Portal login email is required when setting a new portal password.");
        return;
      }
    }

    const payload =
      isNew
        ? {
            ...basePayload,
            ...(portalPw && emailTrim
              ? { loginEmail: emailTrim, portalPassword: portalPw }
              : {}),
          }
        : {
            ...basePayload,
            ...(disablePortal
              ? { disablePortal: true }
              : {
                  loginEmail: emailTrim,
                  ...(portalPw ? { portalPassword: portalPw } : {}),
                }),
            membershipUnlimited: portalMembershipUnlimited,
            membershipAccessMode: portalAccessMode,
            membershipExpiresAt:
              portalAccessMode === "manual"
                ? portalExpiresAt.trim() || null
                : null,
          };

    setSaving(true);
    try {
      if (isNew) {
        await apiSend("/api/admin/members", {
          method: "POST",
          body: JSON.stringify(payload),
        });
      } else {
        await apiSend(`/api/admin/members/${id}`, {
          method: "PUT",
          body: JSON.stringify(payload),
        });
      }
      navigate("/staff/members");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Save failed");
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return <p className="text-slate-500">Loading…</p>;
  }

  return (
    <div>
      <Link
        to="/staff/members"
        className="text-sm text-brand-300 hover:text-brand-200"
      >
        ← Members
      </Link>
      <h1 className="mt-4 font-display text-2xl font-semibold text-white">
        {isNew ? "Add member" : "Edit member"}
      </h1>

      <form className="mt-8 max-w-2xl space-y-5" onSubmit={onSubmit}>
        {error ? (
          <div className="rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-2 text-sm text-red-200">
            {error}
          </div>
        ) : null}

        <div className="grid gap-5 sm:grid-cols-2">
          <div className="sm:col-span-2">
            <label className="block text-sm font-medium text-slate-300">
              URL slug
            </label>
            <input
              required
              value={slug}
              onChange={(e) => setSlug(e.target.value)}
              placeholder="e.g. riverside-electrical-2847"
              className="mt-1 w-full rounded-xl border border-white/10 bg-ink-900 px-4 py-3 text-white placeholder:text-slate-600 focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-500/40"
            />
            <p className="mt-1 text-xs text-slate-500">
              Used in /m/<span className="font-mono">{slug || "your-slug"}</span>
            </p>
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-300">
              Mobile Number
            </label>
            <input
              required
              value={tvId}
              onChange={(e) => setTvId(e.target.value)}
              placeholder="e.g. 07700 900000"
              className="mt-1 w-full rounded-xl border border-white/10 bg-ink-900 px-4 py-3 text-white focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-500/40"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-300">
              Member since
            </label>
            <input
              required
              value={verifiedSince}
              onChange={(e) => setVerifiedSince(e.target.value)}
              placeholder="November 2024"
              className="mt-1 w-full rounded-xl border border-white/10 bg-ink-900 px-4 py-3 text-white focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-500/40"
            />
          </div>
          <div className="sm:col-span-2">
            <label className="block text-sm font-medium text-slate-300">
              Business name
            </label>
            <input
              required
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="mt-1 w-full rounded-xl border border-white/10 bg-ink-900 px-4 py-3 text-white focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-500/40"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-300">
              Trade
            </label>
            <input
              required
              value={trade}
              onChange={(e) => setTrade(e.target.value)}
              className="mt-1 w-full rounded-xl border border-white/10 bg-ink-900 px-4 py-3 text-white focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-500/40"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-300">
              Location
            </label>
            <input
              required
              value={location}
              onChange={(e) => setLocation(e.target.value)}
              className="mt-1 w-full rounded-xl border border-white/10 bg-ink-900 px-4 py-3 text-white focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-500/40"
            />
          </div>
          <div className="sm:col-span-2">
            <label className="block text-sm font-medium text-slate-300">
              Checks (one per line)
            </label>
            <textarea
              required
              rows={5}
              value={checksText}
              onChange={(e) => setChecksText(e.target.value)}
              placeholder="Local address confirmed&#10;Insurance verified"
              className="mt-1 w-full rounded-xl border border-white/10 bg-ink-900 px-4 py-3 text-white placeholder:text-slate-600 focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-500/40"
            />
          </div>
          <div className="sm:col-span-2">
            <label className="block text-sm font-medium text-slate-300">
              Profile summary (blurb)
            </label>
            <textarea
              required
              rows={4}
              value={blurb}
              onChange={(e) => setBlurb(e.target.value)}
              className="mt-1 w-full rounded-xl border border-white/10 bg-ink-900 px-4 py-3 text-white focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-500/40"
            />
          </div>

          {!isNew ? (
            <div className="sm:col-span-2 rounded-xl border border-slate-500/25 bg-slate-950/30 p-5">
              <h2 className="text-sm font-semibold text-slate-200">
                Portal membership access
              </h2>
              <p className="mt-1 text-xs text-slate-500">
                Controls how long the member can use the dashboard (documents,
                profile edits, etc.). Annual renewals now use
                fixed end dates rather than a monthly subscription.
              </p>
              <label className="mt-4 flex cursor-pointer items-center gap-2 text-sm text-slate-300">
                <input
                  type="checkbox"
                  checked={portalMembershipUnlimited}
                  onChange={(e) =>
                    setPortalMembershipUnlimited(e.target.checked)
                  }
                  className="rounded border-white/20 bg-ink-900"
                />
                Unlimited portal access (staff override — ignores dates)
              </label>
              <div className="mt-4">
                <label className="block text-sm font-medium text-slate-300">
                  Access mode
                </label>
                <select
                  value={portalAccessMode}
                  onChange={(e) =>
                    setPortalAccessMode(
                      e.target.value as typeof portalAccessMode
                    )
                  }
                  className="mt-1 w-full rounded-xl border border-white/10 bg-ink-900 px-4 py-3 text-white focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-500/40"
                >
                  <option value="legacy">
                    Unspecified / legacy (no expiry record)
                  </option>
                  <option value="manual">Manual term (set end date)</option>
                </select>
              </div>
              {portalAccessMode === "manual" ? (
                <div className="mt-4">
                  <label className="block text-sm font-medium text-slate-300">
                    Access until (YYYY-MM-DD)
                  </label>
                  <input
                    type="date"
                    value={portalExpiresAt}
                    onChange={(e) => setPortalExpiresAt(e.target.value)}
                    className="mt-1 w-full rounded-xl border border-white/10 bg-ink-900 px-4 py-3 text-white focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-500/40"
                  />
                </div>
              ) : null}
            </div>
          ) : null}

          <div className="sm:col-span-2 rounded-xl border border-brand-500/20 bg-brand-950/20 p-5">
            <h2 className="text-sm font-semibold text-brand-200">
              Member portal login
            </h2>
            <p className="mt-1 text-xs text-slate-500">
              Lets this business sign in at{" "}
              <span className="font-mono text-slate-400">/login</span> (Member tab)
              to view their dashboard and edit allowed profile fields.
            </p>
            {memberXeroInvoiceId || hasMemberStripeBilling ? (
              <div className="mt-4 flex flex-wrap items-center gap-3 rounded-xl border border-white/12 bg-ink-950/40 px-4 py-3">
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium text-slate-200">Latest renewal invoice</p>
                  <p className="mt-1 text-xs text-slate-500">
                    Download the most recent renewal invoice or payment receipt available for this member.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => void downloadMemberRenewalInvoice()}
                  disabled={invoiceBusy !== null}
                  className="rounded-lg border border-brand-400/30 bg-brand-400/10 px-3 py-1.5 text-xs font-medium text-brand-100 transition hover:bg-brand-400/15 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {invoiceBusy === "renewal" ? "Downloading…" : "Download renewal invoice"}
                </button>
              </div>
            ) : null}
            {!isNew && portalEnabled ? (
              <label className="mt-4 flex cursor-pointer items-center gap-2 text-sm text-slate-300">
                <input
                  type="checkbox"
                  checked={disablePortal}
                  onChange={(e) => setDisablePortal(e.target.checked)}
                  className="rounded border-white/20 bg-ink-900"
                />
                Remove portal access (they will not be able to sign in)
              </label>
            ) : null}
            {!disablePortal ? (
              <>
                <div className="mt-4">
                  <label className="block text-sm font-medium text-slate-300">
                    Portal email
                  </label>
                  <input
                    type="email"
                    value={loginEmail}
                    onChange={(e) => setLoginEmail(e.target.value)}
                    placeholder="contact@theirbusiness.co.uk"
                    autoComplete="off"
                    className="mt-1 w-full rounded-xl border border-white/10 bg-ink-900 px-4 py-3 text-white placeholder:text-slate-600 focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-500/40"
                  />
                </div>
                <div className="mt-4">
                  <label className="block text-sm font-medium text-slate-300">
                    Portal password
                  </label>
                  <PasswordInput
                    value={portalPassword}
                    onChange={(e) => setPortalPassword(e.target.value)}
                    placeholder={
                      isNew
                        ? "Optional — set to enable portal"
                        : "Leave blank to keep current password"
                    }
                    autoComplete="new-password"
                    className="mt-1 w-full rounded-xl border border-white/10 bg-ink-900 px-4 py-3 text-white placeholder:text-slate-600 focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-500/40"
                  />
                </div>
              </>
            ) : null}
          </div>
        </div>

        {!isNew ? (
          <div className="sm:col-span-2 rounded-xl border border-sky-500/20 bg-sky-950/20 p-5">
            <h2 className="text-sm font-semibold text-sky-200">Insurance policies</h2>
            <p className="mt-1 text-xs text-slate-500">
              Policies appear in the member portal and trigger automatic expiry reminders at 30 and 14 days.
            </p>

            {policies.length > 0 ? (
              <div className="mt-4 overflow-hidden rounded-xl border border-white/10">
                <table className="w-full text-xs">
                  <thead className="border-b border-white/10 bg-ink-950/60">
                    <tr>
                      {["Type", "Provider", "Policy no.", "Expiry", "Status", "Reminder", ""].map((h) => (
                        <th key={h} className="px-3 py-2 text-left font-semibold text-slate-400">{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-white/5">
                    {policies.map((p) => {
                      const statusColour =
                        p.status === "active" ? "text-emerald-400" :
                        p.status === "expiring_soon" ? "text-amber-400" :
                        p.status === "in_grace" ? "text-orange-400" : "text-red-400";
                      return (
                        <tr key={p.id} className="hover:bg-white/[0.02]">
                          <td className="px-3 py-2 text-slate-200">{p.type}</td>
                          <td className="px-3 py-2 text-slate-400">{p.provider || "—"}</td>
                          <td className="px-3 py-2 font-mono text-slate-400">{p.policyNumber || "—"}</td>
                          <td className="px-3 py-2 text-slate-300">
                            {new Date(p.expiryDate).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" })}
                          </td>
                          <td className={`px-3 py-2 font-medium capitalize ${statusColour}`}>
                            {p.status.replace("_", " ")}
                          </td>
                          <td className="px-3 py-2 text-xs text-slate-400">
                            {insuranceReminderText(p)}
                          </td>
                          <td className="px-3 py-2 text-right">
                            <button
                              type="button"
                              onClick={() => void deletePolicy(p.id)}
                              className="text-red-400 hover:text-red-300"
                            >
                              Delete
                            </button>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            ) : (
              <p className="mt-3 text-xs text-slate-500">No policies recorded yet.</p>
            )}

            <div className="mt-5 grid gap-3 sm:grid-cols-2">
              <div className="sm:col-span-2">
                <p className="text-xs font-semibold text-slate-300">Add new document</p>
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-400">Type of document *</label>
                <input
                  type="text"
                  value={insType}
                  onChange={(e) => setInsType(e.target.value)}
                  placeholder="Public Liability"
                  className="mt-1 w-full rounded-xl border border-white/10 bg-ink-900 px-3 py-2 text-sm text-white placeholder:text-slate-600 focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-500/40"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-400">Expiry date *</label>
                <input
                  type="date"
                  value={insExpiry}
                  onChange={(e) => setInsExpiry(e.target.value)}
                  className="mt-1 w-full rounded-xl border border-white/10 bg-ink-900 px-3 py-2 text-sm text-white focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-500/40"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-400">Provider</label>
                <input
                  type="text"
                  value={insProvider}
                  onChange={(e) => setInsProvider(e.target.value)}
                  placeholder="Axa, Hiscox…"
                  className="mt-1 w-full rounded-xl border border-white/10 bg-ink-900 px-3 py-2 text-sm text-white placeholder:text-slate-600 focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-500/40"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-400">Policy number</label>
                <input
                  type="text"
                  value={insPolicyNumber}
                  onChange={(e) => setInsPolicyNumber(e.target.value)}
                  placeholder="POL-12345"
                  className="mt-1 w-full rounded-xl border border-white/10 bg-ink-900 px-3 py-2 text-sm text-white placeholder:text-slate-600 focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-500/40"
                />
              </div>
              {insError ? (
                <p className="sm:col-span-2 text-xs text-red-300">{insError}</p>
              ) : null}
              <div className="sm:col-span-2">
                <button
                  type="button"
                  disabled={insAdding}
                  onClick={() => void addPolicy()}
                  className="rounded-xl border border-sky-500/30 bg-sky-500/10 px-4 py-2 text-sm font-medium text-sky-100 hover:bg-sky-500/16 disabled:opacity-50"
                >
                  {insAdding ? "Adding…" : "Add document"}
                </button>
              </div>
            </div>
          </div>
        ) : null}

        {!isNew ? (
          <div className="sm:col-span-2 rounded-xl border border-violet-500/20 bg-violet-950/20 p-5">
            <h2 className="text-sm font-semibold text-violet-200">Compliance documents and registrations</h2>
            <p className="mt-1 text-xs text-slate-500">
              Staff-managed records for non-insurance evidence such as waste carrier licences, Gas Safe, NICEIC, ICO, DBS or other registrations. Each record can optionally link to an upload from the original application or the member portal.
            </p>

            {complianceRecords.length > 0 ? (
              <div className="mt-4 overflow-hidden rounded-xl border border-white/10">
                <table className="w-full text-xs">
                  <thead className="border-b border-white/10 bg-ink-950/60">
                    <tr>
                      {["Type", "Reference", "Expiry", "Linked file", "Notes", "Added", ""].map((heading) => (
                        <th key={heading} className="px-3 py-2 text-left font-semibold text-slate-400">{heading}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-white/5">
                    {complianceRecords.map((record) => {
                      const linked = linkedComplianceDocument(record);
                      return (
                      <tr key={record.id} className="hover:bg-white/[0.02] align-top">
                        <td className="px-3 py-2 text-slate-200">{record.type}</td>
                        <td className="px-3 py-2 font-mono text-slate-400">{record.referenceNumber || "—"}</td>
                        <td className="px-3 py-2 text-slate-300">
                          {record.expiryDate
                            ? new Date(record.expiryDate).toLocaleDateString("en-GB", {
                                day: "numeric",
                                month: "short",
                                year: "numeric",
                              })
                            : "—"}
                        </td>
                        <td className="px-3 py-2 text-slate-300">
                          {linked ? (
                            <button
                              type="button"
                              onClick={() => void openComplianceLinkedDocument(record)}
                              className="text-left text-brand-300 hover:text-brand-200"
                            >
                              {linked.kind === "application" ? "Application" : "Portal"}: {linked.doc.originalName}
                            </button>
                          ) : record.sourceDocumentId ? (
                            <span className="text-slate-500">Linked file unavailable</span>
                          ) : (
                            "—"
                          )}
                        </td>
                        <td className="px-3 py-2 text-slate-400">{record.notes || "—"}</td>
                        <td className="px-3 py-2 text-slate-400">
                          {new Date(record.createdAt).toLocaleDateString("en-GB", {
                            day: "numeric",
                            month: "short",
                            year: "numeric",
                          })}
                        </td>
                        <td className="px-3 py-2 text-right">
                          <button
                            type="button"
                            onClick={() => void deleteComplianceRecord(record.id)}
                            className="text-red-400 hover:text-red-300"
                          >
                            Delete
                          </button>
                        </td>
                      </tr>
                    )})}
                  </tbody>
                </table>
              </div>
            ) : (
              <p className="mt-3 text-xs text-slate-500">No compliance records recorded yet.</p>
            )}

            <div className="mt-5 grid gap-3 sm:grid-cols-2">
              <div className="sm:col-span-2">
                <p className="text-xs font-semibold text-slate-300">Add new compliance record</p>
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-400">Type *</label>
                <input
                  type="text"
                  value={complianceType}
                  onChange={(e) => setComplianceType(e.target.value)}
                  placeholder="Waste Carrier Licence"
                  className="mt-1 w-full rounded-xl border border-white/10 bg-ink-900 px-3 py-2 text-sm text-white placeholder:text-slate-600 focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-500/40"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-400">Reference number</label>
                <input
                  type="text"
                  value={complianceReferenceNumber}
                  onChange={(e) => setComplianceReferenceNumber(e.target.value)}
                  placeholder="CBDU123456"
                  className="mt-1 w-full rounded-xl border border-white/10 bg-ink-900 px-3 py-2 text-sm text-white placeholder:text-slate-600 focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-500/40"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-400">Expiry date</label>
                <input
                  type="date"
                  value={complianceExpiry}
                  onChange={(e) => setComplianceExpiry(e.target.value)}
                  className="mt-1 w-full rounded-xl border border-white/10 bg-ink-900 px-3 py-2 text-sm text-white focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-500/40"
                />
              </div>
              <div className="sm:col-span-2">
                <label className="block text-xs font-medium text-slate-400">Link an existing trader upload</label>
                <select
                  value={complianceSourceKey}
                  onChange={(e) => setComplianceSourceKey(e.target.value)}
                  className="mt-1 w-full rounded-xl border border-white/10 bg-ink-900 px-3 py-2 text-sm text-white focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-500/40"
                >
                  <option value="">No linked file</option>
                  {complianceSourceOptions.map((option) => (
                    <option key={option.key} value={option.key}>
                      {option.label}
                    </option>
                  ))}
                </select>
                <p className="mt-1 text-xs text-slate-500">
                  Choose a file the trader already uploaded during registration or through the member portal.
                </p>
              </div>
              <div className="sm:col-span-2">
                <label className="block text-xs font-medium text-slate-400">Notes</label>
                <textarea
                  rows={3}
                  value={complianceNotes}
                  onChange={(e) => setComplianceNotes(e.target.value)}
                  placeholder="Checked against Environment Agency register on 25 Jul 2026"
                  className="mt-1 w-full rounded-xl border border-white/10 bg-ink-900 px-3 py-2 text-sm text-white placeholder:text-slate-600 focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-500/40"
                />
              </div>
              {complianceError ? (
                <p className="sm:col-span-2 text-xs text-red-300">{complianceError}</p>
              ) : null}
              <div className="sm:col-span-2">
                <button
                  type="button"
                  disabled={complianceAdding}
                  onClick={() => void addComplianceRecord()}
                  className="rounded-xl border border-violet-500/30 bg-violet-500/10 px-4 py-2 text-sm font-medium text-violet-100 hover:bg-violet-500/16 disabled:opacity-50"
                >
                  {complianceAdding ? "Adding…" : "Add compliance record"}
                </button>
              </div>
            </div>
          </div>
        ) : null}

        {!isNew ? (
          <div className="sm:col-span-2 rounded-xl border border-emerald-500/20 bg-emerald-950/20 p-5">
            <h2 className="text-sm font-semibold text-emerald-200">Portal uploads</h2>
            <p className="mt-1 text-xs text-slate-500">
              Files uploaded by the trader from their member portal.
            </p>
            {memberDocuments.length > 0 ? (
              <ul className="mt-4 divide-y divide-white/[0.06] overflow-hidden rounded-xl border border-white/12 bg-ink-950/55">
                {memberDocuments.map((doc) => (
                  <li
                    key={doc.id}
                    className="flex flex-wrap items-center justify-between gap-3 px-4 py-3.5 text-sm"
                  >
                    <div className="min-w-0">
                      <p className="truncate text-slate-200">{doc.originalName}</p>
                      <p className="mt-1 text-xs text-slate-500">
                        {formatBytes(doc.sizeBytes)} · {new Date(doc.createdAt).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" })}
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={() => void openMemberDocument(doc)}
                      className="rounded-lg border border-white/12 bg-white/[0.06] px-3 py-1.5 text-xs font-medium text-white transition hover:bg-white/[0.1]"
                    >
                      Open
                    </button>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="mt-3 text-xs text-slate-500">
                No member portal uploads yet.
              </p>
            )}
          </div>
        ) : null}

        {!isNew ? (
          <div className="sm:col-span-2 rounded-xl border border-amber-500/20 bg-amber-950/20 p-5">
            <h2 className="text-sm font-semibold text-amber-200">Original application uploads</h2>
            <p className="mt-1 text-xs text-slate-500">
              Files uploaded by the trader during their join application.
            </p>
            {sourceApplicationId ? (
              <div className="mt-4 flex flex-wrap items-center gap-3 rounded-xl border border-white/12 bg-ink-950/40 px-4 py-3">
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium text-slate-200">Payment receipt</p>
                  <p className="mt-1 text-xs text-slate-500">
                    Re-send the Stripe/Xero payment receipt linked to the original join application.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => void resendReceipt()}
                  disabled={receiptBusy}
                  className="rounded-lg border border-amber-400/30 bg-amber-400/10 px-3 py-1.5 text-xs font-medium text-amber-100 transition hover:bg-amber-400/15 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {receiptBusy ? "Sending…" : "Re-send payment receipt"}
                </button>
              </div>
            ) : null}
            {sourceApplicationId &&
            (sourceApplicationHasRegistrationFeePayment ||
              sourceApplicationHasMembershipPayment) ? (
              <div className="mt-4 flex flex-wrap items-center gap-3 rounded-xl border border-white/12 bg-ink-950/40 px-4 py-3">
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium text-slate-200">Application invoices</p>
                  <p className="mt-1 text-xs text-slate-500">
                    Download the registration or membership invoice/receipt linked to the original join application.
                  </p>
                </div>
                {sourceApplicationHasRegistrationFeePayment ? (
                  <button
                    type="button"
                    onClick={() => void downloadApplicationInvoice("registration_fee")}
                    disabled={invoiceBusy !== null}
                    className="rounded-lg border border-amber-400/30 bg-amber-400/10 px-3 py-1.5 text-xs font-medium text-amber-100 transition hover:bg-amber-400/15 disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    {invoiceBusy === "registration_fee"
                      ? "Downloading…"
                      : "Download reg invoice"}
                  </button>
                ) : null}
                {sourceApplicationHasMembershipPayment ? (
                  <button
                    type="button"
                    onClick={() => void downloadApplicationInvoice("membership")}
                    disabled={invoiceBusy !== null}
                    className="rounded-lg border border-amber-400/30 bg-amber-400/10 px-3 py-1.5 text-xs font-medium text-amber-100 transition hover:bg-amber-400/15 disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    {invoiceBusy === "membership"
                      ? "Downloading…"
                      : "Download membership invoice"}
                  </button>
                ) : null}
              </div>
            ) : null}
            {sourceApplicationDocuments.length > 0 && sourceApplicationId ? (
              <ul className="mt-4 divide-y divide-white/[0.06] overflow-hidden rounded-xl border border-white/12 bg-ink-950/55">
                {sourceApplicationDocuments.map((doc) => (
                  <li
                    key={doc.id}
                    className="flex flex-wrap items-center justify-between gap-3 px-4 py-3.5 text-sm"
                  >
                    <div className="min-w-0">
                      <p className="truncate text-slate-200">{doc.originalName}</p>
                      <p className="mt-1 text-xs text-slate-500">
                        {formatBytes(doc.sizeBytes)} · {new Date(doc.createdAt).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" })}
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={() => void openSourceApplicationDocument(doc)}
                      className="rounded-lg border border-white/12 bg-white/[0.06] px-3 py-1.5 text-xs font-medium text-white transition hover:bg-white/[0.1]"
                    >
                      Open
                    </button>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="mt-3 text-xs text-slate-500">
                No join application uploads are linked to this member.
              </p>
            )}
          </div>
        ) : null}

        <div className="flex flex-wrap gap-3 pt-2">
          <button
            type="submit"
            disabled={saving}
            className="rounded-xl bg-brand-500 px-6 py-2.5 font-semibold text-white hover:bg-brand-400 disabled:opacity-50"
          >
            {saving ? "Saving…" : "Save"}
          </button>
          <Link
            to="/staff/members"
            className="rounded-xl border border-white/15 px-6 py-2.5 text-sm font-medium text-slate-300 hover:bg-white/5"
          >
            Cancel
          </Link>
        </div>
      </form>
    </div>
  );
}
