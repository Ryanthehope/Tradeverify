import fs from "fs/promises";
import path from "path";
import { fileURLToPath } from "url";
import { PDFDocument, StandardFonts, rgb, type PDFFont, type PDFPage } from "pdf-lib";
import Stripe from "stripe";
import { prisma } from "../db.js";
import { ensureIssuedInvoiceNumber } from "./issuedInvoiceNumber.js";
import { orgBrandingFilePath } from "./orgBrandingPaths.js";

export type StripeInvoicePayload = {
  stripeCustomerId: string;
  description: string;
  /** Amount in pence; these Trader Watchdog charges are outside VAT. */
  amountPence: number;
  /** Stripe Checkout Session ID or PaymentIntent ID — shown as payment reference. */
  reference: string;
  paidAt: Date;
  receivedFromName?: string;
  receivedFromEmail?: string;
};

async function loadInvoiceBranding() {
  return prisma.organizationSettings.findUnique({
    where: { id: "default" },
    select: {
      brandingLogoStoredName: true,
      invoiceLegalName: true,
      invoiceAddress: true,
      invoiceFooterNote: true,
    },
  });
}

const MODULE_DIR = path.dirname(fileURLToPath(import.meta.url));
const FALLBACK_LOGO_PATH = path.resolve(
  MODULE_DIR,
  "../../assets/House logo.png"
);
const PAGE_WIDTH = 595.28;
const PAGE_HEIGHT = 841.89;
const MARGIN_X = 40;
const HEADER_HEIGHT = 92;
const BRAND_BLUE = rgb(18 / 255, 42 / 255, 128 / 255);
const BRAND_GREEN = rgb(0 / 255, 133 / 255, 74 / 255);
const WHITE = rgb(1, 1, 1);
const TEXT = rgb(17 / 255, 24 / 255, 39 / 255);
const MUTED = rgb(71 / 255, 85 / 255, 105 / 255);
const LINE = rgb(203 / 255, 213 / 255, 225 / 255);

function wrapText(font: PDFFont, text: string, size: number, maxWidth: number) {
  const words = text.split(/\s+/).filter(Boolean);
  const lines: string[] = [];
  let current = "";

  for (const word of words) {
    const candidate = current ? `${current} ${word}` : word;
    if (font.widthOfTextAtSize(candidate, size) <= maxWidth) {
      current = candidate;
      continue;
    }
    if (current) lines.push(current);
    current = word;
  }

  if (current) lines.push(current);
  return lines.length > 0 ? lines : [""];
}

function drawWrappedText(
  page: PDFPage,
  font: PDFFont,
  text: string,
  x: number,
  y: number,
  maxWidth: number,
  size: number,
  color = TEXT,
  lineGap = 4
) {
  const lines = wrapText(font, text, size, maxWidth);
  const step = size + lineGap;
  lines.forEach((line, index) => {
    page.drawText(line, {
      x,
      y: y - index * step,
      size,
      font,
      color,
    });
  });
  return y - lines.length * step;
}

async function loadReceiptLogo(storedName?: string | null) {
  const candidates = [
    storedName?.trim() ? orgBrandingFilePath(storedName.trim()) : null,
    FALLBACK_LOGO_PATH,
  ].filter(Boolean) as string[];

  for (const candidate of candidates) {
    try {
      const bytes = await fs.readFile(candidate);
      const ext = path.extname(candidate).toLowerCase();
      if (ext === ".png" || ext === ".jpg" || ext === ".jpeg") {
        return { bytes, ext };
      }
    } catch {
      // Try the next candidate.
    }
  }
  return null;
}

async function createCustomReceiptPdf(
  payload: StripeInvoicePayload
): Promise<Buffer> {
  const invoiceNumber = await ensureIssuedInvoiceNumber(payload.reference);
  const paidAtDisplay = payload.paidAt.toLocaleDateString("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
  const invoiceBranding = await loadInvoiceBranding();
  const businessLines = [
    invoiceBranding?.invoiceLegalName?.trim() || "Trader Watchdog Ltd",
    ...(invoiceBranding?.invoiceAddress?.trim()
      ? invoiceBranding.invoiceAddress
          .split(/\r?\n|,/) 
          .map((part) => part.trim())
          .filter(Boolean)
      : []),
  ].filter(Boolean) as string[];
  const receivedFromLines = [
    payload.receivedFromName?.trim() || null,
    payload.receivedFromEmail?.trim() || null,
  ].filter(Boolean) as string[];

  const pdf = await PDFDocument.create();
  const page = pdf.addPage([PAGE_WIDTH, PAGE_HEIGHT]);
  const fontRegular = await pdf.embedFont(StandardFonts.Helvetica);
  const fontBold = await pdf.embedFont(StandardFonts.HelveticaBold);

  page.drawRectangle({
    x: 0,
    y: PAGE_HEIGHT - HEADER_HEIGHT,
    width: PAGE_WIDTH,
    height: HEADER_HEIGHT,
    color: BRAND_BLUE,
  });

  let headerTextX = MARGIN_X;
  const logo = await loadReceiptLogo(invoiceBranding?.brandingLogoStoredName);
  if (logo) {
    const embedded =
      logo.ext === ".png"
        ? await pdf.embedPng(logo.bytes)
        : await pdf.embedJpg(logo.bytes);
    const ratio = embedded.height / embedded.width;
    const drawWidth = 84;
    const drawHeight = drawWidth * ratio;
    const logoX = MARGIN_X;
    const logoY = PAGE_HEIGHT - HEADER_HEIGHT + (HEADER_HEIGHT - drawHeight) / 2;
    const badgePaddingX = 10;
    const badgePaddingY = 5;

    page.drawRectangle({
      x: logoX - badgePaddingX,
      y: logoY - badgePaddingY,
      width: drawWidth + badgePaddingX * 2,
      height: drawHeight + badgePaddingY * 2,
      color: WHITE,
    });

    page.drawImage(embedded, {
      x: logoX,
      y: logoY,
      width: drawWidth,
      height: drawHeight,
    });
    headerTextX = logoX + drawWidth + 18;
  }

  page.drawText("Receipt", {
    x: headerTextX,
    y: PAGE_HEIGHT - 52,
    size: 28,
    font: fontBold,
    color: WHITE,
  });

  page.drawText("Trader Watchdog", {
    x: headerTextX,
    y: PAGE_HEIGHT - 76,
    size: 11,
    font: fontRegular,
    color: rgb(226 / 255, 232 / 255, 240 / 255),
  });

  const infoX = MARGIN_X;
  const infoLabelWidth = 118;
  let infoY = PAGE_HEIGHT - HEADER_HEIGHT - 28;
  const infoItems = [
    ["Invoice number", invoiceNumber],
    ["Date of issue", paidAtDisplay],
    ["Date of supply", paidAtDisplay],
    ["VAT", "Not charged"],
    ["Total", `£${(payload.amountPence / 100).toFixed(2)}`],
  ];
  for (const [label, value] of infoItems) {
    page.drawText(label, {
      x: infoX,
      y: infoY,
      size: 11,
      font: fontBold,
      color: TEXT,
    });
    page.drawText(value, {
      x: infoX + infoLabelWidth,
      y: infoY,
      size: 11,
      font: fontRegular,
      color: TEXT,
    });
    infoY -= 18;
  }

  const contentTopY = 560;
  const leftColX = MARGIN_X;
  const rightColX = 330;
  const colWidth = 220;

  page.drawText(businessLines[0] || "Trader Watchdog Ltd", {
    x: leftColX,
    y: contentTopY,
    size: 12,
    font: fontBold,
    color: TEXT,
  });
  let businessY = contentTopY - 24;
  for (const line of businessLines.slice(1)) {
    page.drawText(line, {
      x: leftColX,
      y: businessY,
      size: 11,
      font: fontRegular,
      color: TEXT,
    });
    businessY -= 17;
  }

  if (receivedFromLines.length > 0) {
    page.drawText("Received from", {
      x: rightColX,
      y: contentTopY,
      size: 12,
      font: fontBold,
      color: TEXT,
    });
    let receivedY = contentTopY - 24;
    for (const line of receivedFromLines) {
      receivedY = drawWrappedText(
        page,
        fontRegular,
        line,
        rightColX,
        receivedY,
        colWidth,
        11,
        TEXT,
        4
      );
    }
  }

  const ruleY = 410;
  page.drawLine({
    start: { x: MARGIN_X, y: ruleY },
    end: { x: PAGE_WIDTH - MARGIN_X, y: ruleY },
    thickness: 1,
    color: LINE,
  });

  page.drawText("Description of service", {
    x: MARGIN_X,
    y: ruleY - 26,
    size: 11,
    font: fontBold,
    color: TEXT,
  });
  const afterDescriptionY = drawWrappedText(
    page,
    fontRegular,
    payload.description,
    MARGIN_X,
    ruleY - 48,
    PAGE_WIDTH - MARGIN_X * 2,
    11,
    TEXT,
    5
  );
  page.drawText(`Payment reference: ${payload.reference}`, {
    x: MARGIN_X,
    y: afterDescriptionY - 12,
    size: 11,
    font: fontRegular,
    color: TEXT,
  });

  if (invoiceBranding?.invoiceFooterNote?.trim()) {
    drawWrappedText(
      page,
      fontRegular,
      invoiceBranding.invoiceFooterNote.trim(),
      MARGIN_X,
      95,
      PAGE_WIDTH - MARGIN_X * 2,
      10,
      MUTED,
      4
    );
  }

  const bytes = await pdf.save();
  return Buffer.from(bytes);
}

/**
 * Builds the trader-facing receipt PDF for a payment that was already collected.
 */
export async function createStripeInvoicePdf(
  _stripe: Stripe,
  payload: StripeInvoicePayload
): Promise<Buffer | null> {
  try {
    return await createCustomReceiptPdf(payload);
  } catch (err) {
    console.error("[stripeInvoice] failed to create receipt PDF", err);
    return null;
  }
}
