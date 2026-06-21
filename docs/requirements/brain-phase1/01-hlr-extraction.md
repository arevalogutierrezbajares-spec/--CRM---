I have read the entire 417-line HLR. Here is the dense extraction.

---

# THE BRAIN — v0 BUILD EXTRACTION (from THE-BRAIN-HLR.md V1.1)

**Module:** living architecture-map at `/brain` route inside AGB-CRM (Next.js App Router + Drizzle + Supabase, deployed x.caneycloud.com). Absorbs existing `/platforms`, `/roadmap`, `/overlord` surfaces into one canvas. Design LOCKED (mockup `designs/brain-canvas-20260621/finalized.html`, Impeccable 34/40). Derived-not-drawn: regenerated from source-of-truth artifacts on every commit + nightly; zero manual upkeep (the anti-goal — never a Backstage-style hand-maintained `catalog-info.yaml`).

**Renderer:** React Flow (`@xyflow/react` v12, `colorMode=dark`). v0 stopgap mockup uses `innerHTML` replacement; production must reconcile via React Flow node model (NFR-PERF-3).

**The 5 systems (S1–S5):**
| ID | System | Stack | State (2026-06-21) | Shape in Brain |
|----|--------|-------|--------------------|----------------|
| S1 | VAV (Venezuela Avitourism marketplace) | Next.js 16, 243 API routes, Supabase | Live, ~done + roadmap | First-class territory |
| S2 | CaneyCloud (PMS) | Python FastAPI ~368 endpoints + Next 14 | Live | First-class territory + **host** for Restaurants |
| S3 | AGB-CRM (control plane) | Next 16 + Drizzle, 70 routes | Live; hosts the Brain | First-class territory |
| S4 | Caney Restaurants (POS/ops) | FastAPI + Vite; modules M_POS, M_BOOK, M_KDS, M_INV, M_PAY, M_FISCAL, M_ACCT; apps diner-web, foh-web, kds-display, operator-web | ~74% built, release-gated `dark` (gated by `GET /api/v1/platform/release-mode`, dark→live) | **Module-mounted territory** inside CaneyCloud (tenant-scoped via `X-Restaurant-Id`; theme/auth inherited) |
| S5 | Caney Academy / CaneyLearn (LMS) | Planned (FastAPI + Postgres + Next.js, reuse CaneyEducation) | ~12% — curriculum drafted, no codebase (`~/vz-avitourism-curriculum`) | **Planned / roadmap-only territory** (nodes from manifest, render `needed`/fog-of-war) |

> **v0 caveat:** §9 v0 says "the three live systems" + "the 5 interchanges" + System axis. S4 Restaurants is a **v1** add; S5 Academy is **v2**. So v0 ships S1–S3 only. Treat S4/S5 schema fields as present-but-unpopulated in v0.

---

## 1. GRAPH-DATA SCHEMA (`brain-graph.json`, §10 — verbatim)

```jsonc
{
  "version": "1.1",
  "generatedAt": "2026-06-21T00:00:00Z",
  "commit": { "vav": "sha", "caney": "sha", "crm": "sha", "restaurants": "sha", "academy": null },
  "nodes": [{
    "id": "vav.bookings",
    "level": 0 | 1 | 2 | 3,        // portfolio|system|domain|surface
    "kind": "system" | "domain" | "surface" | "entity",
    "parentId": "vav" | null,
    "label": "Bookings",
    "system": "vav" | "caney" | "crm" | "restaurants" | "academy" | null,
    "source": "openapi" | "migrations" | "manifest" | "host_mount",  // derivation provenance (V1.1)
    "hosted_by": "caney" | null,    // set for module-mounted systems (restaurants), else null
    "fn": "sales" | "ops" | "growth" | "cx" | "admin" | "platform" | null,
    "state": "done" | "doing" | "needed",   // restaurants=doing while release-mode dark; academy nodes=needed
    "liveness": "ok" | "dead" | "atrophy" | null,
    "size": "sm" | "md" | "lg",
    "owner": null, "branch": null, "last_commit": null,
    "docs_ref": "openapi#receivePmsEvent | mdx | adr | null",
    "surfaces": ["/api/bookings", "..."],       // domain-level
    "meta": "243 routes · 194 pages · 141 mig",  // system-level
    "summary": "plain-English (cartographer)",
    "pos": { "x": 27, "y": 38 }                  // pinned, deterministic
  }],
  "edges": [{
    "id": "ix1",
    "kind": "contains" | "calls" | "reads_writes" | "interchange",
    "subtype": "host_mount" | null,              // host_mount = module-mounted-in-host (restaurants→caney)
    "from": { "system": "vav", "domain": "PMS Mirror" },
    "to":   { "system": "caney", "domain": "Channel" },
    "purpose": "Booking & availability",         // interchange only
    "health": "ok" | "warn" | "dark",            // interchange only
    "contract_status": "live" | "planned",       // planned = not yet in code (dashed, fog-of-war); excluded from FR-PIPE-6 hashing
    "route": "POST /api/pms/webhook/caneycloud",
    "contract_ref": "docs/pms-integration/05-api/openapi.yaml",
    "contract_hash": "7af3c1",                    // null when contract_status=planned
    "version": "v1.4",
    "breaks": ["Change Room.ratePlanId → VAV mirror writes fail silently.", "..."]
  }],
  "functions": [{ "id": "sales", "name": "Sales & Revenue", "pct": 62, "members": ["vav.bookings", "restaurants.pos", "..."] }],
  "externals": ["Stripe", "Anthropic", "WhatsApp", "Mapbox", "SiteMinder", "Inngest", "Resend", "PostHog", "Sentry"]
}
```

**Field meanings / allowed values:**

*Top-level:* `version` (schema "1.1") · `generatedAt` (ISO ts) · `commit` (per-system SHA map; `academy:null` until code exists) · `nodes[]` · `edges[]` · `functions[]` · `externals[]` (9 external deps listed above).

*Node fields:*
- `id` — dotted, e.g. `vav.bookings`; globally unique (de-dup assertion keys on this).
- `level` — `0`=portfolio, `1`=system, `2`=domain, `3`=surface.
- `kind` — `system | domain | surface | entity`.
- `parentId` — id of parent, or `null` at L0.
- `label` — display name.
- `system` — `vav | caney | crm | restaurants | academy | null`. **Restaurants surfaces MUST be `restaurants`, never `caney`** (FR-PIPE-13 de-dup).
- `source` (V1.1 provenance) — `openapi | migrations | manifest | host_mount`. Manifest-sourced nodes MUST also have `state:"needed"` (NFR-OBS-5 fails build otherwise).
- `hosted_by` — `caney | null`; set only for module-mounted systems (restaurants).
- `fn` — business function: `sales | ops | growth | cx | admin | platform | null`.
- `state` — `done | doing | needed`. Restaurants=`doing` while release-mode `dark`; Academy nodes=`needed`.
- `liveness` — `ok | dead | atrophy | null` (null until v2 liveness extractor).
- `size` — `sm | md | lg` (∝ child count; FR-GRAPH-5: ≥3 surfaces→`lg`, 1–2→`md`, 0→`sm`).
- `owner | branch | last_commit` — nullable; from deploy-state extractor.
- `docs_ref` — `openapi#operationId | mdx | adr | null`.
- `surfaces[]` — domain-level array of route/file paths.
- `meta` — system-level metadata string (e.g. `"243 routes · 194 pages · 141 mig"`).
- `summary` — plain-English (cartographer, v2; null in v0).
- `pos` — `{x,y}` pinned deterministic coordinates.

*Edge fields:*
- `id` — e.g. `ix1`.
- `kind` — `contains | calls | reads_writes | interchange`.
- `subtype` — `host_mount | null` (host_mount = restaurants→caney module-mount).
- `from / to` — `{system, domain}` objects (interchange).
- `purpose` — interchange only (e.g. "Booking & availability").
- `health` — interchange only: `ok | warn | dark`.
- `contract_status` — `live | planned`. `planned` = not yet in code → dashed/fog-of-war, **excluded from FR-PIPE-6 contract-hash breakage**.
- `route` — e.g. `POST /api/pms/webhook/caneycloud`.
- `contract_ref` — file path of the contract.
- `contract_hash` — hex hash; **`null` when `contract_status=planned`**.
- `version` — e.g. `v1.4`.
- `breaks[]` — "what breaks" impact list (consumer call-sites / failure modes; for planned edges = build blocker).

*Functions:* `{ id, name, pct, members[] }` — `pct` = % readiness; `members[]` = node ids across all 5 systems.

---

## 2. FR-PIPE-* DERIVATION PIPELINE (15 FRs)

**Format:** `FR-AREA-N: [Actor] can [capability].` Actors: **Viewer** (any auth'd AGB-CRM user), **Agent** (build agent via API), **System** (pipeline/runtime).

- **FR-PIPE-1** *(v0)*: Extract **surface nodes** from each system's OpenAPI spec. Reads VAV `docs/pms-integration/05-api/openapi.yaml`, CaneyCloud `APP/backend/api/openapi.yaml`, AGB-CRM route tree. Emit: exactly one surface node per `paths` entry with method, path, operationId, owning domain. Route count per system within ±2 of spec path count.
- **FR-PIPE-2** *(v0)*: Extract **entity nodes** from DB migration history. Reads Supabase migrations (VAV/CRM), Alembic (CaneyCloud), Drizzle `schema.ts` (CRM). A table added in a migration appears as a node next build.
- **FR-PIPE-3** *(v0)*: Derive **domain nodes** by clustering surfaces from OpenAPI tags, route-group folders, and (nightly) LLM cartographer. Every surface resolves to exactly one domain; orphans (no tag/folder) clustered by nightly cartographer + flagged `derived:llm`.
- **FR-PIPE-4** *(v0)*: Detect **cross-system interchanges** by scanning known integration signatures. Live seed signatures: HMAC webhook route `/api/pms/webhook/caneycloud`, `VAV_SUPABASE_*` service-role reads, `intake-contract.ts`, `mcp_registry.py`, `overlord/sync`, and the Restaurants↔CaneyCloud folio/host-mount signature (`X-Restaurant-Id` + `release-mode`). Each emits one interchange edge with from/to {system,domain}, route, contract_ref. **Planned interchanges (no live signature) come from the roadmap manifest (FR-PIPE-14), NOT a code scan.**
- **FR-PIPE-5** *(v1)*: Compute **contract hash** per interchange contract per commit. Each interchange stores `contract_ref` + `contract_hash`; content change → hash change next build.
- **FR-PIPE-6** *(v1)*: Mark interchange **breaking** when producer's contract hash changes without consumer update. → health `warn` (or `red` if a typed field referenced by consumers was removed) + generated "what breaks" call-site list. *(OQ-2: needs a typed-field differ, not just file hash.)*
- **FR-PIPE-7** *(v0)*: Overlay **build state (done/doing/needed)** onto domains from task boards. Reads Operation Overlord `section-*/TASKS.md`, AGB-CRM `_tasks/_BOARD.md`. `needed` domains carry source task IDs.
- **FR-PIPE-8** *(v1)*: Derive recent **"built" events** from append-only handoff log `HANDOFF-LOG.md`. Entries within snapshot window → `recently_shipped` annotations (date, files-changed count).
- **FR-PIPE-9** *(v1)*: Derive **done/doing from git + Vercel deploy** when a system has no task board (VAV has no Overlord board). Merged-to-main + deployed → `done`; open branches/WIP → `doing`.
- **FR-PIPE-10** *(v2)*: Derive **liveness (lit/dim/atrophy)** from runtime telemetry (PostHog + health pings). Zero events in atrophy window → `live:dead`; recent events + healthy pings → `live:ok` (mockup shows `Itinerary AI` as `live:dead`).
- **FR-PIPE-11** *(v2)*: Nightly **LLM cartographer** — plain-English `summary` per system/domain/interchange (regenerated from latest handoff + graph diff) + assign orphan nodes to a domain.
- **FR-PIPE-12** *(v0)*: Emit a single versioned **`brain-graph.json`** per build + persist snapshot for time-travel. Each build writes `brain-graph.json` (schema §10) + a row in `brain_snapshots` table keyed by commit SHA + timestamp; consecutive snapshots diffable.
- **FR-PIPE-13** *(v1)*: Derive a **module-mounted system** (Restaurants) as its own first-class territory while modeling host-mount + avoiding double-count. Restaurants M_* routes emit under `system:"restaurants"` NOT `caney`; a single `hosted_by` edge (kind `interchange`, subtype `host_mount`) links `restaurants → caney` carrying release-mode contract ref. Portfolio % + per-system counts count each surface **exactly once** — verifiable by de-dup assertion over node ids.
- **FR-PIPE-14** *(v2)*: Derive a **planned system** (Academy) from a roadmap/manifest rather than OpenAPI/migrations; emit nodes as `needed`. When no OpenAPI/migration history, read domains/surfaces from declared manifest (the integration plan's trail→course structure); every node carries `state:"needed"` + `source:"manifest"`; renders as fog-of-war; excluded from route-count + liveness derivations.
- **FR-PIPE-15** *(v1)*: Derive **host-mount release state** and reflect it as the territory's overall state. Restaurants reads `doing` while `release-mode = dark`, flips to `done`/`live` only when `release-mode = live`; `host_mount` interchange health is `dark` while gated, `ok` once live, with blocker ("release-mode = dark") shown in its "what breaks" list.

**Extractor → emit table (§10) — what each extractor reads/emits:**
| Extractor | Reads | Emits |
|-----------|-------|-------|
| **openapi-surfaces** | VAV `docs/pms-integration/05-api/openapi.yaml`; CaneyCloud `APP/backend/api/openapi.yaml` (+ `schema.gen.ts`); AGB-CRM route tree; Restaurants module routes (`caneycloud-restaurant/modules/M_*/routes`) | surface nodes (method, path, operationId), `calls` edges, domain assignment via tags; Restaurants surfaces tagged `system:"restaurants"` (never `caney`) |
| **migration-entities** | Supabase migrations (VAV/CRM), Alembic (CaneyCloud), Drizzle `schema.ts` (CRM); Restaurants module migrations (`modules/M_*/migrations`) | entity nodes, `reads/writes` edges |
| **interchange-detector** | grep signatures: `pms/webhook/caneycloud`, `VAV_SUPABASE_*`, `lib/onboarding/intake-contract.ts`, `mcp_registry.py`, `overlord/sync`, SiteMinder provision, `X-Restaurant-Id` + `release-mode` | interchange edges (from/to {system,domain}, route, contract_ref, purpose, `contract_status`) |
| **host-mount** (V1.1) | `caneycloud-restaurant/MODULE-INTEGRATION.md` (`GET /api/v1/platform/release-mode`, `X-Restaurant-Id`, `frontend_flags`) | `host_mount` interchange edge `restaurants → caney`; Restaurants `state` from `release_mode` (dark=`doing`, live=`done`); de-dup assertion |
| **manifest-source** (V1.1) | `~/vz-avitourism-curriculum/modules/lms-integration-plan.md` (trails AV-1..AV-4 → 14 courses) + declared planned-interchange manifest | Academy domain/surface nodes `state:"needed"`, `source:"manifest"`; 3 planned interchange edges (Academy→VAV, Academy→AGB-CRM, VAV→Restaurants) `contract_status:"planned"` |
| **contract-hasher** | each interchange's contract file (OpenAPI op, `intake-contract.ts`, MCP tool schema, sync envelope) | `contract_hash`, `health`, generated `breaks[]` |
| **state-overlay** | Operation Overlord `section-*/TASKS.md`, AGB-CRM `_tasks/_BOARD.md` | domain `state` (done/doing/needed), source task IDs |
| **handoff-overlay** | `HANDOFF-LOG.md` | `recently_shipped` annotations (date, files-changed) |
| **deploy-state** | git (branch/last_commit) + Vercel deploy status | `state` for board-less systems, `owner/branch/last_commit` |
| **liveness** (v2) | PostHog events + health pings | node `liveness` (ok/dead/atrophy) + last-activity ts |
| **cartographer** (v2, nightly) | new handoff entries + graph diff | node `summary` strings, orphan→domain clustering |

**Host-mounted (Restaurants) handling:** surfaces under `system:"restaurants"` (never `caney`); single `host_mount` interchange edge restaurants→caney; state driven by `release-mode` (dark=`doing`, live=`done`); de-dup assertion ensures no surface id appears under both systems. **Planned-from-manifest (Academy) handling:** no OpenAPI/migrations → read nodes from `lms-integration-plan.md` trail→course manifest; all nodes `state:"needed"` + `source:"manifest"`; fog-of-war; excluded from route-count + liveness; auto-converts to derived nodes when a real repo appears (NFR-FRESH-6).

---

## 3. L0 PORTFOLIO SPEC

**5 systems** at L0 (S1–S5 above): VAV, CaneyCloud, AGB-CRM, Caney Restaurants (module-mounted, renders with `host_mount` link to CaneyCloud), Caney Academy (fog-of-war `needed` planned territory). Each system shows % built + its interchanges (FR-AXIS-2). *(v0 renders S1–S3 only.)*

**Interchange "stations" at L0 (FR-XSYS-1):** rendered as curved links between systems with **health-colored clickable stations at midpoints** (ok/warn/dark). 

The HLR documents **5 live (v0) + 4 V1.1 = 9 total interchanges**, but does NOT enumerate all 9 in one list. Reconstructed:

**The 5 live/seed interchanges** (FR-PIPE-4 / §9 v0 "the 5 interchanges" / FR-XSYS-1 "5 interchanges render"):
1. **VAV → CaneyCloud** — HMAC PMS webhook `POST /api/pms/webhook/caneycloud` (booking & availability mirror; `contract_ref: docs/pms-integration/05-api/openapi.yaml`). *(This is the schema's example `ix1`.)*
2. **VAV ↔ Supabase service-role** — `VAV_SUPABASE_*` service-role reads.
3. **Onboarding intake contract** — `lib/onboarding/intake-contract.ts`.
4. **MCP registry** — `mcp_registry.py`.
5. **Overlord sync** — `overlord/sync` (sync envelope). *(SiteMinder provision is also listed as a detector signature.)*

**The 4 V1.1 interchanges (FR-XSYS-10) — each with producer, consumer, purpose, health, contract_status:**
6. **Caney Restaurants → CaneyCloud** — folio charges & tenant host mount; health `dark`→`ok` per release-mode (FR-PIPE-15); `contract_status: live`; `contract_ref: caneycloud-restaurant/MODULE-INTEGRATION.md` (release-mode + `X-Restaurant-Id`). *(subtype `host_mount`.)*
7. **VAV → Caney Restaurants** — dining experiences/bookings surfaced into the marketplace; health `dark`; `contract_status: planned`.
8. **Caney Academy → VAV** — certified guides become verified VAV providers; health `dark`; `contract_status: planned (blocked on Academy build)`.
9. **Caney Academy → AGB-CRM** — enrollment intake → CRM contacts; health `dark`; `contract_status: planned`.

> Note: §10 manifest-source lists the 3 *planned* edges as "Academy→VAV, Academy→AGB-CRM, VAV→Restaurants" — i.e. of the 4 V1.1 edges, #6 (Restaurants→CaneyCloud) is **live** (host-mount), and #7/#8/#9 are the 3 **planned** edges. (#7 VAV→Restaurants is grouped with the planned set.)

**L0 detail panel (FR-DETAIL-2, `selPortfolio`):** per-system % built, an aggregate portfolio % built, and the full list of cross-system links with health + purpose.

---

## 4. L1 SPEC (System → Domains)

- **Focus + context cross-system threads (FR-XSYS-2, `thread-lbl`):** at L1, each interchange touching the focused system renders a **thread** from its owning domain out to the linked system, labeled with **direction + purpose**.
- **Focus+context invariant (FR-XSYS-4):** an interchange owned by the current node is represented at **L0 (station), L1 (thread), L2 (portal)** — never hidden by zoom.
- **Semantic-zoom drill-down (FR-NAV-1, `go()`):** click a System hub → L0→L1; a Domain → L1→L2; a Surface → opens detail panel. **Shared-element zoom (FR-NAV-6):** drill-in scales from clicked node's coords (~200–300ms); reduced-motion = instant cut.
- **Breadcrumb (FR-NAV-3, `crumbs`):** shows Portfolio › System › Domain (or Functions › Function › Domain); click any crumb to jump to that level.
- **Altitude indicator (FR-NAV-4, `altitude`):** e.g. "Portfolio · 3 systems · L0", "VAV · domains · L1", "Bookings · surfaces · L2".
- **Minimap (FR-NAV-5, `minimap`):** "you are here" overview **persists at all levels**; shows all systems (or functions) with current location highlighted; clickable to jump.
- **The "3 up-paths" (FR-NAV-2, `backbtn`/`crumbs`/Esc):** zoom out via (1) back control, (2) breadcrumb, (3) Escape key — each returns exactly one level up; at L0 all three are no-ops.
- **Single-layer render (FR-GRAPH-2):** exactly one hierarchy level shown per render (+ focus-context interchange affordances); no two layers render simultaneously.
- **Node cap / clustering (FR-NAV-7):** ≤~30 nodes per level; when a level has >1 `needed` child they collapse into one expandable "Roadmap (N)" meta-node; visible count never exceeds cap.
- **L1 detail panel (FR-DETAIL-3, `selTerritory`):** system metadata line (routes/pages/migrations/stack), summary, interchange count + list, domain list with states.

---

## 5. THE TWO GROUPING AXES

**FR-AXIS-1:** toggle (`#axisSeg`) between **"By System"** and **"By Function"**; both axes share the same underlying nodes; toggling re-renders L0 in chosen axis.

**By System (FR-AXIS-2):** groups under all 5 systems (VAV, CaneyCloud, AGB-CRM, Restaurants, Academy), color-coded by system. L0 shows the 5 systems with % built + interchanges; Restaurants as module-mounted territory with `host_mount` link; Academy as fog-of-war `needed`.

**By Function (FR-AXIS-3) — the 6 functions of the capability map (`FUNCS`):**
1. **Marketing & Growth** (`growth`)
2. **Sales & Revenue** (`sales`)
3. **Operations** (`ops`)
4. **Customer Experience** (`cx`)
5. **Business Admin & Finance** (`admin`)
6. **Platform & Data** (`platform`)

L0 shows 6 function hubs; each aggregates capabilities across all 5 systems via `FNMAP`. Restaurants mapping: M_POS/M_PAY → Sales & Revenue; M_KDS/M_INV → Operations; M_FISCAL/M_ACCT → Business Admin & Finance; diner-web → Customer Experience. Academy `needed` capabilities → Operations/Customer Experience (training delivery) + Sales & Revenue (certification → provider supply) — *unless* the optional 7th "Education/Training" function is adopted (OQ-9, deferred to v2 Academy onboarding; a `FUNCS`/`FNMAP` change only, no schema change).

- **FR-AXIS-4:** function % readiness = `mean(done=1, doing=0.5, needed=0)` over members across all 5 systems, rounded (`fnPct`). `doing` includes Restaurants release-gated caps; `needed` includes Academy manifest caps.
- **FR-AXIS-5:** within a function (`selFunction`), list contributing systems (up to 5) with capability counts + a "gaps in this function" list of `needed` members (Academy caps appear as gaps until built).
- **FR-AXIS-6:** drill from function into a member capability's surfaces (cross back into a specific system at L2); members without surfaces open the domain detail.

**Function-overlay lens (distinct from the axis) — FR-LENS-6 (`html[data-lens="function"]`, `FNCOLOR`):** while in the **System axis**, each domain's accent recolors to its `fn` color; a function legend appears. (Recolors the system view — does not switch axes.)

---

## 6. LENSES (pure reducers over one graph — FR-LENS-1..7)

5 lenses, each a **pure visual transform, no data refetch**; switching preserves current level + selection (FR-LENS-1). Behave meaningfully at every level L0/L1/L2 (FR-LENS-7).

| Lens | FR | Behavior | v0 status |
|------|-----|----------|-----------|
| **Navigation** | FR-LENS-2 | Default lens; always-on camera, macro→micro zoom; imposes no de-emphasis. | **v0** |
| **State** | FR-LENS-5 | Emphasize built/wip; fog-of-war the `needed` roadmap (`needed` at reduced emphasis; built/wip full). | **v0** |
| **Topology** | FR-LENS-3 | Highlight cross-system interchanges (interchange-owning nodes get warn border), de-emphasize non-linked nodes to ~32% opacity. | v1 |
| **Function overlay** | FR-LENS-6 | Recolor system view by `fn` (see §5). | v1 |
| **Liveness** | FR-LENS-4 | Pulse `live:ok` nodes (reduced-motion: static), dim `live:dead`/atrophied to ~32%. | v2 |

**v0 lenses = Navigation + State only.** Topology/Function = v1; Liveness = v2. (HLR §9 v0: "Navigation + State lenses".)

---

## 7. NODE DETAIL PANEL · PRESETS · CMD-K

**Detail panel (FR-DETAIL-1..7, `detail`, `aria-live` polite):** updates to current selection (portfolio/system/function/domain/surface/interchange); announces changes politely. Per-selection content:
- **Portfolio (FR-DETAIL-2):** per-system %, aggregate %, all interchanges + health/purpose.
- **System (FR-DETAIL-3):** meta line, summary, links-out count+list, domains with states.
- **Domain (FR-DETAIL-4):** state badge, cross-system links, surfaces; `needed` domains show "fog-of-war / no surfaces yet".
- **Surface = micro = doorway to docs (FR-DETAIL-5):** OpenAPI operation / co-located MDX / the ADR that introduced it. Shows endpoint/contract code derived from OpenAPI at build, a Docs section, + "Open in repo ↗" link to file at its commit.
- **Surface kinds (FR-DETAIL-6, `isFile`):** route surfaces show method + path; file surfaces show contract type + language badge.
- **Actions (FR-DETAIL-7, `d-actions`):** "Open in repo", "Open contract", "Trace across systems" — present where applicable, resolving to correct repo URL or trace.

**Interchange detail (XSYS):** producer→consumer flow with both endpoints labeled + navigable (FR-XSYS-5, `selStation` Flow); `contract_ref` path + version + key facts (auth, flow volume) + contract code snippet (FR-XSYS-6); "what breaks" list (FR-XSYS-7, for `dark` edges states the blocker); health double-encoded icon `✓/!/·` + label + color, dark edges dashed (FR-XSYS-8); "trace across systems" highlights producer→consumer path end to end (FR-XSYS-9). Planned/dark edges (FR-XSYS-11) render dashed + fog-of-war, labeled "PLANNED" (not warn/red), "what breaks" states build blocker, excluded from FR-PIPE-6 hashing.

**Audience presets = saved cameras (FR-PRESET-1..5):** Investor / Agent / Operator; active one `aria-pressed`. A preset only changes **lens + altitude + filters** over the one graph — no separate view component or dataset (FR-PRESET-5).
- **Investor (FR-PRESET-2):** State lens, L0–L1, % built + recently shipped, plain-English summaries (incl. reveal sweep when motion allowed). **[v0]**
- **Agent (FR-PRESET-3):** Topology + State, search foregrounded for rebuild-guard. [v1]
- **Operator (FR-PRESET-4):** Liveness + interchange health. [v2]
> **v0 presets = Investor only** (FR-PRESET-1,2 in v0; Agent=v1, Operator=v2).

**Command palette / cmd-K (FR-CMDK-1..4) — STUB / NOT v0** (entire CMDK block is v1):
- FR-CMDK-1: ⌘K / Ctrl-K opens palette + focuses input; Esc closes.
- FR-CMDK-2: run Lens/Audience/Navigate commands (`COMMANDS` grouped).
- FR-CMDK-3: fuzzy "Jump to" node search over the same index.
- FR-CMDK-4: keyboard-drive (Arrow/Enter) + direct system shortcuts ⌘1–⌘5 → VAV/CaneyCloud/AGB-CRM/Restaurants/Academy.

**Search / rebuild-guard (SEARCH, v1):** FR-SEARCH-1 single input across systems/domains/surfaces/interchanges; FR-SEARCH-2 jump-to navigates+selects; FR-SEARCH-3 keyboard nav (Arrows/Enter/Esc); FR-SEARCH-4 explicit "no match — safe to build it" empty state; FR-SEARCH-5 Agent `/brain/search?q=` API (ranked matches or explicit empty, JSON, behind AGB-CRM auth); FR-SEARCH-6 deterministic ranking (exact label > path/substring).

---

## 8. NFRs (33 total; `NFR-AREA-N: The system shall [target] [condition]`)

**Scalability / Infinite Canvas (NFR-SCALE-*):**
- **NFR-SCALE-1** *(v0)*: canvas supports pan + zoom over an **effectively infinite plane** via React Flow (`@xyflow/react` v12, `colorMode=dark`).
- **NFR-SCALE-2** *(v0)*: no level renders more than ~30 nodes; `needed` clusters into Roadmap meta-node; overflow clusters rather than overflow cap.
- **NFR-SCALE-3** *(v0)*: semantic zoom varies level-of-detail by altitude; underlying graph may hold hundreds–thousands of nodes while any view stays under cap.
- **NFR-SCALE-4** *(v1)*: renderer sustains **60fps** pan/zoom with up to **200 mounted nodes**; interactive (**<100ms input latency**) at a **2,000-node** total graph.

**Freshness & Cadence (NFR-FRESH-*):** FRESH-1 structural extraction in CI on every commit, **<90s/repo** [v1]; FRESH-2 semantic generation nightly, non-blocking [v2]; FRESH-3 graph ≤1 commit behind structure, ≤24h behind summaries, panel shows source commit SHA + sync time [v1]; FRESH-4 zero manual upkeep [v1]; FRESH-5 idempotent — re-run on unchanged commit → byte-identical `brain-graph.json` (modulo timestamps) [v1]; FRESH-6 planned/manifest systems refresh from manifest each build, auto-switch manifest→OpenAPI without schema change [v2].

**Layout Determinism (NFR-LAYOUT-*) [v0]:** LAYOUT-1 curated + deterministic — d3-hierarchy radial for hub/drill, elkjs layered for topology; identical positions across sessions/machines (seed-then-pin); LAYOUT-2 node keeps position across renders/resizes/reloads (spatial memory), resize reflows without jumps; LAYOUT-3 single-level layout **<150ms**.

**Performance (NFR-PERF-*):** PERF-1 initial `/brain` render (fetch + first paint) **<2.5s** cold over prebuilt `brain-graph.json` [v0]; PERF-2 lens/axis switches = pure reducers, no refetch, **<100ms** [v0]; PERF-3 no full `innerHTML` DOM rebuild — reconcile via React Flow node model [v0]; PERF-4 search **<50ms** in-client / **<200ms** via API [v1].

**Accessibility — target 40/40 (NFR-A11Y-*) [all v0]:**
- A11Y-1: all status **double-encoded (icon + shape + text), never color alone**; pass grayscale legibility check.
- A11Y-2: every node/station/portal/control focusable with visible focus ring; canvas exposes ARIA graph/tree role with labeled nodes.
- A11Y-3: fully keyboard-operable — drill (Enter/Space), zoom out (Esc), search (`/`), palette (⌘K), result nav (arrows).
- A11Y-4: text ≥11px; accents ≥3:1 vs local bg, body text ≥4.5:1 (WCAG AA).
- A11Y-5: `prefers-reduced-motion` disables spawn animations, pulses, reveal sweep, zoom transitions (instant cuts).
- A11Y-6: no decorative neon glow/halation (anti-slop); elevation via surface lightness/shadow tokens; halo reserved for genuine live alert only.

**Double-encoded status (FR-GRAPH-4 + A11Y-1):** `done`=✓ + solid left-border + "BUILT"; `doing`=◐ + WIP marker + "WIP"; `needed`=○ + dashed border + "NEEDED"; legible in grayscale. Interchange health (FR-XSYS-8): `ok`=✓, `warn`=!, `dark`=· ; dark edges dashed.

**Security (NFR-SEC-*):** SEC-1 auth'd AGB-CRM users only [v0]; SEC-2 audience-scoped — Investor preset exposes only summaries + % + names, never raw contract code/secret config/service-role ids [v0]; SEC-3 extractors read least-privilege read-only, never write to source repos [v0]; SEC-4 `brain-graph.json` contains no secrets/tokens/creds; contract excerpts redacted of secret material [v0]; SEC-5 `/brain/search` API enforces same auth + audience scoping as UI [v1].

**Observability (NFR-OBS-*):** OBS-1 each extractor emits structured logs (nodes/edges/interchanges/contracts/duration) + failures→Sentry [v1]; OBS-2 failed/partial extraction **fails visibly**, previous good `brain-graph.json` stays served (no silent degraded graph) [v1]; OBS-3 liveness data timestamped so atrophy windows use real last-activity, not build time [v2]; **OBS-4 module exposes empty/loading/error states for canvas + panel (no blank screens) [v0]**; OBS-5 extractor logs record per-system derivation source (`openapi|migrations|manifest|host_mount`) + assert no surface double-counted; a de-dup violation (surface id under both `restaurants` and `caney`) OR a manifest node lacking `state:"needed"` **fails the build visibly** (per OBS-2) [v1].

---

## 9. v0 ACCEPTANCE CRITERIA (verbatim, §9)

> **v0 — Derived static map (kills P1 & P4 immediately)**
> - One manual extractor pass → `brain-graph.json` (the three live systems, their domains, surfaces, the 5 interchanges, state from board counts).
> - `/brain` renders L0–L1 + interchanges as stations + the System axis, Navigation + State lenses, detail panel, minimap, breadcrumb.
> - FRs: PIPE-1,2,3,4,7,12 · GRAPH-1..6 · NAV-1..7 · LENS-1,2,5 · AXIS-1,2 · XSYS-1,2,4,5,6,8 · DETAIL-1..7 · PRESET-1,2.
> - NFRs in scope: SCALE-1..3, LAYOUT-1..3, A11Y-1..6, PERF-1..3, SEC-1..4, OBS-4.

---

## 10. v0 FR/NFR CHECKLIST (one-line per ID, cite directly)

**FRs in v0 scope:**
- **FR-PIPE-1** — extract surface nodes (method/path/operationId/domain) from each system's OpenAPI spec.
- **FR-PIPE-2** — extract entity nodes from DB migration history (Supabase/Alembic/Drizzle).
- **FR-PIPE-3** — derive domain nodes by clustering surfaces (OpenAPI tags / route-group folders / nightly cartographer); every surface → exactly one domain.
- **FR-PIPE-4** — detect cross-system interchanges via known integration signatures (the 5 seed signatures).
- **FR-PIPE-7** — overlay build state (done/doing/needed) onto domains from task boards.
- **FR-PIPE-12** — emit one versioned `brain-graph.json` per build + persist a `brain_snapshots` row per commit SHA+timestamp.
- **FR-GRAPH-1** — render nodes at 4 levels (Portfolio L0 / System L1 / Domain L2 / Surface L3); each carries level/id/parentId/kind/state, reachable by drill-down from L0.
- **FR-GRAPH-2** — show exactly one hierarchy layer at a time.
- **FR-GRAPH-3** — distinguish 4 edge kinds (`contains`/`calls`/`reads_writes`/`interchange`); interchange edges carry contract_ref/contract_hash/health.
- **FR-GRAPH-4** — double-encode status by icon+shape+text (BUILT/WIP/NEEDED), never color alone, grayscale-legible.
- **FR-GRAPH-5** — encode node magnitude by size (≥3 surfaces=lg, 1–2=md, 0=sm).
- **FR-GRAPH-6** — carry per-node overlay attrs (state/liveness/owner/branch/last_commit/docs_ref/contract_ref/fn); lenses read only these.
- **FR-NAV-1** — drill in one level by clicking a node (System→L1, Domain→L2, Surface→detail).
- **FR-NAV-2** — zoom out via back control / breadcrumb / Esc (each one level; no-op at L0).
- **FR-NAV-3** — breadcrumb of current path; click any ancestor to jump.
- **FR-NAV-4** — altitude indicator naming current level.
- **FR-NAV-5** — persistent clickable minimap "you are here".
- **FR-NAV-6** — shared-element zoom transition from clicked node's coords (~200–300ms; reduced-motion=instant cut).
- **FR-NAV-7** — ≤~30 nodes/level; `needed` clusters into one expandable "Roadmap (N)" meta-node.
- **FR-LENS-1** — switch among lenses as pure visual transforms (no refetch); preserve level+selection.
- **FR-LENS-2** — Navigation lens = default always-on camera, no de-emphasis.
- **FR-LENS-5** — State lens emphasizes built/wip, fog-of-war the `needed` roadmap.
- **FR-AXIS-1** — toggle grouping axis By System ↔ By Function (shared nodes).
- **FR-AXIS-2** — By-System axis groups under the systems, color-coded, with % built + interchanges (v0: 3 live systems).
- **FR-XSYS-1** — L0: all cross-system interchanges as curved links + health-colored clickable midpoint stations (5 interchanges).
- **FR-XSYS-2** — L1: interchanges as direction+purpose-labeled threads from owning domain to linked system.
- **FR-XSYS-4** — interchanges visible at every zoom (station@L0 / thread@L1 / portal@L2), never hidden.
- **FR-XSYS-5** — open interchange → producer→consumer flow, both endpoints labeled + navigable.
- **FR-XSYS-6** — interchange shows contract_ref path, version, key facts (auth/volume), contract code snippet.
- **FR-XSYS-8** — interchange health in 3 double-encoded states ok(✓)/warn(!)/dark(·); dark = dashed.
- **FR-DETAIL-1** — context panel updates to current selection; announces via `aria-live`.
- **FR-DETAIL-2** — portfolio detail: per-system %, aggregate %, all interchanges + health/purpose.
- **FR-DETAIL-3** — system detail: meta line, summary, links-out, domains with states.
- **FR-DETAIL-4** — domain detail: state badge, cross-system links, surfaces (`needed`→fog-of-war "no surfaces yet").
- **FR-DETAIL-5** — surface detail = doorway to docs (OpenAPI op / MDX / ADR) + endpoint/contract code + "Open in repo ↗".
- **FR-DETAIL-6** — distinguish surface kinds (route: method+path; file: contract type+language badge).
- **FR-DETAIL-7** — selection actions: "Open in repo", "Open contract", "Trace across systems".
- **FR-PRESET-1** — switch among 3 presets (Investor/Agent/Operator); active = `aria-pressed`.
- **FR-PRESET-2** — Investor preset = State lens + L0–L1 + % built/recently shipped + plain-English summaries.

**NFRs in v0 scope:**
- **NFR-SCALE-1** — infinite pan/zoom plane via React Flow (`@xyflow/react` v12, dark).
- **NFR-SCALE-2** — ≤~30 nodes/level; `needed`→Roadmap cluster; overflow clusters.
- **NFR-SCALE-3** — semantic zoom varies LoD by altitude; graph may hold hundreds–thousands, view stays under cap.
- **NFR-LAYOUT-1** — deterministic layout (d3-hierarchy radial / elkjs layered); identical positions across sessions/machines (seed-then-pin).
- **NFR-LAYOUT-2** — spatial memory: node keeps position across renders/resizes/reloads; resize reflows without jumps.
- **NFR-LAYOUT-3** — single-level layout computes in <150ms.
- **NFR-A11Y-1** — all status double-encoded (icon+shape+text), grayscale-legible.
- **NFR-A11Y-2** — every node/station/portal/control focusable + visible focus ring; ARIA graph/tree role with labeled nodes.
- **NFR-A11Y-3** — fully keyboard-operable (Enter/Space drill, Esc out, `/` search, ⌘K palette, arrows nav).
- **NFR-A11Y-4** — text ≥11px; accent ≥3:1, body ≥4.5:1 (WCAG AA).
- **NFR-A11Y-5** — `prefers-reduced-motion` disables spawn/pulse/reveal/zoom transitions (instant cuts).
- **NFR-A11Y-6** — no decorative neon glow/halation; elevation via lightness/shadow; halo only for genuine live alert.
- **NFR-PERF-1** — initial `/brain` render <2.5s cold over prebuilt graph.
- **NFR-PERF-2** — lens/axis switches = pure reducers, no refetch, <100ms.
- **NFR-PERF-3** — no full `innerHTML` rebuild; reconcile via React Flow node model.
- **NFR-SEC-1** — reachable only by authenticated AGB-CRM users.
- **NFR-SEC-2** — audience-scoped redaction; Investor exposes only summaries+%+names, never raw contract/secret/service-role.
- **NFR-SEC-3** — extractors read least-privilege read-only; never write to source repos.
- **NFR-SEC-4** — `brain-graph.json` has no secrets/tokens/creds; contract excerpts redacted.
- **NFR-OBS-4** — expose empty/loading/error states for canvas + panel (no blank screens).

---

## DEFERRED-TO-LATER (explicit, do NOT build in v0)

- **v1:** FR-PIPE-5,6,8,9,13,15 · LENS-3,6,7 · AXIS-3,4,5,6 · XSYS-3,7,9,10(Restaurants→CaneyCloud row),11 · SEARCH-1..6 · CMDK-1..4 · PRESET-3 | NFR-FRESH-1,3,4,5 · SCALE-4 · PERF-4 · SEC-5 · OBS-1,2,5. (CI regen + contract-diff + rebuild-guard search + ⌘K + Function axis/overlay + Topology lens + Agent preset + Restaurants module-mounted territory.)
- **v2:** FR-PIPE-10,11,14 · LENS-4 · PRESET-4,5 · XSYS-10(3 planned-interchange rows) | NFR-FRESH-2,6 · OBS-3. (Liveness lens + Operator preset + nightly LLM cartographer + Investor fog-of-war momentum + Academy planned/manifest territory + 3 planned interchanges.)
- **Won't-have v1 (§6):** repo write-back; per-feature `feature.json` manifests; a 2nd renderer (Cytoscape/Sigma); public/unauth access; auto-mutation of `~/.megaoverlord/projects.yaml` or `OVERVIEW.md`.
- **Open questions affecting build:** OQ-2 (contract-diff "breaking" rule deferred to impl — needs typed-field differ), OQ-9 (optional 7th "Education/Training" function deferred to v2), OQ-10 (Restaurants modeling decided first-class+host_mount; folio "what breaks" must include CaneyCloud folio call-sites), OQ-11 (Academy manifest = `lms-integration-plan.md`; risk of catalog drift, mitigated by auto-switch + `needed`-flagging), OQ-8 (radial vs elkjs — radial for hub/drill, elkjs for topology; confirm node keeps stable slot across both).

**Source file:** `/Users/tomas/AGB-CRM/docs/requirements/THE-BRAIN-HLR.md` (417 lines, V1.1, 74 FRs / 33 NFRs).