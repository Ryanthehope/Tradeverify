import { Link, useParams } from "react-router-dom";
import { useSiteData } from "../context/SiteDataContext";

export function GuideArticle() {
  const { slug } = useParams<{ slug: string }>();
  const { guides, loading, error, reload } = useSiteData();
  const guide = guides.find((g) => g.slug === slug);

  if (loading) {
    return (
      <main className="flex min-h-[40vh] items-center justify-center px-4">
        <p className="text-slate-400">Loading…</p>
      </main>
    );
  }

  if (error) {
    return (
      <main className="mx-auto max-w-lg px-4 py-24 text-center">
        <p className="text-slate-400">{error}</p>
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

  if (!guide) {
    return (
      <main className="mx-auto max-w-lg px-4 py-24 text-center">
        <h1 className="font-display text-2xl font-semibold text-white">
          Guide not found
        </h1>
        <Link
          to="/guides"
          className="mt-6 inline-block text-brand-300 hover:text-brand-200"
        >
          ← All guides
        </Link>
      </main>
    );
  }

  return (
    <main className="border-b border-white/5 pb-24">
      <article className="mx-auto max-w-2xl px-4 pt-12 sm:px-6">
        <Link
          to="/guides"
          className="text-sm font-medium text-brand-300 hover:text-brand-200"
        >
          ← Guides and advice
        </Link>
        <p className="mt-6 text-xs font-semibold uppercase tracking-wider text-slate-500">
          {guide.readTime}
        </p>
        <h1 className="mt-2 font-display text-3xl font-bold text-white sm:text-4xl">
          {guide.title}
        </h1>
        <p className="mt-4 text-lg text-slate-400">{guide.excerpt}</p>
        <div className="mt-10 max-w-none">
          {guide.body.map((para, i) => (
            <p
              key={i}
              className="mb-4 text-base leading-relaxed text-slate-300"
            >
              {para}
            </p>
          ))}
        </div>
        <div className="mt-12 rounded-2xl border border-brand-500/20 bg-brand-950/30 p-6">
          <p className="text-sm font-medium text-white">
            Ready to verify a tradesperson?
          </p>
          <p className="mt-1 text-sm text-slate-400">
            Look up their Trader Watchdog ID before you commit.
          </p>
          <Link
            to="/#verify"
            className="mt-4 inline-flex rounded-full bg-brand-500 px-5 py-2.5 text-sm font-semibold text-white hover:bg-brand-400"
          >
            Verify a business
          </Link>
        </div>
      </article>
    </main>
  );
}
