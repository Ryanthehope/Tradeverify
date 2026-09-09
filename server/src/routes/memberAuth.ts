import { Router } from "express";
import bcrypt from "bcryptjs";
import crypto from "crypto";
import jwt from "jsonwebtoken";
import rateLimit from "express-rate-limit";
import { prisma } from "../db.js";
import { publicSiteBase, sendPasswordResetEmail } from "../lib/adminMail.js";
import { getJwtSecret } from "../lib/jwtSecret.js";

const router = Router();

function normalizeEmail(value: unknown): string {
  return String(value ?? "")
    .trim()
    .toLowerCase();
}

function normalizePassword(value: unknown): string {
  return String(value ?? "")
    .replace(/[\r\n]+/g, "")
    .trim();
}

function jwtSecret(): string {
  return getJwtSecret();
}

const memberAuthLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 20,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "Too many attempts, please try again later" },
});

router.post("/login", memberAuthLimiter, async (req, res) => {
  try {
    const email = normalizeEmail(req.body?.email);
    const password = normalizePassword(req.body?.password);
    if (!email || !password) {
      res.status(400).json({ error: "Email and password are required" });
      return;
    }
    const member = await prisma.member.findFirst({
      where: { loginEmail: email },
    });
    if (!member?.passwordHash) {
      res.status(401).json({
        error:
          "Invalid email or password. Ask Trader Watchdog if your portal access is set up.",
      });
      return;
    }
    const ok = await bcrypt.compare(password, member.passwordHash);
    if (!ok) {
      res.status(401).json({ error: "Invalid email or password" });
      return;
    }
    await prisma.application.updateMany({
      where: { createdMemberId: member.id },
      data: {
        pendingPortalPassword: null,
        pendingPortalPasswordExpires: null,
      },
    });
    const token = jwt.sign(
      { sub: member.id, role: "member", email: member.loginEmail },
      getJwtSecret(),
      { expiresIn: "14d" }
    );
    res.json({
      token,
      mustChangePassword: member.mustChangePassword,
      member: {
        id: member.id,
        name: member.name,
        tvId: member.tvId,
        slug: member.slug,
      },
    });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: "Login failed" });
  }
});

router.post("/forgot-password", memberAuthLimiter, async (req, res) => {
  try {
    const email = normalizeEmail(req.body?.email);
    if (!email) {
      res.status(400).json({ error: "Email is required" });
      return;
    }
    const member = await prisma.member.findFirst({
      where: { loginEmail: email },
      select: { id: true, name: true, loginEmail: true, passwordHash: true },
    });
    // Always respond OK — never reveal whether the email has an account
    if (!member?.passwordHash || !member.loginEmail) {
      res.json({ ok: true });
      return;
    }
    const rawToken = crypto.randomBytes(32).toString("hex");
    const tokenHash = crypto.createHash("sha256").update(rawToken).digest("hex");
    const expiry = new Date(Date.now() + 60 * 60 * 1000); // 1 hour
    await prisma.member.update({
      where: { id: member.id },
      data: { passwordResetToken: tokenHash, passwordResetExpiry: expiry },
    });
    const base = await publicSiteBase(prisma);
    const resetUrl = `${base}/member/reset-password?token=${rawToken}&email=${encodeURIComponent(member.loginEmail)}`;
    await sendPasswordResetEmail(prisma, member.loginEmail, member.name, resetUrl);
    res.json({ ok: true });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: "Could not send reset email" });
  }
});

router.post("/reset-password", async (req, res) => {
  try {
    const email = normalizeEmail(req.body?.email);
    const token = String(req.body?.token ?? "").trim();
    const password = normalizePassword(req.body?.password);
    if (!email || !token || !password || password.length < 8) {
      res.status(400).json({ error: "Invalid request — password must be at least 8 characters." });
      return;
    }
    const tokenHash = crypto.createHash("sha256").update(token).digest("hex");
    const member = await prisma.member.findFirst({
      where: { loginEmail: email },
      select: { id: true, passwordResetToken: true, passwordResetExpiry: true },
    });
    if (
      !member ||
      member.passwordResetToken !== tokenHash ||
      !member.passwordResetExpiry ||
      member.passwordResetExpiry < new Date()
    ) {
      res.status(400).json({ error: "This reset link is invalid or has expired. Please request a new one." });
      return;
    }
    const hash = await bcrypt.hash(password, 12);
    await prisma.member.update({
      where: { id: member.id },
      data: {
        passwordHash: hash,
        mustChangePassword: false,
        passwordResetToken: null,
        passwordResetExpiry: null,
      },
    });
    res.json({ ok: true });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: "Reset failed" });
  }
});

export default router;
