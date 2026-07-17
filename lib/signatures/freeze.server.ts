/**
 * Freeze target document bytes at signature-request time so signing always
 * uses the exact bytes the owner asked on (not a later replacement).
 */
import "server-only";
import { and, eq } from "drizzle-orm";
import { db, schema } from "@/db";
import {
  createSignedDownloadUrl,
  uploadBytes,
} from "@/lib/project-files/storage";
import { sha256Hex } from "@/lib/signatures/stamp.server";
import {
  SIGN_DOC_MAX_BYTES,
  extForMime,
  frozenDocumentPath,
  mimeFromPdfMagic,
} from "@/lib/signatures/freeze-paths";

export type FreezeResult =
  | {
      ok: true;
      sourceStoragePath: string;
      frozenStoragePath: string;
      documentSha256: string;
      documentByteLength: number;
      documentMimeType: string;
    }
  | { ok: false; error: string };

/** Resolve live storage path for a room repository target (owner-side, no guest token). */
export async function resolveTargetStoragePath(opts: {
  roomId: string;
  workspaceId: string;
  targetKind: "share" | "item" | string;
  targetId: string;
}): Promise<string | null> {
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
    return item?.storagePath ?? null;
  }

  // Shares: join partner_shares → project_links for storage path.
  const [row] = await db
    .select({ storagePath: schema.projectLinks.storagePath })
    .from(schema.partnerShares)
    .innerJoin(
      schema.projectLinks,
      eq(schema.projectLinks.id, schema.partnerShares.projectLinkId),
    )
    .where(
      and(
        eq(schema.partnerShares.id, opts.targetId),
        eq(schema.partnerShares.roomId, opts.roomId),
      ),
    )
    .limit(1);
  return row?.storagePath ?? null;
}

async function fetchStorageBytes(path: string): Promise<Uint8Array | null> {
  const signed = await createSignedDownloadUrl(path);
  if (!signed.ok) return null;
  try {
    const res = await fetch(signed.url);
    if (!res.ok) return null;
    const buf = await res.arrayBuffer();
    if (buf.byteLength > SIGN_DOC_MAX_BYTES) return null;
    if (buf.byteLength === 0) return null;
    return new Uint8Array(buf);
  } catch {
    return null;
  }
}

/**
 * Copy target document into an immutable path under the request id and return
 * freeze metadata for the request row.
 */
export async function freezeSignatureTarget(opts: {
  workspaceId: string;
  roomId: string;
  requestId: string;
  targetKind: "share" | "item" | string;
  targetId: string;
}): Promise<FreezeResult> {
  const sourcePath = await resolveTargetStoragePath({
    roomId: opts.roomId,
    workspaceId: opts.workspaceId,
    targetKind: opts.targetKind,
    targetId: opts.targetId,
  });
  if (!sourcePath) {
    return { ok: false, error: "Document has no stored file to freeze." };
  }

  const bytes = await fetchStorageBytes(sourcePath);
  if (!bytes) {
    return { ok: false, error: "Could not read document to freeze." };
  }

  const mime = mimeFromPdfMagic(bytes);
  const ext = extForMime(mime);
  const frozen = frozenDocumentPath({
    workspaceId: opts.workspaceId,
    roomId: opts.roomId,
    requestId: opts.requestId,
    ext,
  });

  const up = await uploadBytes(frozen, bytes, mime);
  if (!up.ok) {
    return { ok: false, error: up.error || "Could not store frozen document." };
  }

  return {
    ok: true,
    sourceStoragePath: sourcePath,
    frozenStoragePath: frozen,
    documentSha256: sha256Hex(bytes),
    documentByteLength: bytes.byteLength,
    documentMimeType: mime,
  };
}

/** Read frozen bytes when present; otherwise legacy live storage path. */
export async function fetchFrozenOrLiveBytes(opts: {
  frozenStoragePath: string | null | undefined;
  roomId: string;
  workspaceId: string;
  targetKind: string;
  targetId: string;
}): Promise<Uint8Array | null> {
  if (opts.frozenStoragePath) {
    return fetchStorageBytes(opts.frozenStoragePath);
  }
  const path = await resolveTargetStoragePath({
    roomId: opts.roomId,
    workspaceId: opts.workspaceId,
    targetKind: opts.targetKind,
    targetId: opts.targetId,
  });
  if (!path) return null;
  return fetchStorageBytes(path);
}
