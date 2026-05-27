"use server";

import { revalidatePath } from "next/cache";
import { and, eq, sql } from "drizzle-orm";
import { z } from "zod";
import { db, schema } from "@/db";
import { requireUser } from "@/lib/current-user";
import { toUsdCents, setRate } from "@/lib/fx";

const {
  finAccounts,
  finTransactions,
  finVendors,
  finCategories,
  finSubscriptions,
  finBudgets,
} = schema;

/* ─── Helpers ──────────────────────────────────────────────────────────── */

function dollarsToCents(input: string | number): number {
  if (typeof input === "number") return Math.round(input * 100);
  const trimmed = input.trim().replace(/[^\d.-]/g, "");
  if (!trimmed) return 0;
  const n = Number(trimmed);
  if (Number.isNaN(n)) return 0;
  return Math.round(n * 100);
}

async function refreshAccountBalance(accountId: string, workspaceId: string) {
  const [agg] = await db
    .select({
      opening: finAccounts.openingBalanceCents,
      sum: sql<number>`COALESCE(SUM(${finTransactions.amountCents})::int, 0)`,
    })
    .from(finAccounts)
    .leftJoin(
      finTransactions,
      and(
        eq(finTransactions.accountId, finAccounts.id),
        eq(finTransactions.workspaceId, workspaceId),
      ),
    )
    .where(
      and(
        eq(finAccounts.id, accountId),
        eq(finAccounts.workspaceId, workspaceId),
      ),
    )
    .groupBy(finAccounts.id, finAccounts.openingBalanceCents);

  if (!agg) return;
  await db
    .update(finAccounts)
    .set({
      balanceCents: (agg.opening ?? 0) + (agg.sum ?? 0),
      updatedAt: new Date(),
    })
    .where(
      and(
        eq(finAccounts.id, accountId),
        eq(finAccounts.workspaceId, workspaceId),
      ),
    );
}

/* ─── Accounts ─────────────────────────────────────────────────────────── */

const accountSchema = z.object({
  name: z.string().min(1).max(120),
  type: z.enum([
    "checking",
    "savings",
    "credit_card",
    "cash",
    "crypto",
    "brokerage",
    "loan",
    "other",
  ]),
  currency: z.string().min(3).max(3).default("USD"),
  openingBalance: z.string().optional().default("0"),
  color: z.string().optional(),
  notes: z.string().optional(),
});

export async function createAccount(formData: FormData) {
  const user = await requireUser();
  const parsed = accountSchema.safeParse({
    name: formData.get("name"),
    type: formData.get("type"),
    currency: (formData.get("currency") as string)?.toUpperCase() || "USD",
    openingBalance: formData.get("openingBalance"),
    color: formData.get("color") || undefined,
    notes: formData.get("notes") || undefined,
  });
  if (!parsed.success) {
    throw new Error("Invalid account data");
  }
  const opening = dollarsToCents(parsed.data.openingBalance || "0");
  await db.insert(finAccounts).values({
    workspaceId: user.workspaceId,
    name: parsed.data.name,
    type: parsed.data.type,
    currency: parsed.data.currency,
    openingBalanceCents: opening,
    balanceCents: opening,
    color: parsed.data.color,
    notes: parsed.data.notes,
  });
  revalidatePath("/treasury");
  revalidatePath("/treasury/accounts");
}

export async function archiveAccount(id: string) {
  const user = await requireUser();
  await db
    .update(finAccounts)
    .set({ archived: true, updatedAt: new Date() })
    .where(
      and(
        eq(finAccounts.id, id),
        eq(finAccounts.workspaceId, user.workspaceId),
      ),
    );
  revalidatePath("/treasury/accounts");
}

/* ─── Vendors ──────────────────────────────────────────────────────────── */

const vendorSchema = z.object({
  name: z.string().min(1).max(120),
  website: z.string().optional(),
  contactId: z.string().uuid().optional(),
  defaultCategoryId: z.string().uuid().optional(),
});

export async function createVendor(formData: FormData) {
  const user = await requireUser();
  const parsed = vendorSchema.safeParse({
    name: formData.get("name"),
    website: formData.get("website") || undefined,
    contactId: formData.get("contactId") || undefined,
    defaultCategoryId: formData.get("defaultCategoryId") || undefined,
  });
  if (!parsed.success) throw new Error("Invalid vendor data");
  await db.insert(finVendors).values({
    workspaceId: user.workspaceId,
    name: parsed.data.name,
    website: parsed.data.website,
    contactId: parsed.data.contactId,
    defaultCategoryId: parsed.data.defaultCategoryId,
  });
  revalidatePath("/treasury/vendors");
}

/* ─── Categories ───────────────────────────────────────────────────────── */

const categorySchema = z.object({
  name: z.string().min(1).max(80),
  kind: z.enum(["expense", "income", "transfer"]).default("expense"),
  color: z.string().optional(),
});

export async function createCategory(formData: FormData) {
  const user = await requireUser();
  const parsed = categorySchema.safeParse({
    name: formData.get("name"),
    kind: formData.get("kind") || "expense",
    color: formData.get("color") || undefined,
  });
  if (!parsed.success) throw new Error("Invalid category");
  await db.insert(finCategories).values({
    workspaceId: user.workspaceId,
    name: parsed.data.name,
    kind: parsed.data.kind,
    color: parsed.data.color,
  });
  revalidatePath("/treasury");
}

/* ─── Transactions ─────────────────────────────────────────────────────── */

const txnSchema = z.object({
  accountId: z.string().uuid(),
  postedDate: z.string().min(8), // YYYY-MM-DD
  amount: z.string().min(1), // raw input; sign indicates direction
  direction: z.enum(["expense", "income"]).default("expense"),
  description: z.string().min(1).max(500),
  vendorId: z.string().uuid().optional(),
  categoryId: z.string().uuid().optional(),
  projectId: z.string().uuid().optional(),
  contactId: z.string().uuid().optional(),
  notes: z.string().optional(),
});

export async function createTransaction(formData: FormData) {
  const user = await requireUser();
  const parsed = txnSchema.safeParse({
    accountId: formData.get("accountId"),
    postedDate: formData.get("postedDate"),
    amount: formData.get("amount"),
    direction: formData.get("direction") || "expense",
    description: formData.get("description"),
    vendorId: formData.get("vendorId") || undefined,
    categoryId: formData.get("categoryId") || undefined,
    projectId: formData.get("projectId") || undefined,
    contactId: formData.get("contactId") || undefined,
    notes: formData.get("notes") || undefined,
  });
  if (!parsed.success) throw new Error("Invalid transaction");

  // Look up account to know currency
  const [account] = await db
    .select()
    .from(finAccounts)
    .where(
      and(
        eq(finAccounts.id, parsed.data.accountId),
        eq(finAccounts.workspaceId, user.workspaceId),
      ),
    )
    .limit(1);
  if (!account) throw new Error("Account not found");

  const magnitude = Math.abs(dollarsToCents(parsed.data.amount));
  const signedCents =
    parsed.data.direction === "income" ? magnitude : -magnitude;

  const postedDate = parsed.data.postedDate;
  const usdCents = await toUsdCents(
    signedCents,
    account.currency,
    new Date(postedDate),
  );

  await db.insert(finTransactions).values({
    workspaceId: user.workspaceId,
    accountId: parsed.data.accountId,
    postedDate,
    amountCents: signedCents,
    currency: account.currency,
    usdAmountCents: usdCents,
    description: parsed.data.description,
    vendorId: parsed.data.vendorId || null,
    categoryId: parsed.data.categoryId || null,
    projectId: parsed.data.projectId || null,
    contactId: parsed.data.contactId || null,
    notes: parsed.data.notes || null,
    createdBy: user.id,
  });

  await refreshAccountBalance(parsed.data.accountId, user.workspaceId);
  revalidatePath("/treasury");
  revalidatePath("/treasury/transactions");
  revalidatePath("/treasury/accounts");
}

export async function deleteTransaction(id: string) {
  const user = await requireUser();
  const [txn] = await db
    .select({ accountId: finTransactions.accountId })
    .from(finTransactions)
    .where(
      and(
        eq(finTransactions.id, id),
        eq(finTransactions.workspaceId, user.workspaceId),
      ),
    )
    .limit(1);
  if (!txn) return;
  await db
    .delete(finTransactions)
    .where(
      and(
        eq(finTransactions.id, id),
        eq(finTransactions.workspaceId, user.workspaceId),
      ),
    );
  await refreshAccountBalance(txn.accountId, user.workspaceId);
  revalidatePath("/treasury");
  revalidatePath("/treasury/transactions");
  revalidatePath("/treasury/accounts");
}

export async function updateTransactionCategory(
  id: string,
  categoryId: string | null,
) {
  const user = await requireUser();
  await db
    .update(finTransactions)
    .set({ categoryId })
    .where(
      and(
        eq(finTransactions.id, id),
        eq(finTransactions.workspaceId, user.workspaceId),
      ),
    );
  revalidatePath("/treasury/transactions");
}

export async function updateTransactionProject(
  id: string,
  projectId: string | null,
) {
  const user = await requireUser();
  await db
    .update(finTransactions)
    .set({ projectId })
    .where(
      and(
        eq(finTransactions.id, id),
        eq(finTransactions.workspaceId, user.workspaceId),
      ),
    );
  revalidatePath("/treasury/transactions");
}

/* ─── Subscriptions ────────────────────────────────────────────────────── */

const subSchema = z.object({
  vendorId: z.string().uuid(),
  planName: z.string().optional(),
  price: z.string().min(1),
  currency: z.string().min(3).max(3).default("USD"),
  cycle: z
    .enum(["monthly", "yearly", "weekly", "usage", "one_off"])
    .default("monthly"),
  nextRenewalDate: z.string().optional(),
  projectId: z.string().uuid().optional(),
  notes: z.string().optional(),
});

export async function createSubscription(formData: FormData) {
  const user = await requireUser();
  const parsed = subSchema.safeParse({
    vendorId: formData.get("vendorId"),
    planName: formData.get("planName") || undefined,
    price: formData.get("price"),
    currency: (formData.get("currency") as string)?.toUpperCase() || "USD",
    cycle: formData.get("cycle") || "monthly",
    nextRenewalDate: formData.get("nextRenewalDate") || undefined,
    projectId: formData.get("projectId") || undefined,
    notes: formData.get("notes") || undefined,
  });
  if (!parsed.success) throw new Error("Invalid subscription");
  await db.insert(finSubscriptions).values({
    workspaceId: user.workspaceId,
    vendorId: parsed.data.vendorId,
    planName: parsed.data.planName,
    priceCents: dollarsToCents(parsed.data.price),
    currency: parsed.data.currency,
    cycle: parsed.data.cycle,
    nextRenewalDate: parsed.data.nextRenewalDate || null,
    ownerUserId: user.id,
    projectId: parsed.data.projectId || null,
    notes: parsed.data.notes || null,
  });
  revalidatePath("/treasury");
  revalidatePath("/treasury/subscriptions");
}

export async function cancelSubscription(id: string) {
  const user = await requireUser();
  await db
    .update(finSubscriptions)
    .set({
      status: "cancelled",
      cancelledOn: new Date().toISOString().slice(0, 10),
      updatedAt: new Date(),
    })
    .where(
      and(
        eq(finSubscriptions.id, id),
        eq(finSubscriptions.workspaceId, user.workspaceId),
      ),
    );
  revalidatePath("/treasury/subscriptions");
}

/* ─── FX rates ─────────────────────────────────────────────────────────── */

export async function upsertFxRate(formData: FormData) {
  await requireUser();
  const currency = ((formData.get("currency") as string) || "").toUpperCase();
  const usdPerUnit = Number(formData.get("usdPerUnit") || 0);
  if (!currency || currency.length !== 3 || !Number.isFinite(usdPerUnit)) {
    throw new Error("Invalid rate");
  }
  await setRate({ currency, usdPerUnit, source: "manual" });
  revalidatePath("/treasury");
}

/* ─── CSV import ───────────────────────────────────────────────────────── */

/**
 * Lightweight CSV parser. Expects header row with columns:
 * date, description, amount  (optional: category, vendor, notes)
 * Amount is negative for expenses, positive for income.
 */
function parseCsvRow(line: string): string[] {
  const out: string[] = [];
  let cur = "";
  let inQ = false;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (c === '"') {
      if (inQ && line[i + 1] === '"') {
        cur += '"';
        i++;
      } else {
        inQ = !inQ;
      }
    } else if (c === "," && !inQ) {
      out.push(cur);
      cur = "";
    } else {
      cur += c;
    }
  }
  out.push(cur);
  return out.map((s) => s.trim());
}

export async function importTransactionsCsv(formData: FormData) {
  const user = await requireUser();
  const accountId = formData.get("accountId") as string;
  const csv = formData.get("csv") as string;
  if (!accountId || !csv) throw new Error("accountId and csv are required");

  const [account] = await db
    .select()
    .from(finAccounts)
    .where(
      and(
        eq(finAccounts.id, accountId),
        eq(finAccounts.workspaceId, user.workspaceId),
      ),
    )
    .limit(1);
  if (!account) throw new Error("Account not found");

  const lines = csv.split(/\r?\n/).filter((l) => l.trim());
  if (lines.length < 2) throw new Error("CSV needs header + at least one row");

  const header = parseCsvRow(lines[0]).map((h) => h.toLowerCase());
  const idx = {
    date: header.indexOf("date"),
    description: header.indexOf("description"),
    amount: header.indexOf("amount"),
    notes: header.indexOf("notes"),
  };
  if (idx.date < 0 || idx.description < 0 || idx.amount < 0) {
    throw new Error("CSV must have date, description, amount columns");
  }

  const rows = lines.slice(1).map(parseCsvRow);
  let imported = 0;
  for (const row of rows) {
    const dateRaw = row[idx.date];
    const description = row[idx.description];
    const amountRaw = row[idx.amount];
    if (!dateRaw || !description || !amountRaw) continue;
    const date = new Date(dateRaw);
    if (isNaN(date.getTime())) continue;
    const postedDate = date.toISOString().slice(0, 10);
    const cents = dollarsToCents(amountRaw);
    const usdCents = await toUsdCents(cents, account.currency, date);
    await db.insert(finTransactions).values({
      workspaceId: user.workspaceId,
      accountId,
      postedDate,
      amountCents: cents,
      currency: account.currency,
      usdAmountCents: usdCents,
      description,
      notes: idx.notes >= 0 ? row[idx.notes] || null : null,
      source: "csv_import",
      createdBy: user.id,
    });
    imported++;
  }

  await refreshAccountBalance(accountId, user.workspaceId);
  revalidatePath("/treasury");
  revalidatePath("/treasury/transactions");
  return { imported };
}
