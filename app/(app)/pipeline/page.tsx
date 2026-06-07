import Link from "next/link";
import { requireUser } from "@/lib/current-user";
import { TopBar } from "@/components/layout/top-bar";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { DbBanner } from "@/components/db-banner";
import { KanbanCard } from "@/components/lob/kanban-card";
import {
  getKanban,
  listPipelineTemplatesWithStages,
} from "@/db/queries/kanban";
import { safeRead } from "@/lib/db-status";
import { cn } from "@/lib/utils";

type SearchParams = Promise<{ template?: string }>;

export default async function PipelinePage(props: {
  searchParams: SearchParams;
}) {
  const user = await requireUser();
  const sp = await props.searchParams;

  const templatesRes = await safeRead(
    () => listPipelineTemplatesWithStages(),
    [] as Awaited<ReturnType<typeof listPipelineTemplatesWithStages>>,
  );

  const selectedId =
    sp.template ?? templatesRes.data[0]?.id ?? null;

  const boardRes = selectedId
    ? await safeRead(
        () => getKanban({ workspaceId: user.workspaceId, templateId: selectedId }),
        null,
      )
    : { ok: true as const, data: null };

  return (
    <>
      <TopBar email={user.email} displayName={user.displayName} />
      <main className="mx-auto w-full max-w-[1400px] flex-1 px-6 py-8">
        <header className="mb-6">
          <h1 className="text-2xl font-semibold tracking-tight">Pipeline</h1>
          <p className="text-sm text-[var(--muted-foreground)]">
            Projects grouped by current stage. Use the arrows on a card to
            advance or retreat.
          </p>
        </header>

        {!templatesRes.ok && <DbBanner error={templatesRes.error} />}

        {templatesRes.data.length > 0 && (
          <div className="mb-4 flex flex-wrap gap-2">
            {templatesRes.data.map((t) => {
              const active = t.id === selectedId;
              return (
                <Link
                  key={t.id}
                  href={`/pipeline?template=${t.id}`}
                  className={cn(
                    "rounded-full border px-3 py-1 text-xs font-medium transition-colors",
                    active
                      ? "border-transparent bg-[var(--primary)] text-[var(--primary-foreground)]"
                      : "border-[var(--border)] text-[var(--muted-foreground)] hover:text-[var(--foreground)]",
                  )}
                >
                  {t.name}{" "}
                  <span className="ml-1 opacity-70">{t.stages.length}</span>
                </Link>
              );
            })}
          </div>
        )}

        {boardRes.ok && boardRes.data ? (
          <Board board={boardRes.data} />
        ) : (
          <Card>
            <CardContent className="grid place-items-center px-6 py-16 text-center">
              <p className="text-sm text-[var(--muted-foreground)]">
                {!boardRes.ok
                  ? "Database not connected."
                  : "No projects on this template yet."}
              </p>
            </CardContent>
          </Card>
        )}
      </main>
    </>
  );
}

function Board({
  board,
}: {
  board: NonNullable<Awaited<ReturnType<typeof getKanban>>>;
}) {
  return (
    <div className="flex gap-3 overflow-x-auto pb-4">
      {board.columns.map((col, i) => {
        const prev = board.columns[i - 1]?.stageId ?? null;
        const next = board.columns[i + 1]?.stageId ?? null;
        return (
          <div
            key={col.stageId}
            className="flex w-72 shrink-0 flex-col rounded-lg bg-[var(--muted)]/30 p-2"
          >
            <div className="flex items-center justify-between px-1 py-2">
              <div className="text-xs font-semibold uppercase tracking-wide text-[var(--muted-foreground)]">
                {col.order}. {col.stageName}
              </div>
              <Badge variant="outline" className="text-xs">
                {col.cards.length}
              </Badge>
            </div>
            <div className="flex flex-col gap-2">
              {col.cards.length === 0 ? (
                <div className="rounded-md border border-dashed border-[var(--border)] px-3 py-6 text-center text-xs text-[var(--muted-foreground)]">
                  empty
                </div>
              ) : (
                col.cards.map((card) => (
                  <KanbanCard
                    key={card.id}
                    card={card}
                    prevStageId={prev}
                    nextStageId={next}
                  />
                ))
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}
