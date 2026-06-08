import { promises as fs } from "node:fs";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ChevronLeft, Tag } from "lucide-react";
import { requireUser } from "@/lib/current-user";
import { TopBar } from "@/components/layout/top-bar";
import { DashCard } from "@/components/dashboard/shared/dash-card";
import { SectionLabel } from "@/components/dashboard/shared/section-label";
import { DashBadge } from "@/components/dashboard/shared/badge";
import { Markdown } from "@/components/research/markdown";
import { getResearchNoteById } from "@/db/queries/research";
import { resolveBrainPath } from "@/lib/brain-roots";

type Params = Promise<{ id: string }>;

function shortDate(d: Date | null): string {
  if (!d) return "—";
  return new Date(d).toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    year: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export default async function ResearchNotePage(props: { params: Params }) {
  const user = await requireUser();
  const { id } = await props.params;

  const note = await getResearchNoteById({ id, workspaceId: user.workspaceId });
  if (!note) notFound();

  const abs = resolveBrainPath(note.sourceRoot, note.relPath);
  let content = "";
  let readError: string | null = null;
  if (!abs) {
    readError = "Source root is not allowed for reading.";
  } else {
    try {
      content = await fs.readFile(abs, "utf8");
    } catch (e) {
      readError = e instanceof Error ? e.message : String(e);
    }
  }

  return (
    <>
      <TopBar email={user.email} displayName={user.displayName} />
      <main className="mx-auto w-full max-w-5xl flex-1 px-6 py-6 space-y-4">
        <Link
          href="/research"
          className="inline-flex items-center gap-1 text-[13px] text-text-secondary hover:text-text-primary"
        >
          <ChevronLeft size={14} /> All research
        </Link>

        <header className="space-y-2">
          <div className="text-tiny text-text-tertiary font-mono">
            {note.sourceRoot} / {note.relPath}
          </div>
          <h1 className="text-[24px] font-medium tracking-tight">
            {note.title}
          </h1>
          <div className="flex items-center gap-2 flex-wrap text-tiny text-text-tertiary">
            <span>{note.wordCount} words</span>
            <span>·</span>
            <span>modified {shortDate(note.lastModified)}</span>
            {note.projectTitle && (
              <>
                <span>·</span>
                <Link
                  href={`/projects/${note.projectId}`}
                  className="hover:text-text-primary"
                >
                  <DashBadge variant="neutral">{note.projectTitle}</DashBadge>
                </Link>
              </>
            )}
          </div>
          {note.tags.length > 0 && (
            <div className="flex items-center gap-1 flex-wrap">
              {note.tags.map((t) => (
                <Link
                  key={t}
                  href={`/research?q=%23${encodeURIComponent(t)}`}
                  className="inline-flex items-center gap-0.5 rounded-full bg-surface px-1.5 py-0.5 text-tiny text-text-secondary hover:text-text-primary"
                >
                  <Tag size={9} />
                  {t}
                </Link>
              ))}
            </div>
          )}
        </header>

        <DashCard>
          {readError ? (
            <div className="rounded-md border border-red-bg bg-red-bg/30 p-3 text-tiny text-red-text">
              Could not read note: {readError}
            </div>
          ) : (
            <Markdown source={content} />
          )}
        </DashCard>

        <details
          className="rounded-lg border bg-card p-3"
          style={{ borderColor: "var(--border-default)" }}
        >
          <summary className="text-tiny text-text-secondary cursor-pointer">
            Note metadata
          </summary>
          <SectionLabel className="mt-2">Indexed</SectionLabel>
          <dl className="space-y-1 text-tiny">
            <Row label="Source root" value={<code>{note.sourceRoot}</code>} />
            <Row label="Relative path" value={<code>{note.relPath}</code>} />
            <Row label="Folder" value={note.folder ?? "—"} />
            <Row label="Word count" value={note.wordCount.toString()} />
            <Row label="Content hash" value={<code className="text-tiny">{note.contentHash?.slice(0, 12) ?? "—"}</code>} />
            <Row label="Indexed at" value={shortDate(note.indexedAt)} />
          </dl>
        </details>
      </main>
    </>
  );
}

function Row({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex items-baseline justify-between gap-2">
      <dt className="text-text-tertiary">{label}</dt>
      <dd className="text-text-primary text-right break-all">{value}</dd>
    </div>
  );
}
