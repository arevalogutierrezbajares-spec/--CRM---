import { redirect } from "next/navigation";
import { getPublicPartnerShareByToken } from "@/db/queries/partner-access";
import { ClientDeckViewer } from "@/components/access/client-deck-viewer";
import { isPartnerRoomUnlocked } from "@/lib/partner-room-gate.server";
import { getRoomDict, resolveRoomLocale } from "@/lib/partner-room-i18n";
import { RoomI18nProvider } from "@/components/partner-access/room-i18n";

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

  const locale = resolveRoomLocale(row?.room?.locale);
  const dict = getRoomDict(locale);

  if (!row || row.share.kindSnapshot !== "file" || !row.storagePath) {
    return (
      <main className="flex min-h-dvh flex-col items-center justify-center gap-3 bg-black px-6 text-center text-white">
        <p className="text-lg font-medium">{dict.deckPage.unavailable}</p>
        <a href={`/access/${token}`} className="text-sm text-white/60 underline">
          {dict.deckPage.backToRoom}
        </a>
      </main>
    );
  }

  return (
    <RoomI18nProvider locale={locale}>
      <ClientDeckViewer
        src={`/access/${token}/view/${shareId}`}
        title={row.share.labelSnapshot ?? dict.deckPage.deckFallback}
        backHref={`/access/${token}`}
      />
    </RoomI18nProvider>
  );
}
