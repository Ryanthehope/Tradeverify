import {
  Address,
  Contact,
  Contacts,
  Invoice,
  Invoices,
  LineAmountTypes,
  LineItem,
} from "xero-node";
import { getAuthorisedXeroClient } from "./xeroClient.js";
import { prisma } from "../db.js";
import { ensureIssuedInvoiceNumber } from "./issuedInvoiceNumber.js";

export type XeroInvoicePayload = {
    contactName: string;        // traders company name
    contactEmail: string;       // traders email
    contactAddress?: string | null;
    contactPostalCode?: string | null;
    description: string;         // e.g. "Annual Portal Fee" or "Registration Fee"
    amountPence: number;        // amount in pence, with no VAT charged
  reference: string;          // e.g. Stripe payment or invoice reference
    paidAt: Date;               //when payment was confirmed
};

function buildContactAddress(
  rawAddress: string | null | undefined,
  postalCode: string | null | undefined
): Address[] | undefined {
  const address = String(rawAddress ?? "").replace(/\r/g, "").trim();
  const postcode = String(postalCode ?? "").trim();
  if (!address && !postcode) return undefined;

  const parts = address
    ? address
        .split(/\n+|,/)
        .map((part) => part.trim())
        .filter(Boolean)
    : [];

  const [addressLine1, addressLine2, addressLine3, ...rest] = parts;
  const addressLine4 = rest.length > 0 ? rest.join(", ") : undefined;

  return [
    {
      addressType: Address.AddressTypeEnum.STREET,
      ...(addressLine1 ? { addressLine1 } : {}),
      ...(addressLine2 ? { addressLine2 } : {}),
      ...(addressLine3 ? { addressLine3 } : {}),
      ...(addressLine4 ? { addressLine4 } : {}),
      ...(postcode ? { postalCode: postcode } : {}),
    },
  ];
}

async function resolveInvoiceContact(
  tenantId: string,
  payload: XeroInvoicePayload
): Promise<Contact> {
  const client = await getAuthorisedXeroClient();
  const addresses = buildContactAddress(
    payload.contactAddress,
    payload.contactPostalCode
  );

  let existingContact: Contact | undefined;
  if (payload.contactEmail) {
    const existing = await client.accountingApi.getContacts(
      tenantId,
      undefined,
      `EmailAddress="${payload.contactEmail}"`
    );
    existingContact = existing.body.contacts?.[0];
  }

  if (existingContact?.contactID) {
    if (addresses) {
      const contacts: Contacts = {
        contacts: [
          {
            contactID: existingContact.contactID,
            name: payload.contactName,
            emailAddress: payload.contactEmail,
            addresses,
          },
        ],
      };
      await client.accountingApi.updateContact(
        tenantId,
        existingContact.contactID,
        contacts
      );
    }
    return { contactID: existingContact.contactID };
  }

  return {
    name: payload.contactName,
    emailAddress: payload.contactEmail,
    ...(addresses ? { addresses } : {}),
  };
}

export async function createPaidXeroInvoice(payload: XeroInvoicePayload): Promise<string | null> {
    try {
        const client = await getAuthorisedXeroClient();
    const invoiceNumber = await ensureIssuedInvoiceNumber(payload.reference);

        const settings = await prisma.organizationSettings.findUnique({
            where: { id: "default" },
            select: { xeroTenantId: true },
        });

        const tenantId = settings?.xeroTenantId;
        if (!tenantId) {
            console.warn("[xero] No tenant ID stored — skipping invoice creation");
            return null;
    }

    const amount = payload.amountPence / 100;

    const contact = await resolveInvoiceContact(tenantId, payload);

    const lineItem: LineItem = {
      description: payload.description,
      quantity: 1.0,
      unitAmount: amount,
      taxType: "NONE",
      accountCode: "200", // default Xero sales account — Nigel can adjust in Xero
    };

    const invoice: Invoice = {
      type: Invoice.TypeEnum.ACCREC,
      contact,
      lineItems: [lineItem],
      lineAmountTypes: LineAmountTypes.Exclusive,
      date: payload.paidAt.toISOString().split("T")[0],
      dueDate: payload.paidAt.toISOString().split("T")[0],
      invoiceNumber,
      reference: payload.reference,
      status: Invoice.StatusEnum.AUTHORISED,
    };

    const invoices: Invoices = { invoices: [invoice] };
    const created = await client.accountingApi.createInvoices(tenantId, invoices);
    const invoiceId = created.body.invoices?.[0]?.invoiceID;

    if (!invoiceId) {
      console.error("[xero] Invoice created but no ID returned", created.body);
      return null;
    }

    // Mark as paid immediately
    const payment = {
      invoice: { invoiceID: invoiceId },
      account: { code: "090" }, // default Xero bank account — Nigel can adjust
      date: payload.paidAt.toISOString().split("T")[0],
      amount,
    };

    try {
      await client.accountingApi.createPayment(tenantId, payment as any);
    } catch (err) {
      console.error(`[xero] Invoice ${invoiceId} created but payment marking failed`, err);
      return invoiceId;
    }

    console.log(`[xero] Invoice ${invoiceId} created and marked paid for ${payload.contactName}`);
    return invoiceId;
  } catch (err) {
    // Non-fatal — log but don't break the webhook flow
    console.error("[xero] Failed to create invoice", err);
    return null;
  }
}

export type XeroCreditNotePayload = {
    contactName: string;        // traders company name
    contactEmail: string;       // traders email
    description: string;         // e.g. "Refund for Annual Portal Fee"
    amountPence: number;        // amount in pence, with no VAT charged
  reference: string;          // e.g. Stripe payment or invoice reference
    refundedAt: Date;           // when refund was issued
  };

export async function createXeroCreditNote(payload: XeroCreditNotePayload): Promise<void> {
    try {
      const client = await getAuthorisedXeroClient();
      const settings = await prisma.organizationSettings.findUnique({
        where: { id: "default" },
        select: { xeroTenantId: true },
      });
      const tenantId = settings?.xeroTenantId;
      if (!tenantId) {
        console.warn("[xero] No tenant ID stored — skipping credit note creation");
        return;
      }
      const amount = payload.amountPence / 100;

      let contactId: string | undefined;
      if (payload.contactEmail) {
        const existing = await client.accountingApi.getContacts(
          tenantId, undefined, `EmailAddress="${payload.contactEmail}"`
        );
        contactId = existing.body.contacts?.[0]?.contactID;
      }

      const contact: Contact = contactId
        ? { contactID: contactId }
        : { name: payload.contactName, emailAddress: payload.contactEmail };

      const creditNote = {
        type: "ACCRECCREDIT",
        contact,
        date: payload.refundedAt.toISOString().split("T")[0],
        reference: payload.reference,
        status: "AUTHORISED",
        lineAmountTypes: LineAmountTypes.Exclusive,
        lineItems: [{
          description: `Refund: ${payload.description}`,
          quantity: 1.0,
          unitAmount: amount,
          taxType: "NONE",
          accountCode: "200",
        }],
      };

      await client.accountingApi.createCreditNotes(tenantId, { creditNotes: [creditNote] } as any);
      console.log(`[xero] Credit note created for ${payload.contactName} - ${payload.reference}`);
    } catch (err) {
      console.error("[xero] Failed to create credit note", err);
    }
}

    export async function fetchXeroInvoicePDF(invoiceId: string): Promise<Buffer | null> {
      try {
        const client = await getAuthorisedXeroClient();
        const settings = await prisma.organizationSettings.findUnique({
          where: { id: "default" },
          select: { xeroTenantId: true },
        });
        const tenantId = settings?.xeroTenantId;
        if (!tenantId) return null;

        const response = await client.accountingApi.getInvoiceAsPdf(
          tenantId,
          invoiceId,
          { headers: { "Accept": "application/pdf" } }
        );
        return Buffer.from(response.body as unknown as ArrayBuffer);
      } catch (err) {
        console.error("[xero] Failed to fetch invoice PDF", err);
        return null;
      }
}

export async function findRecentXeroInvoiceByReference(reference: string): Promise<string | null> {
  try {
    const client = await getAuthorisedXeroClient();
    const settings = await prisma.organizationSettings.findUnique({
      where: { id: "default" },
      select: { xeroTenantId: true },
    });
    const tenantId = settings?.xeroTenantId;
    if (!tenantId) return null;
    const response = await client.accountingApi.getInvoices(
      tenantId,
      undefined,
      undefined,
      "Date DESC",
      undefined,
      undefined,
      undefined,
      undefined,
      1,
      true
    );
    const match = (response.body.invoices ?? []).find(
      (invoice) => invoice.reference === reference
    );
    return match?.invoiceID ?? null;
  } catch (err) {
    console.error("[xero] Failed to search recent invoices by reference", err);
    return null;
  }
}