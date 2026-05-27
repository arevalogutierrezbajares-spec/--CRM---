import { Archive } from "lucide-react";
import { DashBadge } from "@/components/dashboard/shared/badge";
import { formatMoney } from "@/lib/fx";
import { archiveAccount } from "@/app/(app)/treasury/actions";
import type { AccountRow } from "@/db/queries/treasury";

interface AccountsTableProps {
  accounts: AccountRow[];
}

const TYPE_LABEL: Record<string, string> = {
  checking: "Checking",
  savings: "Savings",
  credit_card: "Credit card",
  cash: "Cash",
  crypto: "Crypto",
  brokerage: "Brokerage",
  loan: "Loan",
  other: "Other",
};

export function AccountsTable({ accounts }: AccountsTableProps) {
  if (accounts.length === 0) {
    return (
      <p className="py-6 text-center text-[12px] text-text-secondary">
        No accounts yet. Add one above to start tracking.
      </p>
    );
  }

  return (
    <table className="w-full text-[12.5px]">
      <thead>
        <tr className="text-tiny text-text-tertiary uppercase tracking-wider">
          <th className="text-left font-medium pb-2 pl-1">Name</th>
          <th className="text-left font-medium pb-2">Type</th>
          <th className="text-left font-medium pb-2">Currency</th>
          <th className="text-right font-medium pb-2">Balance</th>
          <th />
        </tr>
      </thead>
      <tbody>
        {accounts.map((a) => {
          const negative = a.balanceCents < 0;
          return (
            <tr
              key={a.id}
              className="border-t hover:bg-surface/50 transition-colors"
              style={{ borderColor: "var(--border-default)" }}
            >
              <td className="py-2 pl-1">
                <div className="text-text-primary">{a.name}</div>
                {a.notes && (
                  <div className="text-tiny text-text-tertiary truncate max-w-xs">
                    {a.notes}
                  </div>
                )}
              </td>
              <td className="py-2">
                <DashBadge variant="neutral">
                  {TYPE_LABEL[a.type] ?? a.type}
                </DashBadge>
              </td>
              <td className="py-2 text-text-secondary">{a.currency}</td>
              <td
                className={`py-2 text-right tabular-nums font-medium ${
                  negative ? "text-red-text" : "text-text-primary"
                }`}
              >
                {formatMoney(a.balanceCents, a.currency)}
              </td>
              <td className="py-2 pr-1 text-right">
                <form
                  action={async () => {
                    "use server";
                    await archiveAccount(a.id);
                  }}
                >
                  <button
                    type="submit"
                    className="grid h-6 w-6 place-items-center rounded text-text-tertiary hover:bg-surface hover:text-text-primary"
                    aria-label="Archive"
                    title="Archive"
                  >
                    <Archive size={12} />
                  </button>
                </form>
              </td>
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}
