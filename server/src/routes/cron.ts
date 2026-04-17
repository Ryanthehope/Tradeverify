import { Router } from "express";
import { checkInsuranceExpiries } from "../lib/insuranceAlerts.js";
import { prisma } from "../db.js";
import bcrypt from "bcryptjs";

const router = Router();

/**
 * POST /api/cron/check-insurance
 * Daily cron job to check insurance expiries and send alerts
 * Called by Vercel Cron (configured in vercel.json)
 */
router.post("/check-insurance", async (req, res) => {
    try {
        // Verify cron secret to prevent unauthorized access
        const cronSecret = process.env.CRON_SECRET || "dev-secret-123";
        const authHeader = req.headers.authorization;
        
        if (authHeader !== `Bearer ${cronSecret}`) {
            return res.status(401).json({ error: "Unauthorized" });
        }

        console.log("🔄 Running insurance expiry check...");
        
        const results = await checkInsuranceExpiries();
        
        console.log(`✅ Cron job complete: ${results.checked} policies checked, ${results.alertsSent} alerts sent, ${results.statusesUpdated} statuses updated`);
        
        res.json({
            success: true,
            timestamp: new Date().toISOString(),
            results
        });
    } catch (error) {
        console.error("Error in cron job:", error);
        res.status(500).json({ error: "Cron job failed" });
    }
});

/**
 * POST /api/cron/create-admin
 * One-time endpoint to create the initial admin user
 * Protected by CRON_SECRET
 */
router.post("/create-admin", async (req, res) => {
    try {
        // Verify cron secret to prevent unauthorized access
        const cronSecret = process.env.CRON_SECRET || "dev-secret-123";
        const authHeader = req.headers.authorization;
        
        if (authHeader !== `Bearer ${cronSecret}`) {
            return res.status(401).json({ error: "Unauthorized" });
        }

        const email = process.env.STAFF_SEED_EMAIL?.trim().toLowerCase() || "admin@tradeverify.local";
        const password = process.env.STAFF_SEED_PASSWORD?.trim() || "ChangeThisPassword!";
        const name = process.env.STAFF_SEED_NAME?.trim() || "Administrator";

        const hash = await bcrypt.hash(password, 12);
        
        const staff = await prisma.staff.upsert({
            where: { email },
            create: { email, password: hash, name },
            update: { password: hash, name },
        });

        console.log(`✅ Admin user created/updated: ${email}`);
        
        res.json({
            success: true,
            message: "Admin user created successfully",
            email: staff.email,
            name: staff.name
        });
    } catch (error) {
        console.error("Error creating admin:", error);
        res.status(500).json({ error: "Failed to create admin user" });
    }
});

export default router;