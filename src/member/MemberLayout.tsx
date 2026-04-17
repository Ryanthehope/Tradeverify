import { useEffect, useState } from "react";
import { Link, NavLink, Outlet, useLocation, useNavigate } from "react-router-dom";
import { useSiteData } from "../context/SiteDataContext";
import { useMemberAuth } from "./MemberAuthContext";

const nav =
  "flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition";

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

export function MemberLayout() {
  const { member, logout } = useMemberAuth();
  const { brandName } = useSiteData();
  const location = useLocation();
  const navigate = useNavigate();
  const [mobileNavOpen, setMobileNavOpen] = useState(false);

  useEffect(() => {
    setMobileNavOpen(false);
  }, [location.pathname]);

  useEffect(() => {
    if (
      member?.mustChangePassword &&
      location.pathname !== "/member/password"
    ) {
      navigate("/member/password", { replace: true });
    }
  }, [member?.mustChangePassword, location.pathname, navigate]);

  const membershipLocked =
    Boolean(member) &&
    !member!.membershipLegacyUnlimited &&
    !member!.membershipAccessActive;

  useEffect(() => {
    if (
      !member?.mustChangePassword &&
      membershipLocked &&
      location.pathname !== "/member/membership" &&
      location.pathname !== "/member/billing" &&
      location.pathname !== "/member/password" &&
      location.pathname !== "/member"
    ) {
      navigate("/member/membership", { replace: true });
    }
  }, [
    member?.mustChangePassword,
    membershipLocked,
    location.pathname,
    navigate,
  ]);

  const lockPortal = Boolean(member?.mustChangePassword);

  if (location.pathname.includes("/print")) {
    return (
      <div className="min-h-screen bg-white text-slate-900">
        <Outlet />
      </div>
    );
  }

  return (
    <div className="flex min-h-screen flex-col bg-white md:flex-row">
      {/* Mobile top bar */}
      <header className="sticky top-0 z-40 flex h-14 shrink-0 items-center justify-between border-b border-slate-200 bg-white px-3 shadow-sm md:hidden">
        <Link
          to="/member"
          className="flex min-w-0 items-center gap-2"
          onClick={() => setMobileNavOpen(false)}
        >
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-brand-500 text-white">
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
                d="M5 13l4 4L19 7"
              />
            </svg>
          </span>
          <span className="truncate font-display text-base font-semibold text-slate-900">
            {brandName}
          </span>
        </Link>
        <button
          type="button"
          className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg text-slate-600 hover:bg-slate-100 hover:text-slate-900"
          aria-expanded={mobileNavOpen}
          aria-label={mobileNavOpen ? "Close menu" : "Open menu"}
          onClick={() => setMobileNavOpen((o) => !o)}
        >
          {mobileNavOpen ? closeIcon : menuIcon}
        </button>
      </header>

      {/* Mobile overlay */}
      {mobileNavOpen ? (
        <button
          type="button"
          className="fixed inset-0 z-40 bg-black/50 md:hidden"
          aria-label="Close menu"
          onClick={() => setMobileNavOpen(false)}
        />
      ) : null}

      <aside
        className={`fixed inset-y-0 left-0 z-50 flex w-[min(100vw-3rem,18rem)] max-w-[85vw] flex-col border-r border-slate-200 bg-white text-slate-900 transition-transform duration-200 ease-out md:relative md:z-auto md:max-w-none md:w-64 md:translate-x-0 ${
          mobileNavOpen ? "translate-x-0 shadow-2xl" : "-translate-x-full md:translate-x-0"
        }`}
      >
        <div className="border-b border-slate-200 px-4 py-5 md:block">
          <Link
            to="/member"
            className="hidden items-center gap-2 md:flex"
            onClick={() => setMobileNavOpen(false)}
          >
            <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-brand-500 text-white">
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
                  d="M5 13l4 4L19 7"
                />
              </svg>
            </span>
            <span className="font-display text-lg font-semibold text-slate-900">
              {brandName}
            </span>
          </Link>
          <p className="mt-4 text-xs font-medium uppercase tracking-wide text-slate-500 md:hidden">
            Menu
          </p>
        </div>
        <nav className="flex flex-1 flex-col gap-0.5 overflow-y-auto p-3 pb-2">
          {lockPortal ? (
            <p className="rounded-lg bg-amber-50 px-3 py-2.5 text-xs leading-relaxed text-amber-800 ring-1 ring-amber-200">
              Set a new password below to unlock the rest of your portal.
            </p>
          ) : membershipLocked ? (
            <>
              <p className="rounded-lg bg-amber-50 px-3 py-2.5 text-xs leading-relaxed text-amber-800 ring-1 ring-amber-200">
                Your membership is not active. Open{" "}
                <span className="font-semibold text-amber-900">Membership</span>{" "}
                below to renew or start card billing.
              </p>
              <NavLink
                to="/member"
                end
                onClick={() => setMobileNavOpen(false)}
                className={({ isActive }) =>
                  `${nav} ${isActive ? "bg-slate-100 text-slate-900" : "text-slate-700 hover:bg-slate-50 hover:text-slate-900"}`
                }
              >
                Overview
              </NavLink>
            </>
          ) : (
            <>
              <NavLink
                to="/member"
                end
                onClick={() => setMobileNavOpen(false)}
                className={({ isActive }) =>
                  `${nav} ${isActive ? "bg-slate-100 text-slate-900" : "text-slate-700 hover:bg-slate-50 hover:text-slate-900"}`
                }
              >
                Overview
              </NavLink>
              <NavLink
                to="/member/business"
                onClick={() => setMobileNavOpen(false)}
                className={({ isActive }) =>
                  `${nav} ${isActive ? "bg-slate-100 text-slate-900" : "text-slate-700 hover:bg-slate-50 hover:text-slate-900"}`
                }
              >
                Business details
              </NavLink>
              <NavLink
                to="/member/documents"
                onClick={() => setMobileNavOpen(false)}
                className={({ isActive }) =>
                  `${nav} ${isActive ? "bg-slate-100 text-slate-900" : "text-slate-700 hover:bg-slate-50 hover:text-slate-900"}`
                }
              >
                Documents
              </NavLink>
              <NavLink
                to="/member/insurance"
                onClick={() => setMobileNavOpen(false)}
                className={({ isActive }) =>
                  `${nav} ${isActive ? "bg-slate-100 text-slate-900" : "text-slate-700 hover:bg-slate-50 hover:text-slate-900"}`
                }
              >
                Insurance
              </NavLink>
              <NavLink
                to="/member/badge"
                onClick={() => setMobileNavOpen(false)}
                className={({ isActive }) =>
                   `${nav} ${isActive ? "bg-slate-100 text-slate-900" : "text-slate-700 hover:bg-slate-50 hover:text-slate-900"}`
                }
              >
                Badge
              </NavLink>
            </>
          )}
        </nav>
        <div className="border-t border-slate-200 p-3">
          <div className="rounded-lg bg-slate-50 px-3 py-2 ring-1 ring-slate-200">
            <p className="truncate text-sm font-medium text-slate-900">
              {member?.name}
            </p>
            <p className="font-mono text-xs text-brand-600">{member?.tvId}</p>
          </div>
          {!lockPortal ? (
            <>
              <NavLink
                to="/member/membership"
                onClick={() => setMobileNavOpen(false)}
                className={({ isActive }) =>
                  `${nav} mt-2 ${isActive ? "bg-slate-100 text-slate-900" : "text-slate-700 hover:bg-slate-50 hover:text-slate-900"}`
                }
              >
                Membership
              </NavLink>
            </>
          ) : null}
          <NavLink
            to="/member/password"
            onClick={() => setMobileNavOpen(false)}
            className={({ isActive }) =>
              `${nav} ${lockPortal ? "mt-2 " : ""}${isActive ? "bg-slate-100 text-slate-900" : "text-slate-700 hover:bg-slate-50 hover:text-slate-900"}`
            }
          >
            {lockPortal ? "Set new password" : "Change password"}
          </NavLink>
          <Link
            to="/"
            onClick={() => setMobileNavOpen(false)}
            className={`${nav} mt-1 text-slate-600 hover:bg-slate-50 hover:text-slate-900`}
          >
            ← Back to main site
          </Link>
          <button
            type="button"
            onClick={() => {
              setMobileNavOpen(false);
              logout();
            }}
            className={`${nav} w-full text-left text-slate-600 hover:bg-slate-50 hover:text-slate-900`}
          >
            Sign out
          </button>
        </div>
      </aside>

      <div className="min-h-0 min-w-0 flex-1 bg-white text-slate-900 antialiased md:overflow-auto">
        <Outlet />
      </div>
    </div>
  );
}
