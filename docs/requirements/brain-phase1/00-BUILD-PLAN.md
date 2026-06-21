Confirmed: `components/brain/reintro-button.tsx` exists (must namespace), `(app)/brain/` has only server-action files (no `page.tsx`), `scripts/` uses `.mjs`/`.ts`/`.sh` mix, and globals tokens match the integration guide. I have everything needed.

# THE BRAIN — v0 Consolidated Build Plan

**Target:** `/brain` route in AGB-CRM (Next.js 16.2.6, React 19, Tailwind v4, pnpm). v0 ships **S1–S3 (VAV/CaneyCloud/AGB-CRM) + 5 interchanges + L0–L1 + System axis + Navigation/State lenses**. S4 Restaurants schema fields present-but-unpopulated; S5 Academy deferred. Score target ≥36/40. Renderer locked to React Flow (`@xyflow/react` v12, `colorMode=dark`). Schema authored to the full V1.1 spec so v1/v2 extractors append without migration.

---

## 1. GRAPH SCHEMA (final)

Lives at `/Users/tomas/AGB-CRM/lib/brain/types.ts`. This is the canonical TS for `brain-graph.json` (schema `"1.1"`), matching HLR §10 exactly. v0 only **populates** a subset of fields; all fields are **declared** so the artifact never needs a schema bump (NFR-FRESH-6).

```ts
// lib/brain/types.ts
export type System = "vav" | "caney" | "crm" | "restaurants" | "academy";
export type NodeLevel = 0 | 1 | 2 | 3;            // portfolio | system | domain | surface
export type NodeKind  = "system" | "domain" | "surface" | "entity";
export type NodeSource = "openapi" | "migrations" | "manifest" | "host_mount";
export type Fn = "growth" | "sales" | "ops" | "cx" | "admin" | "platform"; // FR-AXIS-3 (the 6)
export type NodeState = "done" | "doing" | "needed";
export type Liveness  = "ok" | "dead" | "atrophy";
export type NodeSize  = "sm" | "md" | "lg";
export type EdgeKind  = "contains" | "calls" | "reads_writes" | "interchange";
export type EdgeSubtype = "host_mount" | null;
export type Health = "ok" | "warn" | "dark";
export type ContractStatus = "live" | "planned";

export interface XY { x: number; y: number }

export interface BrainNode {
  id: string;                       // dotted, globally unique e.g. "vav.bookings"   FR-PIPE-13 de-dup key
  level: NodeLevel;                 // FR-GRAPH-1
  kind: NodeKind;
  parentId: string | null;          // null at L0
  label: string;
  system: System | null;            // restaurants surfaces MUST be "restaurants", never "caney"
  source: NodeSource;               // V1.1 provenance; manifest ⇒ state must be "needed" (OBS-5)
  hosted_by: "caney" | null;        // only set for restaurants
  fn: Fn | null;                    // FR-GRAPH-6 / FR-AXIS-3
  state: NodeState;                 // FR-PIPE-7
  liveness: Liveness | null;        // null until v2 liveness extractor
  size: NodeSize;                   // FR-GRAPH-5: >=3 surfaces=lg, 1-2=md, 0=sm
  owner: string | null;
  branch: string | null;
  last_commit: string | null;       // deploy-state extractor (v1)
  docs_ref: string | null;          // "openapi#operationId" | mdx | adr | null
  surfaces: string[];               // domain-level route/file paths
  meta: string | null;              // system-level: "243 routes · 194 pages · 141 mig"
  summary: string | null;           // cartographer (v2); null in v0
  pos: XY;                          // pinned deterministic coords (seed-then-pin, NFR-LAYOUT-1)
}

export interface EdgeEndpoint { system: System; domain: string }

export interface BrainEdge {
  id: string;                       // "ix1"...
  kind: EdgeKind;                   // FR-GRAPH-3
  subtype: EdgeSubtype;             // "host_mount" for restaurants→caney
  from: EdgeEndpoint;
  to: EdgeEndpoint;
  purpose?: string;                 // interchange only
  health?: Health;                  // interchange only
  contract_status: ContractStatus;  // "planned" ⇒ dashed, hash null, excluded from FR-PIPE-6
  route?: string;                   // "POST /api/pms/webhook/caneycloud"
  contract_ref?: string;            // file path of the contract
  contract_hash?: string | null;    // null when planned; computed v1 (FR-PIPE-5)
  version?: string;
  breaks?: string[];                // "what breaks" impact list
}

export interface BrainFunction {   // FR-AXIS-3/4
  id: Fn;
  name: string;                     // "Sales & Revenue"
  pct: number;                      // mean(done=1,doing=.5,needed=0) rounded
  members: string[];                // node ids across all 5 systems
}

export interface BrainGraph {
  version: "1.1";
  generatedAt: string;              // ISO
  commit: Record<System, string | null>; // academy:null until code exists
  nodes: BrainNode[];
  edges: BrainEdge[];
  functions: BrainFunction[];
  externals: string[];              // the 9: Stripe, Anthropic, WhatsApp, Mapbox, SiteMinder, Inngest, Resend, PostHog, Sentry
}
```

**Status double-encoding constants** (FR-GRAPH-4 / NFR-A11Y-1), co-located in `types.ts`:
`SI = {done:"✓",doing:"◐",needed:"○"}`, `SLBL = {done:"BUILT",doing:"WIP",needed:"NEEDED"}`, `HI = {ok:"✓",warn:"!",dark:"·"}`. Border treatment: `done`=solid 3px left, `doing`=solid 3px left, `needed`=dashed 3px left + 0.72 opacity; `dark` edges dashed. Never color alone.

---

## 2. DERIVATION PIPELINE design

All extractors are **deterministic Node scripts** under `/Users/tomas/AGB-CRM/scripts/brain/`, read-only (NFR-SEC-3), emitting a single artifact. Each is independently runnable and pure (idempotent → byte-identical modulo `generatedAt`, NFR-FRESH-5).

**Module layout** (`scripts/brain/`):
```
scripts/brain/
  build-graph.mjs              # ORCHESTRATOR — runs extractors, merges, validates, writes artifact
  config.mjs                   # repo roots (env-overridable), external creds STUB, contract-diff POLICY flag
  lib/
    emit.mjs                   # node/edge factory + size/level helpers (sizeFor, levelFor)
    dedup.mjs                  # FR-PIPE-13 de-dup assertion: no surface id under two systems
    openapi.mjs                # YAML/JSON path parser shared by surface extractor
    fs-routes.mjs              # Next.js app-tree walker (AGB-CRM + VAV route folders)
  extractors/
    openapi-surfaces.mjs       # FR-PIPE-1  — VAV openapi.yaml, CaneyCloud openapi.yaml, CRM route tree
    migration-entities.mjs     # FR-PIPE-2  — Supabase + Alembic + Drizzle schema.ts
    domain-cluster.mjs         # FR-PIPE-3  — tags / route-group folders → domain nodes
    interchange-detector.mjs   # FR-PIPE-4  — 5 seed signatures
    state-overlay.mjs          # FR-PIPE-7  — Overlord section-*/TASKS.md + AGB-CRM _tasks/_BOARD.md
    host-mount.mjs             # FR-PIPE-13/15 (v1) — restaurants→caney; v0 emits 0 nodes (S4 unpopulated)
    manifest-source.mjs        # FR-PIPE-14 (v2) — academy lms-integration-plan.md; v0 no-op
    contract-hasher.mjs        # FR-PIPE-5/6 (v1) — hash + breaks; v0 leaves contract_hash null
    deploy-state.mjs           # FR-PIPE-9 (v1)  — git/Vercel for board-less systems (VAV)
    handoff-overlay.mjs        # FR-PIPE-8 (v1)  — HANDOFF-LOG.md recently_shipped
```

**On-demand run command** (add to `package.json` scripts): `"brain:build": "node scripts/brain/build-graph.mjs"`. v0 is one manual pass (HLR §9). The orchestrator runs extractors → merges into one `BrainGraph` → runs the de-dup + manifest-state assertions (OBS-5) → fails loudly on violation (OBS-2) and leaves the previous artifact in place → writes:

**Output path:** `/Users/tomas/AGB-CRM/lib/brain/generated/brain-graph.json` (imported statically by the page for `<2.5s` cold render, NFR-PERF-1; no DB round-trip in v0). The `brain_snapshots` Postgres persistence (FR-PIPE-12) is **wired in v0 as a thin write** — `scripts/brain/build-graph.mjs` also inserts a row keyed by commit SHA + timestamp via Drizzle (new table `brainSnapshots` in `db/schema.ts`), so time-travel diffing exists from day one; the page reads the static JSON, not the table.

**Per-extractor read/emit (v0 active = surfaces, entities, domains, interchanges, state):**

| Extractor | Reads (absolute) | Emits |
|---|---|---|
| openapi-surfaces | `/Users/tomas/VZ_Tourism_Project/docs/pms-integration/05-api/openapi.yaml` (10 paths) · `/Users/tomas/tour-pms-main/APP/backend/api/openapi.yaml` (~60 paths) · `/Users/tomas/AGB-CRM/app/api/**/route.ts` (~75) | surface nodes (method/path/operationId), `calls` edges, domain assignment via tags/folders |
| migration-entities | `/Users/tomas/VZ_Tourism_Project/supabase/migrations/` (94) · `/Users/tomas/tour-pms-main/APP/backend/alembic/versions/` (136) · `/Users/tomas/AGB-CRM/db/schema.ts` (~140 tables) | `entity` nodes, `reads_writes` edges |
| domain-cluster | OpenAPI tags + route-group folders ((app), (provider); M02 routers) | `domain` nodes (L2 parents); every surface → exactly one domain |
| interchange-detector | grep the 5 signatures (below) | 5 `interchange` edges with from/to {system,domain}, route, contract_ref, `contract_status:"live"` |
| state-overlay | Overlord `section-*/TASKS.md` (`--TOURISM--`) · AGB-CRM `_tasks/_BOARD.md` | domain `state` (done/doing/needed) + source task IDs; clusters `needed` for FR-NAV-7 |

**Restaurants (host_mount) production** — v1, stubbed v0: `host-mount.mjs` reads `/Users/tomas/caneycloud-restaurant/MODULE-INTEGRATION.md` (`GET /api/v1/platform/release-mode`, `X-Restaurant-Id`, `frontend_flags`); emits all M_* surfaces under `system:"restaurants"` (never `caney`), one `host_mount` interchange edge restaurants→caney, and sets restaurants `state` from `release_mode` (dark=`doing`, live=`done`). De-dup assertion (`dedup.mjs`) guarantees no surface id appears under both systems (FR-PIPE-13). In v0 this extractor is registered but returns `[]` so the S4 territory renders empty.

**Academy (planned-from-manifest) production** — v2, stubbed v0: `manifest-source.mjs` reads `/Users/tomas/vz-avitourism-curriculum/modules/lms-integration-plan.md` (trails AV-1…AV-4 → 14 courses); emits domain/surface nodes with `state:"needed"` + `source:"manifest"` (assertion: manifest node lacking `state:"needed"` fails build, OBS-5), plus the 3 planned interchange edges (Academy→VAV, Academy→AGB-CRM, VAV→Restaurants) `contract_status:"planned"`, `contract_hash:null`. Excluded from route-count + liveness. Auto-converts to derived nodes when a real repo appears (NFR-FRESH-6).

**Contract-diff interface** (leave policy a flag, OQ-2): `contract-hasher.mjs` exports `diffContract(prevHash, curHash, removedFields, consumers, policy)` where `policy` is read from `config.mjs` `CONTRACT_DIFF_POLICY` (`"hash-warn"` default | `"typed-field-red"`). v0 leaves it un-invoked (`contract_hash:null` everywhere). The typed-field differ is the v1 implementation behind the same interface.

**Cross-repo creds stub** (OQ-4): `config.mjs` exposes `REPO_ROOTS` (filesystem paths, no creds needed for v0 since all repos are local clones) and a `CREDS = { vavServiceRole: process.env.BRAIN_VAV_SUPABASE_KEY ?? null, ... }` placeholder that is **never serialized** into the artifact (NFR-SEC-4). v0 reads only local files; the CI secret-store decision is deferred (a `// TODO OQ-4` flag in `config.mjs`).

---

## 3. THE 9 INTERCHANGE STATIONS + the 5 real interchanges

The HLR's "9" = **5 live/seed (v0)** + **4 V1.1 (v1/v2)**. The decision-log's "5 real interchanges" is the v0 set found in code. **Reconciliation: v0 ships exactly the 5 live edges as L0 stations; the 4 V1.1 edges are schema-present but not rendered in v0** (one is live host_mount = v1; three are planned = v2).

**The 5 LIVE interchanges (v0 — derivable today, render as L0 stations FR-XSYS-1):**

| # | Edge | From → To {system,domain} | Route / signature | contract_ref | health | status |
|---|---|---|---|---|---|---|
| ix1 | VAV → CaneyCloud | `{vav, PMS Integration}` → `{caney, Booking Core/Channel}` | `POST /api/pms/webhook/caneyclouds` (HMAC-SHA256) | `VZ_Tourism_Project/docs/pms-integration/05-api/openapi.yaml` | ok | live |
| ix2 | AGB-CRM → VAV | `{crm, Research & Intelligence}` → `{vav, Identity & Access}` | `VAV_SUPABASE_*` service-role read | `AGB-CRM/lib/platforms/status.server.ts` | ok | live |
| ix3 | AGB-CRM → CaneyCloud | `{crm, Projects & Portfolio}` → `{caney, Properties & Rooms}` | posada onboarding intake (FF_ONBOARDING, dark) | `AGB-CRM/lib/onboarding/intake-contract.ts` | warn | live |
| ix4 | CaneyCloud → AGB-CRM | `{caney, Messaging & Comms}` → `{crm, Intelligence & AI}` | MCP client guest CRM | `tour-pms-main/.../mcp_registry.py` | ok | live |
| ix5 | AGB-CRM ⇄ Overlord/sync | `{crm, Overlord & Work Mgmt}` → `{crm, ...}` | `POST /api/overlord/sync` | `AGB-CRM/docs/VAV-CaneyCloud-CRM-sync-status.md` | ok | live |

(SiteMinder provision is a detector signature feeding ix1's CaneyCloud Channel domain, not a separate station.)

**The 4 V1.1 interchanges (NOT rendered in v0):**

| # | Edge | subtype | status | scope |
|---|---|---|---|---|
| ix6 | Caney Restaurants → CaneyCloud | `host_mount` | live | v1 (FR-PIPE-15; `MODULE-INTEGRATION.md` release-mode; dark→ok) |
| ix7 | VAV → Caney Restaurants | null | planned | v2 (dining experiences into marketplace) |
| ix8 | Caney Academy → VAV | null | planned | v2 (certified guides → providers) |
| ix9 | Caney Academy → AGB-CRM | null | planned | v2 (enrollment intake → contacts) |

**Concrete cross-system edges derivable today** = ix1–ix5 above (all have a real route/file signature in the surface maps). The `interchange-detector.mjs` grep targets: `pms/webhook/caneyclouds`, `VAV_SUPABASE_`, `lib/onboarding/intake-contract.ts`, `mcp_registry.py`, `overlord/sync` — exactly the 5.

---

## 4. THE 6 FUNCTIONS capability map

Defined in `lib/brain/functions.ts` (`FUNCS` + `FNMAP`). The 6 (FR-AXIS-3): **growth** (Marketing & Growth), **sales** (Sales & Revenue), **ops** (Operations), **cx** (Customer Experience), **admin** (Business Admin & Finance), **platform** (Platform & Data). Each derived domain assigned to exactly one `fn`. (Note: surface maps use a coarser 6-bucket scheme — Booking/Commerce, Content/Catalog, Identity/Access, Messaging/Comms, Payments/Money, Ops/Intelligence — which I reconcile to the HLR's 6 below.)

| System | Domain | fn |
|---|---|---|
| **VAV** | Marketplace Core, Specialized Content | growth |
| | Booking Pipeline, PMS Integration, Ruta Rides, Growth & Affiliates | sales |
| | Operator Features | ops |
| | Messaging & CRM | cx |
| | Payments & Money | admin |
| | Identity & Access | platform |
| **CaneyCloud** | Booking Core, Availability & Inventory, Pricing & Quotes | sales |
| | Properties & Rooms, Channels & Distribution | ops |
| | Messaging & Communications | cx |
| | Payments & Finance, Accounting & Reporting | admin |
| | Auth & Access | platform |
| **AGB-CRM** | Pitch Feedback, Partner Rooms | growth |
| | (no native sales domain — control plane) | — |
| | Projects & Portfolio, Overlord & Work Mgmt, Intelligence & AI | ops |
| | Contacts & Network, Meetings & Touches, Email, Voice/Capture, Reminders & Nudges | cx |
| | Treasury & Finance | admin |
| | Research & Intelligence | platform |
| **Restaurants** (v1) | M_POS, M_PAY (Order/Payment) | sales |
| | M_KDS, M_INV, Floor Ops, Workforce, Operator Console | ops |
| | diner-web, Guest Intelligence & CRM | cx |
| | M_FISCAL, M_ACCT, Finance & Export | admin |
| | Menu & Catalog, Referral & Onboarding | growth |
| | Identity & Access Control | platform |
| **Academy** (v2, `needed`) | Curriculum, Species Ref, Hotspots, Localization | cx + ops (training delivery) |
| | Assessment & Certification | sales (cert → provider supply) |

`pct` = `mean(done=1, doing=.5, needed=0)` over members across all 5 systems (FR-AXIS-4). By-Function axis is **v1** — this map is wired but the axis toggle is hidden in v0.

**OQ-9 flag (7th Education/Training function):** Academy folds into cx/ops/sales by default (V1.1). If the human adopts a 7th `education` function, it is a `FUNCS`/`FNMAP` change only — **no schema change** (the `fn` union widens). Defer to v2 Academy onboarding; does not block v0 (By-Function is v1).

---

## 5. FILE / MODULE LAYOUT (absolute paths)

**Namespacing rule:** existing `components/brain/reintro-button.tsx` is unrelated. All Brain-canvas components go in `components/brain/canvas/` to avoid collision.

```
# ── Route (thin server component) ──
/Users/tomas/AGB-CRM/app/(app)/brain/page.tsx
  # async server comp: requireUser() → user.workspaceId; <TopBar email displayName title="Brain"/>;
  # <main className="...flex-1"> mounts <BrainCanvasLoader/>. Coexists with existing actions.ts files.

# ── Client shell (build together — the coherent React shell) ──
/Users/tomas/AGB-CRM/components/brain/canvas/
  brain-canvas-loader.tsx     # "use client" + next/dynamic ssr:false (BlockNote pattern); skeleton loading
  brain-canvas.tsx            # "use client"; ReactFlow + colorMode="dark"; imports @xyflow/react/dist/style.css
  graph-provider.tsx          # context: graph + {level,axis,lens,preset,selection,crumbs}; pure reducer dispatch
  nodes/
    hub-node.tsx              # L0/L1 hub: orb + conic progress ring (--p,--accent), pct, name
    domain-node.tsx           # L2 chip: .si glyph + label + .more; data-state/data-xlink/data-fn/data-live attrs
    surface-node.tsx          # L3 surface chip (method+path | file+lang badge)
    cluster-node.tsx          # collapsed "Roadmap (N)" hatched node (FR-NAV-7)
  edges/
    spoke-edge.tsx            # bowed quadratic (control y −36); health/system color, dashed when planned/dark
    station.tsx               # L0 interchange station pin (health-coded, double-encoded ✓/!/·)
  chrome/
    altitude-pill.tsx         # FR-NAV-4
    breadcrumb.tsx            # FR-NAV-3
    minimap.tsx               # FR-NAV-5 persistent "you are here"
    back-button.tsx           # FR-NAV-2 (one of 3 up-paths)
    rail.tsx                  # left rail: axis toggle, lens group, legends
    externals-cluster.tsx     # L0-only externals chips
  panel/
    detail-panel.tsx          # FR-DETAIL-1 aria-live; routes to sub-renderers below
    sel-portfolio.tsx · sel-system.tsx · sel-domain.tsx · sel-surface.tsx · sel-station.tsx
  states/
    empty-state.tsx · loading-state.tsx · error-state.tsx   # NFR-OBS-4 (no blank screens)
  brain.css                   # ported design tokens (§6) scoped under .brain-root; React Flow var overrides

# ── lib (graph engine — pure, testable) ──
/Users/tomas/AGB-CRM/lib/brain/
  types.ts                    # §1 schema
  functions.ts                # FUNCS + FNMAP (§4)
  index.ts                    # barrel
  layout/
    radial.ts                 # d3-hierarchy radial (hub/drill, Navigation) — NFR-LAYOUT-1
    layered.ts                # elkjs layered (Topology, v1) — seed-then-pin, shared slots (OQ-8)
    pin.ts                    # seed-then-pin persistence + spatial-memory (NFR-LAYOUT-2)
  lenses/
    navigation.ts · state.ts  # v0 reducers (pure, no refetch — NFR-PERF-2)
    topology.ts · functionOverlay.ts · liveness.ts   # v1/v2 stubs
  presets.ts                  # investor (v0); agent/operator stubs
  selectors.ts                # level/axis/visibleNodes(cap≤30)/clusterNeeded (FR-NAV-7)
  data/
    sample.ts                 # hand-authored 3-system fallback (renders before first extractor run)
  generated/
    brain-graph.json          # ← extractor output (committed)

# ── scripts (deterministic extractors — parallelizable, isolated) ──
/Users/tomas/AGB-CRM/scripts/brain/   # full tree in §2

# ── DB ──
/Users/tomas/AGB-CRM/db/schema.ts     # +brainSnapshots table (FR-PIPE-12)

# ── nav ──
/Users/tomas/AGB-CRM/components/layout/nav-groups.ts   # add {href:"/brain",label:"Brain",icon:Network} to plan group
```

Loader uses the established `next/dynamic({ssr:false})` pattern (mirrors `components/lob/doc-editor-loader.tsx`) because `@xyflow/react` touches `window`. Deps already installed — no install step.

---

## 6. DESIGN TOKENS to port

Ported into `components/brain/canvas/brain.css`, scoped under a `.brain-root` wrapper so the canvas keeps its bespoke dark palette while the rest of AGB-CRM uses its own tokens. The canvas runs `colorMode="dark"` always (per HLR), so it does **not** need to flip with AGB-CRM's theme — but the surrounding TopBar/chrome use AGB-CRM tokens for harmony.

**Colors (verbatim from mockup `:root`):**
```css
.brain-root{
  --bg:#08090c; --bg-2:#0d0f15; --panel:#0f1217; --panel-2:#14171e; --panel-s:#171b24;
  --line:rgba(255,255,255,.07); --line-2:rgba(255,255,255,.12);
  --ink:#f4f6fa; --ink-dim:#9aa4ba; --ink-faint:#646e85;
  --vav:#E3B061; --caney:#5BBCE6; --crm:#B189EE; --caneyrest:#F0915E; --academy:#4FC3A8; --ext:#7c89a3;
  --done:#58CE97; --doing:#E3B65E; --needed:#6c7892;
  --ok:#58CE97; --warn:#E3B65E; --dark:#6c7892;
  --shadow-color:222deg 47% 3%;
}
```
Function-overlay palette (JS, v1): `{growth:'#E8896B',sales:'#5ED6A6',ops:'#7E8CF0',cx:'#E87FB8',admin:'#4FC9C0',platform:'#94A3C7'}`.

**Glass / shadow / gleam (verbatim):**
```css
--shadow-low:0 1px 1px hsl(var(--shadow-color)/.5),0 1px 2px -1px hsl(var(--shadow-color)/.5);
--shadow-med:0 1px 2px hsl(var(--shadow-color)/.4),0 3px 6px -2px hsl(var(--shadow-color)/.45),0 8px 16px -5px hsl(var(--shadow-color)/.5);
--shadow-high:0 2px 4px hsl(var(--shadow-color)/.4),0 10px 20px -5px hsl(var(--shadow-color)/.55),0 28px 46px -10px hsl(var(--shadow-color)/.62);
--gleam:inset 0 1px 0 rgba(255,255,255,.06);
--ease:cubic-bezier(.16,1,.3,1); --ease-back:cubic-bezier(.34,1.42,.64,1);
```
Glass = `backdrop-filter:blur(16–28px) saturate(160–180%)` + `--gleam` on panels/minimap/detail/cmdk. **Anti-slop (NFR-A11Y-6):** elevation via these shadow stacks + surface lightness only — **no neon glow/halation**; halo reserved for genuine live alert.

**Signature recipes (load-bearing):** (1) hub orb gleam sphere `radial-gradient(circle at 38% 30%,rgba(255,255,255,.07),var(--bg-2) 64%)` + conic progress ring masked to a donut (`--p`/`--accent` inline); (2) dot-grid canvas `radial-gradient(circle at 1px 1px,rgba(255,255,255,.032) 1px,transparent 0)` size `42px 42px` → React Flow `<Background variant="dots" gap={42}/>`; (3) bowed quadratic spoke (control point y `−36`); (4) chip double-encode (color + glyph + solid/dashed left-border + opacity).

**Motion:** `spawn .44s --ease both` (staggered), zoom choreography scale+fade `.22s --ease` from clicked node's `%` origin (FR-NAV-6), `beat` pulse (liveness, v2). **Reduced-motion (NFR-A11Y-5):** disable spawn/pulse/reveal/zoom → instant cuts.

**Focus ring (NFR-A11Y-2):** `box-shadow:0 0 0 2px var(--bg),0 0 0 4px var(--caney)`.

**Typography harmonization:** mockup uses Space Grotesk / IBM Plex Mono / Inter. AGB-CRM already loads **Inter (`--font-sans`)** and **JetBrains Mono (`--font-mono`)** — reuse those: map mockup `--body`→`var(--font-sans)`, `--mono`→`var(--font-mono)`. Skip Space Grotesk (display) → fall back to `--font-sans` 700 for hub names, or load Space Grotesk via `next/font` only if the polish gap matters. Min text ≥11px, accents ≥3:1, body ≥4.5:1 (NFR-A11Y-4).

---

## 7. FR/NFR TRACEABILITY

| Build artifact | Satisfies (FR / NFR) |
|---|---|
| `lib/brain/types.ts` (schema) | FR-GRAPH-1,3,4,5,6 · FR-PIPE-12 · NFR-SEC-4 |
| `scripts/brain/extractors/openapi-surfaces.mjs` | FR-PIPE-1 · FR-DETAIL-5,6 · NFR-SEC-3 |
| `scripts/brain/extractors/migration-entities.mjs` | FR-PIPE-2 · NFR-SEC-3 |
| `scripts/brain/extractors/domain-cluster.mjs` | FR-PIPE-3 |
| `scripts/brain/extractors/interchange-detector.mjs` | FR-PIPE-4 · FR-XSYS-1 |
| `scripts/brain/extractors/state-overlay.mjs` | FR-PIPE-7 · FR-NAV-7 |
| `scripts/brain/lib/dedup.mjs` + `host-mount.mjs` | FR-PIPE-13,15 · NFR-OBS-5 |
| `scripts/brain/extractors/manifest-source.mjs` | FR-PIPE-14 · NFR-FRESH-6 |
| `scripts/brain/extractors/contract-hasher.mjs` | FR-PIPE-5,6 (OQ-2 policy flag) |
| `build-graph.mjs` + `db brainSnapshots` | FR-PIPE-12 · NFR-OBS-2 · NFR-FRESH-5 |
| `app/(app)/brain/page.tsx` | NFR-SEC-1 · NFR-PERF-1 |
| `brain-canvas.tsx` (React Flow) | FR-GRAPH-2 · NFR-SCALE-1,3 · NFR-PERF-3 |
| `nodes/*` + status constants | FR-GRAPH-1,4,5 · NFR-A11Y-1,2 |
| `nodes/cluster-node.tsx` + `selectors.ts` | FR-NAV-7 · NFR-SCALE-2 |
| `edges/spoke-edge.tsx` + `station.tsx` | FR-GRAPH-3 · FR-XSYS-1,4,8 |
| `chrome/breadcrumb.tsx` `altitude-pill.tsx` `back-button.tsx` `minimap.tsx` | FR-NAV-2,3,4,5 · NFR-A11Y-3 |
| `graph-provider.tsx` (drill/zoom) | FR-NAV-1,6 · FR-GRAPH-2 |
| `lib/brain/lenses/{navigation,state}.ts` | FR-LENS-1,2,5 · NFR-PERF-2 |
| `chrome/rail.tsx` (axis toggle) | FR-AXIS-1,2 |
| `lib/brain/layout/{radial,pin}.ts` | NFR-LAYOUT-1,2,3 · correctness-01 |
| `panel/detail-panel.tsx` + `sel-*` | FR-DETAIL-1..7 · FR-XSYS-5,6 |
| `lib/brain/presets.ts` (investor) | FR-PRESET-1,2 |
| `states/{empty,loading,error}.tsx` | NFR-OBS-4 |
| `brain.css` (token port, no glow) | NFR-A11Y-4,5,6 · ui-01 |
| nav-groups edit + `requireUser()` | NFR-SEC-1 |

---

## 8. BUILD ORDER (for build agents)

**Track A — Deterministic extractors (parallelizable, isolated, no UI dep).** Each agent owns one extractor; they share only `lib/brain/types.ts` + `scripts/brain/lib/emit.mjs` (build those first, sequentially).

1. **[seq, gate]** Author `lib/brain/types.ts` + `scripts/brain/lib/{emit,dedup,openapi,fs-routes}.mjs` + `config.mjs`. Everything downstream imports these.
2. **[parallel]** Independent extractors, each against its real repo:
   - A1 `openapi-surfaces.mjs` (3 specs)
   - A2 `migration-entities.mjs` (3 schemas)
   - A3 `domain-cluster.mjs` (depends on A1 output shape — run after A1, or stub surfaces)
   - A4 `interchange-detector.mjs` (5 grep signatures — fully independent)
   - A5 `state-overlay.mjs` (task boards — independent)
3. **[seq]** `build-graph.mjs` orchestrator: merge → assertions (dedup, manifest-state) → write `lib/brain/generated/brain-graph.json` + insert `brainSnapshots` row. Add `"brain:build"` to package.json. Verify `<2.5s` artifact, route count within ±2 (FR-PIPE-1).

**Track B — Coherent React shell (build together, single team/agent — shared state + layout).** Do NOT split across agents; the provider, layout engine, nodes, and lenses are tightly coupled.

4. **[seq, can start parallel to Track A using `lib/brain/data/sample.ts`]** Scaffold route + auth + nav: `page.tsx` (requireUser + TopBar), `nav-groups.ts` edit, `brain-canvas-loader.tsx` (dynamic ssr:false), empty/loading/error states. Renders a blank dark canvas behind auth.
5. **[seq]** `brain.css` token port + `graph-provider.tsx` (reducer state) + `lib/brain/layout/{radial,pin}.ts` (deterministic positions). This is the spine — build before nodes.
6. **[seq]** Node + edge components: `hub-node`, `domain-node`, `cluster-node`, `spoke-edge`, `station`. Wire double-encoding + ARIA `role="tree"` + focus rings + keyboard (Enter/Space drill, Esc out).
7. **[seq]** Chrome: breadcrumb, altitude, back-button, minimap, externals, rail (axis toggle + lens group + legends). Wire the 3 up-paths.
8. **[seq]** Lenses (`navigation`, `state`) as pure reducers; Investor preset; zoom choreography (FR-NAV-6) + reduced-motion guard.
9. **[seq]** Detail panel + `sel-*` renderers (portfolio/system/domain/surface/station) with `aria-live`.

**Integration / hardening (sequential, after A + B converge):**
10. Swap `sample.ts` → `generated/brain-graph.json`; run de-dup + node-cap (≤30/level) checks live.
11. A11y pass (grayscale legibility, contrast ≥4.5:1 body / ≥3:1 accent, full keyboard, reduced-motion), performance pass (`<2.5s` cold, `<100ms` lens switch, `<150ms` layout), `npx tsc --noEmit`, `pnpm dev` smoke.
12. Score against rubric (target ≥36): confirm a11y-01/02, resil-01/02, ux-01-decorative-search-deferred-OK-for-v0, ui-01 (no glow), correctness-01 (position persistence).

Track A and Track B run **fully in parallel** (B uses `sample.ts` until step 10). Within A, A1–A2–A4–A5 parallelize; A3 waits on A1. Within B, steps 4–9 are sequential (shared state).

---

## 9. OPEN QUESTIONS for the human (crisp decisions)

1. **Scope line (decide first — gates the whole build).** Confirm v0 = **3 systems (VAV/CaneyCloud/AGB-CRM) + 5 interchanges + L0–L1 + System axis + Navigation/State lenses**, matching what the 34/40 critique measured. Restaurants schema fields ship present-but-empty (v1), Academy deferred (v2). **Default: yes, hold the 3-system line.** Any objection?

2. **OQ-9 — 7th "Education/Training" function?** When By-Function axis lands (v1) and Academy onboards (v2): adopt a 7th `education` function, or fold Academy into cx/ops/sales? **Default: fold (no schema change either way; the `fn` union just widens if you later add it).** Decision needed before By-Function axis finalizes — not before v0.

3. **OQ-2 — contract-diff strictness policy** (the `CONTRACT_DIFF_POLICY` flag). Two options behind one interface: (a) `"hash-warn"` — any contract-file hash change → health `warn`; or (b) `"typed-field-red"` — `warn` on hash change, `red` only when a typed field referenced by a known consumer call-site is removed (needs a typed-field differ). **Default: ship (a) in v1, build (b) when the differ exists.** Which do you want as the v1 default?

4. **OQ-4 — cross-repo read credentials / CI secret store.** v0 reads only local clones (no creds). For v1 CI regen, the extractors need read-only access to 3 repos + (for ix2) VAV Supabase service-role. Decide: where do least-privilege read-only tokens live (Vercel env / GitHub Actions secrets / 1Password)? Constraint is fixed (NFR-SEC-3 read-only, NFR-SEC-4 never serialized into the artifact) — only the **store** is open. **Default: GitHub Actions repo secrets for CI, never in `brain-graph.json`.** Confirm the store.

(Lower-priority, non-blocking: OQ-7 `~/.megaoverlord/projects.yaml` is stale — do NOT depend on it for structure; OQ-8 confirm a node keeps a stable pinned slot across radial↔elkjs — design intends shared `pin.ts` positions; OQ-3 VAV state from git+handoff only is accepted for v1.)

---

**Key absolute paths:** schema `/Users/tomas/AGB-CRM/lib/brain/types.ts` · extractors `/Users/tomas/AGB-CRM/scripts/brain/` · artifact `/Users/tomas/AGB-CRM/lib/brain/generated/brain-graph.json` · route `/Users/tomas/AGB-CRM/app/(app)/brain/page.tsx` · canvas `/Users/tomas/AGB-CRM/components/brain/canvas/` (namespaced away from existing `components/brain/reintro-button.tsx`) · nav `/Users/tomas/AGB-CRM/components/layout/nav-groups.ts`. Source repos: VAV `/Users/tomas/VZ_Tourism_Project`, CaneyCloud `/Users/tomas/tour-pms-main`, Restaurants `/Users/tomas/caneycloud-restaurant`, Academy curriculum `/Users/tomas/vz-avitourism-curriculum`. Deps (`@xyflow/react` 12.11, `elkjs` 0.11.1, `d3-hierarchy` 3.1.2) already installed — no install step.