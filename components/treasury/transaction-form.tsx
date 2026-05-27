"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { createTransaction } from "@/app/(app)/treasury/actions";

interface Option {
  id: string;
  name: string;
}

interface TransactionFormProps {
  accounts: Array<Option & { currency: string }>;
  categories: Option[];
  vendors: Option[];
  projects: Option[];
}

export function TransactionForm({
  accounts,
  categories,
  vendors,
  projects,
}: TransactionFormProps) {
  const [pending, setPending] = useState(false);
  const today = new Date().toISOString().slice(0, 10);

  async function handleSubmit(formData: FormData) {
    setPending(true);
    try {
      await createTransaction(formData);
      const form = document.getElementById("txn-form") as HTMLFormElement | null;
      form?.reset();
    } finally {
      setPending(false);
    }
  }

  if (accounts.length === 0) {
    return (
      <p className="text-[12px] text-text-secondary py-3">
        Add an account first.
      </p>
    );
  }

  return (
    <form id="txn-form" action={handleSubmit} className="space-y-3">
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Field label="Date">
          <input
            name="postedDate"
            type="date"
            required
            defaultValue={today}
            className={INPUT}
          />
        </Field>
        <Field label="Amount">
          <input
            name="amount"
            required
            type="text"
            inputMode="decimal"
            placeholder="0.00"
            className={INPUT}
          />
        </Field>
        <Field label="Direction">
          <select name="direction" defaultValue="expense" className={INPUT}>
            <option value="expense">Expense (−)</option>
            <option value="income">Income (+)</option>
          </select>
        </Field>
        <Field label="Account">
          <select name="accountId" required className={INPUT}>
            {accounts.map((a) => (
              <option key={a.id} value={a.id}>
                {a.name} · {a.currency}
              </option>
            ))}
          </select>
        </Field>
      </div>

      <Field label="Description">
        <input
          name="description"
          required
          placeholder="e.g. Anthropic API — May overage"
          className={INPUT}
        />
      </Field>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
        <Field label="Category (optional)">
          <select name="categoryId" defaultValue="" className={INPUT}>
            <option value="">—</option>
            {categories.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Vendor (optional)">
          <select name="vendorId" defaultValue="" className={INPUT}>
            <option value="">—</option>
            {vendors.map((v) => (
              <option key={v.id} value={v.id}>
                {v.name}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Venture / project (optional)">
          <select name="projectId" defaultValue="" className={INPUT}>
            <option value="">—</option>
            {projects.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
        </Field>
      </div>

      <div className="flex justify-end">
        <Button type="submit" size="sm" disabled={pending}>
          {pending ? "Saving…" : "Log transaction"}
        </Button>
      </div>
    </form>
  );
}

const INPUT =
  "w-full rounded-md border bg-card px-3 py-1.5 text-[13px] focus:outline-none focus:ring-2 focus:ring-ring";

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block space-y-1">
      <span className="text-tiny text-text-secondary font-medium">{label}</span>
      {children}
    </label>
  );
}
