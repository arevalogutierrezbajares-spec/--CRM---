"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { createAccount } from "@/app/(app)/treasury/actions";

const ACCOUNT_TYPES: Array<{ value: string; label: string }> = [
  { value: "checking", label: "Checking" },
  { value: "savings", label: "Savings" },
  { value: "credit_card", label: "Credit card" },
  { value: "cash", label: "Cash" },
  { value: "crypto", label: "Crypto wallet" },
  { value: "brokerage", label: "Brokerage" },
  { value: "loan", label: "Loan" },
  { value: "other", label: "Other" },
];

export function AccountForm({ onCreated }: { onCreated?: () => void }) {
  const [pending, setPending] = useState(false);

  async function handleSubmit(formData: FormData) {
    setPending(true);
    try {
      await createAccount(formData);
      onCreated?.();
      const form = document.getElementById("account-form") as HTMLFormElement | null;
      form?.reset();
    } finally {
      setPending(false);
    }
  }

  return (
    <form id="account-form" action={handleSubmit} className="space-y-3">
      <div className="grid grid-cols-2 gap-3">
        <Field label="Name">
          <input
            name="name"
            required
            placeholder="e.g. Mercury Operating"
            className={INPUT}
          />
        </Field>
        <Field label="Type">
          <select name="type" required className={INPUT}>
            {ACCOUNT_TYPES.map((t) => (
              <option key={t.value} value={t.value}>
                {t.label}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Currency">
          <input
            name="currency"
            required
            defaultValue="USD"
            maxLength={3}
            className={`${INPUT} uppercase`}
            placeholder="USD"
          />
        </Field>
        <Field label="Opening balance">
          <input
            name="openingBalance"
            type="text"
            inputMode="decimal"
            placeholder="0.00"
            className={INPUT}
          />
        </Field>
      </div>
      <Field label="Notes (optional)">
        <input name="notes" placeholder="e.g. main USD operating account" className={INPUT} />
      </Field>
      <div className="flex justify-end">
        <Button type="submit" size="sm" disabled={pending}>
          {pending ? "Adding…" : "Add account"}
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
