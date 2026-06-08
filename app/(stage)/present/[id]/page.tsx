import { notFound } from "next/navigation";
import { requireUser } from "@/lib/current-user";
import { getMeeting } from "@/db/queries/meetings";
import { listMeetingMaterials } from "@/db/queries/meeting-materials";
import { createSignedDownloadUrl } from "@/lib/project-files/storage";
import { PresentStage, type PresentMaterial } from "@/components/meetings/present/present-stage";

export const dynamic = "force-dynamic";

type Params = Promise<{ id: string }>;

export default async function PresentPage(props: { params: Params }) {
  const user = await requireUser();
  const { id } = await props.params;

  const meeting = await getMeeting({ id, workspaceId: user.workspaceId });
  if (!meeting) notFound();

  const raw = await listMeetingMaterials({
    meetingId: id,
    workspaceId: user.workspaceId,
  });

  // Mint short-lived signed URLs for stored files so decks render immediately.
  const materials: PresentMaterial[] = await Promise.all(
    raw.map(async (m) => {
      let fileUrl: string | null = null;
      if (m.kind === "file" && m.storagePath) {
        const signed = await createSignedDownloadUrl(m.storagePath).catch(
          () => null,
        );
        if (signed?.ok) fileUrl = signed.url;
      }
      return {
        id: m.projectLinkId,
        kind: m.kind,
        label: m.label,
        url: m.url,
        description: m.description,
        mimeType: m.mimeType,
        fileName: m.originalFilename,
        lobTitle: m.lobTitle,
        fileUrl,
      };
    }),
  );

  return (
    <PresentStage
      meetingId={id}
      meetingTitle={meeting.title}
      materials={materials}
    />
  );
}
