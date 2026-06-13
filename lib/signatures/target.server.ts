/**
 * Resolves the exact bytes of a signature request's target document (a room
 * repository item or a share). Both the signing endpoint (hash + stamp) and
 * the in-document viewer route read through this so they always see the same
 * bytes.
 */
import "server-only";
import { and, eq } from "drizzle-orm";
import { db, schema } from "@/db";
import { getPublicPartnerShareByToken } from "@/db/queries/partner-access";
import { createSignedDownloadUrl } from "@/lib/project-files/storage";

export const SIGN_DOC_MAX_BYTES = 30 * 1024 * 1024;

export function isPdfBytes(bytes: Uint8Array | null): bytes is Uint8Array {
  return (
    !!bytes &&
    bytes.length > 4 &&
    bytes[0] === 0x25 && // %PDF
    bytes[1] === 0x50 &&
    bytes[2] === 0x44 &&
    bytes[3] === 0x46
  );
}

export async function fetchSignatureTargetBytes(opts: {
  token: string;
  roomId: string;
  targetKind: string;
  targetId: string;
}): Promise<Uint8Array | null> {
  let storagePath: string | null = null;
  if (opts.targetKind === "item") {
    const [item] = await db
      .select({ storagePath: schema.partnerRoomItems.storagePath })
      .from(schema.partnerRoomItems)
      .where(
        and(
          eq(schema.partnerRoomItems.id, opts.targetId),
          eq(schema.partnerRoomItems.roomId, opts.roomId),
        ),
      )
      .limit(1);
    storagePath = item?.storagePath ?? null;
  } else {
    const row = await getPublicPartnerShareByToken({
      token: opts.token,
      shareId: opts.targetId,
    }).catch(() => null);
    storagePath = row?.storagePath ?? null;
  }
  if (!storagePath) return null;

  const signed = await createSignedDownloadUrl(storagePath);
  if (!signed.ok) return null;
  try {
    const res = await fetch(signed.url);
    if (!res.ok) return null;
    const buf = await res.arrayBuffer();
    if (buf.byteLength > SIGN_DOC_MAX_BYTES) return null;
    return new Uint8Array(buf);
  } catch {
    return null;
  }
}
