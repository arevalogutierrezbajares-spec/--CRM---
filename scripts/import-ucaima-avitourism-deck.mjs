#!/usr/bin/env node
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { config } from "dotenv";
import postgres from "postgres";
import { createClient } from "@supabase/supabase-js";

config({ path: new URL("../.env.local", import.meta.url).pathname, override: true, quiet: true });

const WORKSPACE_ID = "11111111-2222-3333-4444-aaaaaaaaaaa1";
const UCAIMA_PROJECT_TITLE = "Ucaima Transformation";
const DECK_ROOT = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../outputs/manual-20260608120307-ucaima-birds/presentations/ucaima-avitourism",
);
const FINAL_PPTX = path.join(DECK_ROOT, "output/Ucaima-Avitourism-Proposal.pptx");
const CONTACT_SHEET = path.join(DECK_ROOT, "qa/contact-sheet.png");
const SOURCE_NOTES = path.join(DECK_ROOT, "source-notes.txt");
const TALK_TRACK = path.join(DECK_ROOT, "talk-track.md");
const PROFILE_PLAN = path.join(DECK_ROOT, "profile-plan.txt");
const PROJECT_FILES_BUCKET = "agb-project-files";

const sql = postgres(process.env.DATABASE_URL, {
  prepare: false,
  ssl: "require",
});

function storageClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return null;
  return createClient(url, key, { auth: { persistSession: false } });
}

async function firstUserForWorkspace(tx) {
  const [member] = await tx`
    select wm.user_id
    from workspace_members wm
    join users u on u.id = wm.user_id
    where wm.workspace_id = ${WORKSPACE_ID}
    order by case wm.role when 'owner' then 0 when 'admin' then 1 else 2 end, u.created_at asc
    limit 1
  `;
  if (!member?.user_id) throw new Error(`No user found for workspace ${WORKSPACE_ID}`);
  return member.user_id;
}

async function findUcaimaProject(tx) {
  const [row] = await tx`
    select id, lob_id
    from projects
    where workspace_id = ${WORKSPACE_ID}
      and lower(title) = lower(${UCAIMA_PROJECT_TITLE})
    limit 1
  `;
  if (!row?.id) {
    throw new Error(`Project not found: ${UCAIMA_PROJECT_TITLE}. Run scripts/import-ucaima-transformation.mjs first.`);
  }
  return { id: row.id, lobId: row.lob_id ?? null };
}

async function columnSet(tx, tableName) {
  const rows = await tx`
    select column_name
    from information_schema.columns
    where table_schema = 'public'
      and table_name = ${tableName}
  `;
  return new Set(rows.map((row) => row.column_name));
}

async function projectLinkRefColumn(tx) {
  const columns = await columnSet(tx, "project_links");
  if (columns.has("project_id")) return "project_id";
  if (columns.has("lob_id")) return "lob_id";
  throw new Error("project_links table has neither project_id nor lob_id.");
}

async function touchRefColumn(tx) {
  const columns = await columnSet(tx, "touches");
  if (columns.has("project_id")) return "project_id";
  if (columns.has("lob_id")) return "lob_id";
  throw new Error("touches table has neither project_id nor lob_id.");
}

async function ensureProjectDoc(tx, actorId, projectId, refColumn, label, category, text, description) {
  const ref = sql.unsafe(refColumn);
  const [existing] = await tx`
    select id
    from project_links
    where workspace_id = ${WORKSPACE_ID}
      and ${ref} = ${projectId}
      and label = ${label}
    limit 1
  `;

  let linkId = existing?.id;
  if (linkId) {
    await tx`
      update project_links
      set kind = 'doc',
          category = ${category},
          description = ${description},
          updated_at = now(),
          updated_by = ${actorId}
      where id = ${linkId}
    `;
  } else {
    const [{ next_order }] = await tx`
      select coalesce(max(sort_order), -1) + 1 as next_order
      from project_links
      where ${ref} = ${projectId}
        and category = ${category}
    `;
    const [inserted] = await tx`
      insert into project_links (
        workspace_id, ${ref}, kind, category, label, description,
        sort_order, created_by, updated_at, updated_by
      )
      values (
        ${WORKSPACE_ID}, ${projectId}, 'doc', ${category}, ${label}, ${description},
        ${next_order}, ${actorId}, now(), ${actorId}
      )
      returning id
    `;
    linkId = inserted.id;
  }

  await tx`
    insert into project_doc_contents (link_id, workspace_id, text, updated_at, updated_by)
    values (${linkId}, ${WORKSPACE_ID}, ${text}, now(), ${actorId})
    on conflict (link_id) do update
      set text = excluded.text,
          updated_at = now(),
          updated_by = ${actorId}
  `;
  return linkId;
}

async function ensureProjectFile(tx, actorId, refId, refColumn, file) {
  const ref = sql.unsafe(refColumn);
  const [existing] = await tx`
    select id
    from project_links
    where workspace_id = ${WORKSPACE_ID}
      and ${ref} = ${refId}
      and label = ${file.label}
    limit 1
  `;

  if (existing?.id) {
    await tx`
      update project_links
      set kind = 'file',
          category = ${file.category},
          url = null,
          storage_path = ${file.storagePath},
          mime_type = ${file.mimeType},
          size_bytes = ${file.sizeBytes},
          original_filename = ${file.originalFilename},
          description = ${file.description},
          updated_at = now(),
          updated_by = ${actorId}
      where id = ${existing.id}
    `;
    return existing.id;
  }

  const [{ next_order }] = await tx`
    select coalesce(max(sort_order), -1) + 1 as next_order
    from project_links
    where ${ref} = ${refId}
      and category = ${file.category}
  `;
  const [inserted] = await tx`
    insert into project_links (
      workspace_id, ${ref}, kind, category, label, url, description,
      storage_path, mime_type, size_bytes, original_filename,
      sort_order, created_by, updated_at, updated_by
    )
    values (
      ${WORKSPACE_ID}, ${refId}, 'file', ${file.category}, ${file.label}, null, ${file.description},
      ${file.storagePath}, ${file.mimeType}, ${file.sizeBytes}, ${file.originalFilename},
      ${next_order}, ${actorId}, now(), ${actorId}
    )
    returning id
  `;
  return inserted.id;
}

async function ensureUcaimaTouch(tx, actorId, refColumn, refId, body) {
  const ref = sql.unsafe(refColumn);
  const [contact] = await tx`
    select id
    from contacts
    where workspace_id = ${WORKSPACE_ID}
      and lower(name) in ('ucaima', 'campamento ucaima')
    order by case when lower(name) = 'ucaima' then 0 else 1 end
    limit 1
  `;
  if (!contact?.id) return null;

  const prefix = "[UCAIMA:avitourism-deck]";
  const fullBody = `${prefix}\n${body}`;
  const [existing] = await tx`
    select id
    from touches
    where workspace_id = ${WORKSPACE_ID}
      and ${ref} = ${refId}
      and contact_id = ${contact.id}
      and body like ${prefix + "%"}
    limit 1
  `;

  if (existing?.id) {
    await tx`update touches set body = ${fullBody} where id = ${existing.id}`;
  } else {
    await tx`
      insert into touches (workspace_id, contact_id, ${ref}, channel, body, created_by)
      values (${WORKSPACE_ID}, ${contact.id}, ${refId}, 'manual', ${fullBody}, ${actorId})
    `;
  }
  await tx`update contacts set last_touch_at = now(), updated_at = now() where id = ${contact.id}`;
  return contact.id;
}

async function fileStatLine(label, filePath) {
  const stat = await fs.stat(filePath);
  return `- ${label}: ${filePath} (${Math.round(stat.size / 1024).toLocaleString()} KB)`;
}

function storagePathFor(lobId, filename) {
  return `${WORKSPACE_ID}/${lobId}/${filename}`;
}

async function uploadFileToStorage(filePath, storagePath, mimeType) {
  const supabase = storageClient();
  if (!supabase) {
    throw new Error("Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY for storage upload.");
  }
  const data = await fs.readFile(filePath);
  const { error } = await supabase.storage.from(PROJECT_FILES_BUCKET).upload(storagePath, data, {
    contentType: mimeType,
    upsert: true,
  });
  if (error) throw new Error(`Storage upload failed for ${storagePath}: ${error.message}`);
  return data.byteLength;
}

async function uploadDeckAttachments(lobId) {
  const files = [
    {
      label: "Ucaima Avitourism Proposal PPTX",
      category: "marketing",
      filePath: FINAL_PPTX,
      storagePath: storagePathFor(lobId, "ucaima-avitourism-proposal.pptx"),
      mimeType: "application/vnd.openxmlformats-officedocument.presentationml.presentation",
      originalFilename: "Ucaima-Avitourism-Proposal.pptx",
      description: "Editable PowerPoint proposal deck for Ucaima avitourism positioning.",
    },
    {
      label: "Ucaima Avitourism Deck Contact Sheet",
      category: "design",
      filePath: CONTACT_SHEET,
      storagePath: storagePathFor(lobId, "ucaima-avitourism-contact-sheet.png"),
      mimeType: "image/png",
      originalFilename: "ucaima-avitourism-contact-sheet.png",
      description: "Rendered slide contact sheet used for QA and quick review.",
    },
  ];

  const uploaded = [];
  for (const file of files) {
    const sizeBytes = await uploadFileToStorage(file.filePath, file.storagePath, file.mimeType);
    uploaded.push({ ...file, sizeBytes });
  }
  return uploaded;
}

async function buildDeckPackageDoc(uploadedFiles) {
  const [talkTrack, sourceNotes, profilePlan] = await Promise.all([
    fs.readFile(TALK_TRACK, "utf8"),
    fs.readFile(SOURCE_NOTES, "utf8"),
    fs.readFile(PROFILE_PLAN, "utf8"),
  ]);

  const fileLines = await Promise.all([
    fileStatLine("Editable PPTX", FINAL_PPTX),
    fileStatLine("Rendered contact sheet", CONTACT_SHEET),
    fileStatLine("Talk track", TALK_TRACK),
    fileStatLine("Source notes", SOURCE_NOTES),
  ]);

  return `# Ucaima Avitourism Pitch Deck Package

## CRM status
Saved to the Ucaima Transformation CRM project on ${new Date().toISOString()}.

## Core positioning
Ucaima should own Canaima's quiet, conservation-aligned avitourism lane: a responsible birding and naturalist field base for serious travelers, bird clubs, field-course buyers, expedition networks, and founding patrons.

## Key pitch line
Ucaima can become the gateway for people who come to Canaima to listen, study, photograph, and protect.

## Files
${fileLines.join("\n")}

## CRM file attachments
${uploadedFiles.map((file) => `- ${file.label}: storage path ${file.storagePath}`).join("\n")}

## Data points in the deck
- Inparques: Canaima has 587+ bird species.
- Avibase: Canaima National Park checklist lists 736 species and 5 globally threatened species.
- UNESCO: Canaima is a 3,000,000 ha World Heritage landscape with major tepui formations.
- USFWS 2022 National Survey: 96.3M U.S. wild bird observers and 42.6M away-from-home wild bird observers.
- Colombia benchmark: Colombia Travel positions birding as year-round, with 1,900+ bird species and 79 endemic species.
- MinCIT Colombia: Global Big Day 2024 result of 1,558 species and 12,007 checklists demonstrates how avitourism can be used as a national reputation engine.

## Deck structure
1. Vision: Ucaima as Canaima's responsible avitourism field base.
2. The choice: party/luxe drift risk vs quiet specialist tourism.
3. The asset: Canaima birding and protected-area proof.
4. Target birds: tepui and Guianan Shield specialties.
5. Demand proof: U.S. birding demand and Colombia benchmark.
6. Product architecture: field base, not generic hotel package.
7. Year-round demand calendar.
8. Fundable basecamp upgrades.
9. Founding Circle future-stay funding model.
10. Go-to-market channels.
11. Measurable room-night scenario math.
12. The ask: approve lane, validate routes, launch founding circle.

## Caveats to keep explicit
- Do not claim "Canaima-only endemic birds" until validated by a defensible species-level source.
- Publish target species only after local guide, route, permit, and eBird/field-record validation.
- Replace scenario math with Ucaima's actual room count, ADR, occupancy, and seasonal constraints.
- Charles Brewer-Carias collaboration stays "to be confirmed" until there is explicit agreement.

## Immediate CRM follow-ups
- Confirm Ucaima owner approval for the avitourism field-base lane.
- Validate first route/species list with local guides.
- Convert founder tiers into a one-page sell sheet.
- Build bird club / Audubon / natural history museum outreach sequence.
- Translate owner-facing deck to Spanish if Ucaima wants it.

---

## Talk track
${talkTrack}

---

## Source notes
${sourceNotes}

---

## Profile plan
${profilePlan}
`;
}

async function buildSourceBriefDoc() {
  const sourceNotes = await fs.readFile(SOURCE_NOTES, "utf8");
  return `# Ucaima Avitourism Data And Source Brief

## What this supports
This is the evidence pack behind the Ucaima Avitourism Proposal. Use it when tightening the deck, creating the one-pager, or answering a skeptical Ucaima / partner question.

## Strong claims
- Canaima has a credible large birding asset: 587+ bird species from Inparques and 736 species in Avibase.
- Birdwatching is a large North American behavior, not a tiny niche: USFWS reports 96.3M U.S. wild bird observers and 42.6M away-from-home bird observers.
- Colombia is the clean benchmark: it has turned biodiversity and Global Big Day performance into birding tourism positioning.

## Claims to validate before public outreach
- Exact route list from Ucaima.
- Target species by accessible route and season.
- Permit requirements and Pemón/local guide protocol.
- Real room-night capacity and low-season availability.
- Whether any Charles Brewer-Carias event or expedition can be named.

---

${sourceNotes}
`;
}

async function buildFundingDoc() {
  return `# Ucaima Avitourism Founding Circle

## Funding idea
Pre-sell future stays to bird groups, naturalist institutions, specialist operators, and founding patrons. The pitch is not a donation. It is early access plus future room-night credits that help Ucaima fund the field-base upgrades needed to host birders credibly.

## Suggested tiers

### Individual Founder - $2.5k
4 future nights for 2 people, founder recognition, and invitation to the first founder birding week.

### Bird Club Circle - $15k
30 pooled night credits, private club departure window, annual field report, and member briefing.

### Institutional Partner - $50k
120 night credits, field-course or research residency block, route co-design, and named guide-training support.

### Founding Patron - $100k+
250 night credits, named basecamp upgrade, annual hosted visit, and private field report briefing.

## What the money funds
- Dawn logistics: early breakfast, coffee, water, boxed lunches.
- Birding infrastructure: observation deck/blind, quiet trails, gear room, charging station.
- Field credibility: route maps, checklist, data station, guide training, field note protocol.
- Safety and operations: comms plan, first-aid process, guest code of conduct.

## Measurable model
One designed departure: 10 guests x 6 nights = 60 room-nights before extensions.

Year 1 scenario:
- 4 departures = 240 room-nights.
- 8 departures = 480 room-nights.
- 12 departures = 720 room-nights.

Replace with Ucaima's actual ADR, room count, seasonality, guide cost, and margin assumptions.
`;
}

async function main() {
  if (!process.env.DATABASE_URL) {
    throw new Error("DATABASE_URL is missing. Check AGB-CRM/.env.local.");
  }

  await Promise.all([fs.access(FINAL_PPTX), fs.access(CONTACT_SHEET), fs.access(SOURCE_NOTES), fs.access(TALK_TRACK)]);

  const actorId = await firstUserForWorkspace(sql);
  const project = await findUcaimaProject(sql);
  const projectId = project.id;
  const refColumn = await projectLinkRefColumn(sql);
  const touchColumn = await touchRefColumn(sql);
  const linkRefId = refColumn === "lob_id" ? project.lobId : projectId;
  const touchRefId = touchColumn === "lob_id" ? project.lobId : projectId;
  if (!linkRefId) {
    throw new Error(`Project ${UCAIMA_PROJECT_TITLE} has no lob_id for project_links.`);
  }
  if (!touchRefId) {
    throw new Error(`Project ${UCAIMA_PROJECT_TITLE} has no lob_id for touches.`);
  }

  const uploadedFiles = await uploadDeckAttachments(linkRefId);
  const deckPackage = await buildDeckPackageDoc(uploadedFiles);
  const sourceBrief = await buildSourceBriefDoc();
  const fundingDoc = await buildFundingDoc();

  const saved = await sql.begin(async (tx) => {
    const docs = [];
    docs.push(
      await ensureProjectDoc(
        tx,
        actorId,
        linkRefId,
        refColumn,
        "Ucaima Avitourism Pitch Deck Package",
        "marketing",
        deckPackage,
        "Editable PPTX path, talk track, source notes, slide outline, caveats, and immediate follow-ups.",
      ),
    );
    docs.push(
      await ensureProjectDoc(
        tx,
        actorId,
        linkRefId,
        refColumn,
        "Ucaima Avitourism Data & Source Brief",
        "business",
        sourceBrief,
        "Birding, demand, Colombia benchmark, and validation caveats for the Ucaima avitourism pitch.",
      ),
    );
    docs.push(
      await ensureProjectDoc(
        tx,
        actorId,
        linkRefId,
        refColumn,
        "Ucaima Avitourism Founding Circle Funding Model",
        "finance",
        fundingDoc,
        "Future-stay membership tiers, room-night math, and fundable basecamp upgrades.",
      ),
    );
    for (const file of uploadedFiles) {
      docs.push(await ensureProjectFile(tx, actorId, linkRefId, refColumn, file));
    }

    const touchContactId = await ensureUcaimaTouch(
      tx,
      actorId,
      touchColumn,
      touchRefId,
      [
        "Saved avitourism pitch deck package to CRM.",
        `Editable PPTX: ${FINAL_PPTX}`,
        `CRM PPTX attachment: ${uploadedFiles[0]?.storagePath}`,
        `Contact sheet: ${CONTACT_SHEET}`,
        `CRM contact sheet attachment: ${uploadedFiles[1]?.storagePath}`,
        "",
        "Core angle: position Ucaima as Canaima's responsible birding and naturalist field base.",
        "Immediate next step: validate accessible birding routes/species and convert the Founding Circle into a one-page outreach asset.",
      ].join("\n"),
    );

    const milestoneTitles = [
      ["Validate Ucaima avitourism route and target species list", "2026-06-18", 9],
      ["Convert Ucaima avitourism deck into founder one-pager", "2026-06-20", 10],
      ["Build bird club and natural history outreach sequence", "2026-06-22", 11],
    ];
    for (const [title, dueDate, order] of milestoneTitles) {
      const [existing] = await tx`
        select id
        from milestones
        where workspace_id = ${WORKSPACE_ID}
          and project_id = ${projectId}
          and title = ${title}
        limit 1
      `;
      if (existing?.id) {
        await tx`
          update milestones
          set due_date = ${dueDate}, "order" = ${order}, priority = 'now'
          where id = ${existing.id}
        `;
      } else {
        await tx`
          insert into milestones (workspace_id, project_id, title, due_date, created_by, status, "order", priority)
          values (${WORKSPACE_ID}, ${projectId}, ${title}, ${dueDate}, ${actorId}, 'pending', ${order}, 'now')
        `;
      }
    }

    return { docs, touchContactId };
  });

  const docRows = await sql`
    select pl.label, pl.category, pdc.updated_at
    from project_links pl
    left join project_doc_contents pdc on pdc.link_id = pl.id
    where pl.workspace_id = ${WORKSPACE_ID}
      and pl.${sql.unsafe(refColumn)} = ${linkRefId}
      and pl.label like 'Ucaima Avitourism%'
    order by pl.category, pl.label
  `;
  const [{ milestone_count }] = await sql`
    select count(*)::int as milestone_count
    from milestones
    where workspace_id = ${WORKSPACE_ID}
      and project_id = ${projectId}
      and title in (
        'Validate Ucaima avitourism route and target species list',
        'Convert Ucaima avitourism deck into founder one-pager',
        'Build bird club and natural history outreach sequence'
      )
  `;
  const fileRows = await sql`
    select pl.label, pl.kind, pl.category, pl.storage_path, pl.size_bytes
    from project_links pl
    where pl.workspace_id = ${WORKSPACE_ID}
      and pl.${sql.unsafe(refColumn)} = ${linkRefId}
      and pl.label in ('Ucaima Avitourism Proposal PPTX', 'Ucaima Avitourism Deck Contact Sheet')
    order by pl.label
  `;

  console.log(
    JSON.stringify(
      {
        ok: true,
        projectId,
        linkRefId,
        projectTitle: UCAIMA_PROJECT_TITLE,
        refColumn,
        touchColumn,
        savedDocIds: saved.docs,
        touchContactId: saved.touchContactId,
        avitourismDocs: docRows,
        avitourismFiles: fileRows,
        milestoneCount: milestone_count,
        pptx: FINAL_PPTX,
      },
      null,
      2,
    ),
  );
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(async () => {
    await sql.end({ timeout: 5 });
  });
