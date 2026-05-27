"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { DashBadge } from "@/components/dashboard/shared/badge";
import { formatMoney } from "@/lib/fx";
import type { TxnRow } from "@/db/queries/treasury";
import {
  deleteTransaction,
  updateTransactionCategory,
  updateTransactionProject,
} from "@/app/(app)/treasury/actions";

interface Option {
  id: string;
  name: string;
}

interface TransactionsTableProps {
  txns: TxnRow[];
  categories: Option[];
  projects: Option[];
}

function shortDate(iso: string): string {
  return new Date(iso).toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    year: "2-digit",
  });
}

export function TransactionsTable({
  txns,
  categories,
  projects,
}: TransactionsTableProps) {
  const [pending, startTransition] = useTransition();
  const [confirmId, setConfirmId] = useState<string | null>(null);

  function handleCatChange(txnId: string, categoryId: string) {
    startTransition(async () => {
      await updateTransactionCategory(txnId, categoryId || null);
    });
  }

  function handleProjChange(txnId: string, projectId: string) {
    startTransition(async () => {
      await updateTransactionProject(txnId, projectId || null);
    });
  }

  function handleDelete(id: string) {
    if (confirmId !== id) {
      setConfirmId(id);
      setTimeout(() => setConfirmId((cur) => (cur === id ? null : cur)), 3000);
      return;
    }
    startTransition(async () => {
      await deleteTransaction(id);
      setConfirmId(null);
    });
  }

  if (txns.length === 0) {
    return (
      <p className="py-6 text-center text-[12px] text-text-secondary">
        No transactions yet — log one above or import a CSV.
      </p>
    );
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-[12.5px]">
        <thead>
          <tr className="text-tiny text-text-tertiary uppercase tracking-wider">
            <th className="text-left font-medium pb-2 pl-1">Date</th>
            <th className="text-left font-medium pb-2">Description</th>
            <th className="text-left font-medium pb-2">Account</th>
            <th className="text-left font-medium pb-2">Category</th>
            <th className="text-left font-medium pb-2">Venture</th>
            <th className="text-right font-medium pb-2">Amount</th>
            <th />
          </tr>
        </thead>
        <tbody>
          {txns.map((t) => {
            const isExpense = t.amountCents < 0;
            return (
              <tr
                key={t.id}
                className="border-t hover:bg-surface/50 transition-colors"
                style={{ borderColor: "var(--border-default)" }}
              >
                <td className="py-2 pl-1 text-text-secondary tabular-nums whitespace-nowrap">
                  {shortDate(t.postedDate)}
                </td>
                <td className="py-2">
                  <div className="text-text-primary truncate max-w-xs" title={t.description}>
                    {t.description}
                  </div>
                  {t.vendorName && (
                    <div className="text-tiny text-text-tertiary">{t.vendorName}</div>
                  )}
                </td>
                <td className="py-2 text-text-secondary">
                  <DashBadge variant="neutral">{t.accountName ?? "—"}</DashBadge>
                </td>
                <td className="py-2">
                  <select
                    value={t.categoryId ?? ""}
                    onChange={(e) => handleCatChange(t.id, e.target.value)}
                    disabled={pending}
                    className="rounded border bg-card px-1.5 py-0.5 text-tiny max-w-[140px]"
                  >
                    <option value="">—</option>
                    {categories.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.name}
                      </option>
                    ))}
                  </select>
                </td>
                <td className="py-2">
                  <select
                    value={t.projectId ?? ""}
                    onChange={(e) => handleProjChange(t.id, e.target.value)}
                    disabled={pending}
                    className="rounded border bg-card px-1.5 py-0.5 text-tiny max-w-[140px]"
                  >
                    <option value="">—</option>
                    {projects.map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.name}
                      </option>
                    ))}
                  </select>
                </td>
                <td
                  className={`py-2 text-right tabular-nums font-medium whitespace-nowrap ${
                    isExpense ? "text-red-text" : "text-green-text"
                  }`}
                >
                  {isExpense ? "" : "+"}
                  {formatMoney(t.amountCents, t.currency)}
                  {t.currency !== "USD" && t.usdAmountCents !== null && (
                    <div className="text-tiny text-text-tertiary font-normal">
                      ≈ {formatMoney(t.usdAmountCents, "USD")}
                    </div>
                  )}
                </td>
                <td className="py-2 pr-1 text-right">
                  <button
                    type="button"
                    onClick={() => handleDelete(t.id)}
                    disabled={pending}
                    title={confirmId === t.id ? "Click again to confirm" : "Delete"}
                    className={`grid h-6 w-6 place-items-center rounded transition-colors ${
                      confirmId === t.id
                        ? "bg-red-bg text-red-text"
                        : "text-text-tertiary hover:bg-surface hover:text-text-primary"
                    }`}
                  >
                    <X size={12} />
                  </button>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
