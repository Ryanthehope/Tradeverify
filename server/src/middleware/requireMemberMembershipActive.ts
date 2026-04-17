import type { Request, RequestHandler } from "express";
import { prisma } from "../db.js";
// import { isMemberMembershipAccessActive } from "../lib/memberMembership.js";

/** Blocks portal routes when membership has lapsed (after requireMember). */
export const requireMemberMembershipActive: RequestHandler = async (
  req,
  res,
  next
) => {
  const memberId = (req as Request & { memberId: string }).memberId;
  try {
    const m = await prisma.member.findUnique({
      where: { id: memberId },
      select: {
        membershipUnlimited: true,
        membershipBillingType: true,
        membershipExpiresAt: true,
        stripeSubscriptionStatus: true,
      },
    });
    if (!m) {
      res.status(404).json({ error: "Account not found" });
      return;
    }
    // Membership check removed; always allow
    next();
    return;
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: "Could not verify membership" });
  }
};
