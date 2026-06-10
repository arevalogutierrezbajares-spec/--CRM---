import { notFound } from "next/navigation";
import { requireUser } from "@/lib/current-user";
import {
  getPresentation,
  listPresentationComments,
} from "@/db/queries/presentations";
import { PresentationPlayer } from "@/components/presentations/presentation-player";
import { ShareControls } from "@/components/presentations/share-controls";

export const dynamic = "force-dynamic";

type Params = Promise<{ id: string }>;

export default async function PresentationViewerPage(props: { params: Params }) {
  const user = await requireUser();
  const { id } = await props.params;

  const pres = await getPresentation({ id, workspaceId: user.workspaceId });
  if (!pres) notFound();
  const comments = await listPresentationComments({ presentationId: id });

  return (
    <PresentationPlayer
      presentationId={pres.id}
      slides={pres.slides}
      initialComments={comments.map((c) => ({
        ...c,
        createdAt: c.createdAt.toISOString(),
        resolvedAt: c.resolvedAt ? c.resolvedAt.toISOString() : null,
      }))}
      mode="internal"
      allowComments={pres.allowComments}
      backHref="/presentations"
      shareSlot={
        <ShareControls
          presentationId={pres.id}
          initialEnabled={pres.shareEnabled}
          initialToken={pres.shareToken}
        />
      }
    />
  );
}
