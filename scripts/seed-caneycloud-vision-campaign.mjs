import dotenv from "dotenv";
import fs from "node:fs";
import path from "node:path";
import postgres from "postgres";
import { fileURLToPath } from "node:url";

dotenv.config({ path: ".env.local" });

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const campaignPath = path.resolve(
  __dirname,
  "../lib/pitch-feedback/caneycloud-vision-campaign.json",
);
const campaign = JSON.parse(fs.readFileSync(campaignPath, "utf8"));

const WORKSPACE_ID = "11111111-2222-3333-4444-aaaaaaaaaaa1";
const FALLBACK_ACTOR_ID = "9d543a9c-3dfe-4f2b-aa73-e0156d478dce";
const PROJECT_TITLE = "CaneyCloud";

if (!process.env.DATABASE_URL) {
  throw new Error("DATABASE_URL is not set. Load .env.local before running.");
}

const sql = postgres(process.env.DATABASE_URL, {
  prepare: false,
  ssl: "require",
  connection: { search_path: "public, extensions" },
});

async function columnExists(tableName, columnName) {
  const [row] = await sql`
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = ${tableName}
      and column_name = ${columnName}
    limit 1
  `;
  return Boolean(row);
}

async function main() {
  let actorId = FALLBACK_ACTOR_ID;
  if (await columnExists("users", "workspace_id")) {
    const [actor] = await sql`
      select id
      from users
      where workspace_id = ${WORKSPACE_ID}
      order by created_at
      limit 1
    `;
    actorId = actor?.id ?? actorId;
  } else {
    const [actor] = await sql`
      select id
      from users
      order by created_at
      limit 1
    `;
    actorId = actor?.id ?? actorId;
  }

  const hasLobId = await columnExists("pitch_feedback_campaigns", "lob_id");
  const hasProjectId = await columnExists("pitch_feedback_campaigns", "project_id");

  let parentId = null;
  if (hasLobId) {
    const [lob] = await sql`
      select id from lines_of_business
      where workspace_id = ${WORKSPACE_ID} and title = ${PROJECT_TITLE}
      limit 1
    `;
    parentId = lob?.id ?? null;
  } else if (hasProjectId) {
    const [project] = await sql`
      select id from projects
      where workspace_id = ${WORKSPACE_ID} and title = ${PROJECT_TITLE}
      limit 1
    `;
    parentId = project?.id ?? null;
  }

  const [existing] = await sql`
    select id, version
    from pitch_feedback_campaigns
    where workspace_id = ${WORKSPACE_ID}
      and name = ${campaign.name}
    limit 1
  `;

  if (existing) {
    const nextVersion = Number(existing.version ?? 1) + 1;
    if (hasLobId) {
      await sql`
        update pitch_feedback_campaigns
        set lob_id = ${parentId},
            description = ${campaign.description},
            audience = ${campaign.audience},
            status = 'active',
            version = ${nextVersion},
            sections = ${sql.json(campaign.sections)},
            updated_at = now()
        where id = ${existing.id}
      `;
    } else if (hasProjectId) {
      await sql`
        update pitch_feedback_campaigns
        set project_id = ${parentId},
            description = ${campaign.description},
            audience = ${campaign.audience},
            status = 'active',
            version = ${nextVersion},
            sections = ${sql.json(campaign.sections)},
            updated_at = now()
        where id = ${existing.id}
      `;
    } else {
      await sql`
        update pitch_feedback_campaigns
        set description = ${campaign.description},
            audience = ${campaign.audience},
            status = 'active',
            version = ${nextVersion},
            sections = ${sql.json(campaign.sections)},
            updated_at = now()
        where id = ${existing.id}
      `;
    }

    console.log(
      `Updated "${campaign.name}" to v${nextVersion} with ${campaign.sections.length} sections.`,
    );
    return;
  }

  if (hasLobId) {
    const [created] = await sql`
      insert into pitch_feedback_campaigns (
        workspace_id, lob_id, name, description, audience, status, version,
        sections, created_by, updated_at
      ) values (
        ${WORKSPACE_ID}, ${parentId}, ${campaign.name}, ${campaign.description},
        ${campaign.audience}, 'active', 1, ${sql.json(campaign.sections)},
        ${actorId}, now()
      )
      returning id
    `;
    console.log(
      `Created "${campaign.name}" (${created.id}) with ${campaign.sections.length} sections.`,
    );
    return;
  }

  if (hasProjectId) {
    const [created] = await sql`
      insert into pitch_feedback_campaigns (
        workspace_id, project_id, name, description, audience, status, version,
        sections, created_by, updated_at
      ) values (
        ${WORKSPACE_ID}, ${parentId}, ${campaign.name}, ${campaign.description},
        ${campaign.audience}, 'active', 1, ${sql.json(campaign.sections)},
        ${actorId}, now()
      )
      returning id
    `;
    console.log(
      `Created "${campaign.name}" (${created.id}) with ${campaign.sections.length} sections.`,
    );
    return;
  }

  const [created] = await sql`
    insert into pitch_feedback_campaigns (
      workspace_id, name, description, audience, status, version,
      sections, created_by, updated_at
    ) values (
      ${WORKSPACE_ID}, ${campaign.name}, ${campaign.description},
      ${campaign.audience}, 'active', 1, ${sql.json(campaign.sections)},
      ${actorId}, now()
    )
    returning id
  `;
  console.log(
    `Created "${campaign.name}" (${created.id}) with ${campaign.sections.length} sections.`,
  );
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await sql.end();
  });
