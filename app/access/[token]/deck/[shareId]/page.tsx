import { redirect } from "next/navigation";
import { getPublicPartnerShareByToken } from "@/db/queries/partner-access";
import { ClientDeckViewer } from "@/components/access/client-deck-viewer";
import { isPartnerRoomUnlocked } from "@/lib/partner-room-gate.server";

export const dynamic = "force-dynamic";

type Params = Promise<{ token: string; shareId: string }>;

/**
 * Client-facing full-screen viewer for a shared HTML deck. Hosts the deck (served
 * with the correct content-type by /access/[token]/view/[shareId]) inside a
 * scaled 1280×720 canvas so it renders well on any device, phone included.
 */
export default async function ClientDeckPage({ params }: { params: Params }) {
  const { token, shareId } = await params;
  const row = await getPublicPartnerShareByToken({ token, shareId }).catch(
    () => null,
  );

  if (row && !(await isPartnerRoomUnlocked(row.room))) {
    redirect(`/access/${token}`);
  }

  if (!row || row.share.kindSnapshot !== "file" || !row.storagePath) {
    return (
      <main className="flex min-h-dvh flex-col items-center justify-center gap-3 bg-black px-6 text-center text-white">
        <p className="text-lg font-medium">This deck isn’t available.</p>
        <a href={`/access/${token}`} className="text-sm text-white/60 underline">
          Back to your room
        </a>
      </main>
    );
  }

  return (
    <ClientDeckViewer
      src={`/access/${token}/view/${shareId}`}
      title={row.share.labelSnapshot ?? "Deck"}
      backHref={`/access/${token}`}
    />
  );
}
