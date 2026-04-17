import "./lib/webCryptoPolyfill.js";
import path from "path";
import { fileURLToPath } from "url";
import dotenv from "dotenv";
import fs from "fs";
import http from "http";
import https from "https";

const bootDir = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.join(bootDir, "..", ".env") });
dotenv.config();

import "./lib/serverMeta.js";
import cors from "cors";
import express from "express";
import apiAdmin from "./routes/apiAdmin.js";
import apiPublic from "./routes/apiPublic.js";
import authRouter from "./routes/auth.js";
import billingRouter from "./routes/billing.js";
import memberAuthRouter from "./routes/memberAuth.js";
import memberPortalRouter from "./routes/memberPortal.js";
import categoriesRouter from "./routes/categories.js";
import insuranceRouter from "./routes/insurance.js";
import cronRouter from "./routes/cron.js";
import { stripeWebhookHandler } from "./routes/stripeWebhook.js";
import { prisma } from "./db.js";
// import { deleteMembersExpiredBeyondGrace } from "./lib/memberMembership.js";


const rootDir = path.join(bootDir, "..", "..");
const distDir = path.join(rootDir, "dist");

const app = express();
app.use(cors({ origin: true, credentials: true }));
app.post(
  "/api/stripe/webhook",
  express.raw({ type: "application/json" }),
  (req, res) => {
    void stripeWebhookHandler(req, res);
  }
);
app.use(express.json({ limit: "1mb" }));

app.use("/api/auth", authRouter);
app.use("/api/member-auth", memberAuthRouter);
app.use("/api/member/portal", memberPortalRouter);
app.use("/api/admin", apiAdmin);
app.use("/api/billing", billingRouter);
app.use("/api/categories", categoriesRouter);
app.use("/api/insurance", insuranceRouter);
app.use("/api/cron", cronRouter);
app.use("/api", apiPublic);

if (fs.existsSync(distDir)) {
  app.use(
    express.static(distDir, {
      setHeaders(res, filePath) {
        if (filePath.replace(/\\/g, "/").endsWith("/index.html")) {
          res.setHeader(
            "Cache-Control",
            "no-store, no-cache, must-revalidate, proxy-revalidate"
          );
        }
      },
    })
  );
  app.get(/^(?!\/api).*/, (_req, res) => {
    res.setHeader(
      "Cache-Control",
      "no-store, no-cache, must-revalidate, proxy-revalidate"
    );
    res.sendFile(path.join(distDir, "index.html"));
  });
} else {
  console.warn(
    "[tradeverify] dist/ not found — only /api/* routes work. From repo root run `npm run build`, or in dev use Vite (e.g. http://localhost:5173) with the API on PORT."
  );
  app.get("/", (_req, res) => {
    res
      .status(503)
      .type("text")
      .send(
        "TradeVerify API is up. No built web app (dist/). Run: npm run build (project root), then restart the server. In development, open the Vite URL (usually port 5173), not this API port."
      );
  });
}

const port = Number(process.env.PORT) || 3001;

function resolveIfRelative(p: string): string {
  const t = p.trim();
  if (!t) return t;
  return path.isAbsolute(t) ? t : path.join(bootDir, "..", t);
}

const sslKeyFile = process.env.SSL_KEY_FILE?.trim();
const sslCertFile = process.env.SSL_CERT_FILE?.trim();
const sslKeyPath = sslKeyFile ? resolveIfRelative(sslKeyFile) : "";
const sslCertPath = sslCertFile ? resolveIfRelative(sslCertFile) : "";
const useTls =
  Boolean(sslKeyPath && sslCertPath) &&
  fs.existsSync(sslKeyPath) &&
  fs.existsSync(sslCertPath);

if (port === 443 && !useTls) {
  console.warn(
    "[tradeverify] PORT is 443 but SSL_KEY_FILE + SSL_CERT_FILE are missing or files not found — starting plain HTTP (browsers expect HTTPS on 443)."
  );
}

const onListen = () => {
  const scheme = useTls ? "https" : "http";
  console.log(`[tradeverify] listening on ${scheme}://localhost:${port}`);
  if (fs.existsSync(distDir)) {
    console.log(`[tradeverify] Serving SPA from ${distDir}`);
  }
  // Removed: deleteMembersExpiredBeyondGrace cleanup logic
  // Removed: periodic deleteMembersExpiredBeyondGrace cleanup
};

if (useTls) {
  const key = fs.readFileSync(sslKeyPath);
  const cert = fs.readFileSync(sslCertPath);
  https.createServer({ key, cert }, app).listen(port, onListen);
} else {
  http.createServer(app).listen(port, onListen);
}
