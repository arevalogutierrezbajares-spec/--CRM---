import { notFound } from "next/navigation";
import { requireUser } from "@/lib/current-user";
import { getProjectDoc } from "@/db/queries/docs";
import { DocEditor } from "@/components/projects/doc-editor";

type Params = Promise<{ id: string; docId: string }>;

export default async function ProjectDocPage(props: { params: Params }) {
  const user = await requireUser();
  const { id, docId } = await props.params;

  const doc = await getProjectDoc({ linkId: docId, workspaceId: user.workspaceId });
  if (!doc || doc.projectId !== id) notFound();

  return (
    <DocEditor
      projectId={id}
      docId={doc.linkId}
      initialTitle={doc.label}
      initialYdoc={doc.ydoc}
      userId={user.id}
      userName={user.displayName}
    />
  );
}
