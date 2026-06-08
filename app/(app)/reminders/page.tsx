import { requireUser } from "@/lib/current-user";
import { TopBar } from "@/components/layout/top-bar";
import { DbBanner } from "@/components/db-banner";
import { safeRead } from "@/lib/db-status";
import {
  listSharedReminders,
  type SharedReminderItem,
} from "@/db/queries/shared-reminders";
import { listTags } from "@/db/queries/tags";
import { listContacts } from "@/db/queries/contacts";
import { RemindersBoard } from "@/components/reminders/reminders-board";

export default async function RemindersPage() {
  const user = await requireUser();

  const [remindersRes, tagsRes, contactsRes] = await Promise.all([
    safeRead<SharedReminderItem[]>(() => listSharedReminders(user.workspaceId), []),
    safeRead(() => listTags(), []),
    safeRead(() => listContacts({ workspaceId: user.workspaceId }), []),
  ]);

  return (
    <>
      <TopBar email={user.email} displayName={user.displayName} />
      <main className="mx-auto w-full max-w-4xl flex-1 px-6 py-6 space-y-4">
        <div>
          <h1 className="text-[22px] font-medium tracking-tight text-text-primary">
            Reminders
          </h1>
          <p className="text-[13px] text-text-secondary">
            A shared bulletin for the whole team — tag reminders and connect them to people.
          </p>
        </div>

        {!remindersRes.ok ? (
          <DbBanner error={(remindersRes as { error?: string }).error ?? ""} />
        ) : (
          <RemindersBoard
            reminders={remindersRes.data}
            allTags={tagsRes.data.map((t) => ({ id: t.id, name: t.name, color: t.color }))}
            contacts={contactsRes.data.map((c) => ({ id: c.id, name: c.name }))}
          />
        )}
      </main>
    </>
  );
}
