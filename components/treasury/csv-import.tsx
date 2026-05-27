"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { importTransactionsCsv } from "@/app/(app)/treasury/actions";

interface Account {
  id: string;
  name: string;
  currency: string;
}

export function CsvImport({ accounts }: { accounts: Account[] }) {
  const [csv, setCsv] = useState("");
  const [accountId, setAccountId] = useState(accounts[0]?.id ?? "");
  const [pending, setPending] = useState(false);
  const [result, setResult] = useState<string | null>(null);

  async function handleFile(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0];
    if (!f) return;
    setCsv(await f.text());
  }

  async function handleImport() {
    if (!accountId || !csv) {
      setResult("Choose an account and paste/upload a CSV.");
      return;
    }
    setPending(true);
    setResult(null);
    try {
      const form = new FormData();
      form.set("accountId", accountId);
      form.set("csv", csv);
      const res = await importTransactionsCsv(form);
      setResult(`Imported ${res.imported} transactions.`);
      setCsv("");
    } catch (e) {
      setResult(e instanceof Error ? e.message : "Import failed");
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
    <div className="space-y-3">
      <div className="grid grid-cols-2 gap-3">
        <label className="block space-y-1">
          <span className="text-tiny text-text-secondary font-medium">Target account</span>
          <select
            value={accountId}
            onChange={(e) => setAccountId(e.target.value)}
            className="w-full rounded-md border bg-card px-3 py-1.5 text-[13px]"
          >
            {accounts.map((a) => (
              <option key={a.id} value={a.id}>
                {a.name} · {a.currency}
              </option>
            ))}
          </select>
        </label>
        <label className="block space-y-1">
          <span className="text-tiny text-text-secondary font-medium">Upload CSV</span>
          <input
            type="file"
            accept=".csv,text/csv"
            onChange={handleFile}
            className="w-full text-[12px]"
          />
        </label>
      </div>
      <label className="block space-y-1">
        <span className="text-tiny text-text-secondary font-medium">
          …or paste CSV (must have header row: <code>date,description,amount</code>)
        </span>
        <textarea
          value={csv}
          onChange={(e) => setCsv(e.target.value)}
          rows={6}
          placeholder={"date,description,amount\n2026-05-01,Anthropic API,-487.30\n2026-05-02,Client wire,5000.00"}
          className="w-full rounded-md border bg-card px-3 py-2 text-[12px] font-mono"
        />
      </label>
      <div className="flex items-center justify-between gap-2">
        {result && (
          <p className="text-[12px] text-text-secondary">{result}</p>
        )}
        <div className="ml-auto">
          <Button type="button" size="sm" onClick={handleImport} disabled={pending}>
            {pending ? "Importing…" : "Import"}
          </Button>
        </div>
      </div>
    </div>
  );
}
