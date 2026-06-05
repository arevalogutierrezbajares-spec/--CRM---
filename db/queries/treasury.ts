import { and, desc, eq, gte, inArray, lt, or, sql } from "drizzle-orm";
import { db, schema } from "@/db";

const {
  finAccounts,
  finTransactions,
  finVendors,
  finCategories,
  finSubscriptions,
  finBudgets,
  projects,
  contacts,
  users,
} = schema;

/* ─── Accounts ─────────────────────────────────────────────────────────── */

export type AccountRow = typeof finAccounts.$inferSelect;

export async function listAccounts(workspaceId: string): Promise<AccountRow[]> {
  return db
    .select()
    .from(finAccounts)
    .where(
      and(
        eq(finAccounts.workspaceId, workspaceId),
        eq(finAccounts.archived, false),
      ),
    )
    .orderBy(finAccounts.name);
}

export async function getAccount(opts: {
  id: string;
  workspaceId: string;
}): Promise<AccountRow | null> {
  const [row] = await db
    .select()
    .from(finAccounts)
    .where(
      and(
        eq(finAccounts.id, opts.id),
        eq(finAccounts.workspaceId, opts.workspaceId),
      ),
    )
    .limit(1);
  return row ?? null;
}

/* ─── Vendors ──────────────────────────────────────────────────────────── */

export type VendorRow = typeof finVendors.$inferSelect & {
  contactName: string | null;
  defaultCategoryName: string | null;
  totalSpendCents: number;
  txnCount: number;
};

export async function listVendors(workspaceId: string): Promise<VendorRow[]> {
  const rows = await db
    .select({
      vendor: finVendors,
      contactName: contacts.name,
      defaultCategoryName: finCategories.name,
    })
    .from(finVendors)
    .leftJoin(contacts, eq(contacts.id, finVendors.contactId))
    .leftJoin(finCategories, eq(finCategories.id, finVendors.defaultCategoryId))
    .where(
      and(
        eq(finVendors.workspaceId, workspaceId),
        eq(finVendors.archived, false),
      ),
    )
    .orderBy(finVendors.name);

  if (rows.length === 0) return [];

  // Aggregate spend per vendor
  const ids = rows.map((r) => r.vendor.id);
  const spend = await db
    .select({
      vendorId: finTransactions.vendorId,
      total: sql<number>`COALESCE(SUM(${finTransactions.usdAmountCents})::int, 0)`,
      count: sql<number>`COUNT(*)::int`,
    })
    .from(finTransactions)
    .where(
      and(
        eq(finTransactions.workspaceId, workspaceId),
        inArray(finTransactions.vendorId, ids),
      ),
    )
    .groupBy(finTransactions.vendorId);

  return rows.map(({ vendor, contactName, defaultCategoryName }) => {
    const s = spend.find((x) => x.vendorId === vendor.id);
    return {
      ...vendor,
      contactName,
      defaultCategoryName,
      totalSpendCents: Math.abs(s?.total ?? 0),
      txnCount: s?.count ?? 0,
    };
  });
}

/* ─── Categories ───────────────────────────────────────────────────────── */

export type CategoryRow = typeof finCategories.$inferSelect;

export async function listCategories(
  workspaceId: string,
): Promise<CategoryRow[]> {
  return db
    .select()
    .from(finCategories)
    .where(eq(finCategories.workspaceId, workspaceId))
    .orderBy(finCategories.kind, finCategories.name);
}

const SEED_CATEGORIES: Array<{
  name: string;
  color: string;
  kind: "expense" | "income" | "transfer";
}> = [
  { name: "Tech & SaaS", color: "#185FA5", kind: "expense" },
  { name: "AI & Compute", color: "#534AB7", kind: "expense" },
  { name: "Payroll & Contractors", color: "#3B6D11", kind: "expense" },
  { name: "Office & Rent", color: "#854F0B", kind: "expense" },
  { name: "Travel", color: "#0F6E56", kind: "expense" },
  { name: "Marketing", color: "#A32D2D", kind: "expense" },
  { name: "Meals & Entertainment", color: "#BA7517", kind: "expense" },
  { name: "Professional Services", color: "#6B6B68", kind: "expense" },
  { name: "Taxes", color: "#1A1A1A", kind: "expense" },
  { name: "Other Expenses", color: "#A8A8A4", kind: "expense" },
  { name: "Client Revenue", color: "#3B6D11", kind: "income" },
  { name: "Other Income", color: "#1D9E75", kind: "income" },
  { name: "Transfer", color: "#6B6B68", kind: "transfer" },
];

/** Idempotently seed the default expense/income categories for a workspace. */
export async function seedDefaultCategories(workspaceId: string): Promise<void> {
  const existing = await db
    .select({ name: finCategories.name })
    .from(finCategories)
    .where(eq(finCategories.workspaceId, workspaceId));
  const have = new Set(existing.map((e) => e.name));
  const missing = SEED_CATEGORIES.filter((c) => !have.has(c.name));
  if (missing.length === 0) return;
  await db.insert(finCategories).values(
    missing.map((c) => ({
      workspaceId,
      name: c.name,
      color: c.color,
      kind: c.kind,
      isSystem: true,
    })),
  );
}

/* ─── Transactions ─────────────────────────────────────────────────────── */

export type TxnRow = typeof finTransactions.$inferSelect & {
  accountName: string | null;
  accountCurrency: string;
  vendorName: string | null;
  categoryName: string | null;
  categoryColor: string | null;
  projectTitle: string | null;
};

export async function listTransactions(opts: {
  workspaceId: string;
  limit?: number;
  accountId?: string;
  categoryId?: string;
  vendorId?: string;
  projectId?: string;
  from?: Date;
  to?: Date;
}): Promise<TxnRow[]> {
  const conditions = [eq(finTransactions.workspaceId, opts.workspaceId)];
  if (opts.accountId) conditions.push(eq(finTransactions.accountId, opts.accountId));
  if (opts.categoryId) conditions.push(eq(finTransactions.categoryId, opts.categoryId));
  if (opts.vendorId) conditions.push(eq(finTransactions.vendorId, opts.vendorId));
  if (opts.projectId) conditions.push(eq(finTransactions.projectId, opts.projectId));
  if (opts.from) conditions.push(gte(finTransactions.postedDate, opts.from.toISOString().slice(0, 10)));
  if (opts.to) conditions.push(lt(finTransactions.postedDate, opts.to.toISOString().slice(0, 10)));

  const rows = await db
    .select({
      txn: finTransactions,
      accountName: finAccounts.name,
      accountCurrency: finAccounts.currency,
      vendorName: finVendors.name,
      categoryName: finCategories.name,
      categoryColor: finCategories.color,
      projectTitle: projects.title,
    })
    .from(finTransactions)
    .leftJoin(finAccounts, eq(finAccounts.id, finTransactions.accountId))
    .leftJoin(finVendors, eq(finVendors.id, finTransactions.vendorId))
    .leftJoin(finCategories, eq(finCategories.id, finTransactions.categoryId))
    .leftJoin(projects, eq(projects.id, finTransactions.projectId))
    .where(and(...conditions))
    .orderBy(desc(finTransactions.postedDate), desc(finTransactions.createdAt))
    .limit(opts.limit ?? 100);

  return rows.map(({ txn, ...rest }) => ({
    ...txn,
    accountName: rest.accountName,
    accountCurrency: rest.accountCurrency ?? "USD",
    vendorName: rest.vendorName,
    categoryName: rest.categoryName,
    categoryColor: rest.categoryColor,
    projectTitle: rest.projectTitle,
  }));
}

/* ─── Subscriptions ────────────────────────────────────────────────────── */

export type SubscriptionRow = typeof finSubscriptions.$inferSelect & {
  vendorName: string;
  ownerName: string | null;
  projectTitle: string | null;
};

export async function listSubscriptions(
  workspaceId: string,
): Promise<SubscriptionRow[]> {
  const rows = await db
    .select({
      sub: finSubscriptions,
      vendorName: finVendors.name,
      ownerName: users.displayName,
      projectTitle: projects.title,
    })
    .from(finSubscriptions)
    .innerJoin(finVendors, eq(finVendors.id, finSubscriptions.vendorId))
    .leftJoin(users, eq(users.id, finSubscriptions.ownerUserId))
    .leftJoin(projects, eq(projects.id, finSubscriptions.projectId))
    .where(eq(finSubscriptions.workspaceId, workspaceId))
    .orderBy(finSubscriptions.nextRenewalDate);

  return rows.map((r) => ({
    ...r.sub,
    vendorName: r.vendorName,
    ownerName: r.ownerName,
    projectTitle: r.projectTitle,
  }));
}

/* ─── Dashboard aggregates ─────────────────────────────────────────────── */

export type TreasurySnapshot = {
  cashUsdCents: number;
  cashByCurrency: Array<{ currency: string; cents: number }>;
  burnTodayUsdCents: number;
  burn30dUsdCents: number;
  burnMTDUsdCents: number;
  inflowMTDUsdCents: number;
  monthlyBurnRunRateUsdCents: number;
  runwayMonths: number | null;
  accountCount: number;
};

export async function treasurySnapshot(
  workspaceId: string,
): Promise<TreasurySnapshot> {
  const today = new Date().toISOString().slice(0, 10);
  const monthStart = new Date();
  monthStart.setDate(1);
  monthStart.setHours(0, 0, 0, 0);
  const monthStartISO = monthStart.toISOString().slice(0, 10);
  const thirtyDaysAgo = new Date();
  thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
  const thirtyDaysAgoISO = thirtyDaysAgo.toISOString().slice(0, 10);

  const [accounts, todayRows, mtdRows, last30Rows] = await Promise.all([
    db
      .select({
        balanceCents: finAccounts.balanceCents,
        currency: finAccounts.currency,
        type: finAccounts.type,
      })
      .from(finAccounts)
      .where(
        and(
          eq(finAccounts.workspaceId, workspaceId),
          eq(finAccounts.archived, false),
        ),
      ),
    db
      .select({
        usd: finTransactions.usdAmountCents,
        amount: finTransactions.amountCents,
      })
      .from(finTransactions)
      .where(
        and(
          eq(finTransactions.workspaceId, workspaceId),
          eq(finTransactions.postedDate, today),
        ),
      ),
    db
      .select({
        usd: finTransactions.usdAmountCents,
        amount: finTransactions.amountCents,
      })
      .from(finTransactions)
      .where(
        and(
          eq(finTransactions.workspaceId, workspaceId),
          gte(finTransactions.postedDate, monthStartISO),
        ),
      ),
    db
      .select({
        usd: finTransactions.usdAmountCents,
        amount: finTransactions.amountCents,
      })
      .from(finTransactions)
      .where(
        and(
          eq(finTransactions.workspaceId, workspaceId),
          gte(finTransactions.postedDate, thirtyDaysAgoISO),
        ),
      ),
  ]);

  // Cash = sum of positive-balance accounts (exclude loans/credit-card debt)
  const byCurrency = new Map<string, number>();
  let cashUsdCents = 0;
  for (const a of accounts) {
    // Credit card balances are typically negative (debt) or positive (overpayment).
    // We include them as-is so total reflects net liquid position.
    const cur = a.currency;
    byCurrency.set(cur, (byCurrency.get(cur) ?? 0) + a.balanceCents);
    if (cur === "USD") cashUsdCents += a.balanceCents;
  }

  // Sum txn USD values; positive=inflow, negative=outflow
  const sumUsdSigned = (rows: Array<{ usd: number | null; amount: number }>) =>
    rows.reduce(
      (acc, r) => acc + (r.usd ?? (r.amount /* fallback if no FX */)),
      0,
    );

  const todaySum = sumUsdSigned(todayRows);
  const mtdSum = sumUsdSigned(mtdRows);
  const last30Sum = sumUsdSigned(last30Rows);

  // Burn = negative txn sum * -1 (so positive number means burning that much)
  const burnTodayUsdCents = Math.max(0, -todaySum);
  const burnMTDUsdCents = Math.max(0, -mtdSum);
  const burn30dUsdCents = Math.max(0, -last30Sum);

  // Inflow MTD = positive part of mtd
  const inflowMTDUsdCents = mtdRows
    .filter((r) => (r.usd ?? r.amount) > 0)
    .reduce((acc, r) => acc + (r.usd ?? r.amount), 0);

  // Project monthly burn from rolling 30-day data
  const monthlyBurnRunRateUsdCents = burn30dUsdCents;
  const runwayMonths =
    monthlyBurnRunRateUsdCents > 0
      ? cashUsdCents / monthlyBurnRunRateUsdCents
      : null;

  return {
    cashUsdCents,
    cashByCurrency: Array.from(byCurrency.entries())
      .map(([currency, cents]) => ({ currency, cents }))
      .sort((a, b) => b.cents - a.cents),
    burnTodayUsdCents,
    burn30dUsdCents,
    burnMTDUsdCents,
    inflowMTDUsdCents,
    monthlyBurnRunRateUsdCents,
    runwayMonths: runwayMonths !== null ? Math.round(runwayMonths * 10) / 10 : null,
    accountCount: accounts.length,
  };
}

/* ─── Category breakdown (MTD) ─────────────────────────────────────────── */

export type CategoryBreakdownRow = {
  categoryId: string | null;
  categoryName: string;
  categoryColor: string | null;
  usdCents: number; // positive value of spend
  txnCount: number;
};

export async function categoryBreakdownMTD(
  workspaceId: string,
): Promise<CategoryBreakdownRow[]> {
  const monthStart = new Date();
  monthStart.setDate(1);
  monthStart.setHours(0, 0, 0, 0);
  const monthStartISO = monthStart.toISOString().slice(0, 10);

  const rows = await db
    .select({
      categoryId: finTransactions.categoryId,
      categoryName: finCategories.name,
      categoryColor: finCategories.color,
      sumUsd: sql<number>`COALESCE(SUM(${finTransactions.usdAmountCents})::int, 0)`,
      count: sql<number>`COUNT(*)::int`,
    })
    .from(finTransactions)
    .leftJoin(finCategories, eq(finCategories.id, finTransactions.categoryId))
    .where(
      and(
        eq(finTransactions.workspaceId, workspaceId),
        gte(finTransactions.postedDate, monthStartISO),
        sql`${finTransactions.usdAmountCents} < 0`, // expenses only
      ),
    )
    .groupBy(
      finTransactions.categoryId,
      finCategories.name,
      finCategories.color,
    );

  return rows
    .map((r) => ({
      categoryId: r.categoryId,
      categoryName: r.categoryName ?? "Uncategorized",
      categoryColor: r.categoryColor ?? "#A8A8A4",
      usdCents: Math.abs(r.sumUsd),
      txnCount: r.count,
    }))
    .sort((a, b) => b.usdCents - a.usdCents);
}

/* ─── Renewals coming up ───────────────────────────────────────────────── */

export type UpcomingRenewal = SubscriptionRow & { daysUntil: number };

export async function upcomingRenewals(
  workspaceId: string,
  withinDays = 30,
): Promise<UpcomingRenewal[]> {
  const today = new Date();
  const todayISO = today.toISOString().slice(0, 10);
  const cutoff = new Date(today);
  cutoff.setDate(cutoff.getDate() + withinDays);
  const cutoffISO = cutoff.toISOString().slice(0, 10);

  const rows = await db
    .select({
      sub: finSubscriptions,
      vendorName: finVendors.name,
      ownerName: users.displayName,
      projectTitle: projects.title,
    })
    .from(finSubscriptions)
    .innerJoin(finVendors, eq(finVendors.id, finSubscriptions.vendorId))
    .leftJoin(users, eq(users.id, finSubscriptions.ownerUserId))
    .leftJoin(projects, eq(projects.id, finSubscriptions.projectId))
    .where(
      and(
        eq(finSubscriptions.workspaceId, workspaceId),
        eq(finSubscriptions.status, "active"),
        sql`${finSubscriptions.nextRenewalDate} >= ${todayISO}`,
        sql`${finSubscriptions.nextRenewalDate} <= ${cutoffISO}`,
      ),
    )
    .orderBy(finSubscriptions.nextRenewalDate);

  return rows.map((r) => ({
    ...r.sub,
    vendorName: r.vendorName,
    ownerName: r.ownerName,
    projectTitle: r.projectTitle,
    daysUntil: r.sub.nextRenewalDate
      ? Math.max(
          0,
          Math.ceil(
            (new Date(r.sub.nextRenewalDate).getTime() - today.getTime()) /
              86_400_000,
          ),
        )
      : 0,
  }));
}

/* ─── Tech stack table — top vendors by current + prior month spend ─────── */

export type TechVendorRow = {
  vendorId: string;
  vendorName: string;
  currentMonthUsdCents: number;
  prevMonthUsdCents: number;
  txnCount: number;
};

export type TechSpendSummary = {
  todayUsdCents: number;
  monthToDateUsdCents: number;
  categoryCount: number;
};

export async function techSpendSummary(
  workspaceId: string,
): Promise<TechSpendSummary> {
  const today = new Date().toISOString().slice(0, 10);
  const monthStart = new Date();
  monthStart.setDate(1);
  monthStart.setHours(0, 0, 0, 0);
  const monthStartISO = monthStart.toISOString().slice(0, 10);

  const categories = await db
    .select({ id: finCategories.id, name: finCategories.name })
    .from(finCategories)
    .where(
      and(
        eq(finCategories.workspaceId, workspaceId),
        or(eq(finCategories.name, "AI & Compute"), eq(finCategories.name, "Tech & SaaS")),
      ),
    );

  const categoryIds = categories.map((c) => c.id);
  if (categoryIds.length === 0) {
    return { todayUsdCents: 0, monthToDateUsdCents: 0, categoryCount: 0 };
  }

  const [todayRows, monthRows] = await Promise.all([
    db
      .select({ usd: sql<number>`COALESCE(SUM(${finTransactions.usdAmountCents}), 0)` })
      .from(finTransactions)
      .where(
        and(
          eq(finTransactions.workspaceId, workspaceId),
          inArray(finTransactions.categoryId, categoryIds),
          eq(finTransactions.postedDate, today),
          sql`${finTransactions.usdAmountCents} < 0`,
        ),
      ),
    db
      .select({ usd: sql<number>`COALESCE(SUM(${finTransactions.usdAmountCents}), 0)` })
      .from(finTransactions)
      .where(
        and(
          eq(finTransactions.workspaceId, workspaceId),
          inArray(finTransactions.categoryId, categoryIds),
          gte(finTransactions.postedDate, monthStartISO),
          sql`${finTransactions.usdAmountCents} < 0`,
        ),
      ),
  ]);

  return {
    todayUsdCents: Math.abs(Number(todayRows[0]?.usd) || 0),
    monthToDateUsdCents: Math.abs(Number(monthRows[0]?.usd) || 0),
    categoryCount: categories.length,
  };
}

export async function techStackTable(
  workspaceId: string,
): Promise<TechVendorRow[]> {
  const monthStart = new Date();
  monthStart.setDate(1);
  monthStart.setHours(0, 0, 0, 0);
  const prevMonthStart = new Date(monthStart);
  prevMonthStart.setMonth(prevMonthStart.getMonth() - 1);

  const monthStartISO = monthStart.toISOString().slice(0, 10);
  const prevMonthStartISO = prevMonthStart.toISOString().slice(0, 10);

  const rows = await db
    .select({
      vendorId: finTransactions.vendorId,
      vendorName: finVendors.name,
      postedDate: finTransactions.postedDate,
      sumUsd: finTransactions.usdAmountCents,
    })
    .from(finTransactions)
    .innerJoin(finVendors, eq(finVendors.id, finTransactions.vendorId))
    .where(
      and(
        eq(finTransactions.workspaceId, workspaceId),
        gte(finTransactions.postedDate, prevMonthStartISO),
        sql`${finTransactions.usdAmountCents} < 0`,
      ),
    );

  const grouped = new Map<
    string,
    {
      vendorName: string;
      currentMonth: number;
      prevMonth: number;
      txnCount: number;
    }
  >();

  for (const r of rows) {
    if (!r.vendorId) continue;
    const isThisMonth = (r.postedDate as string) >= monthStartISO;
    const existing = grouped.get(r.vendorId) ?? {
      vendorName: r.vendorName,
      currentMonth: 0,
      prevMonth: 0,
      txnCount: 0,
    };
    const abs = Math.abs(r.sumUsd ?? 0);
    if (isThisMonth) existing.currentMonth += abs;
    else existing.prevMonth += abs;
    existing.txnCount += 1;
    grouped.set(r.vendorId, existing);
  }

  return Array.from(grouped.entries())
    .map(([vendorId, g]) => ({
      vendorId,
      vendorName: g.vendorName,
      currentMonthUsdCents: g.currentMonth,
      prevMonthUsdCents: g.prevMonth,
      txnCount: g.txnCount,
    }))
    .sort(
      (a, b) =>
        b.currentMonthUsdCents +
        b.prevMonthUsdCents -
        (a.currentMonthUsdCents + a.prevMonthUsdCents),
    );
}
