import { Router } from "express";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import { verifySync } from "otplib";
import { prisma } from "../db.js";
import rateLimit from "express-rate-limit";
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

const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 20,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "Too many attempts, please try again later" },
});

router.post("/login", authLimiter, async (req, res) => {
  try {
    const email = normalizeEmail(req.body?.email);
    const password = normalizePassword(req.body?.password);
    if (!email || !password) {
      res.status(400).json({ error: "Email and password are required" });
      return;
    }
    const staff = await prisma.staff.findUnique({ where: { email } });
    if (!staff) {
      res.status(401).json({ error: "Invalid email or password" });
      return;
    }
    const ok = await bcrypt.compare(password, staff.password);
    if (!ok) {
      res.status(401).json({ error: "Invalid email or password" });
      return;
    }

    if (staff.totpEnabled && staff.totpSecret) {
      const pendingToken = jwt.sign(
        { sub: staff.id, k: "2fa" },
        getJwtSecret(),
        { expiresIn: "5m" }
      );
      res.json({
        requires2fa: true,
        pendingToken,
        staff: {
          id: staff.id,
          email: staff.email,
          name: staff.name,
        },
      });
      return;
    }

    const token = jwt.sign(
      { sub: staff.id, email: staff.email, role: "staff" },
      getJwtSecret(),
      { expiresIn: "7d" }
    );
    res.json({
      token,
      staff: {
        id: staff.id,
        email: staff.email,
        name: staff.name,
      },
    });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: "Login failed" });
  }
});

router.post("/verify-2fa", authLimiter, async (req, res) => {
  try {
    const pendingToken = String(req.body?.pendingToken ?? "");
    const code = String(req.body?.code ?? "").replace(/\s/g, "");
    if (!pendingToken || !code) {
      res.status(400).json({ error: "pendingToken and code are required" });
      return;
    }
    let payload: jwt.JwtPayload & { sub?: string; k?: string };
    try {
      payload = jwt.verify(pendingToken, getJwtSecret()) as jwt.JwtPayload & {
        sub?: string;
        k?: string;
      };
    } catch {
      res.status(401).json({ error: "Session expired — sign in again" });
      return;
    }
    if (payload.k !== "2fa" || typeof payload.sub !== "string") {
      res.status(400).json({ error: "Invalid token" });
      return;
    }
    const staff = await prisma.staff.findUnique({
      where: { id: payload.sub },
    });
    if (!staff?.totpSecret || !staff.totpEnabled) {
      res.status(400).json({ error: "2FA is not set up for this account" });
      return;
    }
    const { valid } = verifySync({
      token: code,
      secret: staff.totpSecret,
    });
    if (!valid) {
      res.status(401).json({ error: "Invalid authentication code" });
      return;
    }
    const token = jwt.sign(
      { sub: staff.id, email: staff.email, role: "staff" },
      getJwtSecret(),
      { expiresIn: "7d" }
    );
    res.json({
      token,
      staff: {
        id: staff.id,
        email: staff.email,
        name: staff.name,
      },
    });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: "Verification failed" });
  }
});

export default router;
