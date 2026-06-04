import { requireUser } from "@/lib/current-user";
import { TopBar } from "@/components/layout/top-bar";
import { DbBanner } from "@/components/db-banner";
import { safeRead } from "@/lib/db-status";
import { getInboxAction } from "@/app/(app)/town-hall/actions";
import { InboxView } from "@/components/inbox/inbox-view";
import type { NotificationView } from "@/db/queries/town-hall";

export default async function InboxPage() {
  const user = await requireUser();
  const res = await safeRead<NotificationView[]>(() => getInboxAction(), []);

  return (
    <>
      <TopBar email={user.email} displayName={user.displayName} title="Inbox" />
      <div className="mx-auto w-full max-w-3xl px-4 py-6 sm:px-6">
        {!res.ok && <DbBanner error={res.error} />}
        <h1 className="mb-3 font-display text-[26px] leading-none text-text-primary">Inbox</h1>
        <InboxView initial={res.data} />
      </div>
    </>
  );
}
