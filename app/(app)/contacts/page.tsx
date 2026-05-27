import Link from "next/link";
import { Mic, Plus } from "lucide-react";
import { requireUser } from "@/lib/current-user";
import { TopBar } from "@/components/layout/top-bar";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { DbBanner } from "@/components/db-banner";
import { ColumnHeader } from "@/components/grid/column-header";
import { FilterBar } from "@/components/grid/filter-bar";
import { SavedViews } from "@/components/grid/saved-views";
import { ExportButton } from "@/components/grid/export-button";
import {
  listContacts,
  type ContactListItem,
} from "@/db/queries/contacts";
import { listTags } from "@/db/queries/tags";
import { safeRead } from "@/lib/db-status";
import { formatRelative } from "@/lib/utils";
import { VenturePillBar } from "@/components/tags/venture-pill-bar";
import {
  parseSort,
  parseFilter,
  applySort,
  applyFilters,
  groupBy,
} from "@/lib/grid-state";

type SearchParams = Promise<{
  archived?: string;
  tag?: string;
  sort?: string;
  filter?: string;
  group?: string;
}>;

export default async function ContactsPage(props: {
  searchParams: SearchParams;
}) {
  const user = await requireUser();
  const sp = await props.searchParams;
  const archived = sp.archived === "true";
  const tag = sp.tag;
  const queryString = new URLSearchParams(
    Object.entries(sp).filter(([, v]) => v !== undefined) as [string, string][],
  );

  const [res, tagsRes] = await Promise.all([
    safeRead<ContactListItem[]>(
      () => listContacts({ workspaceId: user.workspaceId, archived, tagName: tag }),
      [],
    ),
    safeRead(() => listTags(), []),
  ]);
  const ventureTags = tagsRes.data.filter((t) => t.kind === "venture");

  const sort = parseSort(sp.sort);
  const filters = parseFilter(sp.filter);
  const group = sp.group;

  const filtered = applyFilters<ContactListItem>(res.data, filters, {
    relationship: (r, v) => r.relationshipType === v,
    type: (r, v) => r.type === v,
    org: (r, v) =>
      (r.organization ?? "").toLowerCase().includes(v.toLowerCase()),
  });
  const sorted = applySort<ContactListItem>(filtered, sort, {
    name: (r) => r.name.toLowerCase(),
    relationship: (r) => r.relationshipType,
    organization: (r) => (r.organization ?? "").toLowerCase(),
    lastTouch: (r) => r.lastTouchAt ?? null,
    updated: (r) => r.updatedAt,
  });
  const grouped = groupBy<ContactListItem>(sorted, group, (r) => {
    if (group === "relationship") return r.relationshipType;
    if (group === "type") return r.type;
    if (group === "org") return r.organization ?? "—";
    return "";
  });

  const filterOptions = [
    {
      col: "relationship",
      label: "Relationship",
      values: [
        { value: "friend", label: "Friend" },
        { value: "lead", label: "Lead" },
        { value: "partner", label: "Partner" },
        { value: "prospect", label: "Prospect" },
      ],
    },
    {
      col: "type",
      label: "Type",
      values: [
        { value: "person", label: "Person" },
        { value: "org", label: "Org" },
      ],
    },
  ];

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
              {archived
                ? "Archived contacts."
                : "People + orgs in your network."}
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

        <div className="mb-4 space-y-3">
          <VenturePillBar tags={ventureTags} />
          <div className="flex items-end justify-between gap-3">
            <FilterBar
              options={filterOptions}
              groupOptions={[
                { value: "relationship", label: "Relationship" },
                { value: "type", label: "Type" },
                { value: "org", label: "Organization" },
              ]}
            />
            <div className="flex items-center gap-2">
              <ExportButton endpoint="/api/export/contacts" />
              <SavedViews namespace="contacts" />
            </div>
          </div>
        </div>

        {!res.ok && <DbBanner error={res.error} />}

        {sorted.length === 0 ? (
          <Card className="grid place-items-center px-6 py-10 text-center">
            <div className="space-y-3">
              <p className="text-sm font-medium">
                {res.data.length === 0
                  ? archived
                    ? "No archived contacts."
                    : "No contacts yet."
                  : "No contacts match these filters."}
              </p>
              {res.data.length === 0 && !archived && (
                <div className="flex justify-center gap-2">
                  <Button asChild size="sm">
                    <Link href="/contacts/new">
                      <Plus className="h-4 w-4" /> New contact
                    </Link>
                  </Button>
                  <Button asChild size="sm" variant="outline">
                    <Link href="/contacts/quick">
                      <Mic className="h-4 w-4" /> 30-sec
                    </Link>
                  </Button>
                </div>
              )}
            </div>
          </Card>
        ) : (
          <Card className="overflow-hidden">
            <div className="overflow-x-auto">
              <table className="min-w-full text-sm">
                <thead className="border-b border-[var(--border)] bg-[var(--muted)]/30 text-left">
                  <tr>
                    <ColumnHeader
                      label="Name"
                      col="name"
                      basePath="/contacts"
                      searchParams={queryString}
                    />
                    <ColumnHeader
                      label="Relationship"
                      col="relationship"
                      basePath="/contacts"
                      searchParams={queryString}
                    />
                    <ColumnHeader
                      label="Organization"
                      col="organization"
                      basePath="/contacts"
                      searchParams={queryString}
                    />
                    <ColumnHeader
                      label="Tags"
                      col="tags"
                      basePath="/contacts"
                      searchParams={queryString}
                      sortable={false}
                    />
                    <ColumnHeader
                      label="Last touch"
                      col="lastTouch"
                      basePath="/contacts"
                      searchParams={queryString}
                    />
                  </tr>
                </thead>
                <tbody className="divide-y divide-[var(--border)]">
                  {[...grouped.entries()].map(([groupKey, items]) => (
                    <ContactGroup
                      key={groupKey || "_all"}
                      groupKey={groupKey}
                      group={group}
                      items={items}
                    />
                  ))}
                </tbody>
              </table>
            </div>
            <div className="border-t border-[var(--border)] px-4 py-2 text-xs text-[var(--muted-foreground)]">
              {sorted.length} contact{sorted.length === 1 ? "" : "s"}
              {Object.keys(filters).length > 0 && ` · filtered from ${res.data.length}`}
            </div>
          </Card>
        )}
      </main>
    </>
  );
}

function ContactGroup({
  groupKey,
  group,
  items,
}: {
  groupKey: string;
  group: string | undefined;
  items: ContactListItem[];
}) {
  return (
    <>
      {group && (
        <tr className="bg-[var(--muted)]/15">
          <td
            colSpan={5}
            className="px-4 py-1.5 text-xs uppercase tracking-wide text-[var(--muted-foreground)]"
          >
            {groupKey}{" "}
            <span className="text-[var(--muted-foreground)]/70">
              · {items.length}
            </span>
          </td>
        </tr>
      )}
      {items.map((c) => (
        <tr
          key={c.id}
          className="transition-colors hover:bg-[var(--muted)]/30"
        >
          <td className="px-4 py-3">
            <Link
              href={`/contacts/${c.id}`}
              className="font-medium hover:underline"
            >
              {c.name}
            </Link>
            {c.organization && (
              <div className="text-xs text-[var(--muted-foreground)]">
                {c.organization}
              </div>
            )}
          </td>
          <td className="px-4 py-3">
            <Badge variant="outline">{c.relationshipType}</Badge>
          </td>
          <td className="px-4 py-3 text-[var(--muted-foreground)]">
            {c.organization ?? "—"}
          </td>
          <td className="px-4 py-3">
            <div className="flex flex-wrap gap-1">
              {c.tags.map((t) => (
                <Badge key={t.id} variant="secondary">
                  {t.name}
                </Badge>
              ))}
            </div>
          </td>
          <td className="px-4 py-3 text-[var(--muted-foreground)]">
            {formatRelative(c.lastTouchAt)}
          </td>
        </tr>
      ))}
    </>
  );
}
