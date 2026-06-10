import { and, desc, eq, inArray, sql as rawSql, type SQL } from "drizzle-orm";
import { db, schema } from "@/db";

const { contacts, contactChannels, contactTags, tags } = schema;
const LINKEDIN_LEAD_TAG_NAME = "linkedin lead";

export type ContactRow = typeof contacts.$inferSelect;
export type ContactChannelRow = typeof contactChannels.$inferSelect;
export type TagRow = typeof tags.$inferSelect;

export type ContactProjectRef = {
  id: string;
  title: string;
  parentTitle: string | null;
  role: string | null;
};

export type ContactListItem = ContactRow & {
  channels: ContactChannelRow[];
  tags: TagRow[];
  projects: ContactProjectRef[];
};

export type ContactProjectOption = {
  id: string;
  title: string;
  parentTitle: string | null;
  contactCount: number;
};

export type ContactLeadMode = "direct" | "leads" | "all";

export async function listContacts(opts: {
  workspaceId: string;
  archived?: boolean;
  /** Filter to contacts carrying ANY of these tag names (union). */
  tagNames?: string[];
  /** Filter to contacts linked to ANY of these projects (union). */
  projectIds?: string[];
  leadMode?: ContactLeadMode;
}): Promise<ContactListItem[]> {
  const archived = opts.archived ?? false;
  const leadMode = opts.leadMode ?? "all";
  const projectContactIds = opts.projectIds?.length
    ? await listContactIdsForProjects({
        workspaceId: opts.workspaceId,
        projectIds: opts.projectIds,
      })
    : null;

  let rows: ContactRow[];
  if (opts.tagNames?.length) {
    const res = await db
      .selectDistinct({ contact: contacts })
      .from(contacts)
      .innerJoin(contactTags, eq(contactTags.contactId, contacts.id))
      .innerJoin(tags, eq(tags.id, contactTags.tagId))
      .where(
        and(
          eq(contacts.workspaceId, opts.workspaceId),
          eq(contacts.archived, archived),
          inArray(tags.name, opts.tagNames),
        ),
      )
      .orderBy(desc(contacts.updatedAt));
    rows = res.map((r) => r.contact);
  } else {
    rows = await db
      .select()
      .from(contacts)
      .where(
        and(eq(contacts.workspaceId, opts.workspaceId), eq(contacts.archived, archived)),
      )
      .orderBy(desc(contacts.updatedAt));
  }

  if (projectContactIds) {
    rows = rows.filter((r) => projectContactIds.has(r.id));
  }

  if (rows.length === 0) return [];

  const ids = rows.map((r) => r.id);
  const [channels, ctags, projectRefs] = await Promise.all([
    db.select().from(contactChannels).where(inArray(contactChannels.contactId, ids)),
    db
      .select({
        contactId: contactTags.contactId,
        tag: tags,
      })
      .from(contactTags)
      .innerJoin(tags, eq(tags.id, contactTags.tagId))
      .where(inArray(contactTags.contactId, ids)),
    listProjectRefsForContacts({
      workspaceId: opts.workspaceId,
      contactIds: ids,
    }),
  ]);

  const tagsByContact = new Map<string, TagRow[]>();
  for (const tagged of ctags) {
    const contactTags = tagsByContact.get(tagged.contactId);
    if (contactTags) contactTags.push(tagged.tag);
    else tagsByContact.set(tagged.contactId, [tagged.tag]);
  }

  if (leadMode !== "all") {
    rows = rows.filter((row) => {
      const hasLinkedInLeadTag = (tagsByContact.get(row.id) ?? []).some(
        (tag) => tag.name.toLowerCase() === LINKEDIN_LEAD_TAG_NAME,
      );
      return leadMode === "leads" ? hasLinkedInLeadTag : !hasLinkedInLeadTag;
    });
  }

  if (rows.length === 0) return [];

  const projectsByContact = new Map<string, ContactProjectRef[]>();
  for (const ref of projectRefs) {
    const projects = projectsByContact.get(ref.contactId);
    if (projects) projects.push(ref.project);
    else projectsByContact.set(ref.contactId, [ref.project]);
  }

  return rows.map((row) => ({
    ...row,
    channels: channels.filter((c) => c.contactId === row.id),
    tags: tagsByContact.get(row.id) ?? [],
    projects: projectsByContact.get(row.id) ?? [],
  }));
}

export async function getContact(opts: { id: string; workspaceId: string }) {
  const [row] = await db
    .select()
    .from(contacts)
    .where(and(eq(contacts.id, opts.id), eq(contacts.workspaceId, opts.workspaceId)))
    .limit(1);
  if (!row) return null;
  const [channels, ctags, projectRefs] = await Promise.all([
    db
      .select()
      .from(contactChannels)
      .where(eq(contactChannels.contactId, row.id)),
    db
      .select({ tag: tags })
      .from(contactTags)
      .innerJoin(tags, eq(tags.id, contactTags.tagId))
      .where(eq(contactTags.contactId, row.id)),
    listProjectRefsForContacts({
      workspaceId: opts.workspaceId,
      contactIds: [row.id],
    }),
  ]);
  return {
    ...row,
    channels,
    tags: ctags.map((t) => t.tag),
    projects: projectRefs.map((ref) => ref.project),
  };
}

type ProjectContactShape =
  | { mode: "lob"; hasParent: boolean }
  | { mode: "project"; hasParent: boolean }
  | null;

type SchemaProbeRow = {
  has_lob_id: boolean;
  has_project_id: boolean;
  has_lines_of_business: boolean;
  has_parent_lob_id: boolean;
  has_parent_project_id: boolean;
};

type ProjectContactIdRow = {
  contact_id: string;
};

type ProjectRefRow = {
  contact_id: string;
  project_id: string;
  project_title: string;
  parent_title: string | null;
  role: string | null;
};

type ProjectOptionRow = {
  id: string;
  title: string;
  parent_title: string | null;
  contact_count: number | string;
};

async function executeRows<T>(query: SQL): Promise<T[]> {
  const rows = await db.execute(query);
  return rows as unknown as T[];
}

// The schema shape can't change while the process is running, and this probe
// used to hit information_schema 3× per contacts-page request (listContacts →
// project options → project refs). Memoize the promise for the process lifetime;
// a failed probe clears it so the next request retries.
let projectContactShapePromise: Promise<ProjectContactShape> | null = null;

function getProjectContactShape(): Promise<ProjectContactShape> {
  if (!projectContactShapePromise) {
    projectContactShapePromise = probeProjectContactShape().catch((err) => {
      projectContactShapePromise = null;
      throw err;
    });
  }
  return projectContactShapePromise;
}

async function probeProjectContactShape(): Promise<ProjectContactShape> {
  const [shape] = await executeRows<SchemaProbeRow>(rawSql`
    select
      exists (
        select 1 from information_schema.columns
        where table_schema = 'public'
          and table_name = 'project_contacts'
          and column_name = 'lob_id'
      ) as has_lob_id,
      exists (
        select 1 from information_schema.columns
        where table_schema = 'public'
          and table_name = 'project_contacts'
          and column_name = 'project_id'
      ) as has_project_id,
      exists (
        select 1 from information_schema.tables
        where table_schema = 'public'
          and table_name = 'lines_of_business'
      ) as has_lines_of_business,
      exists (
        select 1 from information_schema.columns
        where table_schema = 'public'
          and table_name = 'lines_of_business'
          and column_name = 'parent_lob_id'
      ) as has_parent_lob_id,
      exists (
        select 1 from information_schema.columns
        where table_schema = 'public'
          and table_name = 'projects'
          and column_name = 'parent_project_id'
      ) as has_parent_project_id
  `);

  if (shape?.has_lob_id && shape.has_lines_of_business) {
    return { mode: "lob", hasParent: shape.has_parent_lob_id };
  }
  if (shape?.has_project_id) {
    return { mode: "project", hasParent: shape.has_parent_project_id };
  }
  return null;
}

export async function listContactProjectOptions(opts: {
  workspaceId: string;
  archived?: boolean;
}): Promise<ContactProjectOption[]> {
  const shape = await getProjectContactShape();
  if (!shape) return [];

  const archived = opts.archived ?? false;
  const rows =
    shape.mode === "lob"
      ? await listLobProjectOptions({
          workspaceId: opts.workspaceId,
          archived,
          includeParent: shape.hasParent,
        })
      : await listLegacyProjectOptions({
          workspaceId: opts.workspaceId,
          archived,
          includeParent: shape.hasParent,
        });

  return rows.map((row) => ({
    id: row.id,
    title: row.title,
    parentTitle: row.parent_title,
    contactCount: Number(row.contact_count),
  }));
}

async function listLobProjectOptions(opts: {
  workspaceId: string;
  archived: boolean;
  includeParent: boolean;
}): Promise<ProjectOptionRow[]> {
  if (opts.includeParent) {
    return executeRows<ProjectOptionRow>(rawSql`
      select
        lob.id,
        lob.title,
        parent.title as parent_title,
        count(distinct pc.contact_id)::int as contact_count
      from lines_of_business lob
      inner join project_contacts pc on pc.lob_id = lob.id
      inner join contacts c
        on c.id = pc.contact_id
       and c.workspace_id = ${opts.workspaceId}
       and c.archived = ${opts.archived}
      left join lines_of_business parent on parent.id = lob.parent_lob_id
      where lob.workspace_id = ${opts.workspaceId}
      group by lob.id, lob.title, parent.title
      order by
        case when lower(lob.title) = 'ucaima transformation' then 0 else 1 end,
        count(distinct pc.contact_id) desc,
        lob.title asc
    `);
  }

  return executeRows<ProjectOptionRow>(rawSql`
    select
      lob.id,
      lob.title,
      null::text as parent_title,
      count(distinct pc.contact_id)::int as contact_count
    from lines_of_business lob
    inner join project_contacts pc on pc.lob_id = lob.id
    inner join contacts c
      on c.id = pc.contact_id
     and c.workspace_id = ${opts.workspaceId}
     and c.archived = ${opts.archived}
    where lob.workspace_id = ${opts.workspaceId}
    group by lob.id, lob.title
    order by
      case when lower(lob.title) = 'ucaima transformation' then 0 else 1 end,
      count(distinct pc.contact_id) desc,
      lob.title asc
  `);
}

async function listLegacyProjectOptions(opts: {
  workspaceId: string;
  archived: boolean;
  includeParent: boolean;
}): Promise<ProjectOptionRow[]> {
  if (opts.includeParent) {
    return executeRows<ProjectOptionRow>(rawSql`
      select
        p.id,
        p.title,
        parent.title as parent_title,
        count(distinct pc.contact_id)::int as contact_count
      from projects p
      inner join project_contacts pc on pc.project_id = p.id
      inner join contacts c
        on c.id = pc.contact_id
       and c.workspace_id = ${opts.workspaceId}
       and c.archived = ${opts.archived}
      left join projects parent on parent.id = p.parent_project_id
      where p.workspace_id = ${opts.workspaceId}
      group by p.id, p.title, parent.title
      order by
        case when lower(p.title) = 'ucaima transformation' then 0 else 1 end,
        count(distinct pc.contact_id) desc,
        p.title asc
    `);
  }

  return executeRows<ProjectOptionRow>(rawSql`
    select
      p.id,
      p.title,
      null::text as parent_title,
      count(distinct pc.contact_id)::int as contact_count
    from projects p
    inner join project_contacts pc on pc.project_id = p.id
    inner join contacts c
      on c.id = pc.contact_id
     and c.workspace_id = ${opts.workspaceId}
     and c.archived = ${opts.archived}
    where p.workspace_id = ${opts.workspaceId}
    group by p.id, p.title
    order by
      case when lower(p.title) = 'ucaima transformation' then 0 else 1 end,
      count(distinct pc.contact_id) desc,
      p.title asc
  `);
}

async function listContactIdsForProjects(opts: {
  workspaceId: string;
  projectIds: string[];
}): Promise<Set<string>> {
  if (opts.projectIds.length === 0) return new Set();
  const shape = await getProjectContactShape();
  if (!shape) return new Set();

  const projectIdList = rawSql.join(
    opts.projectIds.map((id) => rawSql`${id}`),
    rawSql`, `,
  );

  const rows =
    shape.mode === "lob"
      ? await executeRows<ProjectContactIdRow>(rawSql`
          select distinct pc.contact_id
          from project_contacts pc
          inner join lines_of_business lob on lob.id = pc.lob_id
          inner join contacts c
            on c.id = pc.contact_id
           and c.workspace_id = ${opts.workspaceId}
          where lob.workspace_id = ${opts.workspaceId}
            and lob.id in (${projectIdList})
        `)
      : await executeRows<ProjectContactIdRow>(rawSql`
          select distinct pc.contact_id
          from project_contacts pc
          inner join projects p on p.id = pc.project_id
          inner join contacts c
            on c.id = pc.contact_id
           and c.workspace_id = ${opts.workspaceId}
          where p.workspace_id = ${opts.workspaceId}
            and p.id in (${projectIdList})
        `);

  return new Set(rows.map((row) => row.contact_id));
}

async function listProjectRefsForContacts(opts: {
  workspaceId: string;
  contactIds: string[];
}): Promise<Array<{ contactId: string; project: ContactProjectRef }>> {
  if (opts.contactIds.length === 0) return [];

  const shape = await getProjectContactShape();
  if (!shape) return [];

  const contactIdList = rawSql.join(
    opts.contactIds.map((id) => rawSql`${id}`),
    rawSql`, `,
  );

  const rows =
    shape.mode === "lob"
      ? await listLobProjectRefsForContacts({
          workspaceId: opts.workspaceId,
          contactIdList,
          includeParent: shape.hasParent,
        })
      : await listLegacyProjectRefsForContacts({
          workspaceId: opts.workspaceId,
          contactIdList,
          includeParent: shape.hasParent,
        });

  return rows.map((row) => ({
    contactId: row.contact_id,
    project: {
      id: row.project_id,
      title: row.project_title,
      parentTitle: row.parent_title,
      role: row.role,
    },
  }));
}

async function listLobProjectRefsForContacts(opts: {
  workspaceId: string;
  contactIdList: SQL;
  includeParent: boolean;
}): Promise<ProjectRefRow[]> {
  if (opts.includeParent) {
    return executeRows<ProjectRefRow>(rawSql`
      select
        pc.contact_id,
        lob.id as project_id,
        lob.title as project_title,
        parent.title as parent_title,
        pc.role
      from project_contacts pc
      inner join lines_of_business lob on lob.id = pc.lob_id
      left join lines_of_business parent on parent.id = lob.parent_lob_id
      where lob.workspace_id = ${opts.workspaceId}
        and pc.contact_id in (${opts.contactIdList})
      order by lob.title asc
    `);
  }

  return executeRows<ProjectRefRow>(rawSql`
    select
      pc.contact_id,
      lob.id as project_id,
      lob.title as project_title,
      null::text as parent_title,
      pc.role
    from project_contacts pc
    inner join lines_of_business lob on lob.id = pc.lob_id
    where lob.workspace_id = ${opts.workspaceId}
      and pc.contact_id in (${opts.contactIdList})
    order by lob.title asc
  `);
}

async function listLegacyProjectRefsForContacts(opts: {
  workspaceId: string;
  contactIdList: SQL;
  includeParent: boolean;
}): Promise<ProjectRefRow[]> {
  if (opts.includeParent) {
    return executeRows<ProjectRefRow>(rawSql`
      select
        pc.contact_id,
        p.id as project_id,
        p.title as project_title,
        parent.title as parent_title,
        pc.role
      from project_contacts pc
      inner join projects p on p.id = pc.project_id
      left join projects parent on parent.id = p.parent_project_id
      where p.workspace_id = ${opts.workspaceId}
        and pc.contact_id in (${opts.contactIdList})
      order by p.title asc
    `);
  }

  return executeRows<ProjectRefRow>(rawSql`
    select
      pc.contact_id,
      p.id as project_id,
      p.title as project_title,
      null::text as parent_title,
      pc.role
    from project_contacts pc
    inner join projects p on p.id = pc.project_id
    where p.workspace_id = ${opts.workspaceId}
      and pc.contact_id in (${opts.contactIdList})
    order by p.title asc
  `);
}
