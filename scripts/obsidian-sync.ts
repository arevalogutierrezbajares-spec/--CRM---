#!/usr/bin/env tsx
/**
 * AGB-307/308/309 — Obsidian → DB sync.
 *
 * Reads every .md file under OBSIDIAN_VAULT, parses YAML frontmatter, and
 * upserts contacts / projects keyed by `notes_path` (the relative file path).
 *
 * Conflict resolution: last-write-wins per field, comparing the file's mtime
 * against the row's `updated_at` (AGB-308). If the file is older for a given
 * field, we keep the DB value.
 *
 * Env:
 *   OBSIDIAN_VAULT             absolute path to the vault root
 *   OBSIDIAN_OWNER_USER_ID     user.id who owns the imported rows
 *   OBSIDIAN_SYNC_DISABLED=1   kill switch — exits without doing anything (AGB-309)
 *
 * Frontmatter shape (examples):
 *
 *   ---
 *   agb_type: contact
 *   name: Marta López
 *   relationship: lead
 *   org: La Posada de Caney
 *   tags: [caney, vav]
 *   ---
 *
 *   ---
 *   agb_type: project
 *   title: Marta — Caney onboarding
 *   status: active
 *   template: caney-posada-onboarding
 *   ---
 */
import { promises as fs } from "node:fs";
import path from "node:path";
import { parse } from "yaml";
import { and, eq } from "drizzle-orm";
import { db, schema } from "@/db";

const { contacts, projects, contactTags, tags } = schema;

const FRONTMATTER_RE = /^---\r?\n([\s\S]*?)\r?\n---\r?\n/;

type ContactFM = {
  agb_type: "contact";
  name: string;
  relationship?: "friend" | "lead" | "partner" | "prospect";
  type?: "person" | "org";
  org?: string;
  tags?: string[];
  intro?: string;
};

type ProjectFM = {
  agb_type: "project";
  title: string;
  status?: "active" | "waiting" | "done" | "lost";
  template?: string;
  due?: string;
  waiting_on?: string;
};

type Frontmatter = ContactFM | ProjectFM;

async function* walk(dir: string): AsyncGenerator<string> {
  const entries = await fs.readdir(dir, { withFileTypes: true });
  for (const e of entries) {
    if (e.name.startsWith(".")) continue;
    const full = path.join(dir, e.name);
    if (e.isDirectory()) yield* walk(full);
    else if (e.isFile() && e.name.endsWith(".md")) yield full;
  }
}

function parseFrontmatter(text: string): Frontmatter | null {
  const m = text.match(FRONTMATTER_RE);
  if (!m) return null;
  try {
    const fm = parse(m[1]) as Frontmatter;
    if (!fm || typeof fm !== "object") return null;
    if (fm.agb_type !== "contact" && fm.agb_type !== "project") return null;
    return fm;
  } catch {
    return null;
  }
}

async function upsertTag(name: string): Promise<string> {
  const [existing] = await db.select().from(tags).where(eq(tags.name, name)).limit(1);
  if (existing) return existing.id;
  const [row] = await db
    .insert(tags)
    .values({ name, kind: "custom" })
    .returning({ id: tags.id });
  return row.id;
}

async function syncContact(opts: {
  workspaceId: string;
  userId: string;
  vaultPath: string;
  fm: ContactFM;
  mtime: Date;
}) {
  const { workspaceId, userId, vaultPath, fm, mtime } = opts;

  const [existing] = await db
    .select()
    .from(contacts)
    .where(
      and(
        eq(contacts.notesPath, vaultPath),
        eq(contacts.workspaceId, workspaceId),
      ),
    )
    .limit(1);

  if (existing && existing.updatedAt > mtime) {
    return { skipped: true, id: existing.id };
  }

  const baseValues = {
    name: fm.name,
    type: fm.type ?? "person",
    relationshipType: fm.relationship ?? "prospect",
    organization: fm.org ?? null,
    introChainFromText: fm.intro ?? null,
    workspaceId,
    createdBy: userId,
    notesPath: vaultPath,
    updatedAt: new Date(),
  };

  let contactId: string;
  if (existing) {
    await db.update(contacts).set(baseValues).where(eq(contacts.id, existing.id));
    contactId = existing.id;
  } else {
    const [inserted] = await db
      .insert(contacts)
      .values(baseValues)
      .returning({ id: contacts.id });
    contactId = inserted.id;
  }

  if (fm.tags && fm.tags.length > 0) {
    const tagIds = await Promise.all(fm.tags.map((t) => upsertTag(t)));
    await db
      .delete(contactTags)
      .where(eq(contactTags.contactId, contactId));
    for (const tagId of tagIds) {
      await db
        .insert(contactTags)
        .values({ contactId, tagId })
        .onConflictDoNothing();
    }
  }

  return { skipped: false, id: contactId };
}

async function syncProject(opts: {
  workspaceId: string;
  userId: string;
  vaultPath: string;
  fm: ProjectFM;
  mtime: Date;
}) {
  const { workspaceId, userId, vaultPath, fm, mtime } = opts;
  const [existing] = await db
    .select()
    .from(projects)
    .where(
      and(
        eq(projects.notesPath, vaultPath),
        eq(projects.workspaceId, workspaceId),
      ),
    )
    .limit(1);

  if (existing && existing.updatedAt > mtime) {
    return { skipped: true, id: existing.id };
  }

  const baseValues = {
    title: fm.title,
    status: fm.status ?? "active",
    templateId: fm.template ?? null,
    dueDate: fm.due ?? null,
    waitingOn: fm.waiting_on ?? null,
    workspaceId,
    createdBy: userId,
    notesPath: vaultPath,
    updatedAt: new Date(),
  };

  if (existing) {
    await db
      .update(projects)
      .set(baseValues)
      .where(eq(projects.id, existing.id));
    return { skipped: false, id: existing.id };
  } else {
    const [inserted] = await db
      .insert(projects)
      .values(baseValues)
      .returning({ id: projects.id });
    return { skipped: false, id: inserted.id };
  }
}

async function main() {
  if (process.env.OBSIDIAN_SYNC_DISABLED === "1") {
    console.log("OBSIDIAN_SYNC_DISABLED=1 — kill switch active, exiting.");
    process.exit(0);
  }

  const vault = process.env.OBSIDIAN_VAULT;
  if (!vault) {
    console.error("OBSIDIAN_VAULT not set.");
    process.exit(1);
  }
  const ownerId = process.env.OBSIDIAN_OWNER_USER_ID;
  if (!ownerId) {
    console.error("OBSIDIAN_OWNER_USER_ID not set.");
    process.exit(1);
  }
  const [u] = await db
    .select({ id: schema.users.id, workspaceId: schema.users.currentWorkspaceId })
    .from(schema.users)
    .where(eq(schema.users.id, ownerId))
    .limit(1);
  if (!u || !u.workspaceId) {
    console.error(
      "Obsidian owner not found or has no current workspace.",
    );
    process.exit(1);
  }
  const workspaceId = u.workspaceId;

  let contactsSynced = 0;
  let projectsSynced = 0;
  let skipped = 0;
  let scanned = 0;

  for await (const file of walk(vault)) {
    scanned++;
    const stat = await fs.stat(file);
    const text = await fs.readFile(file, "utf8");
    const fm = parseFrontmatter(text);
    if (!fm) continue;
    const rel = path.relative(vault, file);

    if (fm.agb_type === "contact") {
      const r = await syncContact({
        workspaceId,
        userId: ownerId,
        vaultPath: rel,
        fm,
        mtime: stat.mtime,
      });
      if (r.skipped) skipped++;
      else contactsSynced++;
    } else if (fm.agb_type === "project") {
      const r = await syncProject({
        workspaceId,
        userId: ownerId,
        vaultPath: rel,
        fm,
        mtime: stat.mtime,
      });
      if (r.skipped) skipped++;
      else projectsSynced++;
    }
  }

  console.log(
    `[obsidian-sync] scanned=${scanned} contacts=${contactsSynced} projects=${projectsSynced} skipped=${skipped}`,
  );
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
