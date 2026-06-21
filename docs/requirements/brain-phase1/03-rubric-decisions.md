I have everything needed. Both source files are fully read, plus the V1.1 HLR that carries the canonical OQ-1..OQ-12 list (including OQ-9) and the v0 scope/NFR detail. Here is the structured extraction.

---

# The Brain — v0 Build Requirements (extracted from critique + brainstorming + HLR)

Sources read in full:
- **A)** `/Users/tomas/.gstack/projects/arevalogutierrezbajares-spec---CRM---/designs/brain-canvas-20260621/IMPECCABLE-CRITIQUE.md` (rubric + scores)
- **B)** `/Users/tomas/_bmad-output/brainstorming/brainstorming-session-2026-06-20-architecture-brain-visualizer.md` (locked decisions)
- **Companion (canonical OQ list + v0 NFR scope):** `/Users/tomas/AGB-CRM/docs/requirements/THE-BRAIN-HLR.md` (V1.1, GigaRico) — the brainstorming doc has NO explicit "OQ-9"; the numbered open questions live here.

Note on scope drift: the critique scored a **3-system** mockup (VAV/CaneyCloud/AGB-CRM). The HLR **V1.1 expanded to 5 systems** (adds Caney Restaurants + Caney Academy). The critique's "5 real interchanges" is the 3-system set; the HLR adds 4 more V1.1 interchanges. Both are named below — flag for the human which set v0 targets.

---

## (1) Rubric Dimensions + Scoring Targets

The IMPECCABLE rubric is **8 dimensions × /5 = /40** (method line: "impeccable rubric (8 dims × /5) + Nielsen 10×4 design-health + research brief cross-ref"). Baseline 23 → current **34** → ceiling **38** (40 is "intentionally refused by the rubric").

| Dimension | Max | Run-1 | Why points were lost (must clear in v0) |
|---|---|---|---|
| correctness | 5 | 3 | Surface level conflates routes + files under one shape; node positions not stable across renders (spatial memory lost on resize). Portfolio = 3 peers was correct (matches C4 System Landscape). |
| security | 5 | 3 | Mockup N/A, but flagged as a **design constraint**: rebuild-guard search + cross-repo reads must not expose private contracts to the wrong viewer preset. |
| resilience | 5 | 2 | No node-count cap; radial overlaps labels at 10–12 children; no minimap/you-are-here beyond breadcrumb; no empty/error/loading states; resize = full re-render (positions jump). |
| ux_flow | 5 | 3 | **Search was decorative** (headline rebuild-guard did nothing); transitions were spawn-fades not shared-element morphs; lenses barely changed L1/L2. |
| ui_polish | 5 | 3 | **Glow/halation** (neon box-shadows = #1 AI-slop tell + WCAG halation risk); fake momentum data; uneven density rhythm. |
| accessibility | 5 | 2 | **Status encoded by color alone**; nodes were `<div onclick>` (not focusable, no keyboard, no ARIA graph roles); 9px mono labels + sub-4.5:1 accents; no `prefers-reduced-motion`. |
| performance | 5 | 3 | `innerHTML` rebuild every render kills transitions; won't hold at React Flow scale. |
| code_quality | 5 | 3 | Single-file mockup, no DESIGN.md, duplicated detail renderers. |

**Run-2 (verified, 34/40):** fixed a11y-01 (icon+shape+text status, grayscale-safe), a11y-02 (buttons/ARIA/focus/Esc/`/`), resil-01 (needed→"Roadmap ▸ N" cluster, size ∝ children), ux-01 (real search indexing system/domain/surface), ui-01 (glow purged), ux-02 (zoom-from-node transition), resil-02 (minimap you-are-here), a11y-03 (contrast + reduced-motion), ui-02 (fake momentum removed), lens depth.

**Scoring target for v0: ≥36/40 (the ask), path to ceiling 38.** Per the critique's "Path to ceiling": *Fix all P0 + P1 → ~34–36. Add P2 (position persistence + lens depth + real minimap) → ~38.* To beat 36 you must land **all P0 + all P1 + at least P2 position-persistence and lens-depth**. The 4 remaining-to-38 items are **implementation-only and cannot be proven on a static mockup** (auto-derived data, React Flow at true scale, persisted positions across sessions, live screen-reader audit) — so a real v0 React-Flow build is exactly where they become winnable.

### Concrete UX requirements / fixes the critique calls out (the re-score checklist)

**P0 — must fix (blockers):**
- **a11y-01** Status double-encoded: shape + icon + text (✓ filled / pulsing ring "WIP" / dashed "NEEDED"), verified in grayscale (Okabe-Ito).
- **a11y-02** Keyboard + ARIA: nodes are `<button>`, focusable, Enter/Space drills, visible focus ring; canvas as `role="tree"`/group with labels.
- **resil-01** Scale strategy: cap visible nodes (~≤12/level), cluster `needed` into one "Roadmap (N)" meta-node that expands, encode magnitude (size ∝ children). (research: caps ≤30, hard at 50.)

**P1 — launch-quality:**
- **ux-01** Wire the search (rebuild-guard): type → live results across system›domain›surface → click jumps/drills. *Decorative search of the headline feature = the "dynamic is the signature, not the behavior" trap.*
- **ui-01** Kill the glow: remove neon box-shadow halos; elevation via lighter surfaces; reserve any halo for a genuine live alert only.
- **ux-02** Shared-element zoom: clicked orb scales from its own position into the centered hub (~250–300ms, `cubic-bezier(.4,0,.2,1)`), reversed on zoom-out.
- **resil-02** Persistent minimap / you-are-here rect so the portfolio frame is never lost in L2.
- **a11y-03** Min 11–12px labels; desaturate accents to clear 3:1 on local bg; `prefers-reduced-motion` disables spawn/pulse.

**P2 — polish:**
- **correctness-01** Persist node positions (seed-then-pin) — spatial memory.
- **ui-02** Drop fake 12-week momentum bars unless wired to real snapshot history.
- **ux-03** Lenses meaningful at every level: State recolors domains at L1; Liveness pulses live domains; Topology highlights domains that own an interchange.

(These map to the HLR's **NFR-A11Y-1..6, NFR-SCALE-1..4, NFR-LAYOUT-1..3, NFR-PERF-1..4, NFR-SEC-1..5, NFR-OBS-4** — the HLR explicitly tags v0 NFR scope as `SCALE-1..3, LAYOUT-1..3, A11Y-1..6, PERF-1..3, SEC-1..4, OBS-4`.)

---

## (2) Locked Decisions (do not re-litigate)

From brainstorming "Decisions Locked" + "CONVERGED CONCEPT", reinforced by HLR:

**Form & metaphor**
- **ONE elegant thing** — a single graph with toggleable lenses, NOT a dashboard of panels.
- **4 lenses over one graph** (the metaphor stack): 🗺️ **Navigation** (Google Maps — semantic zoom macro→micro, always on/the camera), 🚇 **Topology** ("Transit"/Subway — interchanges + calls, cross-territory highlighted; the *primary spine*), 🧠 **Liveness** (Neurons — active/flowing/broken now; dead=dim/atrophy), 🌳 **State** (Tech-tree — done/doing/needed + fog-of-war over needed).
- **Winning fusion = Maps × Subway as the spine.**
- **Audience = saved camera preset** (altitude + lens + filters), NOT a separate tool: Investor (L0–L1, State lens, % built, plain-English), Agent (search + Topology + State, rebuild-guard), Operator/Team (Liveness + interchange health).

**4-level drill-down (semantic zoom hierarchy)**
- **L0 Territory** — VAV · CaneyCloud · AGB-CRM · (External cluster) [HLR V1.1: +Caney Restaurants, +Caney Academy]
- **L1 Domain** — Bookings, Pricing, Channel, Auth, Capture, etc. (from OpenAPI tags / route groupings / folders)
- **L2 Surface** — API routes, pages, admin surfaces (OpenAPI paths + Next.js app tree)
- **L3 Data** — tables/entities (Supabase / Alembic / Drizzle schema)
- **External** is a sibling cluster (Stripe, Anthropic, WhatsApp, Mapbox, Inngest, SiteMinder, Resend, PostHog, Sentry).
- **Micro level = doorway to docs** — drilling a node surfaces its docs / API specs / contracts. The Brain is the front door to product docs.

**Data & derivation**
- **Derived-not-drawn**: regenerated from code, contracts, and task boards — **never hand-edited**. No per-feature `feature.json` manifests (structure derived from code).
- **Universal node source = OpenAPI** (handles Python + TS uniformly), not AST. Migrations → entity nodes; routes → surface nodes.
- **ONE typed graph**: edges `contains` / `calls` / `reads/writes` / **`interchange`** (first-class, cross-territory, carries contract ref + contract hash + health, seeded from the real edges, extensible via `interchanges.yaml`). Node attrs: `state`, `liveness`, `owner/claimed_by/branch/last_commit`, `docs_ref`, `contract_ref+version`.
- **Belt-and-suspenders overlay**: derive structure (code/OpenAPI/migrations) + overlay state (Overlord boards + HANDOFF-LOG) + liveness (PostHog/health).
- **Cadence**: cheap/structural = per-commit via CI; expensive/semantic (LLM cartographer, full re-layout) = nightly.
- **Store**: generated `brain-graph.json` artifact per build (its git history *is* the momentum animation) + snapshots table in AGB-CRM Postgres for time-travel.

**Tech / engine choices**
- **Renderer = React Flow** (`@xyflow/react` v12, `colorMode=dark`), aggressive domain clustering, default-collapsed L0/L1. Graduate to Cytoscape.js/Sigma **only if** node counts blow up (no second renderer in v1).
- **Layout engines (locked, deterministic, seed-then-pin)**: **d3-hierarchy radial** for hub/drill (Navigation) + **elkjs layered** for Topology. Positions identical across sessions/machines; a node keeps its slot across renders/resizes/reloads.
- **Home = `AGB-CRM/brain`** (new `/brain` route). Absorbs existing `/platforms` + `/roadmap` + `/overlord` surfaces. Least new infra (control-plane data already there). Strictly behind AGB-CRM auth (no public access).

**Scope (locked)**
- **3 territories + control plane**: VAV (product) · CaneyCloud (product) · AGB-CRM (client hub / control plane). [HLR V1.1 widened to 5 systems — see flag below.]
- **Each pain → its killer feature**: P1 lost-track → the derived map; P2 rebuild → rebuild-guard `/brain/search`; P3 invisible breakage → contract-diff (hash per commit, flash red); P4 can't-explain → Navigation zoom + Investor preset + route-finding.

**Phasing (v0 specifically locked):** manual extractor pass → `brain-graph.json` → `/brain` renders **L0–L1 + the 5 interchanges + State lens from board counts + detail panel + minimap + breadcrumb**, Navigation + State lenses, System axis. Kills P1 & P4 immediately.

---

## (3) The 5 Real Interchanges (named, found in code)

These are the **first-class cross-territory edges** that v0 must seed. From brainstorming "The subway interchanges are REAL":

1. **VAV ⇄ CaneyCloud** — HMAC webhook `/api/pms/webhook/caneycloud`; mirror tables `experience_caneycloud_mirror` (mig 088), `provider.source='caneyclouds'` (086); SiteMinder channel `vav_auto_provision.py` + flag `VAV_GLOBAL_ENABLED`.
2. **AGB-CRM → VAV** — direct Supabase **service-role read** (cross-DB) of providers/invites via `VAV_SUPABASE_*` (`lib/platforms/status.server.ts`).
3. **AGB-CRM → CaneyCloud** — posada-onboarding **intake API**, DARK behind `FF_ONBOARDING`, contract `lib/onboarding/intake-contract.ts`; health polling; MCP CRM tools.
4. **CaneyCloud → AGB-CRM** — MCP client (`mcp_registry.py`) for guest CRM.
5. **AGB-CRM ⇄ Overlord/sync** — `/api/overlord/sync` (control-plane sync; the existing living doc `AGB-CRM/docs/VAV-CaneyCloud-CRM-sync-status.md`). *(The interchange-detector grep list names `overlord/sync` as a 5th signature alongside the four above.)*

**HLR V1.1 adds 4 more interchanges (NOT in the critique's "5", v1/v2 scope — flag to human):**
- Restaurants → CaneyCloud (`host_mount`/folio, `X-Restaurant-Id` + release-mode) — v1
- Academy → VAV (certified guides → providers; `dark`, `contract_status: planned`) — v2
- Academy → AGB-CRM (enrollment intake → contacts; `dark`, planned) — v2
- VAV → Restaurants (once Restaurants live) — v2

---

## (4) Open Questions to Surface to the Human

The brainstorming log itself flags only loose "design forks" (where it lives; derive-vs-declare; cadence — all since resolved/locked). The **numbered OQs live in `THE-BRAIN-HLR.md §11`**. The ones called out in the task:

- **OQ-9 — Academy / CaneyLearn as a 7th business function?** *"Should Caney Academy warrant its own 'Education / Training' business function (a 7th function), or fold into existing functions?"* Severity **Medium**. V1.1 default (FR-AXIS-3): **fold** Academy capabilities into Operations / Customer Experience / Sales & Revenue. A dedicated 7th function becomes attractive once Academy is built and CaneyEducation's posada-host trails also map in — **revisit at v2 Academy onboarding**. Adding a 7th function is a `FUNCS`/`FNMAP` change only, **no schema change**. → Decision needed before By-Function axis is finalized; v0 By-Function axis is v1 scope so this does not block v0.

- **OQ-2 — Contract-diff strictness** (High): *when is a hash change breaking vs benign (e.g. added optional field)?* v1 plan: **warn on any hash change; red only when a typed field referenced by a known consumer call-site is removed** — needs a typed-field differ, not just a file hash. (Defers a rule to implementation — one of the rubric's named minor deductions.)

- **OQ-4 — Cross-repo read credentials** (High): *how does CI access all three repos + Supabase service-role safely?* Plan: **least-privilege, read-only tokens per NFR-SEC-3; never embed in `brain-graph.json` (NFR-SEC-4); decide the CI secret store.** This is the security constraint the critique flagged (security dim = 3).

Other open OQs worth surfacing (HLR §11):
- **OQ-1** (Med) — mapping CaneyCloud FastAPI domains into the same taxonomy as the TS systems (OpenAPI tags are the universal key; confirm tags are clean).
- **OQ-3** (Med) — VAV has no Overlord board; state derives from git+handoff only — reliable enough for `needed`? (Accepted for v1.)
- **OQ-5** (Med) — Investor redaction: in-app scoping enough, or do partners need a separate stripped export? (v1 = in-app scoping; static export is a v2 candidate.)
- **OQ-6** (Low) — snapshot retention for momentum/time-travel.
- **OQ-7** (Low) — `~/.megaoverlord/projects.yaml` missing AGB-CRM / stale VAV — do NOT depend on it for structure; fix as hygiene.
- **OQ-8** (Med) — elkjs layered vs d3-hierarchy radial: which applies when, and do they share pinned positions? (Radial = hub/drill/Navigation; elkjs = Topology; confirm a node keeps a stable slot across both.)
- **OQ-10** (High) — module-mounted-system modeling: is Restaurants first-class, a domain of CaneyCloud, or both? (V1.1: first-class `system:"restaurants"` + single `host_mount` to `caney`; folio coupling tighter than a normal interchange.)
- **OQ-11** (High) — planned-system canonical manifest for Academy before code exists (`lms-integration-plan.md`); risk = reintroduces Backstage "catalog drift" — mitigate by keeping manifest tiny + auto-switch to derived nodes + visibly flag as `needed`.
- **OQ-12** (Med) — Academy product shape itself undecided (posada-host trail vs pro bird-guide cert vs both); the Brain models whatever the manifest declares.

**Scope decision to escalate before building v0:** the critique/brainstorming target **3 systems + 5 interchanges**; the HLR V1.1 targets **5 systems + 9 interchanges**. The HLR explicitly scopes **v0 = the 3 live systems + 5 interchanges + State/Navigation lenses + L0–L1** (Restaurants is v1, Academy is v2). Confirm v0 holds to the 3-system / 5-interchange line so the re-score is against the same surface the critique measured.