import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { apiGetAuth } from "../lib/api";

type Summary = {
  membersTotal: number;
  guidesTotal: number;
  membersByTrade: { trade: string; count: number }[];
  applicationsByStatus: { status: string; count: number }[];
  googleAnalyticsMeasurementId: string | null;
};

type Ga4Report = {
  configured: boolean;
  metrics: {
    activeUsers: number;
    sessions: number;
    screenPageViews: number;
    dateRangeLabel: string;
  } | null;
  hint: string | null;
  error: string | null;
};

export function StaffAnalytics() {
  const [data, setData] = useState<Summary | null>(null);
  const [gaReport, setGaReport] = useState<Ga4Report | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    Promise.all([
      apiGetAuth<Summary>("/api/admin/analytics-summary"),
      apiGetAuth<Ga4Report>("/api/admin/analytics-ga-report").catch(() => ({
        configured: false,
        metrics: null,
        hint: null,
        error: "Could not load GA report",
      })),
    ])
      .then(([summary, report]) => {
        if (!cancelled) {
          setData(summary);
          setGaReport(report);
        }
      })
      .catch((e) => {
        if (!cancelled) {
          setError(e instanceof Error ? e.message : "Failed");
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  if (loading) return <p className="text-slate-500">Loading…</p>;
  if (error || !data) return <p className="text-red-300">{error ?? "—"}</p>;

  const gaId = data.googleAnalyticsMeasurementId?.trim() || null;

  return (
    <div>
      <h1 className="font-display text-2xl font-semibold text-white">
        Analytics
      </h1>
      <p className="mt-2 text-sm text-slate-400">
        Google Analytics for traffic; database totals for your Trader Watchdog
        directory below.
      </p>

      <h2 className="mt-10 text-xs font-semibold uppercase tracking-wider text-slate-500">
        Google Analytics
      </h2>

      {gaId ? (
        <div className="mt-3 rounded-xl border border-amber-500/20 bg-amber-500/5 px-4 py-3 text-sm text-amber-100/90">
          <p className="font-medium text-amber-200/95">If GA shows “no data” yet</p>
          <ul className="mt-2 list-inside list-disc space-y-1 text-amber-100/80">
            <li>
              Open your public homepage (not <code className="text-amber-50">/staff</code>
              ) — we only load gtag on the public site and member areas.
            </li>
            <li>
              In GA4 use <strong className="text-amber-100">Reports → Real-time</strong>{" "}
              and visit the site in another tab; hits can take a few minutes.
            </li>
            <li>
              Disable ad blockers for a quick test. In Edge, check{" "}
              <strong className="text-amber-100">Settings → Privacy → Tracking prevention</strong>{" "}
              (Strict can block Google tags).
            </li>
          </ul>
        </div>
      ) : null}

      <div className="mt-4 rounded-2xl border border-white/10 bg-ink-900/40 p-5 sm:p-6">
        {gaId ? (
          <p className="text-sm text-slate-300">
            <span className="font-medium text-white">Tag configured</span> for the
            public app using{" "}
            <code className="rounded bg-ink-950 px-1.5 py-0.5 font-mono text-brand-200">
              {gaId}
            </code>
            .
          </p>
        ) : (
          <p className="text-sm text-slate-400">
            No Measurement ID yet. Add your GA4 web stream ID under Integrations →
            Google Analytics.
          </p>
        )}

        <div className="mt-4 flex flex-wrap gap-3">
          <a
            href="https://analytics.google.com/"
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex rounded-xl bg-brand-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-brand-500"
          >
            Open Google Analytics
          </a>
          <Link
            to="/staff/integrations?tab=ga"
            className="inline-flex rounded-xl border border-white/15 px-4 py-2.5 text-sm font-medium text-slate-300 hover:bg-white/5"
          >
            Edit Measurement ID
          </Link>
        </div>

        {gaReport?.metrics ? (
          <div className="mt-8 border-t border-white/10 pt-6">
            <p className="text-xs font-semibold uppercase tracking-wider text-slate-500">
              From Google (same property) · {gaReport.metrics.dateRangeLabel}
            </p>
            <div className="mt-4 grid gap-4 sm:grid-cols-3">
              <div className="rounded-xl border border-white/10 bg-ink-950/50 p-4">
                <p className="text-xs uppercase text-slate-500">Active users</p>
                <p className="mt-1 font-display text-2xl font-semibold text-white">
                  {gaReport.metrics.activeUsers}
                </p>
              </div>
              <div className="rounded-xl border border-white/10 bg-ink-950/50 p-4">
                <p className="text-xs uppercase text-slate-500">Sessions</p>
                <p className="mt-1 font-display text-2xl font-semibold text-white">
                  {gaReport.metrics.sessions}
                </p>
              </div>
              <div className="rounded-xl border border-white/10 bg-ink-950/50 p-4">
                <p className="text-xs uppercase text-slate-500">Page views</p>
                <p className="mt-1 font-display text-2xl font-semibold text-white">
                  {gaReport.metrics.screenPageViews}
                </p>
              </div>
            </div>
          </div>
        ) : null}

        {gaReport && !gaReport.metrics && gaReport.error ? (
          <p className="mt-6 rounded-lg border border-red-500/25 bg-red-500/10 px-3 py-2 text-sm text-red-200/95">
            {gaReport.error}
            {gaReport.hint ? (
              <span className="mt-2 block text-xs text-red-200/70">{gaReport.hint}</span>
            ) : null}
          </p>
        ) : null}

        {gaReport && !gaReport.metrics && !gaReport.error && gaReport.hint ? (
          <p className="mt-6 text-sm text-slate-500">{gaReport.hint}</p>
        ) : null}
      </div>

      <h2 className="mt-10 text-xs font-semibold uppercase tracking-wider text-slate-500">
        Site database (Trader Watchdog)
      </h2>
      <p className="mt-2 text-sm text-slate-500">
        Counts from your app database — not from Google Analytics.
      </p>

      <div className="mt-4 grid gap-4 sm:grid-cols-2">
        <div className="rounded-2xl border border-white/10 bg-ink-900/40 p-5">
          <p className="text-xs uppercase text-slate-500">Members</p>
          <p className="mt-1 font-display text-3xl font-semibold text-white">
            {data.membersTotal}
          </p>
        </div>
        <div className="rounded-2xl border border-white/10 bg-ink-900/40 p-5">
          <p className="text-xs uppercase text-slate-500">Articles</p>
          <p className="mt-1 font-display text-3xl font-semibold text-white">
            {data.guidesTotal}
          </p>
        </div>
      </div>

      <h2 className="mt-10 text-xs font-semibold uppercase tracking-wider text-slate-500">
        Members by trade
      </h2>
      <div className="mt-3 overflow-x-auto rounded-xl border border-white/10">
        <table className="w-full text-left text-sm">
          <thead className="border-b border-white/10 bg-ink-900/80 text-xs text-slate-500">
            <tr>
              <th className="px-4 py-2">Trade</th>
              <th className="px-4 py-2">Count</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-white/5">
            {data.membersByTrade.map((r) => (
              <tr key={r.trade}>
                <td className="px-4 py-2 text-white">{r.trade}</td>
                <td className="px-4 py-2 text-slate-400">{r.count}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <h2 className="mt-10 text-xs font-semibold uppercase tracking-wider text-slate-500">
        Applications by status
      </h2>
      <div className="mt-3 overflow-x-auto rounded-xl border border-white/10">
        <table className="w-full text-left text-sm">
          <thead className="border-b border-white/10 bg-ink-900/80 text-xs text-slate-500">
            <tr>
              <th className="px-4 py-2">Status</th>
              <th className="px-4 py-2">Count</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-white/5">
            {data.applicationsByStatus.length === 0 ? (
              <tr>
                <td colSpan={2} className="px-4 py-3 text-slate-500">
                  No applications yet
                </td>
              </tr>
            ) : (
              data.applicationsByStatus.map((r) => (
                <tr key={r.status}>
                  <td className="px-4 py-2 text-white">{r.status}</td>
                  <td className="px-4 py-2 text-slate-400">{r.count}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
