import { describe, expect, it, vi } from "vitest";
import { resolveCheckoutDiscountCode } from "./checkoutDiscount";

describe("resolveCheckoutDiscountCode", () => {
  it("skips validation when no code was entered", async () => {
    const validateDiscountCode = vi.fn();

    const result = await resolveCheckoutDiscountCode({
      normalizedDiscountCode: "",
      discountApplied: false,
      appliedDiscountCode: null,
      validateDiscountCode,
    });

    expect(result).toEqual({ invalid: false });
    expect(validateDiscountCode).not.toHaveBeenCalled();
  });

  it("reuses an already applied code without revalidating", async () => {
    const validateDiscountCode = vi.fn();

    const result = await resolveCheckoutDiscountCode({
      normalizedDiscountCode: "SAVE25",
      discountApplied: true,
      appliedDiscountCode: "SAVE25",
      validateDiscountCode,
    });

    expect(result).toEqual({
      checkoutDiscountCode: "SAVE25",
      invalid: false,
    });
    expect(validateDiscountCode).not.toHaveBeenCalled();
  });

  it("validates a typed code once when checkout starts", async () => {
    const validateDiscountCode = vi.fn().mockResolvedValue({
      code: "SAVE25",
      quote: {
        registrationFinalPricePence: 1500,
        membershipFinalPricePence: 8000,
      },
    });

    const result = await resolveCheckoutDiscountCode({
      normalizedDiscountCode: "SAVE25",
      discountApplied: false,
      appliedDiscountCode: null,
      validateDiscountCode,
    });

    expect(validateDiscountCode).toHaveBeenCalledTimes(1);
    expect(validateDiscountCode).toHaveBeenCalledWith("SAVE25");
    expect(result).toEqual({
      checkoutDiscountCode: "SAVE25",
      validatedDiscount: {
        code: "SAVE25",
        quote: {
          registrationFinalPricePence: 1500,
          membershipFinalPricePence: 8000,
        },
      },
      invalid: false,
    });
  });

  it("reports an invalid code when validation fails", async () => {
    const validateDiscountCode = vi.fn().mockResolvedValue(null);

    const result = await resolveCheckoutDiscountCode({
      normalizedDiscountCode: "BADCODE",
      discountApplied: false,
      appliedDiscountCode: null,
      validateDiscountCode,
    });

    expect(result).toEqual({ invalid: true });
  });
});
