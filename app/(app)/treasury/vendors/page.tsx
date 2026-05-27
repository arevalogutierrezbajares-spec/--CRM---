import Link from "next/link";
import { requireUser } from "@/lib/current-user";
import { TopBar } from "@/components/layout/top-bar";
import { TreasuryNav } from "@/components/treasury/treasury-nav";
import { Button } from "@/components/ui/button";
import { DbBanner } from "@/components/db-banner";
import { DashBadge } from "@/components/dashboard/shared/badge";
import { formatMoney } from "@/lib/fx";
import {
  listCategories,
  listVendors,
  type VendorRow,
} from "@/db/queries/treasury";
import { safeRead } from "@/lib/db-status";
import { createVendor } from "../actions";

export default async function TreasuryVendorsPage() {
  const user = await requireUser();
  const [vendorsRes, catsRes] = await Promise.all([
    safeRead<VendorRow[]>(() => listVendors(user.workspaceId), []),
    safeRead(() => listCategories(user.workspaceId), []),
  ]);

  return (
    <>
      <TopBar email={user.email} displayName={user.displayName} />
      <main className="mx-auto w-full max-w-5xl flex-1 px-6 py-6 space-y-4">
        <header>
          <h1 className="text-[22px] font-medium tracking-tight">Treasury</h1>
          <p className="text-[13px] text-text-secondary">
            Who you pay. Tag transactions with vendors to enable per-vendor spend tracking.
          </p>
        </header>

        <TreasuryNav />

        {!vendorsRes.ok && (
          <DbBanner error={(vendorsRes as { error?: string }).error ?? ""} />
        )}

        <section
          className="rounded-lg border bg-card p-4"
          style={{ borderColor: "var(--border-default)" }}
        >
          <h2 className="text-[13px] font-medium text-text-primary mb-3">
            Add vendor
          </h2>
          <form action={createVendor} className="flex flex-wrap items-end gap-2">
            <label className="block space-y-1 flex-1 min-w-[180px]">
              <span className="text-tiny text-text-secondary font-medium">Name</span>
              <input
                name="name"
                required
                placeholder="e.g. Anthropic"
                className="w-full rounded-md border bg-card px-3 py-1.5 text-[13px]"
              />
            </label>
            <label className="block space-y-1 flex-1 min-w-[180px]">
              <span className="text-tiny text-text-secondary font-medium">Website</span>
              <input
                name="website"
                placeholder="https://"
                className="w-full rounded-md border bg-card px-3 py-1.5 text-[13px]"
              />
            </label>
            <label className="block space-y-1">
              <span className="text-tiny text-text-secondary font-medium">
                Default category
              </span>
              <select
                name="defaultCategoryId"
                defaultValue=""
                className="rounded-md border bg-card px-3 py-1.5 text-[13px]"
              >
                <option value="">—</option>
                {catsRes.data.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
            </label>
            <Button type="submit" size="sm">
              Add
            </Button>
          </form>
        </section>

        <section
          className="rounded-lg border bg-card p-3"
          style={{ borderColor: "var(--border-default)" }}
        >
          <h2 className="text-[13px] font-medium text-text-primary mb-3 px-1">
            All vendors
          </h2>
          {vendorsRes.data.length === 0 ? (
            <p className="py-4 text-center text-[12px] text-text-secondary">
              No vendors yet.
            </p>
          ) : (
            <table className="w-full text-[12.5px]">
              <thead>
                <tr className="text-tiny text-text-tertiary uppercase tracking-wider">
                  <th className="text-left pb-2 pl-1 font-medium">Name</th>
                  <th className="text-left pb-2 font-medium">Default category</th>
                  <th className="text-left pb-2 font-medium">CRM link</th>
                  <th className="text-right pb-2 font-medium">Total spend</th>
                  <th className="text-right pb-2 font-medium pr-1">Txns</th>
                </tr>
              </thead>
              <tbody>
                {vendorsRes.data.map((v) => (
                  <tr
                    key={v.id}
                    className="border-t"
                    style={{ borderColor: "var(--border-default)" }}
                  >
                    <td className="py-2 pl-1">
                      <div className="text-text-primary">{v.name}</div>
                      {v.website && (
                        <a
                          href={v.website}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-tiny text-text-tertiary hover:text-text-primary truncate block"
                        >
                          {v.website}
                        </a>
                      )}
                    </td>
                    <td className="py-2">
                      {v.defaultCategoryName ? (
                        <DashBadge variant="neutral">
                          {v.defaultCategoryName}
                        </DashBadge>
                      ) : (
                        <span className="text-text-tertiary">—</span>
                      )}
                    </td>
                    <td className="py-2 text-text-secondary">
                      {v.contactId ? (
                        <Link
                          href={`/contacts/${v.contactId}`}
                          className="hover:underline"
                        >
                          {v.contactName ?? "View contact"}
                        </Link>
                      ) : (
                        <span className="text-text-tertiary">—</span>
                      )}
                    </td>
                    <td className="py-2 text-right tabular-nums font-medium text-text-primary">
                      {formatMoney(v.totalSpendCents, "USD")}
                    </td>
                    <td className="py-2 pr-1 text-right tabular-nums text-text-secondary">
                      {v.txnCount}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </section>
      </main>
    </>
  );
}
