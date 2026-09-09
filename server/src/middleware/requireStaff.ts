import type { Request, RequestHandler } from "express";
import jwt from "jsonwebtoken";
import { getJwtSecret } from "../lib/jwtSecret.js";

function jwtSecret(): string {
  return getJwtSecret();
}

export const requireStaff: RequestHandler = (req, res, next) => {
  const h = req.headers.authorization;
  const token = h?.startsWith("Bearer ") ? h.slice(7).trim() : null;
  if (!token) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }
  try {
    const payload = jwt.verify(token, getJwtSecret()) as jwt.JwtPayload & {
      role?: string;
    };
    const id = payload.sub;
    if (!id || typeof id !== "string") {
      res.status(401).json({ error: "Invalid token" });
      return;
    }
    if (payload.role !== "staff") {
      res.status(403).json({ error: "Staff access required" });
      return;
}
    (req as Request & { staffId: string }).staffId = id;
    next();
  } catch {
    res.status(401).json({ error: "Invalid or expired token" });
  }
};
