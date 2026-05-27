import Link from "next/link";
import { Plus } from "lucide-react";
import { requireUser } from "@/lib/current-user";
import { TopBar } from "@/components/layout/top-bar";
import { Button } from "@/components/ui/button";
import { DbBanner } from "@/components/db-banner";
import { TreasuryNav } from "@/components/treasury/treasury-nav";
import { CashPositionCard } from "@/components/treasury/cash-position-card";
import { BurnRunwayCard } from "@/components/treasury/burn-runway-card";
import { CategoryBreakdownCard } from "@/components/treasury/category-breakdown-card";
import { RenewalsCard } from "@/components/treasury/renewals-card";
import { TechStackTable } from "@/components/treasury/tech-stack-table";
import { TransactionsTable } from "@/components/treasury/transactions-table";
import { FxRateForm } from "@/components/treasury/fx-rate-form";
import { safeRead } from "@/lib/db-status";
import {
  categoryBreakdownMTD,
  listCategories,
  listTransactions,
  seedDefaultCategories,
  techStackTable,
  treasurySnapshot,
  upcomingRenewals,
  type CategoryBreakdownRow,
  type TechVendorRow,
  type TreasurySnapshot,
  type TxnRow,
  type UpcomingRenewal,
} from "@/db/queries/treasury";
import { listProjects } from "@/db/queries/projects";

const EMPTY_SNAPSHOT: TreasurySnapshot = {
  cashUsdCents: 0,
  cashByCurrency: [],
  burnTodayUsdCents: 0,
  burn30dUsdCents: 0,
  burnMTDUsdCents: 0,
  inflowMTDUsdCents: 0,
  monthlyBurnRunRateUsdCents: 0,
  runwayMonths: null,
  accountCount: 0,
};

export default async function TreasuryOverviewPage() {
  const user = await requireUser();

  // Seed default categories on first visit (idempotent)
  try {
    await seedDefaultCategories(user.workspaceId);
  } catch {
    /* ignore — page still renders */
  }

  const [snapRes, breakdownRes, renewalsRes, techRes, txnsRes, catsRes, projsRes] =
    await Promise.all([
      safeRead<TreasurySnapshot>(
        () => treasurySnapshot(user.workspaceId),
        EMPTY_SNAPSHOT,
      ),
      safeRead<CategoryBreakdownRow[]>(
        () => categoryBreakdownMTD(user.workspaceId),
        [],
      ),
      safeRead<UpcomingRenewal[]>(() => upcomingRenewals(user.workspaceId), []),
      safeRead<TechVendorRow[]>(() => techStackTable(user.workspaceId), []),
      safeRead<TxnRow[]>(
        () => listTransactions({ workspaceId: user.workspaceId, limit: 12 }),
        [],
      ),
      safeRead(() => listCategories(user.workspaceId), []),
      safeRead(
        () => listProjects({ workspaceId: user.workspaceId, status: "active" }),
        [],
      ),
    ]);

  return (
    <>
      <TopBar
        email={user.email}
        displayName={user.displayName}
        action={
          <Button asChild size="sm">
            <Link href="/treasury/transactions">
              <Plus className="h-4 w-4" /> New transaction
            </Link>
          </Button>
        }
      />
      <main className="mx-auto w-full max-w-7xl flex-1 px-6 py-6 space-y-4">
        <header>
          <h1 className="text-[22px] font-medium tracking-tight">Treasury</h1>
          <p className="text-[13px] text-text-secondary">
            Cash position, burn, and where money goes — across your ventures.
          </p>
        </header>

        <TreasuryNav />

        {!snapRes.ok && (
          <DbBanner
            error={(snapRes as { error?: string }).error ?? "Database error"}
          />
        )}

        {/* Zone 1: snapshot row */}
        <div className="grid gap-2.5 lg:grid-cols-3">
          <CashPositionCard
            cashUsdCents={snapRes.data.cashUsdCents}
            cashByCurrency={snapRes.data.cashByCurrency}
          />
          <BurnRunwayCard
            burn30dUsdCents={snapRes.data.burn30dUsdCents}
            burnMTDUsdCents={snapRes.data.burnMTDUsdCents}
            runwayMonths={snapRes.data.runwayMonths}
          />
          <RenewalsCard renewals={renewalsRes.data} />
        </div>

        {/* Zone 2: spending breakdown + tech stack */}
        <div className="grid gap-2.5 lg:grid-cols-2">
          <CategoryBreakdownCard rows={breakdownRes.data} />
          <TechStackTable rows={techRes.data} />
        </div>

        {/* Zone 3: recent transactions */}
        <section
          className="rounded-lg border bg-card p-3"
          style={{ borderColor: "var(--border-default)" }}
        >
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-[13px] font-medium text-text-primary">
              Recent transactions
            </h2>
            <Link
              href="/treasury/transactions"
              className="text-tiny text-text-secondary hover:text-text-primary"
            >
              See all
            </Link>
          </div>
          <TransactionsTable
            txns={txnsRes.data}
            categories={catsRes.data.map((c) => ({ id: c.id, name: c.name }))}
            projects={projsRes.data.map((p) => ({ id: p.id, name: p.title }))}
          />
        </section>

        {/* Zone 4: FX rates (collapsed footer) */}
        <details
          className="rounded-lg border bg-card p-3"
          style={{ borderColor: "var(--border-default)" }}
        >
          <summary className="cursor-pointer text-[12px] text-text-secondary">
            FX rates (manual override)
          </summary>
          <div className="mt-3">
            <p className="text-tiny text-text-tertiary mb-2">
              Set USD-per-unit rates for any non-USD currency you use. These convert your transactions to USD for the cash/burn/runway numbers above. USD is always 1:1.
            </p>
            <FxRateForm />
          </div>
        </details>
      </main>
    </>
  );
}
