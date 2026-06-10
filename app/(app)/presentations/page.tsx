import Link from "next/link";
import { Plus, Presentation as PresentationIcon, Share2 } from "lucide-react";
import { requireUser } from "@/lib/current-user";
import { TopBar } from "@/components/layout/top-bar";
import { Button } from "@/components/ui/button";
import { DbBanner } from "@/components/db-banner";
import { Badge } from "@/components/ui/badge";
import { listPresentations } from "@/db/queries/presentations";
import { safeRead } from "@/lib/db-status";
import { formatRelative } from "@/lib/utils";
import { createExamplePresentationAction } from "./actions";

export const dynamic = "force-dynamic";

export default async function PresentationsPage() {
  const user = await requireUser();
  const res = await safeRead(
    () => listPresentations({ workspaceId: user.workspaceId }),
    [] as Awaited<ReturnType<typeof listPresentations>>,
  );

  async function createExample() {
    "use server";
    await createExamplePresentationAction();
  }

  return (
    <>
      <TopBar
        email={user.email}
        displayName={user.displayName}
        action={
          <form action={createExample}>
            <Button type="submit" size="sm">
              <Plus className="h-4 w-4" /> New from example
            </Button>
          </form>
        }
      />
      <main className="mx-auto w-full max-w-4xl flex-1 px-6 py-8">
        <header className="mb-6">
          <h1 className="text-2xl font-semibold tracking-tight">Presentations</h1>
          <p className="mt-1 text-sm text-[var(--muted-foreground)]">
            Dynamic story decks you can present and share for click-to-comment
            feedback.
          </p>
        </header>

        {!res.ok && <DbBanner error={res.error} />}

        {res.ok && res.data.length === 0 ? (
          <div className="rounded-lg border border-dashed border-[var(--border)] p-10 text-center">
            <PresentationIcon className="mx-auto h-8 w-8 text-[var(--muted-foreground)]" />
            <p className="mt-3 text-sm text-[var(--muted-foreground)]">
              No presentations yet.
            </p>
            <form action={createExample} className="mt-3">
              <Button type="submit" size="sm">
                <Plus className="h-4 w-4" /> Create the example story
              </Button>
            </form>
          </div>
        ) : (
          <ul className="divide-y divide-[var(--border)] overflow-hidden rounded-lg border border-[var(--border)]">
            {res.data.map((p) => (
              <li key={p.id}>
                <Link
                  href={`/presentations/${p.id}`}
                  className="flex items-center justify-between gap-3 px-4 py-3 hover:bg-[var(--muted)]"
                >
                  <div className="min-w-0">
                    <div className="truncate text-sm font-medium">{p.title}</div>
                    <div className="truncate text-xs text-[var(--muted-foreground)]">
                      {p.subtitle ? `${p.subtitle} · ` : ""}
                      {p.slides.length} slide{p.slides.length === 1 ? "" : "s"} ·
                      updated {formatRelative(p.updatedAt)}
                    </div>
                  </div>
                  {p.shareEnabled && (
                    <Badge variant="outline" className="flex-none gap-1">
                      <Share2 className="h-3 w-3" /> Shared
                    </Badge>
                  )}
                </Link>
              </li>
            ))}
          </ul>
        )}
      </main>
    </>
  );
}
