import dotenv from "dotenv";
import fs from "node:fs";
import path from "node:path";
import postgres from "postgres";
import * as Y from "yjs";
import { fileURLToPath, pathToFileURL } from "node:url";

dotenv.config({ path: ".env.local" });

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const campaignPath = path.resolve(
  __dirname,
  "../lib/pitch-feedback/caneycloud-vision-campaign.json",
);
const campaign = JSON.parse(fs.readFileSync(campaignPath, "utf8"));

const WORKSPACE_ID = "11111111-2222-3333-4444-aaaaaaaaaaa1";
const PROJECT_TITLE = "CaneyCloud";
const DOC_TITLE = "CaneyCloud Vision / Mission Deck";
const CATEGORY = "marketing";
const BLOCKNOTE_SERVER_UTIL_PATH =
  "/Users/tomas/AGB-CRM/node_modules/.pnpm/@blocknote+server-util@0.51.4_@floating-ui+dom@1.7.6_@types+hast@3.0.4_@types+react-dom_2704a61576d60ece29cfcd15107e1647/node_modules/@blocknote/server-util/dist/blocknote-server-util.js";

if (!process.env.DATABASE_URL) {
  throw new Error("DATABASE_URL is not set. Load .env.local before running.");
}

const sql = postgres(process.env.DATABASE_URL, {
  prepare: false,
  ssl: "require",
  connection: { search_path: "public, extensions" },
});

function visualLine(visual) {
  if (!visual) return "";
  const parts = [
    visual.kind ? `Visual type: ${visual.kind}` : null,
    visual.src ? `asset: ${visual.src}` : null,
    visual.title ? `visual claim: ${visual.title}` : null,
    visual.caption ? `note: ${visual.caption}` : null,
  ].filter(Boolean);
  return parts.length ? `- ${parts.join(" | ")}` : "";
}

function promptLine(prompts) {
  if (!Array.isArray(prompts) || prompts.length === 0) return "";
  return prompts
    .map((prompt) => `- Feedback prompt: ${prompt.label}`)
    .join("\n");
}

function buildMarkdown() {
  const sections = campaign.sections
    .map((section, index) => {
      const lines = [
        `## ${String(index + 1).padStart(2, "0")}. ${section.title}`,
        "",
        section.eyebrow ? `**Section:** ${section.eyebrow}` : "",
        "",
        section.body,
        "",
        section.proof ? `**Proof:** ${section.proof}` : "",
        "",
        "### Visual",
        visualLine(section.visual),
        "",
        "### Feedback",
        promptLine(section.prompts),
      ].filter((line) => line !== "");
      return lines.join("\n");
    })
    .join("\n\n---\n\n");

  return [
    "# CaneyCloud Vision / Mission Deck",
    "",
    "## Purpose",
    campaign.description,
    "",
    "## Core Story",
    "",
    "Venezuela already has the magic. CaneyCloud builds the digital foundation that helps local communities run, measure, and grow sustainable tourism businesses.",
    "",
    "## Vision",
    "",
    "A trusted tourism economy, built by Venezuelan communities and powered by technology they can actually use.",
    "",
    "## Mission",
    "",
    "Build the digital foundation that lets Venezuelan tourism communities operate, grow, and benefit from the country's comeback.",
    "",
    "## Slide Outline",
    "",
    sections,
    "",
    "## Current Live Feedback Campaign",
    "",
    `- Campaign: ${campaign.name}`,
    "- Production URL: https://x.caneycloud.com/pitch-feedback",
    "- Recipient flow: https://x.caneycloud.com/f/{invite-token}",
    "- Status: live in CRM as version 2",
  ].join("\n");
}

async function buildYdoc(markdown) {
  const { ServerBlockNoteEditor } = await import(
    pathToFileURL(BLOCKNOTE_SERVER_UTIL_PATH)
  );
  const editor = ServerBlockNoteEditor.create();
  const blocks = await editor.tryParseMarkdownToBlocks(markdown);
  const doc = editor.blocksToYDoc(blocks, "document-store");
  return Buffer.from(Y.encodeStateAsUpdate(doc)).toString("base64");
}

async function main() {
  const markdown = buildMarkdown();
  const ydoc = await buildYdoc(markdown);

  const [actor] = await sql`
    select id from users
    order by created_at
    limit 1
  `;
  if (!actor) throw new Error("No CRM user found for audit attribution.");

  const [lob] = await sql`
    select id, title
    from lines_of_business
    where workspace_id = ${WORKSPACE_ID}
      and title = ${PROJECT_TITLE}
    limit 1
  `;
  if (!lob) throw new Error(`Could not find project/LoB "${PROJECT_TITLE}".`);

  const result = await sql.begin(async (tx) => {
    const [existing] = await tx`
      select *
      from project_links
      where workspace_id = ${WORKSPACE_ID}
        and lob_id = ${lob.id}
        and kind = 'doc'
        and label = ${DOC_TITLE}
      limit 1
    `;

    if (existing) {
      await tx`
        update project_links
        set category = ${CATEGORY},
            description = ${"Mission, vision, story spine, slide copy, proof points, and visual plan for the CaneyCloud partner feedback deck."},
            updated_at = now(),
            updated_by = ${actor.id}
        where id = ${existing.id}
      `;
      await tx`
        insert into project_doc_contents (
          link_id, workspace_id, ydoc, text, updated_at, updated_by
        ) values (
          ${existing.id}, ${WORKSPACE_ID}, ${ydoc}, ${markdown}, now(), ${actor.id}
        )
        on conflict (link_id) do update set
          ydoc = excluded.ydoc,
          text = excluded.text,
          updated_at = excluded.updated_at,
          updated_by = excluded.updated_by
      `;
      await tx`
        insert into project_link_audits (
          workspace_id, lob_id, link_id, actor_id, action, before, after
        ) values (
          ${WORKSPACE_ID},
          ${lob.id},
          ${existing.id},
          ${actor.id},
          'update',
          ${sql.json(existing)},
          ${sql.json({ label: DOC_TITLE, category: CATEGORY, textLength: markdown.length, ydocLength: ydoc.length })}
        )
      `;
      return { action: "updated", linkId: existing.id, lobId: lob.id };
    }

    const [{ nextOrder }] = await tx`
      select coalesce(max(sort_order), -1) + 1 as "nextOrder"
      from project_links
      where lob_id = ${lob.id}
        and category = ${CATEGORY}
    `;

    const [created] = await tx`
      insert into project_links (
        workspace_id, lob_id, kind, category, label, url, description,
        sort_order, created_by, updated_at, updated_by
      ) values (
        ${WORKSPACE_ID},
        ${lob.id},
        'doc',
        ${CATEGORY},
        ${DOC_TITLE},
        null,
        ${"Mission, vision, story spine, slide copy, proof points, and visual plan for the CaneyCloud partner feedback deck."},
        ${Number(nextOrder)},
        ${actor.id},
        now(),
        ${actor.id}
      )
      returning *
    `;

    await tx`
      insert into project_doc_contents (
        link_id, workspace_id, ydoc, text, updated_at, updated_by
      ) values (
        ${created.id}, ${WORKSPACE_ID}, ${ydoc}, ${markdown}, now(), ${actor.id}
      )
    `;

    await tx`
      insert into project_link_audits (
        workspace_id, lob_id, link_id, actor_id, action, before, after
      ) values (
        ${WORKSPACE_ID},
        ${lob.id},
        ${created.id},
        ${actor.id},
        'create',
        null,
        ${sql.json({ label: DOC_TITLE, category: CATEGORY, textLength: markdown.length, ydocLength: ydoc.length })}
      )
    `;

    return { action: "created", linkId: created.id, lobId: lob.id };
  });

  console.log(JSON.stringify(result, null, 2));
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await sql.end();
  });
