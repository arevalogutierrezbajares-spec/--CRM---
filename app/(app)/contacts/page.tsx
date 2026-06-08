import Link from "next/link";
import { Suspense } from "react";
import { Mic, Plus } from "lucide-react";
import { requireUser } from "@/lib/current-user";
import { TopBar } from "@/components/layout/top-bar";
import { Button } from "@/components/ui/button";
import { DbBanner } from "@/components/db-banner";
import { ContactsGrid } from "@/components/contacts/contacts-grid";
import {
  listContactProjectOptions,
  listContacts,
  type ContactListItem,
  type ContactLeadMode,
  type ContactProjectOption,
} from "@/db/queries/contacts";
import { listTags } from "@/db/queries/tags";
import { safeRead } from "@/lib/db-status";

type SearchParams = Promise<{ archived?: string; project?: string; leadView?: string }>;

function parseLeadMode(value: string | undefined): ContactLeadMode {
  if (value === "leads" || value === "all") return value;
  return "direct";
}

export default async function ContactsPage(props: {
  searchParams: SearchParams;
}) {
  const user = await requireUser();
  const sp = await props.searchParams;
  const archived = sp.archived === "true";
  const projectId = sp.project || undefined;
  const leadMode = parseLeadMode(sp.leadView);

  const [res, tagsRes, projectOptionsRes] = await Promise.all([
    safeRead<ContactListItem[]>(
      () => listContacts({ workspaceId: user.workspaceId, archived, projectId, leadMode }),
      [],
    ),
    safeRead(() => listTags(), []),
    safeRead<ContactProjectOption[]>(
      () => listContactProjectOptions({ workspaceId: user.workspaceId, archived }),
      [],
    ),
  ]);

  const ventureTags = tagsRes.data.filter((t) => t.kind === "venture");
  const selectedProject = projectId
    ? projectOptionsRes.data.find((p) => p.id === projectId)
    : undefined;

  return (
    <>
      <TopBar
        email={user.email}
        displayName={user.displayName}
        action={
          <div className="flex items-center gap-2">
            <Button asChild size="sm" variant="outline">
              <Link href="/contacts/quick">
                <Mic className="h-4 w-4" /> 30-sec
              </Link>
            </Button>
            <Button asChild size="sm">
              <Link href="/contacts/new">
                <Plus className="h-4 w-4" /> New contact
              </Link>
            </Button>
          </div>
        }
      />
      <main className="mx-auto w-full max-w-6xl flex-1 px-6 py-8">
        <header className="mb-6 flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight">Contacts</h1>
            <p className="text-sm text-[var(--muted-foreground)]">
              {selectedProject
                ? leadMode === "leads"
                  ? `${selectedProject.title} LinkedIn leads.`
                  : `${selectedProject.title} project contacts.`
                : archived
                  ? "Archived contacts."
                  : leadMode === "leads"
                    ? "LinkedIn leads saved for follow-up."
                    : leadMode === "all"
                      ? "Direct contacts and LinkedIn leads."
                      : "Direct contacts in your network."}
            </p>
          </div>
          <div className="flex gap-2 text-sm">
            <Link
              href="/contacts"
              className={
                archived
                  ? "text-[var(--muted-foreground)] hover:text-[var(--foreground)]"
                  : "font-medium"
              }
            >
              Active
            </Link>
            <span className="text-[var(--muted-foreground)]">·</span>
            <Link
              href="/contacts?archived=true"
              className={
                archived
                  ? "font-medium"
                  : "text-[var(--muted-foreground)] hover:text-[var(--foreground)]"
              }
            >
              Archived
            </Link>
          </div>
        </header>

        {!res.ok && <DbBanner error={res.error} />}
        {res.ok && !projectOptionsRes.ok && <DbBanner error={projectOptionsRes.error} />}

        <Suspense fallback={<div className="text-sm text-[var(--muted-foreground)]">Loading…</div>}>
          <ContactsGrid
            initialContacts={res.data}
            ventureTags={ventureTags}
            allTags={tagsRes.data}
            projectOptions={projectOptionsRes.data}
            archived={archived}
          />
        </Suspense>
      </main>
    </>
  );
}
