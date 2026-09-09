import { prisma } from "../db.js";
import { getLaunchWindow } from "./launchWindow.js";
const MIN_CHECKOUT_PENCE = 100; // £1.00 minimum checkout amount
const MAX_CHECKOUT_PENCE = 999_999_99;
const DEFAULT_ANNUAL_MEMBERSHIP_PENCE = 8_000;
const DEFAULT_REGISTRATION_FEE_PENCE = 1_500;

function removeVatSuffix(label: string) {
  return label.replace(/\s*\+\s*VAT\b/gi, "").trim();
}

function defaultAnnualMembershipPence(value: number) {
  const normalized = clampCheckoutPence(value);
  // Migrate old default DB values to the new default price
  if (normalized === 1_500 || normalized === 7_200 || normalized === 9_000) {
    return DEFAULT_ANNUAL_MEMBERSHIP_PENCE;
  }
  return normalized;
}

function defaultRegistrationFeePence(value: number) {
  const normalized = clampCheckoutPence(value);
  return normalized === 1_800 ? DEFAULT_REGISTRATION_FEE_PENCE : normalized;
}

export async function getOrgBilling() {
  return prisma.organizationSettings.upsert({
    where: { id: "default" },
    create: {
      id: "default",
      checkoutMembershipPence: DEFAULT_ANNUAL_MEMBERSHIP_PENCE,
      checkoutRegistrationFeePence: DEFAULT_REGISTRATION_FEE_PENCE,
    },
    update: {},
  });
}

export function billingReady(s: {
  billingEnabled: boolean;
}): boolean {
  return Boolean(s.billingEnabled);
}

type BillingRow = {
  checkoutMembershipName?: string | null;
  checkoutRegistrationFeeName?: string | null;
  checkoutMembershipPence?: number | null;
  checkoutRegistrationFeePence?: number | null;
};

export function clampCheckoutPence(n: number): number {
  const v = Math.floor(Number(n));
  if (Number.isNaN(v)) return MIN_CHECKOUT_PENCE;
  return Math.min(MAX_CHECKOUT_PENCE, Math.max(MIN_CHECKOUT_PENCE, v));
}

/** Names + amounts for online billing line items. */
export function checkoutLineConfig(s: BillingRow) {
  const baseMembershipPence = defaultAnnualMembershipPence(
    s.checkoutMembershipPence ?? DEFAULT_ANNUAL_MEMBERSHIP_PENCE
  );
  return {
    membershipPence: baseMembershipPence,
    registrationFeePence: defaultRegistrationFeePence(
      s.checkoutRegistrationFeePence ?? DEFAULT_REGISTRATION_FEE_PENCE
    ),
    membershipName: removeVatSuffix(
      s.checkoutMembershipName?.trim() || "Trader Watchdog annual portal fee"
    ),
    registrationFeeName: removeVatSuffix(
      s.checkoutRegistrationFeeName?.trim() ||
        "Trader Watchdog registration and admin checks"
    ),
  };
}
