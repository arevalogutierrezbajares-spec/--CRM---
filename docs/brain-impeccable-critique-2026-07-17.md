---
target: "The Brain" — /brain Living Structural Brain (post living-brain ship)
method: 4 parallel adversarial agents (motion · layout/type · product UX · a11y/polish) + graph-data density analysis + unit-test cross-check
prior_score: 21.5/40 (2026-06-21 build)
timestamp: 2026-07-17
focus: dynamic · easy to use · no overlap / crunched text
---

# Impeccable Critique — THE BRAIN (Living Map)

**Honest verdict: 5.2 / 10 overall** for *dynamic + seamless + readable density*.

The data and wiring leap since June is real (auto-regen, full inventory, rebuild-guard, portals, completeness, 148 unit tests). What still fails the user is **HUD chaos**, **dead motion that lies in comments**, and **chips that refuse to truncate** while the layout engine pretends they are 244px wide.

This is not a “redesign the architecture map” problem. It is a **shell + chip contract + camera choreography** problem.

---

## Executive scorecard (4 agents + synthesis)

| Dimension | Motion | Layout/Type | Product UX | A11y/Polish | **Synth** |
|-----------|-------:|------------:|-----------:|------------:|----------:|
| Dynamism / alive | 3.0 | — | — | — | **3.0** |
| No-overlap + density | — | 4.1 | — | — | **4.0** |
| Text truncation hygiene | — | 2.0 | — | — | **2.0** |
| Ease / time-to-value | — | — | 4.6 | — | **4.5** |
| Accessibility | — | — | — | 5.5 | **5.5** |
| Visual polish | — | — | — | 6.5 | **6.0** |
| Responsive | — | 5.0 | — | 3.5 | **4.0** |

**Compared to 2026-06-21 (21.5/40 ≈ 5.4/10):** correctness of edges is up sharply; **felt quality** is flat-to-slightly-better because chrome volume grew as fast as capability.

---

## What improved (credit)

- Hub-and-spoke + portal threads + overflow clusters (no more silent edge-drop at L1/L2).
- Measured `resolveOverlaps` + unit tests (architecture is right).
- Rebuild-guard *idea* and copy (“Does it already exist?” / safe-to-build).
- Completeness strip + portfolio Gaps list (trust loop started).
- Status double-encoding, skip link, SR altitude region, edge `aria-hidden`.
- Graph is fresh (260 nodes / 295 edges) and CI-regenerable.

---

## Cross-agent consensus — P0 themes

### P0-A · Chips are unbounded (`nowrap` with no max-width)

**Evidence:**  
- `brain-nodes.css` surface `.path` and domain `.t` use `white-space: nowrap` with **no** `max-width` / ellipsis.  
- Live graph: longest surface label **54 chars**; densest domain `caney.auth` **31** L3 kids.  
- `estWidth()` caps seed width at **244px** while real mono chips can paint **~420–480px**.

**Result:** Layout math and measured separation work against a **lie**. Neighbors invade. Text is not “crunched” — it is **unbounded** and then *looks* crushed when the ring packs.

**Fix recipe (ship this week):**
```css
.brain-root .surface .chip { max-width: 244px; }
.brain-root .surface .path {
  max-width: 148px; /* or 168px */
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.brain-root .nd .chip .t {
  max-width: 160px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
```
Full path stays in `aria-label` + detail panel. Align `estWidth()` to the same ceiling.

---

### P0-B · Spawn animation breaks geometry (and differs under reduced-motion)

**Evidence:** `brain-spawn` uses permanent `translate(-50%, -50%)` with `animation-fill-mode: both` on RF-positioned content. Reduced-motion sets `animation: none` → **different resting layout**. Station pins double-center.

**Fix:** Scale/opacity only; `transform-origin: center`; `fill-mode: backwards` or clear transform after end; never bake mockup centering into RF nodes.

---

### P0-C · Drill camera races itself

**Evidence:** default `fitView` + altitude `fitView(460ms)` + post-resolve `fitView(360ms)` + node `transform 0.4s`. Feels glitchy, not cinematic. Header still claims a framer-motion spring that does not exist.

**Fix:** `fitView={false}`; **one** fit after measure + resolveOverlaps; optional short setCenter toward drill target.

---

### P0-D · Rebuild-guard is a mode, not a habit

**Evidence:** Dock only when `level===0 && selection==null && axis==="system"`. Rail “Rebuild-guard…” opens a **different** UI (cmdk). Three search surfaces.

**Fix:** One search component; slim bar at every altitude; big dock only as L0 hero.

---

### P0-E · Chrome stacks fight for the same pixels

**Evidence:**  
- Trust stack z:5 vs Externals z:15 — same top-right corner.  
- Dock z:8 vs Coachmark z:22 (covers product CTA) vs Minimap z:18 (can block hit targets).  
- ≤820px: rail `display:none` kills SearchTrigger; panel still 248px.

**Fix:** Single right column stack; bottom reserved band for dock; coachmark merges into dock or defers; floating search when rail hidden.

---

## Motion agent (dynamic / elite)

| Axis | /10 |
|------|----:|
| Dynamism | 3.5 |
| Drill choreography | 2.0 |
| Edge life | 3.5 |
| Idle ambient | 2.0 |
| Reduced-motion | 4.0 |
| **Overall** | **3.0** |

**Top fixes:** (1) spawn geometry (2) single post-layout camera (3) radial spawn stagger (4) edge life hierarchy — stations ok/warn ants only; contains draw-in; data-flow slow ants (5) hub breathe via shadow stack only (6) wire `data-lens` on ReactFlow (7) selection edge emphasis.

---

## Layout agent (overlap / crunch)

| Axis | /10 |
|------|----:|
| No-overlap guarantee | 6.0 |
| Density readability | 3.5 |
| Text truncation | 2.0 |
| Responsive shell | 5.0 |
| **Overall** | **4.1** |

**Top fixes:** (1) chip max-width + ellipsis (2) measured-pass retry if dims incomplete (3) honest `estWidth` (4) arc-length placement not equal angles (5) lower L3 cap / adaptive density (6) overflow expand must re-paginate (7) kill selection `scale(1.04)` or re-resolve (8) panel as drawer under density.

**Density data (artifact):** `caney.auth` 31 · `crm.capture` 25 · `caney.accounting` 23 — overflow expand currently dumps **all** siblings unbounded.

---

## Product UX agent (easy to use)

| Axis | /10 |
|------|----:|
| Time-to-value | 5.5 |
| Discoverability | 4.5 |
| Search habit | 6.0 |
| Audience modes | 3.0 |
| Panel actionability | 5.0 |
| Chrome density | 3.5 |
| **Overall** | **4.6** |

**P0 product lies / fractures:**
1. Rebuild-guard vanishes after first real action.  
2. Three search UIs.  
3. No URL deep-links (`?node=` / `?q=`).  
4. Coachmark teaches click/pinch, not search.  
5. Operator preset → liveness (disabled / null data).

**Top 8:** unify search · URL state · coachmark rewrite · honest presets · collapse rail legends · panel action hierarchy · safe-to-build humility · search jump always fitViews.

---

## A11y / polish agent

| Axis | /10 |
|------|----:|
| A11y | 5.5 |
| Visual polish | 6.5 |
| Responsive | 3.5 |

**Critical:** chrome z-index wars · mobile rail death · fake combobox · `role="application"` trap · triple live regions · completeness neon glow (anti-slop violation) · 9px chrome type · needed/dark contrast margin.

---

## Priority roadmap (ship order)

### Wave 1 — Readable density (1–2 days) — **must ship for “no crunch”**

| # | Item | Files |
|---|------|--------|
| 1 | Chip max-width + ellipsis (surface path, domain title) | `brain-nodes.css` |
| 2 | Align `estWidth` to CSS ceilings | `selectors.ts` |
| 3 | Measured-pass rAF retry + only mark resolved on success | `brain-canvas.tsx` |
| 4 | Fix spawn: scale/opacity only; no layout translate | `brain.css`, stations |
| 5 | Single post-layout `fitView` | `brain-canvas.tsx` |

**Success:** On `caney.auth` / long OpenAPI paths, no visual neighbor invasion; reduced-motion geometry matches motion path.

### Wave 2 — Dynamic without slop (1–2 days)

| # | Item |
|---|------|
| 6 | Radial spawn stagger from focus |
| 7 | Edge life hierarchy (station/data/spoke) |
| 8 | Hub shadow breathe (gated) |
| 9 | `data-lens` on ReactFlow; selection edge highlight |
| 10 | Kill completeness bar glow; type floor 11px |

**Success:** Drill feels like one camera move; L0 wires breathe; no neon.

### Wave 3 — Seamless daily use (2–3 days)

| # | Item |
|---|------|
| 11 | One search component; always-on slim bar |
| 12 | URL deep-links for focus/selection/query/preset |
| 13 | Coachmark → search-first |
| 14 | Honest presets (disable Operator until live health mapped) |
| 15 | Chrome recompose: one right stack; coachmark vs dock |
| 16 | Panel: 1 primary CTA + overflow |
| 17 | Safe-to-build humility + nearest neighbors |
| 18 | ≤820px: panel overlay + floating search |

**Success:** Search works at L1/L2; shareable URL; first-run teaches rebuild-guard.

---

## Explicit non-goals this cycle

- LLM cartographer / generated summaries  
- Full IcePanel rewrite  
- Neon “alive” particles  
- Raising NODE_CAP without chip width discipline  

---

## Bottom line

> **THE BRAIN is a truthful instrument trapped in a noisy HUD, with chips that refuse to fit the layout contract and motion code that still documents a spring that never shipped.**

Fix **Wave 1** before any more floating glass. Until chips ellipsize and the camera settles once, “elite dynamic map” is marketing, not UX.

---

## Agent IDs (for resume)

| Lens | subagent_id |
|------|-------------|
| Motion | `019f6e5e-1751-7492-8759-207c23dbc05a` |
| Layout/type | `019f6e5e-1751-7492-8759-2084e42155ba` |
| Product UX | `019f6e5e-1752-72e0-87ed-b8ea496f579c` |
| A11y/polish | `019f6e5e-1752-72e0-87ed-b8ff2def485c` |
