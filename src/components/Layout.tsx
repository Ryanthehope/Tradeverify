import { useState } from "react";
import { Link, NavLink, Outlet } from "react-router-dom";
import { useSiteData } from "../context/SiteDataContext";

function Logo({
  className = "",
  title = "Trader Watchdog",
}: {
  className?: string;
  title?: string;
}) {
  return (
    <div className={`flex items-center gap-3 ${className}`}>
      <img 
        src="/logo.png" 
        alt={title}
        className="h-10 w-auto"
      />
    </div>
  );
}

export function Layout() {
  const [menuOpen, setMenuOpen] = useState(false);
  const { error, reload, brandName } = useSiteData();

  return (
    <div className="flex min-h-screen flex-col">
      {error ? (
        <div
          className="border-b border-amber-500/20 bg-amber-950/40 px-4 py-2.5 text-center text-sm text-amber-100"
          role="alert"
        >
          <span className="text-amber-200/90">{error}</span>{" "}
          <button
            type="button"
            onClick={() => reload()}
            className="font-semibold text-white underline-offset-2 hover:underline"
          >
            Retry
          </button>
        </div>
      ) : null}
      <header className="sticky top-0 z-50 border-b border-white/10 bg-ink-950/85 backdrop-blur-xl supports-[backdrop-filter]:bg-ink-950/75">
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-4 px-4 py-3.5 sm:px-6">
          <Link
            to="/"
            className="outline-none ring-brand-500 focus-visible:ring-2"
            onClick={() => setMenuOpen(false)}
          >
            <Logo title={brandName} />
          </Link>

          <nav className="hidden items-center gap-7 text-sm font-medium text-slate-400 md:flex">
            <Link
              to="/#verify"
              className="transition-colors duration-200 hover:text-white"
            >
              Verify
            </Link>
            <Link
              to="/#how"
              className="transition-colors duration-200 hover:text-white"
            >
              How it works
            </Link>
            <Link
              to="/#why"
              className="transition-colors duration-200 hover:text-white"
            >
              What we check
            </Link>
            <Link
              to="/#compare"
              className="transition-colors duration-200 hover:text-white"
            >
              Compare
            </Link>
            <Link
              to="/post-job"
              className="transition-colors duration-200 hover:text-white"
            >
              Post a job
            </Link>
            <NavLink
              to="/guides"
              className={({ isActive }) =>
                isActive
                  ? "text-white"
                  : "transition-colors duration-200 hover:text-white"
              }
            >
              Advice
            </NavLink>
          </nav>

          <div className="hidden items-center gap-3 md:flex">
            <Link
              to="/login"
              className="text-sm font-medium text-slate-500 transition-colors duration-200 hover:text-white"
            >
              Log in
            </Link>
            <Link
              to="/#verify"
              className="rounded-full bg-white/10 px-4 py-2 text-sm font-semibold text-white ring-1 ring-white/15 transition-colors duration-200 hover:bg-white/[0.14]"
            >
              Verify a trade
            </Link>
            <Link
              to="/join"
              className="rounded-full bg-brand-500 px-4 py-2 text-sm font-semibold text-white shadow-lg shadow-brand-900/35 transition-colors duration-200 hover:bg-brand-400"
            >
              Join Trader Watchdog
            </Link>
          </div>

          <button
            type="button"
            className="flex h-10 w-10 items-center justify-center rounded-lg border border-white/10 text-white md:hidden"
            aria-expanded={menuOpen}
            aria-label={menuOpen ? "Close menu" : "Open menu"}
            onClick={() => setMenuOpen((o) => !o)}
          >
            {menuOpen ? (
              <svg
                className="h-5 w-5"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
                strokeWidth={2}
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M6 18L18 6M6 6l12 12"
                />
              </svg>
            ) : (
              <svg
                className="h-5 w-5"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
                strokeWidth={2}
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M4 6h16M4 12h16M4 18h16"
                />
              </svg>
            )}
          </button>
        </div>

        {menuOpen ? (
          <div className="border-t border-white/5 bg-ink-950 px-4 py-4 md:hidden">
            <nav className="flex flex-col gap-1 text-sm font-medium text-slate-300">
              <Link
                to="/#verify"
                className="rounded-lg px-3 py-2.5 hover:bg-white/5 hover:text-white"
                onClick={() => setMenuOpen(false)}
              >
                Verify a trade
              </Link>
              <Link
                to="/#how"
                className="rounded-lg px-3 py-2.5 hover:bg-white/5 hover:text-white"
                onClick={() => setMenuOpen(false)}
              >
                How it works
              </Link>
              <Link
                to="/#why"
                className="rounded-lg px-3 py-2.5 hover:bg-white/5 hover:text-white"
                onClick={() => setMenuOpen(false)}
              >
                What we check
              </Link>
              <Link
                to="/#compare"
                className="rounded-lg px-3 py-2.5 hover:bg-white/5 hover:text-white"
                onClick={() => setMenuOpen(false)}
              >
                Compare
              </Link>
              <Link
                to="/post-job"
                className="rounded-lg px-3 py-2.5 hover:bg-white/5 hover:text-white"
                onClick={() => setMenuOpen(false)}
              >
                Post a job
              </Link>
              <Link
                to="/guides"
                className="rounded-lg px-3 py-2.5 hover:bg-white/5 hover:text-white"
                onClick={() => setMenuOpen(false)}
              >
                Guides & advice
              </Link>
              <Link
                to="/login"
                className="rounded-lg px-3 py-2.5 hover:bg-white/5 hover:text-white"
                onClick={() => setMenuOpen(false)}
              >
                Log in
              </Link>
              <Link
                to="/join"
                className="mt-2 rounded-lg bg-brand-500 px-3 py-2.5 text-center font-semibold text-white"
                onClick={() => setMenuOpen(false)}
              >
                Join Trader Watchdog
              </Link>
            </nav>
          </div>
        ) : null}
      </header>

      <main className="flex-1">
        <Outlet />
      </main>

      <footer className="mt-auto border-t border-white/10 bg-gradient-to-b from-transparent to-black/20">
        <div className="mx-auto max-w-6xl px-4 py-12 sm:px-6">
          <div className="flex flex-col gap-10 lg:flex-row lg:items-start lg:justify-between">
            <div className="max-w-sm">
              <Link to="/" className="inline-block outline-none ring-brand-500 focus-visible:ring-2">
                <Logo title={brandName} />
              </Link>
              <p className="mt-4 text-sm leading-relaxed text-slate-500">
                Independent verification for trades and homeowners — confirm
                credentials before you hire.
              </p>
            </div>
            <nav
              className="flex flex-wrap gap-x-8 gap-y-3 text-sm text-slate-400"
              aria-label="Footer"
            >
              <Link
                to="/guides"
                className="transition-colors hover:text-white"
              >
                Guides
              </Link>
              <Link
                to="/post-job"
                className="transition-colors hover:text-white"
              >
                Post a job
              </Link>
              <Link
                to="/join"
                className="transition-colors hover:text-white"
              >
                Apply
              </Link>
              <Link
                to="/privacy"
                className="transition-colors hover:text-white"
              >
                Privacy
              </Link>
              <Link
                to="/terms"
                className="transition-colors hover:text-white"
              >
                Terms
              </Link>
              <Link
                to="/contact"
                className="transition-colors hover:text-white"
              >
                Contact
              </Link>
              <Link
                to="/login"
                className="text-slate-600 transition-colors hover:text-slate-400"
              >
                Log in
              </Link>
            </nav>
          </div>
          <p className="mt-10 border-t border-white/5 pt-8 text-center text-xs text-slate-600">
            © {new Date().getFullYear()} {brandName}. All rights reserved.
          </p>
        </div>
      </footer>
    </div>
  );
}
