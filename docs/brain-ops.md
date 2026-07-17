# Brain ops runbook

The Brain (`/brain`) is a **derived** portfolio map. Structure comes from
`npm run brain:build` / GitHub Actions `brain-regen`. Runtime health comes from
platform probes. **No LLM is called** in the derivation pipeline.

## How freshness works

| Path | What happens |
|------|----------------|
| **GitHub `brain-regen`** | Multi-repo checkout → `pnpm brain:build` with `BRAIN_SCIP=1` → commit `brain-graph.json` as `brain-bot` |
| **GitHub `brain-check`** | On PRs: fail if graph older than 14 days or SHAs drift (when siblings present) |
| **Vercel deploy** | Serves the **committed** JSON only. Never runs extractors (siblings not available). |
| **Local** | `pnpm brain:build` with sibling clones at `BRAIN_ROOT_*` (defaults under `/Users/tomas/...`) |

## Secrets

Prefer one org-scoped **read-only** token:

| Secret | Used by |
|--------|---------|
| `BRAIN_MULTI_REPO_TOKEN` | Clone VAV, Caney, restaurants |
| `CANEY_REPO_TOKEN` | Fallback (also SCIP weekly job) |
| `VAV_REPO_TOKEN` / `RESTAURANTS_REPO_TOKEN` | Optional per-repo overrides |

Grant access to:

- `arevalogutierrezbajares-spec/VZ_Tourism_Project`
- `arevalogutierrezbajares-spec/cloud-pms-main`
- `arevalogutierrezbajares-spec/caneycloud-restaurant`

CRM itself uses `GITHUB_TOKEN` or the multi-repo token for push as brain-bot.

## Local regenerate

```bash
# From AGB-CRM with siblings checked out:
pnpm brain:build

# With SCIP Caney edges (uses committed scip-caney-report.json):
BRAIN_SCIP=1 pnpm brain:build

# Fail if drift:
pnpm brain:check
pnpm brain:check -- --max-age 7
```

Env overrides:

```bash
export BRAIN_ROOT_VAV=/path/to/VZ_Tourism_Project
export BRAIN_ROOT_CANEY=/path/to/cloud-pms-main
export BRAIN_ROOT_CRM=/path/to/AGB-CRM
export BRAIN_ROOT_RESTAURANTS=/path/to/caneycloud-restaurant
```

## Force CI regen

Actions → **brain-regen** → Run workflow.

## “Map looks wrong”

1. Check freshness chip on `/brain` (`generatedAt` age).
2. `pnpm brain:check` locally — SHA drift?
3. Re-run `brain-regen` workflow.
4. If build fails, previous `brain-graph.json` stays (NFR-OBS-2). Fix extractors, re-run.
5. Live red stations = **health probes**, not structure. Check `/platforms` env vars.

## Agent rebuild-guard

```
GET /api/brain/search?q=booking
tool: brain_search { query: "booking" }
```

Empty matches → `{ safeToBuild: true }`. Deterministic; no model in the tool.

## Cost posture

- Pipeline: Node only, **$0 model**.
- Weekly SCIP report job may run `scip-python` (CPU, not LLM).
- Runtime: health pings only.
- Agents may use their own model when *calling* `brain_search`; the tool itself is free.
