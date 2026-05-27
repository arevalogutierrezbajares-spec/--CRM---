import { requireUser } from "@/lib/current-user";
import { TopBar } from "@/components/layout/top-bar";
import { TreasuryNav } from "@/components/treasury/treasury-nav";
import { Button } from "@/components/ui/button";
import { DbBanner } from "@/components/db-banner";
import { DashBadge } from "@/components/dashboard/shared/badge";
import { formatMoney } from "@/lib/fx";
import {
  listSubscriptions,
  listVendors,
  type SubscriptionRow,
} from "@/db/queries/treasury";
import { listProjects } from "@/db/queries/projects";
import { safeRead } from "@/lib/db-status";
import { cancelSubscription, createSubscription } from "../actions";

const CYCLE_LABEL: Record<string, string> = {
  monthly: "/mo",
  yearly: "/yr",
  weekly: "/wk",
  usage: "usage",
  one_off: "one-off",
};

const STATUS_TONE: Record<string, "green" | "amber" | "red" | "neutral"> = {
  active: "green",
  paused: "amber",
  cancelled: "red",
  trialing: "blue" as never,
};

function shortDate(iso: string | null): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    year: "2-digit",
  });
}

export default async function TreasurySubscriptionsPage() {
  const user = await requireUser();
  const [subsRes, vendorsRes, projsRes] = await Promise.all([
    safeRead<SubscriptionRow[]>(() => listSubscriptions(user.workspaceId), []),
    safeRead(() => listVendors(user.workspaceId), []),
    safeRead(
      () => listProjects({ workspaceId: user.workspaceId, status: "active" }),
      [],
    ),
  ]);

  const totalMonthly = subsRes.data
    .filter((s) => s.status === "active" && s.cycle === "monthly")
    .reduce((sum, s) => sum + s.priceCents, 0);
  const totalYearly = subsRes.data
    .filter((s) => s.status === "active" && s.cycle === "yearly")
    .reduce((sum, s) => sum + s.priceCents, 0);
  const monthlyEquivalent = totalMonthly + Math.round(totalYearly / 12);

  return (
    <>
      <TopBar email={user.email} displayName={user.displayName} />
      <main className="mx-auto w-full max-w-5xl flex-1 px-6 py-6 space-y-4">
        <header>
          <h1 className="text-[22px] font-medium tracking-tight">Treasury</h1>
          <p className="text-[13px] text-text-secondary">
            Active subscriptions and renewal dates. ~{formatMoney(monthlyEquivalent, "USD")}/mo committed.
          </p>
        </header>

        <TreasuryNav />

        {!subsRes.ok && (
          <DbBanner error={(subsRes as { error?: string }).error ?? ""} />
        )}

        <section
          className="rounded-lg border bg-card p-4"
          style={{ borderColor: "var(--border-default)" }}
        >
          <h2 className="text-[13px] font-medium text-text-primary mb-3">
            Add subscription
          </h2>
          {vendorsRes.data.length === 0 ? (
            <p className="text-[12px] text-text-secondary">
              Add a vendor first on the Vendors tab.
            </p>
          ) : (
            <form action={createSubscription} className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              <label className="space-y-1 col-span-2 sm:col-span-1">
                <span className="text-tiny text-text-secondary font-medium">Vendor</span>
                <select
                  name="vendorId"
                  required
                  className="w-full rounded-md border bg-card px-3 py-1.5 text-[13px]"
                >
                  {vendorsRes.data.map((v) => (
                    <option key={v.id} value={v.id}>
                      {v.name}
                    </option>
                  ))}
                </select>
              </label>
              <label className="space-y-1">
                <span className="text-tiny text-text-secondary font-medium">Plan</span>
                <input
                  name="planName"
                  placeholder="Pro / Team"
                  className="w-full rounded-md border bg-card px-3 py-1.5 text-[13px]"
                />
              </label>
              <label className="space-y-1">
                <span className="text-tiny text-text-secondary font-medium">Price</span>
                <input
                  name="price"
                  required
                  placeholder="20.00"
                  className="w-full rounded-md border bg-card px-3 py-1.5 text-[13px]"
                />
              </label>
              <label className="space-y-1">
                <span className="text-tiny text-text-secondary font-medium">Currency</span>
                <input
                  name="currency"
                  defaultValue="USD"
                  maxLength={3}
                  className="w-full rounded-md border bg-card px-3 py-1.5 text-[13px] uppercase"
                />
              </label>
              <label className="space-y-1">
                <span className="text-tiny text-text-secondary font-medium">Cycle</span>
                <select
                  name="cycle"
                  defaultValue="monthly"
                  className="w-full rounded-md border bg-card px-3 py-1.5 text-[13px]"
                >
                  <option value="monthly">Monthly</option>
                  <option value="yearly">Yearly</option>
                  <option value="weekly">Weekly</option>
                  <option value="usage">Usage-based</option>
                  <option value="one_off">One-off</option>
                </select>
              </label>
              <label className="space-y-1">
                <span className="text-tiny text-text-secondary font-medium">Next renewal</span>
                <input
                  name="nextRenewalDate"
                  type="date"
                  className="w-full rounded-md border bg-card px-3 py-1.5 text-[13px]"
                />
              </label>
              <label className="space-y-1">
                <span className="text-tiny text-text-secondary font-medium">Venture</span>
                <select
                  name="projectId"
                  defaultValue=""
                  className="w-full rounded-md border bg-card px-3 py-1.5 text-[13px]"
                >
                  <option value="">—</option>
                  {projsRes.data.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.title}
                    </option>
                  ))}
                </select>
              </label>
              <div className="col-span-2 sm:col-span-4 flex justify-end">
                <Button type="submit" size="sm">
                  Add subscription
                </Button>
              </div>
            </form>
          )}
        </section>

        <section
          className="rounded-lg border bg-card p-3"
          style={{ borderColor: "var(--border-default)" }}
        >
          <h2 className="text-[13px] font-medium text-text-primary mb-3 px-1">
            All subscriptions
          </h2>
          {subsRes.data.length === 0 ? (
            <p className="py-6 text-center text-[12px] text-text-secondary">
              No subscriptions yet.
            </p>
          ) : (
            <table className="w-full text-[12.5px]">
              <thead>
                <tr className="text-tiny text-text-tertiary uppercase tracking-wider">
                  <th className="text-left pb-2 pl-1 font-medium">Vendor</th>
                  <th className="text-left pb-2 font-medium">Plan</th>
                  <th className="text-right pb-2 font-medium">Price</th>
                  <th className="text-left pb-2 font-medium">Next renewal</th>
                  <th className="text-left pb-2 font-medium">Venture</th>
                  <th className="text-left pb-2 font-medium">Status</th>
                  <th className="pb-2 pr-1" />
                </tr>
              </thead>
              <tbody>
                {subsRes.data.map((s) => (
                  <tr
                    key={s.id}
                    className="border-t"
                    style={{ borderColor: "var(--border-default)" }}
                  >
                    <td className="py-2 pl-1 text-text-primary">{s.vendorName}</td>
                    <td className="py-2 text-text-secondary">{s.planName ?? "—"}</td>
                    <td className="py-2 text-right tabular-nums font-medium text-text-primary">
                      {formatMoney(s.priceCents, s.currency)}
                      <span className="text-tiny text-text-tertiary font-normal">
                        {" "}
                        {CYCLE_LABEL[s.cycle] ?? s.cycle}
                      </span>
                    </td>
                    <td className="py-2 text-text-secondary tabular-nums">
                      {shortDate(s.nextRenewalDate)}
                    </td>
                    <td className="py-2 text-text-secondary">{s.projectTitle ?? "—"}</td>
                    <td className="py-2">
                      <DashBadge
                        variant={
                          (STATUS_TONE[s.status] ?? "neutral") as
                            | "green"
                            | "amber"
                            | "red"
                            | "neutral"
                            | "blue"
                        }
                      >
                        {s.status}
                      </DashBadge>
                    </td>
                    <td className="py-2 pr-1 text-right">
                      {s.status === "active" && (
                        <form
                          action={async () => {
                            "use server";
                            await cancelSubscription(s.id);
                          }}
                        >
                          <button
                            type="submit"
                            className="text-tiny text-text-tertiary hover:text-red-text"
                          >
                            Cancel
                          </button>
                        </form>
                      )}
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
