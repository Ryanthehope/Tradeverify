import { Link } from "react-router-dom";
import { useSiteData } from "../context/SiteDataContext";

export function GuidesIndex() {
  const { guides, loading, error, reload } = useSiteData();

  if (loading) {
    return (
      <main className="flex min-h-[40vh] items-center justify-center px-4">
        <p className="text-slate-400">Loading guides…</p>
      </main>
    );
  }

  if (error) {
    return (
      <main className="mx-auto max-w-lg px-4 py-24 text-center">
        <h1 className="font-display text-xl font-semibold text-white">
          Guides unavailable
        </h1>
        <p className="mt-3 text-slate-400">{error}</p>
        <button
          type="button"
          onClick={() => reload()}
          className="mt-8 rounded-full bg-brand-600 px-6 py-3 text-sm font-semibold text-white hover:bg-brand-500"
        >
          Retry
        </button>
      </main>
    );
  }

  return (
    <main className="border-b border-white/10 pb-24">
      <div className="relative overflow-hidden border-b border-white/10 bg-gradient-to-br from-brand-950/50 via-ink-950 to-ink-950 py-14 sm:py-20">
        <div
          className="pointer-events-none absolute inset-0 bg-grid-faint bg-grid opacity-40 [mask-image:linear-gradient(to_bottom,black,transparent)]"
          aria-hidden
        />
        <div className="relative mx-auto max-w-3xl px-4 sm:px-6">
          <Link
            to="/"
            className="text-sm font-medium text-brand-300 transition-colors hover:text-brand-200"
          >
            ← Home
          </Link>
          <h1 className="mt-6 font-display text-3xl font-bold tracking-tight text-white sm:text-4xl">
            Guides and advice
          </h1>
          <p className="mt-4 max-w-2xl text-lg leading-relaxed text-slate-400">
            Protect yourself before you hire — practical guides on quotes,
            reviews, and payments.
          </p>
        </div>
      </div>

      <div className="mx-auto max-w-3xl px-4 pt-12 sm:px-6">
        <ul className="space-y-4">
          {guides.map((g) => (
            <li key={g.slug}>
              <Link
                to={`/guides/${g.slug}`}
                className="block rounded-2xl border border-white/10 bg-ink-900/50 p-6 shadow-card-lg transition-all duration-200 hover:border-brand-500/35 hover:bg-ink-900/80"
              >
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <h2 className="font-display text-xl font-semibold text-white">
                    {g.title}
                  </h2>
                  <span className="text-xs text-slate-500">{g.readTime}</span>
                </div>
                <p className="mt-2 text-sm leading-relaxed text-slate-400">
                  {g.excerpt}
                </p>
                <span className="mt-4 inline-flex text-sm font-semibold text-brand-300">
                  Read guide →
                </span>
              </Link>
            </li>
          ))}
        </ul>
      </div>
    </main>
  );
}
