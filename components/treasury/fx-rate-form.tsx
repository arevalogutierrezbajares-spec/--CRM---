"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { upsertFxRate } from "@/app/(app)/treasury/actions";

export function FxRateForm() {
  const [pending, setPending] = useState(false);

  async function handleSubmit(formData: FormData) {
    setPending(true);
    try {
      await upsertFxRate(formData);
      const form = document.getElementById("fx-form") as HTMLFormElement | null;
      form?.reset();
    } finally {
      setPending(false);
    }
  }

  return (
    <form id="fx-form" action={handleSubmit} className="flex flex-wrap items-end gap-2">
      <label className="block space-y-1">
        <span className="text-tiny text-text-secondary font-medium">Currency</span>
        <input
          name="currency"
          placeholder="VES"
          maxLength={3}
          required
          className="w-20 rounded-md border bg-card px-3 py-1.5 text-[13px] uppercase"
        />
      </label>
      <label className="block space-y-1 flex-1">
        <span className="text-tiny text-text-secondary font-medium">
          USD per 1 unit (e.g. 0.000028 for VES, 1.08 for EUR)
        </span>
        <input
          name="usdPerUnit"
          type="text"
          inputMode="decimal"
          placeholder="0.000028"
          required
          className="w-full rounded-md border bg-card px-3 py-1.5 text-[13px]"
        />
      </label>
      <Button type="submit" size="sm" disabled={pending}>
        {pending ? "Saving…" : "Set rate"}
      </Button>
    </form>
  );
}
