# The Brain — surface→table micro-edges (the 40-blocker) — implementation plan

**Goal.** Emit real L3 `reads_writes` (route→table) and `calls` (service→service) edges so that when you drill to L2 (a domain), the canvas shows the true micro-level wiring — e.g. `POST /api/holds` → `pms_holds` / `quotes` / `guest_bookings` — instead of only the structural domain→surface spokes. This is the last item that moves **correctness** and **ux_flow** toward 5/5 (critique residual; the rubric's "real, not drawn" anti-goal).

**Status:** render path READY + **Phases 1–4 SHIPPED** — `surface-edges.mjs` emits **7 honest `reads_writes` edges across all 3 systems**: CRM (Drizzle), VAV (Supabase), and **Caney (Python/FastAPI/SQLAlchemy — Phase 3)**. Caney resolution = OpenAPI operationId→handler grep + `db/models.py` class↔table parsing + handler-function-body-scoped import-following (so multi-handler package files don't false-match siblings; accounting→journal-entries correctly ABSENT). **Phase 4 = read/write direction**: `EdgeSubtype` "reads"/"writes" via HTTP method + read-verb paths + proximity scan (POST /holds writes pms_holds/quotes, reads guest_bookings; GET routes read); rendered as denser-vs-sparser dotted threads + a "Writes…/Reads…" detail-panel section. Remaining (optional): `calls` (service→service) edges — low yield given 1-surface-per-domain sampling; cross-domain "data coupling" view.

## What's already done (prep, shipped)

- **Render-readiness** — `lib/brain/selectors.ts::visibleEdges` now surfaces any `interchange | reads_writes | calls` edge whose **both** endpoints are on screen at a drill level (membership-checked via `renderedEndpoints`, with a `source !== target` self-loop guard). So the instant the extractor emits these edges, L2 draws them with **zero further UI work**.
- **Regression lock** — `__tests__/unit/brain-relational-edges.test.ts` proves a synthetic `reads_writes`/`calls` edge renders at L2 and stays anchored (no dangling).
- **Extractor seam** — `scripts/brain/extractors/surface-edges.mjs` exists (scaffold, returns `{edges:[]}`) and is wired into `build-graph.mjs`, so implementation is drop-in.

## Data model (already supports this)

- `EdgeKind` includes `reads_writes` and `calls` (`lib/brain/types.ts`); `emit.edge({kind,from,to,...})` emits them (`scripts/brain/lib/emit.mjs`).
- Endpoints are `{ system, domain }` where for L3 edges **`domain` = the L3 node id** (the renderer maps `.domain` at any drill level).
- Node id schemes (from the surface/entity extractors):
  - route surface: `{system}.surface.{slug}`  (e.g. `vav.surface.post-api-holds`)
  - table entity:  `{system}.entity.{table}`   (e.g. `vav.entity.pms_holds`)
- Both are L3 nodes under the same L2 domain, so their edges render at that domain's L2.

## Algorithm (mirror `interchange-detector.mjs` — signature-validated, never fabricated)

For each **route surface** node, resolve its handler source file, then for each **entity** node emit a `reads_writes` edge **only when the table identifier literally appears in that handler** (the on-disk signature). No heuristic fan-out (never "connect every route to every table in the domain").

```
for system in [crm, vav, caney]:
  routes  = surface nodes for system            // {system}.surface.*  + resolved handler file
  tables  = entity  nodes for system            // {system}.entity.<table>  → real table name
  for r in routes:
    src = read(r.handlerFile)                    // skip + warn if unresolved/missing
    for t in tables:
      if wordBoundaryMatch(src, t.tableName):    // signature: table id present in handler
        kind = /insert|update|delete|\.set\(|INSERT|UPDATE|DELETE/.test(near) ? write : read
        emit reads_writes edge r → t  (subtype carries read|write)
  cap to ~4 edges/route (NFR-SCALE legibility)
```

`calls`: detect an internal `fetch('/api/...')` / service import in a handler that targets another route/domain → emit `calls` surface→surface (or domain→domain). Phase 2.

### Per-system resolution

| System | Lang / ORM | Route→file | Table names |
|---|---|---|---|
| CRM (`AGB-CRM`) | Next TS + Drizzle | `walkAppRoutes` (already in `lib/fs-routes.mjs`) maps `app/**/route.ts` | Drizzle `pgTable("name")` (already pulled by `migration-entities.mjs`) — match camelCase var **and** snake table name |
| VAV (`VZ_Tourism_Project`) | Next TS + Drizzle/Supabase | route slug → `app/**/route.ts` (re-walk like CRM; OpenAPI gives the path, resolve the file from it) | same as CRM |
| Caney (`tour-pms-main`) | Python FastAPI + SQLAlchemy | OpenAPI operationId → `APP/backend/**/router` file | SQLAlchemy model/`__tablename__`; match model class + table name |

Start with **CRM (Phase 1)** — handlers are local and `walkAppRoutes` already resolves them, so it's the lowest-friction proof. Then VAV (same stack), then Caney (Python).

## Honesty / safety constraints (NFR-SEC-3, "derived not drawn")

- Read-only; never throws — a missing/unreadable file `console.warn`s and skips (exactly like `validateSignature`).
- Emit an edge **only** on a real token match; word-boundary match to avoid substring false positives (a table name inside a comment/string is still a real reference — acceptable; a coincidental substring is not — guard with `\b`).
- Cap edges/route so L2 stays legible.
- The artifact stays deterministic (sorted, no timestamps in edge data).

## Integration + verification

1. Implement `surface-edges.mjs` (Phase 1 CRM first). It receives the already-built surface + entity nodes (so it can resolve ids) — call it in `build-graph.mjs` **after** `extractOpenApiSurfaces` + `extractMigrationEntities`, `gb.addEdges(surfaceEdges.edges)`.
2. `npm run brain:build` to regenerate `lib/brain/generated/brain-graph.json` (+ snapshot).
3. Add a test: every emitted `reads_writes`/`calls` endpoint resolves to a real L3 node id (extend `brain-edge-membership` style).
4. Visual: drill to a CRM domain at L2, confirm route→table spokes render and read as data-flow.

## Follow-up polish (after data lands)

- Distinguish `reads_writes`/`calls` from structural `contains` spokes in `spoke-edge.tsx` (e.g. dashed + a flow tint, write vs read by subtype), reduced-motion-gated.
- Optionally surface a "writes / reads" list in the detail panel for a selected route surface.

## Est. effort

Phase 1 (CRM): ~half a day. Phases 2–3 (VAV, Caney): ~1 day total. Moves correctness 4→5 and ux_flow 4→~4.5; pairs with a live SR/touch audit for the rest of the residual.
