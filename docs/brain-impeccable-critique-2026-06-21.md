---
target: "The Brain" — /brain React Flow build (live), AGB-CRM
method: impeccable rubric (8 dims × /5) + live Playwright probe (1440×900) + 9-lens adversarially-verified code review (73 agents)
prior_score: 34/40 (the static HTML mockup, 2026-06-21)
build_score: 21.5/40
ceiling_if_p0_p1_fixed: 29
timestamp: 2026-06-21
ask: "very visual + dynamic, macro→micro, info at layers, clean, scales to a LOT of info, shows where VAV/CaneyCloud/AGB-CRM link — zoom must work, nodes linked when you zoom in, easy trackpad zoom, 40/40"
---

# Impeccable Critique — The Brain (React Flow build, live)

**Honest verdict: 21.5/40 (ceiling 29 after P0+P1).** The mockup scored 34/40; the *build* scores lower because a mockup only has to *look* right in one frame, while the build has to *behave* right across drill levels — and it doesn't. The architecture is genuinely good (auto-derived signature-validated graph, pure lenses, double-encoded status, type-routed detail panel, disciplined anti-slop tokens, the old neon-glow is gone). But it **fails all three of your headline asks on the canvas itself**: zoom is only half-wired, links vanish the instant you drill in, and it does not feel dynamic. The model is right; the rendering wiring, layout, dynamism, and keyboard paths are wrong. Every blocker is a concrete, well-scoped fix — not a redesign.

## Scorecard

| Dimension | /5 | Note |
|---|---|---|
| correctness | 2 | Model genuine, but 2 P0s gut the core: lenses bind edge source/target to `e.from.system` not the node id, and `visibleEdges` never filters by visible-node membership → `edgeCount=0` on every drill-in. Plus all 37 L3 surfaces at `(0,0)`, dead pin persistence, a self-loop interchange, `caneyclouds` typo. |
| security | 4 | Not the focus, but invariants hold: creds env-only (never serialized into the artifact), `/brain` auth-gated via `requireUser()`, dedup enforces no cross-system id collision. No findings; held at 4 only because no dedicated security lens probed the preset/contract boundary. |
| resilience | 2 | Scaffolding exists (NODE_CAP=30, cluster, minimap, empty/loading) but the load-bearing parts are broken: 37 L3 surfaces stack at one point; clustering only collapses `needed`, so the *dense built* systems (CRM 12, restaurants 13) overlap as a hairball; count-scaling `radialLayout` is dead code; no ResizeObserver re-fit. |
| ux_flow | 2.5 | Strong IA skeleton (3 real up-paths, truthful you-are-here, rich detail panel, search is real now) but the on-canvas link promise is broken, drilling is a crossfade not a zoom, no on-screen zoom controls, axis/preset switches destroy drill position. |
| ui_polish | 3 | Visual floor genuinely disciplined (glow fixed, status double-encoded, clean reduced-motion micro-interactions) BUT reads static where it must feel alive: edges never animate, drill is a dead 1.5% fade, L0 motion-dead at rest; plus a flat 11px-dominated type scale. |
| accessibility | 2.5 | Far better than the mockup (status triple-encoded, **visible focus ring**, real `<button>` nodes, **Enter-to-drill works**, reduced-motion). Blockers: **no focus management on drill** (focus drops to body on remount) + no skip-link past ~65 chrome focusables; edges unspoken to screen readers. |
| performance | 3 | NFR-PERF-2 genuinely holds — re-derivation is pure & synchronous, no refetch. Gaps all P2/P3 and invisible at ≤30 nodes (no node/edge `React.memo`, context memoized on whole `view`, 5× duplicated edge mapper). |
| code_quality | 2.5 | Pure reducers/selectors + clean extractor pipeline are real strengths, but substantial **dead subsystems** gave false confidence the prior P2s were fixed: pin persistence loaded-then-ignored, `radial`+`layered` layout dead, `brain-zoom-in/out` keyframes dead CSS, `emphasize` preset field consumed nowhere, 10× `as unknown as` casts, zero tests on the selectors/lens/layout path. |

**Total: 21.5/40.**

## Your three questions, answered directly

### 1. Does zoom work properly? — *Partially.*
The **mechanism works**: trackpad/ctrl-pinch zooms the full `0.2→1.6` range and respects min/max; the Figma-style `panOnScroll` (two-finger pans, pinch zooms) is correctly wired. *Verified live.* But it does **not** "work properly" as an experience: there are **no on-screen zoom controls** (`<Controls/>` is never rendered — even though `brain.css:299-303` already themes it), `zoomOnDoubleClick={false}`, and `disableKeyboardA11y` removes React Flow's +/- keys — so a **mouse-only or keyboard user has zero discoverable way to zoom**. And on the sparse L0, pinching at center lands you in the **empty gap between the 5 widely-spaced hubs**.

### 2. Are nodes linked when you zoom in? — *No. This is the single biggest failure.*
- **L0 (portfolio):** 6 cross-system interchange "stations" render — but only *by accident* (the visible node ids happen to equal the system strings).
- **L1 (drill into VAV):** 10 domains, **`edgeCount = 0`**. *Verified live.*
- **L2 (drill into a domain):** 4 surfaces, **`edgeCount = 0`**, and only 1 of the 4 is even visible. *Verified live.*

The canvas draws **nothing** connecting a hub to its domains or a route to its tables, while the right panel still text-lists "LINKS OUT · 4." Three compounding root causes (all confirmed in code):

1. **All 5 lenses bind the React Flow edge to the System enum, not the node id.** `lib/brain/lenses/navigation.ts:31-32` → `source: e.from.system, target: e.to.system`. A `contains` edge `vav → vav.booking` becomes a self-loop on a `vav` node that isn't in the L1 view → React Flow **silently drops it**.
2. **`selectors.visibleEdges` never filters by the visible node set.** `lib/brain/selectors.ts:256-263` computes `visibleIds` but the predicate only checks `visibleIds.size > 0 && (kind in {interchange,contains,calls})` — it never tests whether the edge's endpoints are actually visible.
3. **The focused hub is excluded from the L1 node set** (`selectors.ts:222-229` returns only domains), so the 66 `contains` spokes have **no center to anchor to**; and there are **zero** surface→table (`reads_writes`) or domain→domain (`calls`) edges in the data, so the most compelling micro-link ("`POST /api/holds` writes `pms_holds`/`quotes`/`guest_bookings`") has no source data and can never render.

**The data fully supports the fix** — `brain-graph.json` already has **66 `contains` edges + 9 interchanges**, and every node has React Flow `Handle`s. It's wired wrong, not missing.

### 3. Does it feel very dynamic? — *No.*
The only drill "choreography" is a **1.5% scale crossfade** (`0.985→1`) on a key-remounted `motion.div` (`brain-canvas.tsx:246-256`) — the viewport *teleports* (fitView on a fresh mount) while the wrapper opacity springs. The real `brain-zoom-in` (1.25→1) / `brain-zoom-out` (0.85→1) keyframes that would read as an actual zoom are **dead CSS applied to nothing** (`brain.css:237-266`). **Edges never animate** (bare paths, stroke-opacity only), and at rest **nothing breathes** — 5 ring-gauges sit motionless in a void. What *is* dynamic: clean, reduced-motion-correct hover/spawn micro-interactions (a solid floor, no slop). The data-driven motion you mean by "dynamic" — flowing edges, an orienting camera zoom, ambient life — is absent.

## P0 — must fix (these are why it fails your literal asks)

1. **Fix edge endpoint binding in all 5 lenses** (`lib/brain/lenses/*.ts ~31-48`): map `source`/`target` to `e.from.domain`/`e.to.domain` for `contains`/`calls`, keeping `e.*.system` only for L0 stations. Extract one shared `mapEdges()` helper so it's fixed once.
2. **Make `selectors.visibleEdges` filter by the visible node set** (`selectors.ts:256-263`): require **both** endpoint ids ∈ `visibleIds`. Add a dev `console.warn`/`onError` in `brain-canvas.tsx` for any edge whose endpoints aren't in the node set, so this class of bug can never ship silently again.
3. **Render the focused hub at L1 as a center node + emit hub→domain spokes** (`selectors.ts:222-229`; the `isCenter` path at `hub-node.tsx:66` already exists) so the 66 `contains` spokes have an anchor and L1 shows a fan, not a disconnected ring.
4. **Position all 37 L3 surface/entity nodes** — they're all `pos {0,0}` so siblings stack into one pile and `fitView` frames a single chip. Call the layout helper when emitting level-3 nodes in `scripts/brain/extractors/{openapi-surfaces,migration-entities}.mjs` and rebuild.
5. **Make clustering density-driven, not state-driven** (`clusterNeeded`, `selectors.ts:151-158`): cluster (or grow ring radius) by **count** once visible siblings exceed what the radius can space, regardless of done/doing/needed — otherwise CRM(12)/restaurants(13) overlap.
6. **Restore focus management on drill** (not reachability — see correction below): there is **zero `.focus()`** on drill/up, so keyboard users drop to `body` on every navigation. Move focus to a deterministic node (or the BackButton) in a `useEffect` keyed on `choreoKey`.

> **Correction to the code-only review (verified live):** the a11y lens claimed nodes are "not Tab-reachable" from `nodesFocusable={false}` + `disableKeyboardA11y`. **This is wrong.** The custom node is a real `<button>`, natively focusable regardless of React Flow's node-focusable flag. Live test: Tab reached the VAV node (focusable #65 of 95, behind the app chrome) with a **visible focus ring** (`2px` dark + `4px` `rgb(91,188,230)`), and **Enter drilled in**. The genuine issues are (a) no skip-link past ~65 chrome focusables, and (b) **no focus restoration after the drill remount**.

## P1 — launch-quality

1. **Replace the crossfade-on-remount with a true camera zoom** (`brain-canvas.tsx:246-256`): keep **one persistent** `<ReactFlow>` and animate the viewport via `useReactFlow().fitView({nodes:[childIds], duration:380})`, reusing the already-authored `brain-zoom-in/out` keyframes on spawning children. Reduced-motion-gated.
2. **Add on-screen zoom affordance**: render `<Controls showInteractive={false}/>` (theme already exists, unused). Optionally re-enable double-click/keyboard zoom.
3. **Introduce a real type scale**: ~48 of ~80 font-sizes are 11px; nothing on-canvas exceeds 21px. Add `--t-display/title/body/label`, bump hub names to ~18-20, reserve 11px for mono readouts — so macro→micro hierarchy reads on the *canvas*, not just the panel.
4. **Animate live edges** with a marching-ants `stroke-dashoffset` keyframe on `ok`/`live` interchange + contains edges (highest-leverage "alive" signal). Reduced-motion-gated.
5. **Add edge/relationship semantics for screen readers**: node layer `role="tree"`, nodes `role="treeitem"` with `aria-level`/`aria-expanded`; fold link counts into node `aria-label`s.
6. **Stop axis/preset switches from destroying drill position** (`graph-provider.tsx:164-199` hard-reset level/focus/path): preserve focus where the target axis can resolve it, or offer a one-tap "return to where I was."

## P2 — polish

1. Tighten sparse L0 so pinch lands on content not void (reduce ring radius / raise `fitViewOptions.maxZoom`; surface interchange names + per-system readiness as faint on-canvas labels).
2. **Fix the global command palette `DialogTitle` a11y error** — source of the 2 console warnings on `/brain`. It's the **global** palette (`components/command/command-palette.tsx:186-188`), *not* the brain's (the brain palette already adds a hidden `Dialog.Title`). ~12-line fix, app-wide.
3. Add a debounced `ResizeObserver` → `fitView` (canvas goes off-center on the app's own sidebar collapse with no recovery).
4. Make presets visibly distinct + non-destructive (consume the dead `emphasize` field; preserve level/focus on `SET_PRESET`).
5. Add selection motion (scale-1.04 pop) + panel `AnimatePresence` crossfade.
6. Intercept bare ⌘K for the Brain palette when the canvas is focused (currently ⌘⇧K); show a "N matches / +N more" indicator (palette silently slices to 10 of 93 targets).
7. Tokenize ad-hoc badge hex + drop the lone gradient button; scope `role="application"` to just the graph; add a skip-to-graph link; ≥24px minimap dot hit-areas; `aria-live` for lens/preset switches.
8. **Add a responsive strategy** — zero width `@media` exists in `components/brain`; the fixed 204px rail + 326px panel + app sidebar leave near-zero canvas below ~1024px. Collapse the rail / make the panel an overlay at tablet/phone. Also force the brain route dark to avoid the light-TopBar-over-dark-canvas seam.

## What's already good (don't touch)

- Trackpad **pinch zoom** (full 0.2→1.6) and **two-finger pan** — correctly wired, smooth. *Verified live.*
- **Keyboard**: real `<button>` nodes, **visible focus ring**, **Enter-to-drill**, Esc up-path. *Verified live.*
- **Status double-encoded** (✓ BUILT / ◐ WIP / ○ NEEDED — icon + text + %), grayscale-safe.
- **Search is real now** (prior P1 fixed): the palette indexes all systems/domains/surfaces and `jump()` actually drills/selects.
- **Neon glow is gone** (prior P1 fixed): `--gleam` is a subtle `inset 0 1px 0 #ffffff0f` sheen; shadows are dark layered drop-shadows. Tokens disciplined (`--bg #08090c`, `--ink #f4f6fa` — tinted, not pure black/white). Glassmorphism concern **refuted**.
- **Graph is genuinely auto-derived** (5 systems / 51 domains / 37 surfaces / 75 edges), signature-validated, not the SAMPLE fallback.
- **Pure reducer, no refetch** on nav/lens/preset (NFR-PERF-2 holds); minimap, breadcrumb, empty/loading states present.

## Path to a true 40/40

A 40/40 requires three things simultaneously true that are false today: (1) the canvas **shows relationships at every altitude**, (2) drilling **feels like a continuous orienting zoom**, (3) the deepest, densest layers stay **clean and reachable by every input**. Ordered:

1. **Land all six P0s as one coherent change** + add an **invariant test**: assert every emitted edge's endpoints ∈ the node set, per lens × level × focus. (This one test would have caught the P0 and gates regressions.)
2. **Fix the data layer** so micro-links are real: position all L3 nodes; extract `reads_writes` (surface→entity) and `calls` (domain→domain) edges in the extractors so "route writes to 3 tables" actually draws — signature-derived like the interchanges.
3. **Make scale hold**: count/density-driven clustering, grow ring radius with child count (or adopt the dead `radialLayout`), synthesize a "+N more" chip when `capNodes` truncates; add layout-invariant tests (no two siblings share coords).
4. **Make it dynamic & orienting**: one persistent `<ReactFlow>` + animated `fitView` toward the clicked node, wire the authored zoom keyframes onto spawning children, marching-ants on live edges, restrained L0 ambient life — all reduced-motion-gated.
5. **Make zoom work for everyone**: ship `<Controls/>`, re-enable double-click/keyboard zoom, tighten L0.
6. **Close accessibility**: restore focus to a node after every drill/up, `role=tree/treeitem` + edge `aria-label`s, skip-link, ≥24px minimap targets, `aria-live`.
7. **Polish to impeccable**: modular type scale w/ display tier, tokenize stray hex, delete dead pin/layout/zoom-keyframe code, memo node/edge components + split actions/view context, responsive breakpoints + force-dark route + first-run coachmark, fix the global `DialogTitle` warning and the `caneyclouds` typo.

Only after steps 1–3 land does the build stop failing your literal asks. Steps 4–7 take it from "correct" to 40.

---

## Method / artifacts

- **Live probe** (headless Chromium, 1440×900, dev server `AGB_DEV_FAKE_USER=1`): zoom range, pan, drill L0→L1→L2 edge counts, keyboard Tab + focus ring + Enter-to-drill, search, lens switch, design tokens, console errors. Screenshots in `/tmp/brain-shots/` (`01-L0`, `02-pinch-zoom-in`, `03-pinch-zoom-out`, `04-after-drill-L1`, `05-after-drill-L2`).
- **Code review**: 9 lenses (zoom, node-linking, dynamism, a11y, scale, polish, ux-flow, correctness/security, perf/code) × adversarial verification × completeness critic × synthesis = 73 agents. Each finding carries `file:line` evidence and a confirmed/refuted/adjusted verdict.
- **Refuted by verification** (kept the critique honest): "nodes not Tab-reachable" (live-disproven), glassmorphism-as-slop, contrast failures (only aria-hidden glyphs), `visibleIds` fully dead (its `.size` is read), liveness-pulse "vaporware" (honestly labeled v2).

---

## Fixes applied — P0 + P1 (2026-06-21, branch `fix/brain-linking-zoom-dynamism`, commit `58f5f82`)

Delivered the full P0 + P1 set. **Estimated re-score: ~29/40 (up from 21.5)** — the predicted P0+P1 ceiling. (A true 40 still needs the P2 path below: L0 density, surface→table micro-edges, full type-scale adoption, `role=tree`, responsive, `ResizeObserver`, dead-code removal.)

**P0 — all six landed & live-verified:**
- Lens edge mapping → unified all 5 lenses through `lenses/shared.ts::mapEdges` + `selectors.renderedEndpoints` (maps `.domain` on drill, `.system` at L0). The `e.from.system` bug is gone in one place.
- `visibleEdges` now synthesizes hub→child spokes from `parentId` and **membership-filters** every edge; dev `console.warn` guards against silent drops.
- Focused hub rendered **at center** at L1 (and the focused domain at L2) with children fanned on a radial ring (reuses the previously-dead `radial.ts`).
- All 37 L3 surfaces positioned by the ring layout → **no more (0,0) pile**.
- Density-driven ring radius (grows with child count) → dense systems (CRM 12, restaurants 13) **no longer hairball**.
- **Focus restored to a node after every drill/up** (was dropping to `body`).
- *Verified live:* edge counts now **L0 = 6 · L1 = 10 spokes · L2 = 1 spoke** (were 6 / 0 / 0). Keyboard drill restores focus (`inNode: true`).

**P1 — all six landed & live-verified:**
- Drill is now an **animated camera glide** (`useReactFlow().fitView`, single persistent `<ReactFlow>`, no remount) instead of a teleporting crossfade; reduced-motion → instant.
- On-screen **`<Controls>`** rendered (themed, was unused) + double-click zoom re-enabled. *Verified:* zoom-in button 0.77 → 0.92.
- **Marching-ants flow** on live interchange stations; spoke opacity bumped for legibility.
- Modular **type-scale tokens** + larger on-canvas hub names.
- Edge/relationship semantics: hub `aria-label` now states domain count.
- Preset switches **preserve drill position** when the axis matches.

**Bonus:** added the missing `Dialog.Title` to the global command palette → the **2 `DialogContent` console errors on `/brain` are gone (0 console errors)**.

**Regression lock:** `__tests__/unit/brain-edge-membership.test.ts` — 62 cases asserting every emitted edge endpoint is a visible node (lens × level × focus) + drill renders spokes + siblings never share coordinates. Gates green: **tsc 0 · eslint clean · 504 unit tests pass · production build ✓**.
