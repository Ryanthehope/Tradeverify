import { useEffect, useState } from "react";
import { Link, NavLink, Outlet, useLocation } from "react-router-dom";
import { useSiteData } from "../context/SiteDataContext";
import { apiGetAuth } from "../lib/api";
import { useStaffAuth } from "./StaffAuthContext";

const menuIcon = (
  <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
    <path strokeLinecap="round" strokeLinejoin="round" d="M4 6h16M4 12h16M4 18h16" />
  </svg>
);

const closeIcon = (
  <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
    <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
  </svg>
);

function NavGroup({ label }: { label: string }) {
  return (
    <p className="mb-2 mt-6 px-3 text-[10px] font-semibold uppercase tracking-wider text-slate-600 first:mt-0">
      {label}
    </p>
  );
}

const navLink =
  "flex items-center justify-between gap-2 rounded-lg px-3 py-2 text-sm font-medium transition";

function navClass({ isActive }: { isActive: boolean }) {
  return `${navLink} ${
    isActive
      ? "bg-brand-500/20 text-brand-100"
      : "text-slate-400 hover:bg-white/5 hover:text-white"
  }`;
}

export function StaffLayout() {
  const { staff, logout } = useStaffAuth();
  const { brandName } = useSiteData();
  const location = useLocation();
  const [inboxUnread, setInboxUnread] = useState<number | null>(null);
  const [mobileNavOpen, setMobileNavOpen] = useState(false);

  useEffect(() => {
    apiGetAuth<{ inboxUnread: number }>("/api/admin/dashboard")
      .then((d) => setInboxUnread(d.inboxUnread))
      .catch(() => setInboxUnread(0));
  }, []);

  useEffect(() => {
    setMobileNavOpen(false);
  }, [location.pathname]);

  const closeNav = () => setMobileNavOpen(false);

  return (
    <div className="flex min-h-screen flex-col bg-ink-950 text-slate-200 md:flex-row">
      {/* Mobile top bar */}
      <header className="sticky top-0 z-40 flex h-14 shrink-0 items-center justify-between gap-2 border-b border-white/10 bg-ink-900/95 px-3 backdrop-blur md:hidden">
        <Link
          to="/staff"
          className="flex min-w-0 flex-1 items-center gap-2"
          onClick={closeNav}
        >
          <span className="truncate font-display text-base font-semibold text-white">
            {brandName}
            <span className="text-brand-400"> Staff</span>
          </span>
        </Link>
        <button
          type="button"
          className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg text-slate-200 hover:bg-white/10 hover:text-white"
          aria-expanded={mobileNavOpen}
          aria-label={mobileNavOpen ? "Close menu" : "Open menu"}
          onClick={() => setMobileNavOpen((o) => !o)}
        >
          {mobileNavOpen ? closeIcon : menuIcon}
        </button>
      </header>

      {mobileNavOpen ? (
        <button
          type="button"
          className="fixed inset-0 z-40 bg-black/50 md:hidden"
          aria-label="Close menu"
          onClick={closeNav}
        />
      ) : null}

      <aside
        className={`fixed inset-y-0 left-0 z-50 flex w-[min(100vw-3rem,18rem)] max-w-[85vw] flex-col border-r border-white/10 bg-ink-900/95 backdrop-blur transition-transform duration-200 ease-out md:relative md:z-auto md:h-screen md:max-w-none md:w-56 md:shrink-0 md:translate-x-0 md:border-b-0 md:shadow-none ${
          mobileNavOpen ? "translate-x-0 shadow-2xl" : "-translate-x-full md:translate-x-0"
        }`}
      >
        <div className="border-b border-white/10 px-4 py-4 md:border-0">
          <Link
            to="/staff"
            className="font-display text-lg font-semibold text-white"
            onClick={closeNav}
          >
            {brandName}
            <span className="ml-1 text-brand-400">Staff</span>
          </Link>
          <p className="mt-1 truncate text-xs text-slate-500">{staff?.email}</p>
        </div>

        <nav className="flex flex-1 flex-col overflow-y-auto px-3 py-3 pb-2 md:pb-6">
          <div className="flex flex-col gap-0.5">
            <NavLink to="/staff" end className={navClass} onClick={closeNav}>
              Dashboard
            </NavLink>
            <NavLink to="/staff/financial" className={navClass} onClick={closeNav}>
              Financial
            </NavLink>

            {/* Outreach links removed */}

            <NavGroup label="Members" />
            <NavLink to="/staff/applications" className={navClass} onClick={closeNav}>
              Applications
            </NavLink>
            <NavLink to="/staff/members" className={navClass} onClick={closeNav}>
              Members
            </NavLink>
            <NavLink to="/staff/insurance" className={navClass} onClick={closeNav}>
              Insurance
            </NavLink>

            <NavGroup label="Content" />
            <NavLink to="/staff/analytics" className={navClass} onClick={closeNav}>
              Analytics
            </NavLink>

            <NavGroup label="Admin" />
            <NavLink to="/staff/team" className={navClass} onClick={closeNav}>
              Staff
            </NavLink>
            <NavLink to="/staff/settings" className={navClass} onClick={closeNav}>
              Settings
            </NavLink>
            {/* Integrations and System links removed */}
          </div>
        </nav>

        <div className="border-t border-white/10 p-3 md:hidden">
          <Link
            to="/"
            className="flex w-full items-center rounded-lg px-3 py-2.5 text-sm font-medium text-slate-400 transition hover:bg-white/5 hover:text-white"
            onClick={closeNav}
          >
            View site
          </Link>
          <button
            type="button"
            onClick={() => {
              closeNav();
              logout();
            }}
            className="mt-1 w-full rounded-lg px-3 py-2.5 text-left text-sm font-medium text-slate-400 transition hover:bg-white/5 hover:text-white"
          >
            Sign out
          </button>
        </div>
      </aside>

      <div className="flex min-h-0 min-w-0 flex-1 flex-col md:overflow-auto">
        <header className="sticky top-0 z-10 hidden h-14 shrink-0 items-center justify-between gap-3 border-b border-white/10 bg-ink-950/90 px-4 backdrop-blur sm:px-6 md:flex">
          <div className="text-sm text-slate-500">Operations console</div>
          <div className="flex items-center gap-2">
            <Link
              to="/"
              className="rounded-lg px-3 py-2 text-sm text-slate-500 hover:text-white"
            >
              View site
            </Link>
            <button
              type="button"
              onClick={() => logout()}
              className="rounded-lg px-3 py-2 text-sm text-slate-500 hover:text-white"
            >
              Sign out
            </button>
          </div>
        </header>

        <main className="mx-auto w-full max-w-6xl flex-1 px-4 py-6 sm:px-6 sm:py-8">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
