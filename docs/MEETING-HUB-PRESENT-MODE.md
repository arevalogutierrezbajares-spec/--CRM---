# Meeting Hub + Present Mode — Spec & Plan

**Status:** v1 + Share-to-client implemented (uncommitted; migration applied to live DB) · **Date:** 2026-06-08 · **Owner:** Tomás

> **Share-to-client (done):** the materials panel's **Share** button issues one private,
> tracked **`/access/[token]`** client room per attendee by reusing `createPartnerShare`
> (partnerKind `client`, channel `meeting`). All meeting materials land in a single room;
> existing rooms get a freshly-minted link. View/download tracking flows through the
> existing `partnerAccessEvents`. See `shareMeetingMaterialsAction` in
> `app/(app)/meetings/actions.ts`.

> **Build note (deviation from §5):** present mode lives at **`/present/[id]`** in a new
> top-level route group `app/(stage)/`, NOT at `/meetings/[id]/present`. Reason: the
> `(app)` layout hard-injects the `Sidebar`, and Next.js nested layouts *add* chrome
> rather than replace it — a nested route could not escape the sidebar. The `(stage)`
> group is auth-gated via `requireUser()` but renders a clean full-viewport stage.
> The meeting page's **Present** button opens `/present/[id]` in a new tab.

## 1. Problem

When running a client meeting, I need a single place that holds everything for that
meeting (notes, agenda, attendees, and **materials/decks**), plus a clean
**"screen-share presentation" mode** that hides CRM clutter and looks dynamic. The
client is usually on a phone, so the presented material must adapt to a chosen target
(**phone vs. laptop**). The same materials should also be shareable as a tracked link
when the client is remote/async.

## 2. Key decision — reuse, don't rebuild

The meeting hub already exists. This feature **extends three existing systems**; it does
**not** introduce a new top-level entity.

| Capability | Existing home | Action |
|---|---|---|
| Meeting hub (notes, agenda, attendees, linked project) | `meetings` (`db/schema.ts:1281`) + `app/(app)/meetings/[id]/page.tsx` | **Extend** |
| Private live cockpit | `?live=1` → `components/meetings/live-meeting.tsx` | **Leave as-is** |
| Materials / decks / files / docs | `projectLinks` (`schema.ts:689`), `projectDocContents` (`:745`) | **Reuse as source** |
| File storage (signed up/download) | `lib/project-files/storage.ts` | **Reuse** |
| Tokened external share + view tracking | `partnerShares` / `partnerAccessEvents` + `app/f/[token]` | **Reuse for remote path** |

**Mental model — two views of one meeting:**
- **`?live=1`** = my *private cockpit* (notes, action items, briefs). Unchanged.
- **`/present`** = the *audience-facing clean stage* (this spec). New.

## 3. Scope

### In scope
1. `meetingMaterials` join table — curate which materials show in a given meeting.
2. Materials panel on the meeting detail page (attach / reorder / remove).
3. `/meetings/[id]/present` — full-bleed present mode, no app chrome.
4. Phone/laptop device-target toggle in present mode.
5. Deck/material viewer that renders HTML decks, files, links, and docs responsively.
6. "Share to client" affordance that hands the same materials to the existing
   `partnerShares` → `app/f/[token]` flow.

### Out of scope (this pass)
- Real-time co-presence / cursor sync with the client.
- Live screen-annotation / drawing.
- New analytics dashboards (reuse `partnerAccessEvents` if tracking is needed).
- Authoring decks inside the CRM (decks are produced elsewhere, e.g. the Ucaima HTML deck).

## 4. Data model

### 4.1 New table: `meeting_materials`

```ts
export const meetingMaterials = pgTable(
  "meeting_materials",
  {
    meetingId: uuid("meeting_id").notNull()
      .references(() => meetings.id, { onDelete: "cascade" }),
    projectLinkId: uuid("project_link_id").notNull()
      .references(() => projectLinks.id, { onDelete: "cascade" }),
    workspaceId: uuid("workspace_id").notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    sortOrder: integer("sort_order").notNull().default(0),
    addedBy: uuid("added_by").references(() => users.id),
    addedAt: timestamp("added_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({ pk: primaryKey({ columns: [t.meetingId, t.projectLinkId] }) }),
);
```

**Rationale.** Materials live on a **LoB** (`projectLinks.lobId`); meetings link to a
**Project** (`meetings.linkedProjectId`). A meeting may want a deck from any LoB, so a
direct join is cleaner than inferring through the project→LoB chain. The material's
*content* stays in `projectLinks` (single source of truth); this table only curates
**which** materials appear and **in what order** for **this** meeting.

Migration: `db/migrations/0018_meeting_materials.sql` (next free number).

### 4.2 No changes to existing tables
`meetings`, `projectLinks`, `projectDocContents`, `partnerShares` are untouched.
Present mode reads `projectLinks.kind` (`note | link | file | doc`) to pick a renderer.

## 5. Routes & components

```
app/(app)/meetings/[id]/
  page.tsx                 # EXTEND: add <MeetingMaterials> panel
  present/
    page.tsx               # NEW: full-bleed, no <TopBar>, loads meeting + materials
components/meetings/
  meeting-materials.tsx    # NEW: attach / reorder / remove panel (authoring side)
  present/
    present-stage.tsx      # NEW: device frame + chrome-less stage + keyboard nav
    device-toggle.tsx      # NEW: [ Laptop | Phone ] segmented control
    material-renderer.tsx  # NEW: switch on kind -> iframe | image | doc | link card
db/queries/
  meeting-materials.ts     # NEW: list/add/remove/reorder
app/(app)/meetings/[id]/
  actions.ts               # EXTEND: addMaterial / removeMaterial / reorderMaterials
```

### 5.1 Present route behavior
- Renders **outside** the app shell: no `TopBar`, no sidebar — a dark full-bleed stage.
- Loads via existing `getMeeting(...)` + new `listMeetingMaterials(meetingId)`.
- Default device target = **laptop**; toggle persists per-meeting in `localStorage`.
- Keyboard: `←/→` between materials, `f` fullscreen, `Esc` back to meeting detail.
- A small floating control bar (auto-hides after 3s idle) holds: material switcher,
  device toggle, fullscreen, "Share to client", and "Exit".

### 5.2 Material renderer by `kind`
| `projectLinks.kind` | Render |
|---|---|
| `file` (html) | sandboxed `<iframe>` of the signed URL (HTML decks like Ucaima) |
| `file` (pdf/image) | native viewer / `<img>`, object-fit contained to the stage |
| `link` | full-bleed `<iframe>` if embeddable, else a branded "Open" card |
| `doc` | read-only render of `projectDocContents.text` (markdown) |
| `note` | typographic full-screen note |

## 6. Phone vs. laptop behavior

The toggle changes **the stage the material is rendered into**, not the material:
- **Laptop:** stage fills the viewport at ~16:9.
- **Phone:** stage constrains to a phone aspect (~390×844 frame, centered) so I can
  preview exactly what a client on a phone sees while I screen-share.

Materials must be **authored responsive** to honor this. The Ucaima deck already is
(`outputs/manual-20260608120307-ucaima-birds/.../ucaima-deck.html` has phone media
queries + swipe). Provide a one-line authoring guideline in `docs/` for future decks.

## 7. Remote / async path (reuse)

"Share to client" in present mode does **not** build new sharing — it routes the
selected materials into the existing `partnerShares` flow:
- Create `partnerShares` rows (one per material) with `permissions: ["view"]`.
- Surface the existing tokened public URL (`app/f/[token]`).
- View/download events already land in `partnerAccessEvents` — no new tracking.

This gives one material set, two delivery modes: **live screen-share** (`/present`) and
**tracked link** (`partnerShares`).

## 8. Acceptance criteria

**Data model**
- [ ] `meeting_materials` migration applies cleanly; composite PK prevents dup attach.
- [ ] Deleting a meeting or a `projectLink` cascades and leaves no orphan rows.

**Materials panel (meeting detail)**
- [ ] I can attach any `projectLink` (file/link/doc) to a meeting from a picker.
- [ ] I can reorder and remove attached materials; order persists.
- [ ] Panel shows kind, label, and category for each material.

**Present mode**
- [ ] `/meetings/[id]/present` renders with **zero** app chrome (no TopBar/sidebar).
- [ ] `←/→` switch materials; `Esc` exits; control bar auto-hides when idle.
- [ ] HTML deck (`file`/html) renders in a sandboxed iframe and is interactive.
- [ ] PDF/image/link/doc/note each render via the correct branch of §5.2.
- [ ] Device toggle switches laptop↔phone stage; choice persists per meeting.
- [ ] In phone mode, the stage matches a real phone aspect for accurate preview.
- [ ] Page is performant with a large HTML deck (no layout thrash on toggle).

**Remote share**
- [ ] "Share to client" creates `partnerShares` rows and returns a working `f/[token]`.
- [ ] Viewing the token link records a `partnerAccessEvents` row.

## 9. Build order (suggested commits)
1. `meeting_materials` table + migration + `db/queries/meeting-materials.ts`. *(safe, no UI)*
2. Materials panel + server actions on the meeting detail page.
3. `/present` route + `present-stage` + `material-renderer` (laptop only).
4. Device toggle (phone/laptop) + persistence.
5. "Share to client" wiring into `partnerShares`.
6. Authoring guideline doc for responsive decks.

## 10. Open questions
- Should present mode pull materials **only** from `meeting_materials`, or also auto-
  include docs from the linked Project/LoB? *(Recommend explicit-only to avoid clutter.)*
- Do we want a "presenter notes" overlay (visible to me, not on the shared stage) in v1,
  or defer to the `?live=1` cockpit? *(Recommend defer.)*
- Phone-frame chrome: realistic device bezel, or just an aspect-constrained card?
  *(Recommend plain card — faster, less gimmicky.)*
```
