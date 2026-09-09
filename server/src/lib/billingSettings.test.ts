import { describe, expect, it } from "vitest";
import { checkoutLineConfig } from "./billingSettings.js";

describe("checkoutLineConfig", () => {
  it("uses the requested no-VAT defaults", () => {
    expect(checkoutLineConfig({})).toMatchObject({
      registrationFeePence: 1500,
      membershipPence: 8000,
    });
  });

  it("normalizes the previous default settings", () => {
    expect(
      checkoutLineConfig({
        checkoutRegistrationFeePence: 1800,
        checkoutMembershipPence: 9000,
      })
    ).toMatchObject({
      registrationFeePence: 1500,
      membershipPence: 8000,
    });
  });

  it("preserves custom configured amounts", () => {
    expect(
      checkoutLineConfig({
        checkoutRegistrationFeePence: 2500,
        checkoutMembershipPence: 7500,
      })
    ).toMatchObject({
      registrationFeePence: 2500,
      membershipPence: 7500,
    });
  });
});
