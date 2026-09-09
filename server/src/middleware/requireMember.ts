import type { Request, RequestHandler } from "express";
import jwt from "jsonwebtoken";
import { getJwtSecret } from "../lib/jwtSecret.js";

export const requireMember: RequestHandler = (req, res, next) => {
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
    if (payload.role !== "member" || !payload.sub || typeof payload.sub !== "string") {
      res.status(403).json({ error: "Invalid member session" });
      return;
    }
    (req as Request & { memberId: string }).memberId = payload.sub;
    next();
  } catch {
    res.status(401).json({ error: "Invalid or expired token" });
  }
};
