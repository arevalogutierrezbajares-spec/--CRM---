import { notFound } from "next/navigation";
import { requireUser } from "@/lib/current-user";
import { getProjectDoc } from "@/db/queries/docs";
import { listWorkspaceMembers } from "@/db/queries/team";
import { DocEditor } from "@/components/lob/doc-editor";
import { DocCommentsPanel } from "@/components/lob/doc-comments-panel";

type Params = Promise<{ id: string; docId: string }>;

export default async function ProjectDocPage(props: { params: Params }) {
  const user = await requireUser();
  const { id, docId } = await props.params;

  const doc = await getProjectDoc({ linkId: docId, workspaceId: user.workspaceId });
  if (!doc || doc.lobId !== id) notFound();

  const members = (await listWorkspaceMembers(user.workspaceId)).map((m) => ({
    userId: m.userId,
    displayName: m.displayName,
  }));

  return (
    <div className="flex h-[calc(100vh-3rem)]">
      <div className="min-w-0 flex-1">
        <DocEditor
          lobId={id}
          docId={doc.linkId}
          initialTitle={doc.label}
          initialYdoc={doc.ydoc}
          userId={user.id}
          userName={user.displayName}
        />
      </div>
      <aside className="hidden w-80 shrink-0 border-l border-[var(--border)] md:flex">
        <DocCommentsPanel
          linkId={doc.linkId}
          members={members}
          currentUserId={user.id}
          currentUserRole={user.workspaceRole}
          className="w-full"
        />
      </aside>
    </div>
  );
}
