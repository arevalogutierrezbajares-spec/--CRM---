import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { eq } from "drizzle-orm";
import { db, schema } from "@/db";
import { requireUser } from "@/lib/current-user";
import {
  createSignedDownloadUrl,
  createSignedUploadUrl,
  removeObjects,
  slugFilename,
} from "@/lib/project-files/storage";
import {
  getContactLogoStoragePath,
  updateContactLogo,
} from "@/db/queries/partner-access";
import { canonicalMime } from "@/lib/project-files/allowed-types";

type Params = Promise<{ contactId: string }>;

const MAX_LOGO_BYTES = 5 * 1024 * 1024;
const LOGO_MIME = /^image\/(png|jpeg|jpg|webp|gif|svg\+xml)$/i;

const SignBody = z.object({
  action: z.literal("sign"),
  filename: z.string().min(1).max(255),
  mimeType: z.string().max(120),
  sizeBytes: z.number().int().positive().max(MAX_LOGO_BYTES),
});
const FinalizeBody = z.object({
  action: z.literal("finalize"),
  storagePath: z.string().min(1),
});

/** Public: stream a contact's uploaded logo (brand image shown in public rooms). */
export async function GET(_: NextRequest, props: { params: Params }) {
  const { contactId } = await props.params;
  if (!/^[0-9a-f-]{36}$/.test(contactId)) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  const path = await getContactLogoStoragePath(contactId).catch(() => null);
  if (!path) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const signed = await createSignedDownloadUrl(path);
  if (!signed.ok) {
    return NextResponse.json({ error: "Unavailable" }, { status: 503 });
  }
  const upstream = await fetch(signed.url);
  if (!upstream.ok || !upstream.body) {
    return NextResponse.json({ error: "Fetch failed" }, { status: 502 });
  }
  return new NextResponse(upstream.body, {
    status: 200,
    headers: {
      "Content-Type": canonicalMime(path, "image/png"),
      "Cache-Control": "public, max-age=300, must-revalidate",
      "X-Content-Type-Options": "nosniff",
    },
  });
}

/** Owner: sign an upload, then finalize → sets contact logo to the proxy path. */
export async function POST(req: NextRequest, props: { params: Params }) {
  const user = await requireUser();
  const { contactId } = await props.params;

  const [contact] = await db
    .select({ id: schema.contacts.id })
    .from(schema.contacts)
    .where(eq(schema.contacts.id, contactId))
    .limit(1);
  if (!contact) return NextResponse.json({ error: "Contact not found" }, { status: 404 });

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const action = (body as Record<string, unknown>)?.action;

  if (action === "sign") {
    const parsed = SignBody.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: "Invalid input" }, { status: 400 });
    }
    if (!LOGO_MIME.test(parsed.data.mimeType)) {
      return NextResponse.json({ error: "Use a PNG, JPG, WEBP, GIF, or SVG" }, { status: 400 });
    }
    const unique = crypto.randomUUID();
    const path = `${user.workspaceId}/contact-logos/${contactId}/${unique}-${slugFilename(parsed.data.filename)}`;
    const signed = await createSignedUploadUrl(path);
    if (!signed.ok) return NextResponse.json({ error: signed.error }, { status: 500 });
    return NextResponse.json({
      path: signed.data.path,
      token: signed.data.token,
      signedUrl: signed.data.signedUrl,
    });
  }

  if (action === "finalize") {
    const parsed = FinalizeBody.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: "Invalid input" }, { status: 400 });
    }
    const requiredPrefix = `${user.workspaceId}/contact-logos/${contactId}/`;
    if (!parsed.data.storagePath.startsWith(requiredPrefix)) {
      return NextResponse.json({ error: "Invalid path" }, { status: 400 });
    }
    const res = await updateContactLogo({
      workspaceId: user.workspaceId,
      contactId,
      logoUrl: `/api/contact-logo/${contactId}?v=${Date.now()}`,
      logoStoragePath: parsed.data.storagePath,
    });
    if (!res) return NextResponse.json({ error: "Contact not found" }, { status: 404 });
    if (res.previousPath) await removeObjects([res.previousPath]).catch(() => {});
    return NextResponse.json({ ok: true, url: `/api/contact-logo/${contactId}?v=${Date.now()}` });
  }

  return NextResponse.json({ error: "Unknown action" }, { status: 400 });
}
