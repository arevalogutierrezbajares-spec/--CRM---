import { requireUser } from "@/lib/current-user";
import { TopBar } from "@/components/layout/top-bar";
import { TreasuryNav } from "@/components/treasury/treasury-nav";
import { TransactionForm } from "@/components/treasury/transaction-form";
import { CsvImport } from "@/components/treasury/csv-import";
import { TransactionsTable } from "@/components/treasury/transactions-table";
import {
  listAccounts,
  listCategories,
  listTransactions,
  listVendors,
} from "@/db/queries/treasury";
import { listProjects } from "@/db/queries/projects";
import { safeRead } from "@/lib/db-status";
import { DbBanner } from "@/components/db-banner";

export default async function TreasuryTransactionsPage() {
  const user = await requireUser();

  const [accountsRes, txnsRes, catsRes, vendorsRes, projectsRes] =
    await Promise.all([
      safeRead(() => listAccounts(user.workspaceId), []),
      safeRead(
        () => listTransactions({ workspaceId: user.workspaceId, limit: 200 }),
        [],
      ),
      safeRead(() => listCategories(user.workspaceId), []),
      safeRead(() => listVendors(user.workspaceId), []),
      safeRead(
        () => listProjects({ workspaceId: user.workspaceId, status: "active" }),
        [],
      ),
    ]);

  const accountsForForm = accountsRes.data.map((a) => ({
    id: a.id,
    name: a.name,
    currency: a.currency,
  }));
  const cats = catsRes.data.map((c) => ({ id: c.id, name: c.name }));
  const vendors = vendorsRes.data.map((v) => ({ id: v.id, name: v.name }));
  const projects = projectsRes.data.map((p) => ({ id: p.id, name: p.title }));

  return (
    <>
      <TopBar email={user.email} displayName={user.displayName} />
      <main className="mx-auto w-full max-w-6xl flex-1 px-6 py-6 space-y-4">
        <header>
          <h1 className="text-[22px] font-medium tracking-tight">Treasury</h1>
          <p className="text-[13px] text-text-secondary">
            Every money in and out — log manually or import a bank CSV.
          </p>
        </header>

        <TreasuryNav />

        {!accountsRes.ok && (
          <DbBanner error={(accountsRes as { error?: string }).error ?? ""} />
        )}

        <div className="grid gap-4 lg:grid-cols-[1fr_360px]">
          <section
            className="rounded-lg border bg-card p-4"
            style={{ borderColor: "var(--border-default)" }}
          >
            <h2 className="text-[13px] font-medium text-text-primary mb-3">
              Quick log
            </h2>
            <TransactionForm
              accounts={accountsForForm}
              categories={cats}
              vendors={vendors}
              projects={projects}
            />
          </section>

          <section
            className="rounded-lg border bg-card p-4"
            style={{ borderColor: "var(--border-default)" }}
          >
            <h2 className="text-[13px] font-medium text-text-primary mb-3">
              CSV import
            </h2>
            <CsvImport accounts={accountsForForm} />
          </section>
        </div>

        <section
          className="rounded-lg border bg-card p-3"
          style={{ borderColor: "var(--border-default)" }}
        >
          <h2 className="text-[13px] font-medium text-text-primary mb-3 px-1">
            All transactions
          </h2>
          <TransactionsTable
            txns={txnsRes.data}
            categories={cats}
            projects={projects}
          />
        </section>
      </main>
    </>
  );
}
