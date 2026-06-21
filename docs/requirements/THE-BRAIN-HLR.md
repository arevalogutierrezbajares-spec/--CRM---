# THE BRAIN — HLR (High-Level Requirements)

**Project:** The Brain — living architecture-map module, `/brain` route inside AGB-CRM
**Version:** V1.1 — 2026-06-21 by GigaRico — **scope expanded 3 systems → 5 systems** (adds Caney Restaurants + Caney Academy/CaneyLearn)
**Status:** Design LOCKED at the canvas/interaction level (mockup `designs/brain-canvas-20260621/finalized.html`, Impeccable-verified 34/40). This spec is implementation-ready. Requirements are derived from the locked mockup, the repo-recon brainstorm, and live source repos — not re-decided. The V1.1 expansion is **additive**: it preserves the V1 FR/NFR structure and numbering and extends PIPE/XSYS/AXIS to model two new territory shapes (a module mounted inside a host, and a planned/roadmap-only system).
**Home:** new route inside AGB-CRM (`/brain`). Absorbs the existing `/platforms`, `/roadmap`, and `/overlord` surfaces into one canvas.

---

## §1 — Vision & Problem

The portfolio is **five heterogeneous systems** — three live codebases, one live-but-release-gated module, and one planned system — wired together by real cross-system integrations. There is no single artifact that shows what exists, what's in flight, what's still needed, where the systems touch, and what breaks when a contract changes.

| # | System | Stack | State (2026-06-21) | Shape in the Brain |
|---|--------|-------|--------------------|--------------------|
| S1 | **VAV** (Venezuela Avitourism marketplace) | Next.js 16, 243 API routes, Supabase | Live, ~done domains + roadmap | First-class system territory |
| S2 | **CaneyCloud** (PMS) | Python FastAPI ~368 endpoints + Next 14 | Live | First-class system territory + **host** for Restaurants |
| S3 | **AGB-CRM** (control plane) | Next 16 + Drizzle, 70 routes | Live; hosts the Brain | First-class system territory |
| S4 | **Caney Restaurants** (restaurant POS/ops) | FastAPI + Vite (modules M_POS, M_BOOK, M_KDS, M_INV, M_PAY, M_FISCAL, M_ACCT; apps diner-web, foh-web, kds-display, operator-web) | **~74% built, release-gated `dark`** — mounts inside the CaneyCloud host, gated by `GET /api/v1/platform/release-mode` (dark→live) | **Module-mounted territory** inside CaneyCloud (tenant-scoped via `X-Restaurant-Id`; theme/auth inherited) |
| S5 | **Caney Academy / CaneyLearn** (LMS) | Planned (target: FastAPI + Postgres + Next.js, reusing CaneyEducation) | **~12% — curriculum drafted, no codebase** (`~/vz-avitourism-curriculum`) | **Planned / roadmap-only territory** (nodes from a manifest, render as `needed`/fog-of-war) |

The two new territories are not symmetric with VAV/CaneyCloud/AGB-CRM: Restaurants is a **module mounted inside another system's host** (a strong host-integration coupling — POS charges flow to the CaneyCloud guest folio), and Academy is a **planned system with little/no code** whose structure must come from a roadmap/manifest source, not an OpenAPI spec.

The Brain is **one graph, multiple lenses, two parallel grouping axes, progressive disclosure macro→micro**. It is *derived, not drawn*: regenerated from source-of-truth artifacts on every commit and nightly, so it never rots. It serves three audiences (team, AI agents, investors/partners) through saved camera presets.

**The four pains it kills:**

| # | Pain | The feature that kills it |
|---|------|---------------------------|
| P1 | Lost track of what's built across codebases | The derived map itself — always current, never hand-edited |
| P2 | Agents rebuild work that already exists | Rebuild-guard search across system/domain/surface ("does X already exist?") |
| P3 | Cross-system breakage is invisible | Contract-diff: per-commit contract hashing → interchange flashes red + "what breaks" call-site list |
| P4 | Can't explain the system fast | Navigation zoom + Investor preset + route-finding ("trace a booking VAV→CaneyCloud") |

**The anti-goal (call it out explicitly):** The Brain must never require manual upkeep. Backstage-style catalogs died because they depend on hand-maintained `catalog-info.yaml` files that drift the moment a human stops curating them. The Brain derives 100% of structure from code, OpenAPI specs, migrations, task boards, handoff logs, and deploy status. A node nobody declared still appears; a node nobody maintains still updates.

---

## §2 — Goals & Non-Goals

### Goals
- G1 — One canvas that renders the entire portfolio at every altitude (Portfolio → System → Domain → Surface).
- G2 — Auto-derived freshness: ≤1 commit behind on structure, ≤24h behind on semantic summaries.
- G3 — Cross-system interchanges visible at every zoom level (focus + context), each carrying a contract ref, health, and a "what breaks" impact list.
- G4 — Two coexisting grouping axes: **By System** and **By Function** (business-capability map), plus a **Function overlay** that recolors the system view.
- G5 — Rebuild-guard: any human or agent can ask "does X exist?" and get a definitive answer with a jump-to.
- G6 — Audience presets (Investor / Agent / Operator) as one-click saved cameras.
- G7 — 40/40-grade accessibility, determinism, and scale-readiness (the things a static mockup cannot prove).

### Non-Goals (v1)
- NG1 — Not a code editor or a deployment tool. Read-only over the portfolio; "Open in repo" links out.
- NG2 — Not a replacement for the source task boards (Operation Overlord remains canonical for tasks).
- NG3 — Not a general multi-org catalog. Scoped to the five known systems (incl. Restaurants as a module-mounted territory and Academy as a planned territory) + their external dependencies.
- NG4 — No write-back to source repos. The Brain never edits contracts, migrations, or boards.

---

## §3 — Personas

| Persona | Altitude / Lens default | Primary job-to-be-done | Success signal |
|---------|------------------------|------------------------|----------------|
| **Operator / Team** (Tomas, cofounder) | L1, Liveness lens | "What's broken or stale right now? What's the interchange health?" | Sees a red/warn interchange before a consumer breaks in prod |
| **AI Agent** (build agents, via `/brain/search` API + Agent preset) | L1–L2, Topology + State | "Does a capability for X already exist before I build it?" | Returns reuse target or "safe to build" deterministically |
| **Investor / Partner** | L0–L1, State lens | "Explain the whole system in 60 seconds; what's built vs roadmap" | Grasps % built + recently shipped + cross-system links without a walkthrough |

---

## §4 — Capability Areas

| Code | Area | FR count |
|------|------|----------|
| PIPE | Data pipeline / derivation (extractors → `brain-graph.json`) | 15 |
| GRAPH | Graph model & node/edge taxonomy | 6 |
| NAV | Navigation / semantic zoom | 7 |
| LENS | Lenses (Navigation, Topology, Liveness, State, Function overlay) | 7 |
| AXIS | Two axes + Function overlay (System / Function) | 6 |
| XSYS | Cross-system interchanges (focus + context, contract-diff) | 11 |
| DETAIL | Detail / docs panel (the micro = doorway to docs) | 7 |
| SEARCH | Search / rebuild-guard | 6 |
| CMDK | Command palette | 4 |
| PRESET | Audience presets (saved cameras) | 5 |

**74 FRs total. 33 NFRs.**
(V1.1 added 5 FRs — PIPE-13/14/15, XSYS-10/11 — and 2 NFRs — FRESH-6, OBS-5 — for the module-mounted and planned-system territory shapes.)

---

## §5 — Functional Requirements

Format: `FR-AREA-N: [Actor] can [capability]. Source: [mockup section / pain / brainstorm]. Acceptance: [verifiable criterion].`
Actors: **Viewer** (any authenticated AGB-CRM user), **Agent** (build agent via API), **System** (The Brain's pipeline/runtime).

### PIPE — Data Pipeline / Derivation

- **FR-PIPE-1:** The System can extract surface nodes (API routes/operations) from each system's OpenAPI spec. Source: brainstorm §5; VAV `docs/pms-integration/05-api/openapi.yaml`, CaneyCloud `APP/backend/api/openapi.yaml`, AGB-CRM route tree. Acceptance: every `paths` entry in each spec produces exactly one surface node with method, path, operationId, and owning domain; route count per system within ±2 of the spec's path count.
- **FR-PIPE-2:** The System can extract entity nodes from database migration history. Source: brainstorm §1 (L3 Data). Acceptance: Supabase migrations (VAV/CRM) and Alembic migrations (CaneyCloud) and Drizzle schema (CRM) each emit table/entity nodes; a table added in a migration appears as a node in the next build.
- **FR-PIPE-3:** The System can derive domain nodes by clustering surfaces from OpenAPI tags, route-group folders, and (nightly) the LLM cartographer. Source: brainstorm §1. Acceptance: every surface node resolves to exactly one domain; orphan surfaces (no tag/folder) are clustered into a domain by the nightly cartographer and flagged `derived:llm`.
- **FR-PIPE-4:** The System can detect cross-system interchanges by scanning for known integration signatures. Source: brainstorm GROUNDED FINDINGS; mockup `IX`. Acceptance: the live seed signatures are detected — HMAC webhook route (`/api/pms/webhook/caneycloud`), `VAV_SUPABASE_*` service-role reads, `intake-contract.ts`, `mcp_registry.py`, `overlord/sync`, and the Restaurants↔CaneyCloud folio/host-mount signature (`X-Restaurant-Id` + `release-mode` per `caneycloud-restaurant/MODULE-INTEGRATION.md`) — each producing one interchange edge with from/to {system,domain}, route, contract ref. Planned interchanges (no live signature) are sourced from the roadmap manifest per FR-PIPE-14, not from a code scan.
- **FR-PIPE-5:** The System can compute a contract hash per interchange contract per commit. Source: pain P3; mockup `ver`/`breaks`. Acceptance: each interchange stores `contract_ref` + `contract_hash`; a content change to the referenced contract file changes the hash in the next build.
- **FR-PIPE-6:** The System can mark an interchange as breaking when a producer's contract hash changes without a corresponding consumer update. Source: pain P3. Acceptance: when a producer contract hash changes and consumer call-sites are unchanged since, the interchange health is set to `warn` (or `red` if a typed field referenced by consumers was removed) with a generated "what breaks" list of call-site paths.
- **FR-PIPE-7:** The System can overlay build state (done/doing/needed) onto domains from task boards. Source: brainstorm §5; Operation Overlord `section-*/TASKS.md`, AGB-CRM `_tasks/_BOARD.md`. Acceptance: each domain's state is derived from board task statuses mapped to that domain; `needed` domains carry their source task IDs.
- **FR-PIPE-8:** The System can derive recent "built" events from the append-only handoff log. Source: brainstorm §5; `HANDOFF-LOG.md`. Acceptance: handoff entries within the snapshot window produce `recently_shipped` annotations on the affected domains/surfaces with session date and files-changed count.
- **FR-PIPE-9:** The System can derive done/doing status from git and Vercel deploy state when a system has no task board. Source: brainstorm §7 (VAV has no Overlord board). Acceptance: for systems without a board, a domain with merged-to-main + deployed surfaces reads `done`; with open branches/WIP commits reads `doing`.
- **FR-PIPE-10:** The System can derive liveness (lit/dim/atrophy) from runtime telemetry. Source: brainstorm §5 (Liveness); PostHog + health pings. Acceptance: a surface with zero events in the atrophy window is marked `live:dead`; a surface with recent events and healthy pings is `live:ok` (mockup shows `Itinerary AI` as `live:dead`).
- **FR-PIPE-11:** The System can run a nightly LLM cartographer that emits plain-English summaries and clusters orphan nodes. Source: brainstorm §5; mockup `summary` fields. Acceptance: each system/domain/interchange node has a `summary` string regenerated nightly from the latest handoff entries + graph diff; orphan nodes are assigned a domain.
- **FR-PIPE-12:** The System can emit a single versioned `brain-graph.json` artifact per build and persist a snapshot for time-travel. Source: brainstorm §5 (Store). Acceptance: each build writes `brain-graph.json` (schema §10) plus a row in a `brain_snapshots` table keyed by commit SHA + timestamp; consecutive snapshots are diffable.
- **FR-PIPE-13:** The System can derive a **module-mounted system** (a system that runs inside another system's host) as its own first-class territory while representing the host-mount relationship and avoiding double-counting. Source: V1.1 scope; `caneycloud-restaurant/MODULE-INTEGRATION.md` (mounts inside CaneyCloud, tenant-scoped via `X-Restaurant-Id`, gated by `GET /api/v1/platform/release-mode`). Acceptance: Caney Restaurants surfaces (its M_* module routes) emit under `system:"restaurants"`, NOT under `caney`; a single `hosted_by` edge (kind `interchange`, subtype `host_mount`) links `restaurants → caney` carrying the release-mode contract ref; portfolio % built and per-system route counts count each Restaurants surface exactly once (no surface appears under both systems), verifiable by a de-dup assertion over node ids.
- **FR-PIPE-14:** The System can derive a **planned system** (little or no code) from a roadmap/manifest source rather than from OpenAPI/migrations, emitting its nodes as `needed`. Source: V1.1 scope; Caney Academy curriculum + `~/vz-avitourism-curriculum/modules/lms-integration-plan.md` (trails AV-1..AV-4, 14 courses, no codebase yet). Acceptance: when a system has no OpenAPI spec / migration history, its domains and surfaces are read from a declared manifest (the integration plan's trail→course structure) and every emitted node carries `state:"needed"` + `source:"manifest"`; the system renders as a fog-of-war territory and is excluded from the route-count and liveness derivations that assume a live spec.
- **FR-PIPE-15:** The System can derive the host-mount release state of a module-mounted system and reflect it as that territory's overall state. Source: V1.1 scope; `MODULE-INTEGRATION.md` §2 (`release_mode: dark|live`, `frontend_flags`). Acceptance: the Restaurants territory's state reads `doing` (built-but-gated) while `release-mode` resolves to `dark`, and flips to `done`/`live` only when `release-mode` resolves to `live`; the `host_mount` interchange health is `dark` while gated and `ok` once live, with the blocker ("release-mode = dark") shown in its "what breaks" list.

### GRAPH — Graph Model

- **FR-GRAPH-1:** The Viewer can see nodes at four hierarchical levels: Portfolio (L0), System (L1), Domain (L2 hub), Surface (L3 route/file). Source: mockup levels; brainstorm §1. Acceptance: each rendered node carries `level`, `id`, `parentId`, `kind`, `state`, and is reachable by drill-down from L0.
- **FR-GRAPH-2:** The Viewer can see exactly one hierarchy layer at a time (one level shown per render). Source: mockup `render()` per-level. Acceptance: at any given moment the stage shows nodes of a single level plus focus-context interchange affordances; no two hierarchy layers render simultaneously.
- **FR-GRAPH-3:** The Viewer can distinguish four edge kinds: `contains` (hierarchy), `calls`, `reads/writes`, and `interchange` (cross-system, first-class). Source: brainstorm §1 (Edges). Acceptance: each edge in `brain-graph.json` declares a `kind`; interchange edges additionally carry `contract_ref`, `contract_hash`, `health`.
- **FR-GRAPH-4:** The Viewer can see each node's status double-encoded by icon + shape + text, never color alone. Source: critique a11y-01; mockup `SI`/`SLBL`. Acceptance: `done`=✓ + solid left-border + "BUILT"; `doing`=◐ + WIP marker + "WIP"; `needed`=○ + dashed border + "NEEDED"; verified legible in grayscale.
- **FR-GRAPH-5:** The Viewer can see node magnitude encoded by size (size ∝ child count). Source: critique resil-01; mockup `sizeFor`. Acceptance: domains with ≥3 surfaces render `lg`, 1–2 render `md`, 0 render `sm`.
- **FR-GRAPH-6:** The System can carry per-node overlay attributes: `state`, `liveness`, `owner/claimed_by/branch/last_commit`, `docs_ref`, `contract_ref`, `fn` (business function). Source: brainstorm §1 (Node attributes); mockup `FNMAP`/`live`. Acceptance: every node serializes these attributes (null when N/A); lenses read only from these attributes.

### NAV — Navigation / Semantic Zoom

- **FR-NAV-1:** The Viewer can zoom from macro to micro by clicking a node to drill in one level. Source: mockup `go()`. Acceptance: clicking a System hub navigates L0→L1; a Domain → L1→L2; a Surface opens the detail panel.
- **FR-NAV-2:** The Viewer can zoom out via a back control, the breadcrumb, or the Escape key. Source: mockup `backbtn`, `crumbs`, keydown Esc. Acceptance: each of the three affordances returns exactly one level up; at L0 they are no-ops.
- **FR-NAV-3:** The Viewer can see a breadcrumb of the current path and jump to any ancestor. Source: mockup `crumbs`. Acceptance: breadcrumb shows Portfolio › System › Domain (or Functions › Function › Domain); clicking any crumb navigates to that level.
- **FR-NAV-4:** The Viewer can see an altitude indicator naming the current level. Source: mockup `altitude`. Acceptance: indicator reads e.g. "Portfolio · 3 systems · L0", "VAV · domains · L1", "Bookings · surfaces · L2".
- **FR-NAV-5:** The Viewer can see a minimap "you are here" overview that persists at all levels. Source: critique resil-02; mockup `minimap`. Acceptance: minimap shows all systems (or functions) with the current location highlighted and is clickable to jump.
- **FR-NAV-6:** The Viewer can navigate via a shared-element zoom transition that scales from the clicked node's position. Source: critique ux-02; mockup `go()` transform-origin. Acceptance: drill-in scales from the clicked node's coordinates (~200–300ms); reduced-motion users get an instant cut (no transition).
- **FR-NAV-7:** The Viewer can see at most ~30 nodes per level, with `needed` nodes clustered into one expandable "Roadmap (N)" meta-node. Source: critique resil-01; mockup `visibleDomains`. Acceptance: when a level has >1 `needed` child, they collapse into a single Roadmap cluster node showing the count; clicking it expands them; visible node count never exceeds the cap.

### LENS — Lenses (pure reducers over one graph)

- **FR-LENS-1:** The Viewer can switch among five lenses over the same graph: Navigation, Topology, Liveness, State, Function overlay. Source: mockup lens-group; brainstorm §2. Acceptance: each lens is a pure visual transform (no data refetch); switching lenses preserves the current level and selection.
- **FR-LENS-2:** The Viewer can use the Navigation lens to zoom macro→micro (the always-on camera). Source: mockup `data-l="navigation"`. Acceptance: Navigation is the default lens; it imposes no de-emphasis on nodes.
- **FR-LENS-3:** The Viewer can use the Topology lens to highlight cross-system interchanges and de-emphasize non-linked nodes. Source: mockup `html[data-lens="topology"]`. Acceptance: nodes that own an interchange are highlighted (warn border); non-interchange nodes dim to ~32% opacity.
- **FR-LENS-4:** The Viewer can use the Liveness lens to pulse live nodes and dim dead/atrophied ones. Source: mockup `html[data-lens="liveness"]`. Acceptance: `live:ok` stations pulse (reduced-motion: static); `live:dead` nodes dim to ~32%.
- **FR-LENS-5:** The Viewer can use the State lens to emphasize built/wip and fog-of-war the `needed` roadmap. Source: mockup `html[data-lens="state"]`; brainstorm fog-of-war. Acceptance: `needed` nodes render at reduced emphasis (fog); built/wip render full.
- **FR-LENS-6:** The Viewer can use the Function overlay lens to recolor the system view by business function. Source: mockup `html[data-lens="function"]`, `FNCOLOR`. Acceptance: while in the System axis, each domain's accent recolors to its `fn` color; a function legend appears.
- **FR-LENS-7:** The Viewer can see lenses behave meaningfully at every level (not just L0). Source: critique ux-03. Acceptance: State recolors domains at L1; Liveness pulses live domains at L1; Topology highlights interchange-owning domains at L1; verified at L0, L1, L2.

### AXIS — Two Axes + Function Map

- **FR-AXIS-1:** The Viewer can toggle the grouping axis between "By System" and "By Function". Source: mockup `#axisSeg`; locked scope. Acceptance: toggling re-renders the graph at L0 in the chosen axis; both axes share the same underlying nodes.
- **FR-AXIS-2:** The Viewer can see the By-System axis group nodes under all five systems — VAV, CaneyCloud, AGB-CRM, Caney Restaurants (module-mounted), Caney Academy (planned) — color-coded by system. Source: mockup `T`, `C`; V1.1 scope. Acceptance: L0 shows the five systems with % built and their interchanges; Restaurants renders as a module-mounted territory with its `host_mount` link to CaneyCloud, and Academy renders as a fog-of-war/`needed` planned territory.
- **FR-AXIS-3:** The Viewer can see the By-Function axis group capabilities under 6 business functions: Marketing & Growth, Sales & Revenue, Operations, Customer Experience, Business Admin & Finance, Platform & Data. Source: locked scope; mockup `FUNCS`. Acceptance: L0 shows 6 function hubs; each aggregates capabilities across **all five systems** via `FNMAP`. Restaurants capabilities map into existing functions (e.g. M_POS/M_PAY → Sales & Revenue; M_KDS/M_INV → Operations; M_FISCAL/M_ACCT → Business Admin & Finance; diner-web → Customer Experience); Academy's `needed` capabilities map into Operations/Customer Experience (training delivery) and Sales & Revenue (certification → provider supply), unless the optional "Education/Training" function is adopted per OQ-9.
- **FR-AXIS-4:** The Viewer can see each function's % readiness computed from its member capabilities' states. Source: mockup `fnPct`. Acceptance: function % = mean(done=1, doing=0.5, needed=0) over members across all five systems, rounded; `doing` includes Restaurants' release-gated capabilities (FR-PIPE-15) and `needed` includes Academy's manifest-sourced capabilities; matches the displayed value.
- **FR-AXIS-5:** The Viewer can see, within a function, which systems contribute and which capabilities are gaps. Source: mockup `selFunction`. Acceptance: function detail lists all contributing systems (up to five) with capability counts and a "gaps in this function" list of `needed` members (Academy capabilities appear here as gaps until built).
- **FR-AXIS-6:** The Viewer can drill from a function into a member capability's surfaces (crossing back into a specific system at L2). Source: mockup `memberEl` → `go(level:2)`. Acceptance: clicking a function member with surfaces navigates to that system's domain at L2; members without surfaces open the domain detail.

### XSYS — Cross-System Interchanges (focus + context)

- **FR-XSYS-1:** The Viewer can see all cross-system interchanges at the Portfolio level as curved links between systems with health-colored stations at their midpoints. Source: mockup L0 stations. Acceptance: 5 interchanges render as links + a clickable station each, colored by health (ok/warn/dark).
- **FR-XSYS-2:** The Viewer can see interchanges as threads to other systems at the System level (focus + context). Source: mockup L1 `thread-lbl`. Acceptance: at L1, each interchange touching the focused system renders a thread from its owning domain out to the linked system, labeled with direction + purpose.
- **FR-XSYS-3:** The Viewer can see interchanges as portals to other systems at the Domain level. Source: mockup L2 `portal`. Acceptance: at L2, each interchange owned by the focused domain renders a portal ring toward the linked system; the panel auto-selects the first link.
- **FR-XSYS-4:** The Viewer can see interchanges remain visible at every zoom level (focus+context invariant). Source: locked scope; critique. Acceptance: an interchange owned by the current node is represented at L0 (station), L1 (thread), and L2 (portal) — never hidden by zoom.
- **FR-XSYS-5:** The Viewer can open an interchange to see its producer→consumer flow with both endpoints labeled. Source: mockup `selStation` Flow. Acceptance: detail shows producer (from) and consumer (to) rows, each navigable to that endpoint's L2 surfaces.
- **FR-XSYS-6:** The Viewer can see each interchange's contract reference, version, auth, and a code excerpt. Source: mockup `selStation` Contract/Facts. Acceptance: detail shows `contract_ref` file path, version label, key facts (auth, flow volume), and a contract code snippet.
- **FR-XSYS-7:** The Viewer can see a "what breaks if this changes" impact list per interchange. Source: pain P3; mockup `breaks`. Acceptance: detail shows a generated list of downstream consumer call-sites / failure modes; for `dark` edges it states the blocker.
- **FR-XSYS-8:** The Viewer can see interchange health in three double-encoded states: ok (live), warn (untyped/drifting), dark (not live). Source: mockup `health`/`hcol`/badges. Acceptance: health is encoded by icon (✓/!/·) + label + color; dark edges render dashed.
- **FR-XSYS-9:** The Viewer can trace a route across systems from a surface ("trace across systems"). Source: pain P4; mockup detail action. Acceptance: from a surface or interchange, a "trace" action highlights the producer→consumer path end to end (e.g. a VAV booking reaching CaneyCloud).
- **FR-XSYS-10:** The Viewer can see the four V1.1 cross-system interchanges, each with a producer, consumer, purpose, health, and contract status. Source: V1.1 scope; `caneycloud-restaurant/MODULE-INTEGRATION.md`; Academy integration plan. Acceptance: the following render as interchange edges/stations alongside the existing five, each with from/to {system,domain}, purpose, health, and `contract_status`:
  - **Caney Restaurants → CaneyCloud** — folio charges & tenant host mount; health `dark`→`ok` per release-mode (FR-PIPE-15); `contract_status: live`; `contract_ref: caneycloud-restaurant/MODULE-INTEGRATION.md` (release-mode + `X-Restaurant-Id`).
  - **VAV → Caney Restaurants** — dining experiences/bookings surfaced into the marketplace; health `dark`; `contract_status: planned`.
  - **Caney Academy → VAV** — certified guides become verified VAV providers; health `dark`; `contract_status: planned (blocked on Academy build)`.
  - **Caney Academy → AGB-CRM** — enrollment intake → CRM contacts; health `dark`; `contract_status: planned`.
- **FR-XSYS-11:** The Viewer can distinguish a **planned/dark edge** (an interchange that does not yet exist in code) from a live-but-degraded edge. Source: V1.1 scope; pain P3 (don't false-alarm on not-yet-built links). Acceptance: edges with `contract_status: planned` render dashed + fog-of-war and label as "PLANNED" (not `warn`/`red`); their "what breaks" panel states the build blocker (e.g. "blocked on Caney Academy build") rather than a consumer call-site list; they are excluded from contract-hash breakage detection (FR-PIPE-6) since there is no producer contract to hash yet.

### DETAIL — Detail / Docs Panel

- **FR-DETAIL-1:** The Viewer can see a context panel that updates to the current selection (portfolio, system, function, domain, surface, interchange). Source: mockup `detail`, `aria-live`. Acceptance: selecting any node updates the panel; the panel announces changes politely (`aria-live`).
- **FR-DETAIL-2:** The Viewer can see, at the portfolio selection, per-system % built, an aggregate % built, and the list of cross-system links. Source: mockup `selPortfolio`. Acceptance: panel lists each system's %, a portfolio aggregate %, and all interchanges with health + purpose.
- **FR-DETAIL-3:** The Viewer can see, at a system selection, its meta (routes/pages/migrations/stack), a summary, its links out, and its domains. Source: mockup `selTerritory`. Acceptance: panel shows the system's metadata line, summary, interchange count + list, and domain list with states.
- **FR-DETAIL-4:** The Viewer can see, at a domain selection, its state badge, cross-system links, and its surfaces. Source: mockup `selDomain`. Acceptance: panel shows the state badge, any interchange links, and the surface list; `needed` domains show "fog-of-war / no surfaces yet".
- **FR-DETAIL-5:** The Viewer can open a surface (the micro level) to reach its documentation — OpenAPI operation, co-located MDX, or the ADR that introduced it. Source: brainstorm §4 ("micro = doorway to docs"); mockup `selSurface`. Acceptance: surface detail shows endpoint/contract code derived from OpenAPI at build, a Docs section, and an "Open in repo ↗" link to the file at its commit.
- **FR-DETAIL-6:** The Viewer can distinguish surface kinds (route vs file/contract). Source: mockup `isFile`. Acceptance: route surfaces show method + path; file surfaces show contract type + language badge.
- **FR-DETAIL-7:** The Viewer can act on a selection via "Open in repo", "Open contract", and "Trace across systems" actions. Source: mockup `d-actions`. Acceptance: each action is present where applicable and resolves to the correct repo URL or trace.

### SEARCH — Search / Rebuild-Guard

- **FR-SEARCH-1:** The Viewer can search across systems, domains, surfaces, and interchanges from a single input. Source: critique ux-01; mockup `INDEX`/`runSearch`. Acceptance: typing filters an index spanning all four node types; each result shows type + path.
- **FR-SEARCH-2:** The Viewer can jump to any search result, which navigates and selects the node. Source: mockup `pick`. Acceptance: selecting a result drills to the node's level and selects it in the panel.
- **FR-SEARCH-3:** The Viewer can keyboard-navigate results (Arrow keys, Enter to pick, Escape to close). Source: mockup search keydown. Acceptance: ArrowUp/Down move the active result, Enter activates it, Escape dismisses.
- **FR-SEARCH-4:** The Viewer can see an explicit "no match — safe to build it" answer when a query matches nothing. Source: pain P2; mockup empty state. Acceptance: an empty result set renders the literal rebuild-guard message naming the query.
- **FR-SEARCH-5:** The Agent can query the rebuild-guard programmatically via `/brain/search` API before building. Source: pain P2; brainstorm §6 (v1). Acceptance: a GET/POST to `/brain/search?q=` returns ranked matches (system/domain/surface/interchange) or an explicit empty result, as JSON, behind AGB-CRM auth.
- **FR-SEARCH-6:** The System can rank rebuild-guard matches by node type and label/path relevance. Source: mockup filter order. Acceptance: exact label matches rank above path/substring matches; results are deterministic for a given graph + query.

### CMDK — Command Palette

- **FR-CMDK-1:** The Viewer can open a command palette with ⌘K / Ctrl-K. Source: mockup `toggleCmdk`. Acceptance: ⌘K (and Ctrl-K) opens the palette and focuses its input; Escape closes it.
- **FR-CMDK-2:** The Viewer can run lens, audience, and navigation commands from the palette. Source: mockup `COMMANDS`. Acceptance: palette lists grouped commands (Lenses, Audiences, Navigate) and executes the selected one.
- **FR-CMDK-3:** The Viewer can jump to any node from the palette via fuzzy search over the same index. Source: mockup `renderCmdk` "Jump to". Acceptance: typing surfaces node matches under a "Jump to" group; selecting navigates to the node.
- **FR-CMDK-4:** The Viewer can keyboard-drive the palette entirely (Arrow/Enter), including direct shortcuts to each system (⌘1–⌘5). Source: mockup keydown; V1.1 scope. Acceptance: arrows move selection, Enter runs it, and ⌘1/2/3/4/5 jump to VAV / CaneyCloud / AGB-CRM / Caney Restaurants / Caney Academy respectively.

### PRESET — Audience Presets (saved cameras)

- **FR-PRESET-1:** The Viewer can switch among three audience presets: Investor, Agent, Operator. Source: mockup `presets`; locked scope. Acceptance: a preset group with three options; the active one is `aria-pressed`.
- **FR-PRESET-2:** The Viewer can apply the Investor preset (State lens, L0–L1 altitude, % built + recently shipped, plain-English summaries). Source: brainstorm §3; mockup `setPreset('investor')`. Acceptance: selecting Investor sets the State lens and shows the investor framing (incl. reveal sweep when motion is allowed).
- **FR-PRESET-3:** The Viewer can apply the Agent preset (Topology + State, search foregrounded for rebuild-guard). Source: brainstorm §3; mockup `setPreset('agent')`. Acceptance: selecting Agent sets the Topology lens and emphasizes search/rebuild-guard.
- **FR-PRESET-4:** The Viewer can apply the Operator preset (Liveness + interchange health). Source: brainstorm §3; mockup `setPreset('operator')`. Acceptance: selecting Operator sets the Liveness lens.
- **FR-PRESET-5:** Each preset encodes a saved camera (altitude + lens + filters), not a separate tool. Source: brainstorm §3 (decision). Acceptance: switching presets only changes lens/altitude/filters over the one graph; no preset loads a different view component or dataset.

---

## §6 — Won't Have (v1)

- Editing or writing back to source repos (contracts, migrations, boards).
- Per-feature manifest files (`feature.json`) — structure is derived from code, not declared (brainstorm §5).
- A second renderer (Cytoscape/Sigma) — React Flow is sufficient at v1 node counts; graduate only if counts blow up.
- Public/unauthenticated access — The Brain lives strictly behind AGB-CRM auth.
- Auto-mutation of `~/.megaoverlord/projects.yaml` or `OVERVIEW.md` (flagged as hygiene cleanups, not v1 features).

---

## §7 — Non-Functional Requirements

Format: `NFR-AREA-N: The system shall [measurable target] [condition].`

### Freshness & Cadence

- **NFR-FRESH-1:** Structural extraction (routes, migrations, contract hashes, interchange detection) shall run in CI on every commit to any of the three repos and complete in <90s per repo.
- **NFR-FRESH-2:** Semantic generation (LLM cartographer summaries, full re-layout, orphan clustering) shall run nightly and not block per-commit builds.
- **NFR-FRESH-3:** The rendered graph shall be ≤1 commit behind structure and ≤24h behind semantic summaries; the panel shall display the source commit SHA and sync time.
- **NFR-FRESH-4:** The graph shall require zero manual upkeep: no hand-maintained catalog files; a node added in code appears without human action, and a node removed in code disappears within one build.
- **NFR-FRESH-5:** Every generated build shall be idempotent — re-running extraction on an unchanged commit produces a byte-identical `brain-graph.json` (modulo timestamps).
- **NFR-FRESH-6:** Planned/manifest-sourced systems (e.g. Caney Academy) shall refresh from their declared manifest on every build with zero manual curation of node lists; when a planned system later gains a real codebase, the derivation shall switch from manifest to OpenAPI/migrations without a schema change to `brain-graph.json` (state transitions `needed`→`doing`/`done` automatically).

### Scalability / Infinite Canvas

- **NFR-SCALE-1:** The canvas shall support pan and zoom over an effectively infinite plane via React Flow (`@xyflow/react` v12, `colorMode=dark`).
- **NFR-SCALE-2:** No level shall render more than ~30 nodes; `needed` nodes shall cluster into a Roadmap meta-node, and overflow shall cluster rather than overflow the cap.
- **NFR-SCALE-3:** Semantic zoom shall vary level-of-detail by altitude (systems → domains → surfaces); the underlying graph may hold hundreds–thousands of nodes while any view stays under the cap.
- **NFR-SCALE-4:** The renderer shall sustain 60fps pan/zoom with up to 200 simultaneously mounted nodes and remain interactive (<100ms input latency) at a 2,000-node total graph.

### Layout Determinism

- **NFR-LAYOUT-1:** Layout shall be curated and deterministic: d3-hierarchy radial for hub/drill views, elkjs layered for topology; given the same graph, positions shall be identical across sessions and machines (seed-then-pin).
- **NFR-LAYOUT-2:** A node shall keep its position across renders, resizes, and reloads (spatial memory); resize shall reflow without nodes jumping to new coordinates.
- **NFR-LAYOUT-3:** Layout computation for a single level shall complete in <150ms.

### Accessibility (target: 40/40-grade)

- **NFR-A11Y-1:** All status shall be double-encoded (icon + shape + text), never color alone, and shall pass a grayscale legibility check.
- **NFR-A11Y-2:** Every node, station, portal, and control shall be a focusable element with a visible focus ring; the canvas shall expose an ARIA graph/tree role with labeled nodes.
- **NFR-A11Y-3:** The entire module shall be operable by keyboard alone: drill (Enter/Space), zoom out (Esc), search (`/`), palette (⌘K), result navigation (arrows).
- **NFR-A11Y-4:** Text shall be ≥11px; accents shall meet ≥3:1 against their local background and body text ≥4.5:1 (WCAG AA).
- **NFR-A11Y-5:** `prefers-reduced-motion` shall disable spawn animations, pulses, the reveal sweep, and zoom transitions (instant cuts instead).
- **NFR-A11Y-6:** No decorative neon glow/halation (anti-slop): elevation expressed via surface lightness/shadow tokens; any halo reserved for a genuine live alert only.

### Performance

- **NFR-PERF-1:** Initial `/brain` render (graph fetch + first paint) shall complete in <2.5s on a cold load over the prebuilt `brain-graph.json`.
- **NFR-PERF-2:** Lens switches and axis toggles shall be pure reducers over the loaded graph with no network refetch and shall apply in <100ms.
- **NFR-PERF-3:** The renderer shall not rebuild the DOM via full `innerHTML` replacement on every render (mockup's stopgap); it shall reconcile via React Flow's node model to preserve transitions and performance.
- **NFR-PERF-4:** Search/rebuild-guard queries shall return in <50ms in-client and <200ms via the `/brain/search` API.

### Security

- **NFR-SEC-1:** The module shall be reachable only by authenticated AGB-CRM users (it is the control plane).
- **NFR-SEC-2:** Cross-repo extraction shall not leak private contract bodies or secrets to the wrong audience: the Investor preset shall expose only summaries + % + names, never raw contract code, secret-bearing config, or service-role identifiers.
- **NFR-SEC-3:** Extractors shall read source repos with least-privilege, read-only credentials and shall never write to source repos.
- **NFR-SEC-4:** `brain-graph.json` shall contain no secrets, tokens, or credentials; contract excerpts shall be redacted of secret material before serialization.
- **NFR-SEC-5:** The `/brain/search` API shall enforce the same auth + audience scoping as the UI.

### Observability

- **NFR-OBS-1:** Each extractor run shall emit structured logs (per repo: nodes/edges produced, interchanges detected, contracts hashed, duration) and surface failures to Sentry.
- **NFR-OBS-2:** A failed or partial extraction shall not silently ship a degraded graph: the build shall fail visibly and the previous good `brain-graph.json` shall remain served.
- **NFR-OBS-3:** Liveness data (PostHog events, health pings) shall be timestamped so atrophy windows are computed against real last-activity times, not build time.
- **NFR-OBS-4:** The module shall expose empty, loading, and error states for the canvas and panel (no blank screens).
- **NFR-OBS-5:** Extractor logs shall record, per system, its derivation source (`openapi` | `migrations` | `manifest` | `host_mount`) and shall assert no surface is double-counted across a module-mounted system and its host; a de-dup violation (a surface id under both `restaurants` and `caney`) or a manifest-sourced node lacking `state:"needed"` shall fail the build visibly (per NFR-OBS-2), not ship silently.

---

## §8 — Traceability: Pain → FRs

| Pain | Killed by |
|------|-----------|
| **P1** Lost track of what's built across codebases | FR-PIPE-1..3,7,8,9,12,13,14,15 (derive structure + state, incl. module-mounted + planned systems) · FR-GRAPH-1..4 · FR-NAV-1..7 · FR-DETAIL-1..4 · NFR-FRESH-1..6 · NFR-OBS-5 |
| **P2** Agents rebuild existing work | FR-SEARCH-1..6 (rebuild-guard, incl. `/brain/search` API) · FR-CMDK-3,4 · FR-AXIS-1..6 (find by function too, across all 5 systems) · FR-PRESET-3 (Agent preset) |
| **P3** Cross-system breakage invisible | FR-PIPE-4,5,6,15 (detect + hash + flag, incl. release-mode gating) · FR-XSYS-1..11 (interchanges everywhere + "what breaks" + the 4 V1.1 interchanges + planned/dark edges) · FR-LENS-3 (Topology) · FR-PRESET-4 (Operator) |
| **P4** Can't explain the system fast | FR-NAV-1..6 (zoom) · FR-XSYS-9,10 (route-finding/trace + the new cross-system links) · FR-PRESET-2 (Investor) · FR-PIPE-11 (plain-English summaries) · FR-AXIS-3..5 (function story across 5 systems) |

Every FR traces up to at least one pain and one mockup/brainstorm/V1.1-scope source; no orphan requirements. The five V1.1 FRs map: PIPE-13/15 → P1+P3 (module-mounted state + folio breakage), PIPE-14 → P1 (planned system visibility), XSYS-10 → P3+P4 (new links + explainability), XSYS-11 → P3 (don't false-alarm on planned edges).

---

## §9 — Phased Delivery Plan

### v0 — Derived static map (kills P1 & P4 immediately)
- One manual extractor pass → `brain-graph.json` (the three live systems, their domains, surfaces, the 5 interchanges, state from board counts).
- `/brain` renders L0–L1 + interchanges as stations + the System axis, Navigation + State lenses, detail panel, minimap, breadcrumb.
- FRs: PIPE-1,2,3,4,7,12 · GRAPH-1..6 · NAV-1..7 · LENS-1,2,5 · AXIS-1,2 · XSYS-1,2,4,5,6,8 · DETAIL-1..7 · PRESET-1,2.
- NFRs in scope: SCALE-1..3, LAYOUT-1..3, A11Y-1..6, PERF-1..3, SEC-1..4, OBS-4.

### v1 — CI regen + contract-diff + search + Restaurants folio integration (kills P2 & P3)
- CI extraction per-repo on commit; nightly placeholder.
- Contract-hasher → red/warn interchanges + "what breaks" lists.
- L2 surfaces + docs panel (OpenAPI at micro) fully wired; "Open in repo".
- Rebuild-guard search UI + `/brain/search` API; ⌘K palette; Function axis + Function overlay lens; Topology lens; Agent preset.
- **Near-term V1.1:** add Caney Restaurants as a module-mounted territory + its folio/host-mount interchange and release-mode-driven state (it is ~74% built today; its folio link is the most actionable new cross-system surface). Extend ⌘-shortcuts and the System axis to it.
- FRs added: PIPE-5,6,8,9,13,15 · LENS-3,6,7 · AXIS-3,4,5,6 · XSYS-3,7,9,10 (Restaurants→CaneyCloud row),11 · SEARCH-1..6 · CMDK-1..4 · PRESET-3.
- NFRs added: FRESH-1,3,4,5 · SCALE-4 · PERF-4 · SEC-5 · OBS-1,2,5.

### v2 — Liveness + investor mode + LLM cartographer + planned-system territories
- Liveness lens from PostHog + health pings (lit/dim/atrophy); Operator preset.
- Nightly LLM cartographer: plain-English summaries + orphan clustering + Investor fog-of-war momentum (snapshot diff animation).
- Route-finding fully interactive across systems.
- **V1.1 roadmap:** add Caney Academy / CaneyLearn as a planned/manifest-sourced fog-of-war territory and its three planned interchanges (Academy→VAV, Academy→AGB-CRM, plus VAV→Restaurants once Restaurants is live). Academy is v2+ because no codebase exists yet; it appears as `needed` and converts to derived nodes automatically when built (NFR-FRESH-6).
- FRs added: PIPE-10,11,14 · LENS-4 · PRESET-4,5 · XSYS-10 (the three planned-interchange rows).
- NFRs added: FRESH-2,6 · OBS-3.

### v2+ hygiene (cleanups this surfaced)
- Register AGB-CRM in `~/.megaoverlord/projects.yaml`; backfill stale VAV registry entry.
- Auto-refresh `OVERVIEW.md`; give VAV an Overlord task board (so VAV state stops depending on git+handoff only).

---

## §10 — Data-Source Contracts (extractors → `brain-graph.json`)

Each extractor reads a source-of-truth artifact and emits a slice of the graph. Belt-and-suspenders: derive structure from code/specs, overlay state from boards/handoff, overlay liveness from runtime.

| Extractor | Reads | Emits |
|-----------|-------|-------|
| **openapi-surfaces** | VAV `docs/pms-integration/05-api/openapi.yaml`; CaneyCloud `APP/backend/api/openapi.yaml` (+ `schema.gen.ts`); AGB-CRM route tree; **Caney Restaurants** module routes (`caneycloud-restaurant/modules/M_*/routes`) | surface nodes (method, path, operationId), `calls` edges, domain assignment via tags; Restaurants surfaces tagged `system:"restaurants"` (never `caney`) per FR-PIPE-13 |
| **migration-entities** | Supabase migrations (VAV/CRM), Alembic migrations (CaneyCloud), Drizzle `schema.ts` (CRM); Restaurants module migrations (`modules/M_*/migrations`) | entity nodes, `reads/writes` edges |
| **interchange-detector** | grep signatures: `pms/webhook/caneycloud`, `VAV_SUPABASE_*`, `lib/onboarding/intake-contract.ts`, `mcp_registry.py`, `overlord/sync`, SiteMinder provision, **`X-Restaurant-Id` + `release-mode`** (Restaurants host-mount/folio) | interchange edges (from/to {system,domain}, route, contract_ref, purpose, `contract_status`) |
| **host-mount** (V1.1) | `caneycloud-restaurant/MODULE-INTEGRATION.md` (`GET /api/v1/platform/release-mode`, `X-Restaurant-Id`, `frontend_flags`) | `host_mount` interchange edge `restaurants → caney`; Restaurants territory `state` from `release_mode` (dark=`doing`, live=`done`) per FR-PIPE-15; de-dup assertion (no surface under both systems) |
| **manifest-source** (V1.1) | `~/vz-avitourism-curriculum/modules/lms-integration-plan.md` (trails AV-1..AV-4 → 14 courses) + a declared planned-interchange manifest | Caney Academy domain/surface nodes with `state:"needed"`, `source:"manifest"`; the 3 planned interchange edges (Academy→VAV, Academy→AGB-CRM, VAV→Restaurants) with `contract_status:"planned"` per FR-PIPE-14 / FR-XSYS-10,11 |
| **contract-hasher** | each interchange's contract file (OpenAPI op, `intake-contract.ts`, MCP tool schema, sync envelope) | `contract_hash`, `health`, generated `breaks[]` |
| **state-overlay** | Operation Overlord `section-*/TASKS.md`, AGB-CRM `_tasks/_BOARD.md` | domain `state` (done/doing/needed), source task IDs |
| **handoff-overlay** | `HANDOFF-LOG.md` | `recently_shipped` annotations (date, files-changed) |
| **deploy-state** | git (branch/last_commit) + Vercel deploy status | `state` for board-less systems, `owner/branch/last_commit` |
| **liveness** (v2) | PostHog events + health pings | node `liveness` (ok/dead/atrophy) with last-activity timestamp |
| **cartographer** (v2, nightly) | new handoff entries + graph diff | node `summary` strings, orphan→domain clustering |

### `brain-graph.json` schema (v1)

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

---

## §11 — Open Questions / Risks

| # | Question / Risk | Severity | Note / Recommendation |
|---|-----------------|----------|------------------------|
| OQ-1 | How are CaneyCloud (FastAPI) domains mapped to the same domain taxonomy as the TS systems? | Medium | OpenAPI tags are the universal key (brainstorm §5). Confirm CaneyCloud tags are clean enough; else cartographer clusters. |
| OQ-2 | Contract-diff "red" rule — when is a hash change *breaking* vs benign (e.g. added optional field)? | High | v1: warn on any hash change; red only when a typed field referenced by a known consumer call-site is removed. Needs a typed-field differ, not just a file hash. |
| OQ-3 | VAV has no Overlord task board — state derives from git+handoff only. Reliable enough for `needed`? | Medium | Acceptable for v1 (FR-PIPE-9). Hygiene item: give VAV a board (v2+). |
| OQ-4 | Cross-repo read credentials — how does CI access all three repos + Supabase service-role safely? | High | Least-privilege read-only tokens per NFR-SEC-3; never embed in `brain-graph.json` (NFR-SEC-4). Decide CI secret store. |
| OQ-5 | Audience-scoped redaction — is summary-only Investor mode enough, or do partners need a separate exported artifact? | Medium | v1 enforces in-app scoping (NFR-SEC-2). A static export with stripped contracts is a candidate for v2. |
| OQ-6 | Snapshot retention for time-travel/momentum — how many `brain_snapshots` to keep? | Low | Start with per-commit on main + nightly; prune to weekly after 90 days. |
| OQ-7 | `~/.megaoverlord/projects.yaml` is missing AGB-CRM and VAV is stale — does the pipeline depend on it? | Low | Do NOT depend on it for structure (derive from code). Fix as hygiene (§9 v2+). |
| OQ-8 | elkjs layered vs d3-hierarchy radial — when does each apply, and do they share pinned positions? | Medium | Radial for hub/drill (Navigation), elkjs for Topology. Pin positions per layout per NFR-LAYOUT-1; confirm a node keeps a stable slot across both. |
| OQ-9 | Should Caney Academy warrant its own **"Education / Training" business function** (a 7th function), or fold into existing functions? | Medium | V1.1 default (FR-AXIS-3): fold Academy capabilities into Operations / Customer Experience / Sales & Revenue. A dedicated Education function becomes attractive once Academy is built and CaneyEducation's posada-host trails also map in — revisit at the v2 Academy onboarding. Adding a 7th function is a `FUNCS`/`FNMAP` change only, no schema change. |
| OQ-10 | **Module-mounted-system modeling** — is Restaurants a first-class system, a domain of CaneyCloud, or both? | High | V1.1 decision (FR-PIPE-13): first-class `system:"restaurants"` territory + a single `host_mount` interchange to `caney`; surfaces counted once. Risk: the folio coupling (POS charge → guest folio) is tighter than a normal interchange, so its "what breaks" list must include CaneyCloud folio call-sites, not just the release-mode switch. Confirm the de-dup assertion (NFR-OBS-5) holds once real Restaurants OpenAPI is wired. |
| OQ-11 | **Planned-system data source** — what is the canonical manifest for Academy's nodes before code exists? | High | V1.1 (FR-PIPE-14): use `lms-integration-plan.md` trail→course structure as the manifest. Risk: a hand-maintained manifest reintroduces the Backstage "catalog drift" anti-goal (§1). Mitigation: keep the manifest tiny (trails + planned interchanges only), auto-switch to derived nodes the moment a real Academy repo appears (NFR-FRESH-6), and visibly flag manifest-sourced nodes as `needed` so they can never masquerade as built. |
| OQ-12 | **Academy product shape is itself undecided** (`lms-integration-plan.md` §0: posada-host trail vs pro bird-guide cert vs both-tiered). Does the Brain model both? | Medium | The Brain models whatever the manifest declares. v2 default: model the pro-guide trail (AV-1..AV-4) since that drives the Academy→VAV provider-certification interchange. Posada-host trail (Phase 1 quick win) can be added as additional `needed` courses without schema change. Decision belongs to the Academy product, not the Brain. |

---

## §12 — Quality Self-Assessment

| # | Dimension | Weight | Score | Evidence |
|---|-----------|--------|-------|----------|
| 1 | Density | 10% | 9 | Capability-contract phrasing; minimal filler; tables over prose; V1.1 additions held to the same house style |
| 2 | Implementation-free (FR text) | 15% | 8 | FRs state WHAT; tech names (React Flow/elkjs, FastAPI/Vite/Postgres) confined to the §1 inventory table, NFRs, and §10 Source columns per the verified defect/external-contract carve-out — grep of FR-PIPE-13/14/15 + FR-XSYS-10/11 statements returns zero stack leakage |
| 3 | Traceability | 15% | 10 | Every FR cites a mockup/brainstorm/V1.1-scope source; §8 maps all 4 pains → FRs incl. the 5 new FRs; the host-mount/manifest contracts cite exact files (`MODULE-INTEGRATION.md`, `lms-integration-plan.md`); no orphans |
| 4 | Measurability | 15% | 9 | Every FR has an acceptance criterion; new FRs carry concrete checks (de-dup assertion, `state:"needed"` + `source:"manifest"`, release-mode→state mapping, dashed planned edges excluded from hashing) |
| 5 | SMART quality | 15% | 9 | Specific, measurable, attainable, relevant, traceable across 74 FRs |
| 6 | Completeness | 15% | 9 | All locked features covered; V1.1 covers both new territory shapes (module-mounted + planned), all 4 new interchanges, 5-system axis/function/palette, schema + extractor contracts, phasing, and 4 new risks |
| 7 | Actor coverage | 10% | 9 | Viewer / Agent / System actors; 3 personas mapped to presets (unchanged) |
| 8 | Independence | 5% | 9 | Each FR is self-contained; cross-refs only in traceability/phasing sections |

**Composite: 9.0 / 10 — EXCELLENT** (held steady through the scope expansion).
Minor deductions: a few NFRs name the locked stack (intentional); contract-diff "breaking" semantics (OQ-2) defer a rule to implementation. New V1.1 watch-items: the planned-system manifest (OQ-11) risks reintroducing catalog drift — mitigated by auto-switch to derived nodes (NFR-FRESH-6) and `needed`-flagging; the folio coupling's true "what breaks" surface (OQ-10) is tighter than a normal interchange and needs confirming once real Restaurants OpenAPI is wired.
