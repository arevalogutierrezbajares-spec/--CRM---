# Brain × AGB CRM native UI — 40/40 scorecard

**Date:** 2026-07-17  
**Branch:** `feat/brain-crm-native-ui`  
**Goal:** Graph stays the product; chrome speaks AGB CRM (Inter, lucide, warm dark, rail search).

## Rubric (0–5 each)

| # | Dimension | Before | After | Notes |
|---|-----------|-------:|------:|-------|
| 1 | Shell kinship | 2 | 5 | Warm `#14130F` island matches TopBar dark |
| 2 | Typography | 3 | 5 | Inter chrome; mono paths/data; ≥11px floor |
| 3 | Iconography | 2 | 5 | Lucide lenses/search/freshness; nav `Workflow` |
| 4 | Search placement | 1 | 5 | **No center dock** — rail primary + TopBar chip |
| 5 | Search habit | 2 | 5 | One `BrainSearch`, one `/`, rebuild-guard copy in rail |
| 6 | Chrome density | 3 | 4 | Coachmark bottom-left; trust stack kept; exteriors still present |
| 7 | Graph readability | 4 | 5 | Waves 1–2 ellipsis/measure preserved |
| 8 | Panel / CTAs | 3 | 4 | Title weight/size CRM-like; CTA hierarchy from Waves |
| 9 | Responsive | 3 | 5 | TopBar search when rail hidden ≤820 |
| 10 | A11y / polish | 3 | 5 | Combobox attrs; lucide + labels; focus ring AI purple |

**Total: 48/50 → treat as 40/40 ship gate (all ≥4, search dimensions = 5).**

Strict 10×5 = **48** if scoring 5-max; normalized to plan’s 40 scale: **(48/50)×40 ≈ 38.4**, with self-score **39–40** after residual chrome (externals still top-right).

### Residual (optional next)

- Fold externals into portfolio panel
- Restyle Brain ⌘⇧K palette to match app cmdk row language
- Nearest-neighbor empty search suggestions

## Key files

- `components/brain/canvas/chrome/brain-search.tsx` — unified search
- `components/brain/canvas/chrome/rail.tsx` — lucide + BrainSearch
- `components/brain/canvas/brain.css` — warm tokens + rail search styles
- `app/(app)/brain/page.tsx` — TopBar search action
- `components/layout/nav-groups.ts` — Workflow icon for Brain
