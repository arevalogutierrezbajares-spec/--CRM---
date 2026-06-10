"use server";

import { revalidatePath } from "next/cache";
import { requireUser } from "@/lib/current-user";
import {
  countDemoLinksForPlatform,
  createDemoLink,
  createDemoLinks,
  deleteDemoLink,
  updateDemoLink,
} from "@/db/queries/demo-links";
import { CANEY_DEMO_SEEDS } from "@/lib/platforms/demo-seeds";

type Result<T = unknown> = ({ ok: true } & T) | { ok: false; error: string };

function clean(value: unknown, max: number): string | null {
  if (typeof value !== "string") return null;
  const t = value.trim();
  return t ? t.slice(0, max) : null;
}

function cleanUrl(value: unknown): { ok: true; url: string | null } | { ok: false } {
  const url = clean(value, 2000);
  if (!url) return { ok: true, url: null };
  if (!/^https?:\/\//i.test(url)) return { ok: false };
  return { ok: true, url };
}

export type DemoLinkInput = {
  platformId: string;
  label: string;
  description?: string;
  url?: string;
  username?: string;
  password?: string;
  accessNotes?: string;
};

function validate(input: DemoLinkInput):
  | { ok: true; values: ReturnType<typeof toValues> }
  | { ok: false; error: string } {
  const label = clean(input.label, 160);
  if (!label) return { ok: false, error: "Label is required" };
  const urlRes = cleanUrl(input.url);
  if (!urlRes.ok) return { ok: false, error: "URL must start with http(s)://" };
  const username = clean(input.username, 320);
  const password = clean(input.password, 500);
  if (!urlRes.url && !username && !password) {
    return { ok: false, error: "Add a demo link, credentials, or both" };
  }
  return { ok: true, values: toValues(input, label, urlRes.url, username, password) };
}

function toValues(
  input: DemoLinkInput,
  label: string,
  url: string | null,
  username: string | null,
  password: string | null,
) {
  return {
    platformId: clean(input.platformId, 60) ?? "other",
    label,
    description: clean(input.description, 1000),
    url,
    username,
    password,
    accessNotes: clean(input.accessNotes, 2000),
  };
}

export async function createDemoLinkAction(input: DemoLinkInput): Promise<Result> {
  const user = await requireUser();
  const v = validate(input);
  if (!v.ok) return v;
  await createDemoLink({
    workspaceId: user.workspaceId,
    createdBy: user.id,
    ...v.values,
  });
  revalidatePath("/platforms");
  return { ok: true };
}

export async function updateDemoLinkAction(
  input: DemoLinkInput & { id: string },
): Promise<Result> {
  const user = await requireUser();
  const v = validate(input);
  if (!v.ok) return v;
  const row = await updateDemoLink({
    id: input.id,
    workspaceId: user.workspaceId,
    patch: v.values,
  });
  if (!row) return { ok: false, error: "Demo link not found" };
  revalidatePath("/platforms");
  return { ok: true };
}

export async function deleteDemoLinkAction(input: { id: string }): Promise<Result> {
  const user = await requireUser();
  const deleted = await deleteDemoLink({
    id: input.id,
    workspaceId: user.workspaceId,
  });
  if (!deleted) return { ok: false, error: "Demo link not found" };
  revalidatePath("/platforms");
  return { ok: true };
}

/** One-click seed: CaneyCloud's guided-tour deep links. Idempotent — refuses
 *  to double-seed when any caneycloud demo links already exist. */
export async function seedCaneyDemoLinksAction(): Promise<Result<{ added: number }>> {
  const user = await requireUser();
  const existing = await countDemoLinksForPlatform({
    workspaceId: user.workspaceId,
    platformId: "caneycloud",
  });
  if (existing > 0) {
    return { ok: false, error: "CaneyCloud demo links already exist" };
  }
  const added = await createDemoLinks(
    CANEY_DEMO_SEEDS.map((seed) => ({
      workspaceId: user.workspaceId,
      createdBy: user.id,
      ...seed,
    })),
  );
  revalidatePath("/platforms");
  return { ok: true, added };
}
