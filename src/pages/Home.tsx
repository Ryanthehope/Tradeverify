import { useEffect } from "react";
import { Link, useLocation } from "react-router-dom";
import { useSiteData } from "../context/SiteDataContext";
import { publicApiUrl } from "../lib/api";
import { MemberPreviewCard } from "../components/MemberPreviewCard";
import { VerifyForm } from "../components/VerifyForm";

function BadgeShowcase() {
  return (
    <section className="border-b border-slate-200 bg-slate-50 py-20 sm:py-24">
      <div className="mx-auto grid max-w-6xl items-center gap-12 px-4 sm:gap-16 lg:grid-cols-2 lg:items-center sm:px-6">
        <div className="lg:max-w-xl">
          <p className="text-sm font-semibold uppercase tracking-wider text-brand-600">
            The Trader Watchdog badge
          </p>
          <h2 className="mt-3 font-display text-3xl font-bold text-slate-900 sm:text-4xl">
            Spot it on vans, sites, and quotes
          </h2>
          <p className="mt-5 text-base leading-relaxed text-slate-700">
            Verified members display a unique Trader Watchdog ID that homeowners can
            search on this site. If there is no badge, or the number does not
            match a live profile, treat that as a red flag before you pay a
            deposit.
          </p>
          <ul className="mt-8 space-y-3 text-sm text-slate-700">
            <li className="flex gap-3">
              <span className="text-brand-600">✓</span>
              Ask for their Trader Watchdog ID if it is not visible.
            </li>
            <li className="flex gap-3">
              <span className="text-brand-600">✓</span>
              Confirm the ID here before large upfront payments.
            </li>
          </ul>
        </div>
        <div className="flex justify-center lg:justify-end">
          <div className="w-full max-w-[360px]">
            <div className="flex flex-col items-stretch sm:items-end">
              <img
                src={publicApiUrl("/api/badge-preview.svg")}
                width={320}
                height={88}
                alt="Trader Watchdog verified member badge: green ribbon with check, Trader Watchdog, member ID TW-2847"
                className="h-auto w-full max-w-[320px] sm:ml-auto"
              />
              <p className="mt-6 text-center text-xs leading-relaxed text-slate-600 sm:max-w-[320px] sm:text-right">
                Same green SVG badge issued to each verified member (their name,
                trade, and ID).
              </p>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

function Stats() {
  const items = [
    { value: "£3.5bn", label: "estimated lost to rogue traders yearly" },
    { value: "1.26mil", label: "fly-tipping incidents a year and rising" },
    { value: "24%", label: "of traders do not have Public Liability insurance" },
  ];
  return (
    <section className="border-b border-slate-200 bg-white py-16">
      <div className="mx-auto grid max-w-6xl gap-8 px-4 sm:grid-cols-3 sm:px-6">
        {items.map((item) => (
          <div
            key={item.label}
            className="rounded-lg border border-slate-300/60 bg-slate-50 p-8 text-center transition-all duration-200 hover:border-brand-500/50 hover:shadow-sm"
          >
            <p className="font-display text-4xl font-bold text-brand-600 sm:text-5xl">
              {item.value}
            </p>
            <p className="mt-3 text-sm leading-snug text-slate-700">
              {item.label}
            </p>
          </div>
        ))}
      </div>
    </section>
  );
}

function IconCheck({ className = "text-emerald-400" }: { className?: string }) {
  return (
    <svg
      className={`h-5 w-5 ${className}`}
      fill="none"
      viewBox="0 0 24 24"
      stroke="currentColor"
      strokeWidth={2.5}
      aria-hidden
    >
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M5 13l4 4L19 7"
      />
    </svg>
  );
}

function IconCross({ className = "text-slate-500" }: { className?: string }) {
  return (
    <svg
      className={`h-5 w-5 ${className}`}
      fill="none"
      viewBox="0 0 24 24"
      stroke="currentColor"
      strokeWidth={2}
      aria-hidden
    >
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M6 18L18 6M6 6l12 12"
      />
    </svg>
  );
}

type CompareCell = "yes" | "no" | "partial";

function CompareCell({ value }: { value: CompareCell }) {
  if (value === "yes") {
    return (
      <span className="inline-flex justify-center" title="Yes">
        <span className="flex h-9 w-9 items-center justify-center rounded-full bg-emerald-500/15">
          <IconCheck />
        </span>
      </span>
    );
  }
  if (value === "partial") {
    return (
      <span
        className="text-xs font-medium text-amber-200/90"
        title="Partial or varies by plan"
      >
        Varies
      </span>
    );
  }
  return (
    <span className="inline-flex justify-center" title="No">
      <span className="flex h-9 w-9 items-center justify-center rounded-full bg-white/5">
        <IconCross className="text-slate-500" />
      </span>
    </span>
  );
}

function FeatureHighlights() {
  const cards = [
    {
      title: "Free for homeowners",
      body: "Look up a Trader Watchdog ID or search the public directory before you hire. No fee to check whether a business is listed and what we hold on file.",
    },
    {
      title: "Straightforward for trades",
      body: "Membership covers verification and your live public profile — we focus on proof, not selling you leads job-by-job.",
    },
    {
      title: "Proof in one link",
      body: "Structured vetting summary, badge artwork, and profile details — so customers see independent checks in one place, not scattered claims.",
    },
  ];
  return (
    <section
      id="highlights"
      className="scroll-mt-24 border-b border-slate-200/10 bg-slate-900/30 py-20 sm:py-24"
    >
      <div className="mx-auto max-w-6xl px-4 sm:px-6">
        <p className="text-center text-sm font-semibold uppercase tracking-wider text-brand-400">
          Why Choose Trader Watchdog
        </p>
        <h2 className="mt-3 text-center font-display text-3xl font-bold text-white sm:text-4xl">
          Verification, not lead generation
        </h2>
        <div className="mt-14 grid gap-8 md:grid-cols-3">
          {cards.map((c) => (
            <div
              key={c.title}
              className="rounded-lg border border-slate-700/50 bg-slate-800/30 p-8 transition-all duration-200 hover:border-brand-500/50 hover:bg-slate-800/50"
            >
              <div className="flex h-12 w-12 items-center justify-center rounded-lg bg-brand-500/10 text-brand-400">
                <IconCheck className="h-6 w-6" />
              </div>
              <h3 className="mt-5 font-display text-xl font-semibold text-white">
                {c.title}
              </h3>
              <p className="mt-3 text-sm leading-relaxed text-slate-300">
                {c.body}
              </p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

function CompetitorComparison() {
  const rows: {
    feature: string;
    detail?: string;
    tv: CompareCell;
    other: CompareCell;
    other2: CompareCell;
  }[] = [
    {
      feature: "Free public lookup of a business",
      tv: "yes",
      other: "yes",
      other2: "yes",
    },
    {
      feature: "Independent verification checklist on profile",
      detail: "Address, insurance, accreditations, digital footprint — structured on one page.",
      tv: "yes",
      other: "partial",
      other2: "partial",
    },
    {
      feature: "Unique ID & official badge artwork",
      detail: "Homeowners can confirm the ID matches a live listing.",
      tv: "yes",
      other: "partial",
      other2: "partial",
    },
    {
      feature: "Verification-first listings",
      detail: "Public profile is built around what we checked — not just ads.",
      tv: "yes",
      other: "partial",
      other2: "partial",
    },
    {
      feature: "Built-in job posting & quote marketplace",
      tv: "no",
      other: "yes",
      other2: "yes",
    },
    {
      feature: "In-app messaging between homeowner & trade",
      tv: "no",
      other: "partial",
      other2: "yes",
    },
  ];

  return (
    <section
      id="compare"
      className="scroll-mt-24 border-b border-slate-200 bg-white py-16 sm:py-20"
    >
      <div className="mx-auto max-w-6xl px-4 sm:px-6">
        <p className="text-center text-sm font-semibold uppercase tracking-wider text-brand-600">
          Comparison
        </p>
        <h2 className="mt-2 text-center font-display text-2xl font-semibold text-slate-900 sm:text-3xl">
          How we&apos;re different from lead directories
        </h2>
        <p className="mx-auto mt-3 max-w-2xl text-center text-sm text-slate-700">
          Trader Watchdog is a verification service with public profiles. Lead
          marketplaces focus on connecting jobs — we focus on what&apos;s true
          before you connect. Competitor columns are a general guide; features
          vary by plan and change over time.
        </p>

        <div className="mt-10 overflow-x-auto rounded-2xl border border-slate-300/60 bg-slate-50">
          <table className="w-full min-w-[640px] border-collapse text-left text-sm">
            <thead>
              <tr className="border-b border-slate-300/60 bg-white">
                <th
                  scope="col"
                  className="px-4 py-4 font-medium text-slate-700 sm:px-6"
                >
                  Feature
                </th>
                <th
                  scope="col"
                  className="px-4 py-4 text-center font-display font-semibold text-brand-600 sm:px-6"
                >
                  Trader Watchdog
                </th>
                <th
                  scope="col"
                  className="px-4 py-4 text-center font-medium text-slate-700 sm:px-6"
                >
                  Typical directory
                  <span className="mt-1 block text-[10px] font-normal normal-case text-slate-600">
                    e.g. Checkatrade
                  </span>
                </th>
                <th
                  scope="col"
                  className="px-4 py-4 text-center font-medium text-slate-700 sm:px-6"
                >
                  Typical directory
                  <span className="mt-1 block text-[10px] font-normal normal-case text-slate-600">
                    e.g. MyBuilder
                  </span>
                </th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row, i) => (
                <tr
                  key={row.feature}
                  className={
                    i % 2 === 0 ? "bg-white" : "bg-slate-50"
                  }
                >
                  <th
                    scope="row"
                    className="max-w-[220px] px-4 py-4 align-top font-medium text-slate-900 sm:px-6"
                  >
                    {row.feature}
                    {row.detail ? (
                      <span className="mt-1 block text-xs font-normal text-slate-600">
                        {row.detail}
                      </span>
                    ) : null}
                  </th>
                  <td className="px-4 py-4 text-center sm:px-6">
                    <CompareCell value={row.tv} />
                  </td>
                  <td className="px-4 py-4 text-center sm:px-6">
                    <CompareCell value={row.other} />
                  </td>
                  <td className="px-4 py-4 text-center sm:px-6">
                    <CompareCell value={row.other2} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </section>
  );
}

function MembersCarousel() {
  const { members, loading } = useSiteData();

  return (
    <section className="border-b border-slate-200 bg-slate-50 py-20 sm:py-24">
      <div className="mx-auto max-w-6xl px-4 sm:px-6">
        <h2 className="text-center font-display text-3xl font-bold text-slate-900 sm:text-4xl">
          Verified members
        </h2>
        <p className="mx-auto mt-4 max-w-xl text-center text-base text-slate-700">
          Public profiles in the Trader Watchdog directory. Each card links to a
          full verification summary you can share with customers.
        </p>
        <div className="mt-12 flex gap-6 overflow-x-auto pb-4 snap-x snap-mandatory sm:justify-center sm:overflow-visible sm:pb-0">
          {loading
            ? [0, 1, 2].map((k) => (
                <div
                  key={k}
                  className="h-[280px] w-[min(100%,320px)] shrink-0 snap-center animate-pulse rounded-lg bg-slate-200"
                  aria-hidden
                />
              ))
            : members.map((m) => (
                <MemberPreviewCard key={m.slug} member={m} />
              ))}
        </div>
      </div>
    </section>
  );
}

function HowItWorks() {
  const steps = [
    {
      n: "1",
      title: "Spot the badge",
      body: "See the Trader Watchdog badge on a van, website, or marketing material.",
    },
    {
      n: "2",
      title: "Search the company",
      body: "Type the business Trader Watchdog ID into our verification tool.",
    },
    {
      n: "3",
      title: "Checked or not",
      body: "Instantly see whether they have been independently checked.",
    },
  ];
  return (
    <section
      id="how"
      className="scroll-mt-24 border-y border-slate-200/10 bg-slate-900/30 py-20 sm:py-28"
    >
      <div className="mx-auto max-w-6xl px-4 sm:px-6">
        <p className="text-center text-sm font-semibold uppercase tracking-wider text-brand-400">
          How it works
        </p>
        <h2 className="mt-3 text-center font-display text-3xl font-bold text-white sm:text-4xl">
          Check in seconds
        </h2>
        <div className="mt-14 grid gap-8 md:grid-cols-3">
          {steps.map((s) => (
            <div
              key={s.n}
              className="relative rounded-lg border border-slate-700/50 bg-slate-800/30 p-8 pt-12 transition-all duration-200 hover:border-brand-500/50 hover:bg-slate-800/50"
            >
              <span className="absolute left-8 top-0 flex h-12 w-12 -translate-y-1/2 items-center justify-center rounded-lg bg-brand-500 font-display text-xl font-bold text-white">
                {s.n}
              </span>
              <h3 className="font-display text-lg font-semibold text-white">
                {s.title}
              </h3>
              <p className="mt-3 text-sm leading-relaxed text-slate-300">
                {s.body}
              </p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

function Pillars() {
  const pillars = [
    {
      title: "Who They Are and Where They're From",
      body: "We check and validate the trader's name, address and details held at Companies House if the trader is a Limited Company. Confirmed as a genuine operating address — not a virtual office or PO box.",
    },
    {
      title: "Insurance",
      body: "Public Liability Insurance protects you, your property and your contents from any damage caused by a trader. Employers Insurance is a legal requirement for any business with employees. Up to 50% of employers have no insurance at all and 24% of traders don't have Public Liability Insurance. We validate any insurance held by the trader and record the expiry date.",
    },
    {
      title: "Your Waste — It's Your Responsibility",
      body: "As a householder you are legally responsible for all waste removed from your home until it is disposed at an approved waste disposal site or collected by a registered waste carrier. If your waste is traced to an illegal site or fly-tipped, enforcement action can be taken against you. We check and validate that a trader holds the required permits or licenses and record the expiry date. You can download our report, without charge, as proof of your diligence.",
    },
    {
      title: "Other Credentials",
      body: "We require evidence of any claimed qualifications or trade association membership. Gas Safe, NICEIC, FENSA and other certifications are checked against official registers where claimed.",
    },
  ];
  return (
    <section id="why" className="scroll-mt-24 border-b border-slate-200 bg-white py-20 sm:py-28">
      <div className="mx-auto max-w-6xl px-4 sm:px-6">
        <p className="text-center text-sm font-semibold uppercase tracking-wider text-brand-600">
          What We Verify For You
        </p>
        <h2 className="mt-3 max-w-3xl text-center font-display text-3xl font-bold leading-tight text-slate-900 sm:mx-auto sm:text-4xl">
          With just one click
        </h2>
        <p className="mx-auto mt-6 max-w-2xl text-center text-base text-slate-700">
          We check if they are who they say they are, they are based where they say they're based, they are insured to carry out the work and they comply with legal environmental policies for traders.
        </p>
        <div className="mt-14 grid gap-8 sm:grid-cols-2">
          {pillars.map((p) => (
            <div
              key={p.title}
              className="flex gap-5 rounded-lg border border-slate-300/60 bg-slate-50 p-8 transition-all duration-200 hover:border-brand-500/50 hover:shadow-sm"
            >
              <span
                className="mt-1 flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-brand-100 text-brand-600"
                aria-hidden
              >
                <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                </svg>
              </span>
              <div>
                <h3 className="font-display text-lg font-semibold text-slate-900">
                  {p.title}
                </h3>
                <p className="mt-3 text-sm leading-relaxed text-slate-700">
                  {p.body}
                </p>
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

const faqItems = [
  {
    q: "What is Trader Watchdog?",
    a: "Trader Watchdog is an independent verification service for trades businesses. We check what they claim — address, insurance, registrations, and public footprint — so homeowners have a single place to confirm a business before they hire.",
  },
  {
    q: "What if someone fakes a badge or ID?",
    a: "Always search the Trader Watchdog ID on this site. A forged number will not return a matching verified profile. If in doubt, contact us with the details they gave you.",
  },
  {
    q: "How often are member checks updated?",
    a: "Members agree to notify us of material changes. We also run scheduled renewals according to your published policy — for example annual proof of insurance — so profiles stay meaningful over time.",
  },
];

function Faq() {
  return (
    <section id="faq" className="border-y border-slate-200 bg-slate-50 py-20 sm:py-24">
      <div className="mx-auto max-w-3xl px-4 sm:px-6">
        <h2 className="text-center font-display text-3xl font-bold tracking-tight text-slate-900 sm:text-4xl">
          Common questions
        </h2>
        <dl className="mt-12 space-y-6">
          {faqItems.map((item) => (
            <div
              key={item.q}
              className="rounded-lg border border-slate-300/60 bg-white px-6 py-6 transition-all duration-200 hover:border-brand-500/50 hover:shadow-sm"
            >
              <dt className="font-semibold text-slate-900">{item.q}</dt>
              <dd className="mt-3 text-sm leading-relaxed text-slate-700">
                {item.a}
              </dd>
            </div>
          ))}
        </dl>
      </div>
    </section>
  );
}

function GuidesTeaser() {
  const { guides } = useSiteData();
  const top = guides.slice(0, 3);

  if (top.length === 0) return null;

  return (
    <section id="guides" className="border-y border-slate-200/10 bg-slate-900/20 py-20 sm:py-24">
      <div className="mx-auto max-w-6xl px-4 sm:px-6">
        <div className="flex flex-col items-start justify-between gap-6 md:flex-row md:items-end">
          <div>
            <h2 className="font-display text-3xl font-bold text-white sm:text-4xl">
              Guides and advice
            </h2>
            <p className="mt-4 max-w-xl text-base text-slate-300">
              Protect yourself before you hire — clear guidance on quotes,
              reviews, and how to pay safely.
            </p>
          </div>
          <Link
            to="/guides"
            className="shrink-0 rounded-lg border border-slate-700/50 bg-slate-800/30 px-6 py-3 text-sm font-semibold text-white transition-all duration-200 hover:border-brand-500/50 hover:bg-slate-800/50"
          >
            View all guides
          </Link>
        </div>
        <ul className="mt-12 grid gap-6 sm:grid-cols-3">
          {top.map((g) => (
            <li key={g.slug}>
              <Link
                to={`/guides/${g.slug}`}
                className="block h-full rounded-lg border border-slate-700/50 bg-slate-800/30 p-6 transition-all duration-200 hover:border-brand-500/50 hover:bg-slate-800/50"
              >
                <p className="text-xs font-medium text-brand-400">{g.readTime}</p>
                <p className="mt-3 font-display text-lg font-semibold text-white">
                  {g.title}
                </p>
                <p className="mt-2 line-clamp-2 text-sm text-slate-300">
                  {g.excerpt}
                </p>
              </Link>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}

function TradesCta() {
  return (
    <section id="join" className="border-t border-slate-200 bg-white py-20 sm:py-28">
      <div className="mx-auto max-w-6xl px-4 sm:px-6">
        <div className="overflow-hidden rounded-xl border border-slate-300/60 bg-white p-10 sm:p-14">
          <div className="text-center">
            <p className="text-sm font-semibold uppercase tracking-wider text-brand-600">
              Traders & Businesses
            </p>
            <h2 className="mt-3 font-display text-3xl font-bold text-slate-900 sm:text-4xl">
              PROVE IT! Register Now
            </h2>
            <p className="mx-auto mt-5 max-w-2xl text-base text-slate-700">
              Are you who you say you are? Are you based where you say you're based? Do you have current Public Liability Insurance to protect your customers? Do you hold a current Environmental Waste permit or licence?
            </p>
            <p className="mx-auto mt-4 max-w-2xl text-base font-medium text-slate-900">
              Independent verification improves customers' confidence and increases conversions.
            </p>

            <div className="mx-auto mt-12 max-w-2xl rounded-lg border border-slate-300/60 bg-slate-50/50 p-8 text-left">
              <h3 className="mb-6 text-center font-display text-xl font-semibold text-slate-900">
                Registration Requirements
              </h3>
              <ul className="space-y-4 text-sm text-slate-700">
                <li className="flex gap-3">
                  <span className="mt-0.5 text-brand-600">
                    <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                    </svg>
                  </span>
                  <span>Your name and trading address</span>
                </li>
                <li className="flex gap-3">
                  <span className="mt-0.5 text-brand-600">
                    <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                    </svg>
                  </span>
                  <span>Photo ID and proof of address (current driving licence front or passport plus a utility bill showing your name and address in the last 3 months)</span>
                </li>
                <li className="flex gap-3">
                  <span className="mt-0.5 text-brand-600">
                    <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                    </svg>
                  </span>
                  <span>A copy of your current Public Liability Insurance policy and Employers Insurance (if applicable)</span>
                </li>
                <li className="flex gap-3">
                  <span className="mt-0.5 text-brand-600">
                    <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                    </svg>
                  </span>
                  <span>Proof that you hold a current Waste Permit or a current Waste Carrier Licence</span>
                </li>
                <li className="flex gap-3">
                  <span className="mt-0.5 text-brand-600">
                    <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                    </svg>
                  </span>
                  <span>Proof of your claimed qualifications or trade association membership</span>
                </li>
              </ul>
            </div>

            <Link
              to="/join"
              className="mt-10 inline-flex shrink-0 items-center justify-center rounded-lg bg-brand-600 px-10 py-4 font-semibold text-white transition-all duration-200 hover:bg-brand-700"
            >
              Register now
            </Link>
          </div>
        </div>
      </div>
    </section>
  );
}

function useHashScroll() {
  const { pathname, hash } = useLocation();
  useEffect(() => {
    if (pathname !== "/" || !hash) return;
    const id = hash.replace(/^#/, "");
    if (!id) return;
    requestAnimationFrame(() => {
      document.getElementById(id)?.scrollIntoView({
        behavior: "smooth",
        block: "start",
      });
    });
  }, [pathname, hash]);
}

export function Home() {
  useHashScroll();
  const { members } = useSiteData();
  const exampleMember = members[0];

  return (
    <>
      <section className="relative overflow-hidden border-b border-slate-200/10 bg-gradient-to-b from-slate-900 to-slate-950">
        <div className="relative mx-auto max-w-6xl px-4 pb-24 pt-16 sm:px-6 sm:pb-32 sm:pt-24 lg:pt-32">
          <p className="mb-6 inline-flex items-center gap-2 rounded-full border border-brand-400/30 bg-brand-500/5 px-4 py-2 text-xs font-semibold uppercase tracking-wider text-brand-300">
            Recommended by Police, Insurers & Environment Agencies
          </p>
          <h1 className="font-display text-5xl font-bold leading-[1.1] tracking-tight text-white sm:text-6xl lg:text-[4rem] lg:leading-[1.08]">
            Don&apos;t take their word for it.
          </h1>
          <p className="mt-8 max-w-2xl text-lg leading-relaxed text-slate-300 sm:text-xl sm:leading-relaxed">
            Police, insurers, environment agencies and social protection groups recommend you verify any trader before you part with your money. Trader Watchdog is a free service protecting households against rogue traders.
          </p>
          <VerifyForm id="hero-verify" layout="hero" />
          {exampleMember ? (
            <p className="mt-3 max-w-xl text-sm text-slate-500">
              Search by ID{" "}
              <span className="font-mono text-slate-400">
                {exampleMember.tvId}
              </span>{" "}
              or by business name.
            </p>
          ) : null}
          <div className="mt-12 flex flex-wrap gap-4">
            <Link
              to="/#verify"
              className="inline-flex items-center justify-center rounded-lg border border-slate-700/50 bg-slate-800/40 px-8 py-4 text-base font-semibold text-white transition-all duration-200 hover:border-brand-500/50 hover:bg-slate-800/60"
            >
              Verify a trader now
            </Link>
            <Link
              to="/join"
              className="inline-flex items-center justify-center rounded-lg bg-brand-600 px-8 py-4 text-base font-semibold text-white transition-all duration-200 hover:bg-brand-500"
            >
              Get verified as a tradesperson
            </Link>
          </div>
        </div>
      </section>

      <BadgeShowcase />
      <Stats />
      <FeatureHighlights />

      <section
        id="verify"
        className="scroll-mt-24 border-b border-slate-200 bg-slate-50 py-20 sm:py-24"
      >
        <div className="mx-auto max-w-6xl px-4 sm:px-6">
          <div className="mx-auto max-w-2xl text-center">
            <h2 className="font-display text-3xl font-bold text-slate-900 sm:text-4xl">
              Don't take their word for it. Verify a trader now.
            </h2>
            <p className="mt-4 text-base text-slate-700">
              It's FREE, you do NOT have to register, and it's only one click away. Enter the full trading name of the trader and their postcode.
            </p>
          </div>
          <VerifyForm id="section-verify" layout="section" />
          <div className="mx-auto mt-8 max-w-3xl space-y-4 text-center">
            <div className="rounded-lg border border-emerald-600/30 bg-emerald-50 px-6 py-4">
              <p className="text-sm text-slate-700">
                <span className="inline-flex items-center gap-2 font-semibold text-emerald-700">
                  <span className="flex h-6 w-6 items-center justify-center rounded-full bg-emerald-500/20">✓</span>
                  GREEN flag
                </span>
                {' '}
                = verified. You can download their report without charge to prove your diligence, particularly important for Environmental Waste Regulations.
              </p>
            </div>
            <div className="rounded-lg border border-red-600/30 bg-red-50 px-6 py-4">
              <p className="text-sm text-slate-700">
                <span className="inline-flex items-center gap-2 font-semibold text-red-700">
                  <span className="flex h-6 w-6 items-center justify-center rounded-full bg-red-500/20">✕</span>
                  RED flag
                </span>
                {' '}
                = not verified. Do not part with any money or agree to any work unless the trader proves they comply with the essential requirements of operating a legal business.
              </p>
            </div>
          </div>
        </div>
      </section>

      <CompetitorComparison />
      <MembersCarousel />
      <HowItWorks />
      <Pillars />
      <Faq />
      <GuidesTeaser />
      <TradesCta />
    </>
  );
}
