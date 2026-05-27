import { requireUser } from "@/lib/current-user";
import { TopBar } from "@/components/layout/top-bar";
import { TreasuryNav } from "@/components/treasury/treasury-nav";
import { AccountsTable } from "@/components/treasury/accounts-table";
import { AccountForm } from "@/components/treasury/account-form";
import { listAccounts } from "@/db/queries/treasury";
import { safeRead } from "@/lib/db-status";
import { DbBanner } from "@/components/db-banner";

export default async function TreasuryAccountsPage() {
  const user = await requireUser();
  const res = await safeRead(() => listAccounts(user.workspaceId), []);

  return (
    <>
      <TopBar email={user.email} displayName={user.displayName} />
      <main className="mx-auto w-full max-w-5xl flex-1 px-6 py-6 space-y-4">
        <header>
          <h1 className="text-[22px] font-medium tracking-tight">Treasury</h1>
          <p className="text-[13px] text-text-secondary">
            Bank accounts, credit cards, cash, crypto wallets — every place money lives.
          </p>
        </header>

        <TreasuryNav />

        {!res.ok && <DbBanner error={(res as { error?: string }).error ?? ""} />}

        <section
          className="rounded-lg border bg-card p-4"
          style={{ borderColor: "var(--border-default)" }}
        >
          <h2 className="text-[13px] font-medium text-text-primary mb-3">
            Add account
          </h2>
          <AccountForm />
        </section>

        <section
          className="rounded-lg border bg-card p-3"
          style={{ borderColor: "var(--border-default)" }}
        >
          <h2 className="text-[13px] font-medium text-text-primary mb-3 px-1">
            All accounts
          </h2>
          <AccountsTable accounts={res.data} />
        </section>
      </main>
    </>
  );
}
