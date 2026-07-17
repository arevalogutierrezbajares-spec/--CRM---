# THE BRAIN — Agent Consumption Roadmap (P0 → P3)

**Status:** Shipped (P0–P3)  
**Date:** 2026-07-17  
**Depends on:** Phase 1 docs corpus (shipped) — doc/adr nodes, `documents` edges, `searchBrain`, `docs/llms.txt`, `AGENTS.md`  
**Goal:** Agents can diagnose, root-cause, and remediate portfolio issues using the Living Brain as the primary architecture substrate—not freeform repo grepping.

---

## 0. Product outcome

An agent given only a symptom (WA message, Sentry link, ticket text) can:

1. **Locate** candidates in the multi-repo map (code + docs + wires).  
2. **Expand** blast radius (neighborhood + interchanges + linked docs).  
3. **Ground** claims in runbooks/ADRs (fetch doc body, not invent).  
4. **Correlate** freshness / change (graph SHAs; later deploys/Sentry).  
5. **Propose** ranked causes with **node ids + doc paths**.  
6. **Remediate** via PR + tests under gates (no silent prod mutation).  
7. **Write back** failure-mode / decision notes without inventing graph structure.

**Non-goals (all phases):** LLM regenerates `brain-graph.json`; auto-merge to main; unscoped prod writes; vector DB as the only architecture source.

---

## 1. Requirements principles (quality bar)

Every FR below must be:

| Attribute | Rule |
|-----------|------|
| **Measurable** | Observable via unit test or tool JSON contract |
| **Traceable** | ID `FR-BRAIN-AGENT-###` |
| **Agent-usable** | Tool descriptions tell *when* to call, not just *what* |
| **Safe** | Read tools free; write tools gated; graph stays deterministic |
| **Composable** | Tools chain: search → neighborhood → doc_get → (optional) rca_pack |

**Orchestration law:** Protocol (`AGENTS.md`) routes; skills load playbooks; MCP tools fetch structure; extractors own truth.

---

## 2. Architecture (consumption plane)

```
┌─────────────────────────────────────────────────────────────┐
│ Protocol: AGENTS.md + CLAUDE.md (short routing)             │
│ Skills: investigate.md / remediate.md (task-class only)     │
└────────────────────────────┬────────────────────────────────┘
                             │
┌────────────────────────────▼────────────────────────────────┐
│ Tool registry: lib/wa-agent/tools/*                         │
│ MCP allowlist: lib/mcp/tools.ts                             │
│ Optional HTTP: app/api/brain/* (same pure functions)        │
└────────────────────────────┬────────────────────────────────┘
                             │
┌────────────────────────────▼────────────────────────────────┐
│ Pure core: lib/brain/*                                      │
│ search · neighborhood · docs-get · freshness · rca-pack     │
│ Graph artifact: lib/brain/generated/brain-graph.json        │
│ Docs FS: docs/** (read-only for agents via tool)            │
└─────────────────────────────────────────────────────────────┘
```

**Invariant:** Tool executors call pure `lib/brain/*` functions. Unit tests drive those functions on the real committed graph—no mocks of search logic.

---

## 3. Phase P0 — Agent tool plane (must ship first)

**Duration:** ~1–2 days · **Cost:** $0 LLM in graph path  
**Objective:** Close “search only” gap so agents can expand + read docs.

### 3.1 Functional requirements

| ID | Requirement | Acceptance |
|----|-------------|------------|
| **FR-BA-001** | `brain_search` description documents hit kinds including `doc`/`adr`, humble empty-state (verify before build), and points agents to neighborhood after a hit. | Tool def string asserts kinds; unit/snapshot of description optional |
| **FR-BA-002** | Pure `neighborhood(graph, id, depth)` returns node (or edge), adjacent nodes, edges, linked docs via `documents`, interchange health when present. Depth default 1, max 2. Unknown id → structured error, not throw. | Unit tests on real graph ids (`crm`, known interchange, `crm.doc.brain-ops`) |
| **FR-BA-003** | Tool `brain_neighborhood` wraps FR-BA-002; registered in TOOLS + MCP allowlist. | MCP_TOOL_NAMES includes name; execute returns ok/data |
| **FR-BA-004** | Pure `getBrainDoc(graph, { id \| path })` loads markdown from CRM repo under `docs/` only (path traversal blocked), size-capped (e.g. 200KB), returns body + frontmatter fields + node metadata if any. | Unit tests: happy path, reject `../`, reject outside docs |
| **FR-BA-005** | Tool `brain_doc_get` wraps FR-BA-004; MCP allowlist. | Same as FR-BA-003 |
| **FR-BA-006** | Pure `brainFreshness(graph)` returns `generatedAt`, per-system commit SHAs, optional stale flags (age > N days). | Unit test on artifact |
| **FR-BA-007** | Tool `brain_freshness` (or include freshness blob in every neighborhood/rca response). Prefer dedicated tool for clarity. | MCP allowlist |
| **FR-BA-008** | AGENTS.md “Investigation mode” mandates: search → neighborhood → doc_get → cite ids; stop rules (3 failed remediations → escalate). | File present; checklist items explicit |
| **FR-BA-009** | `docs/llms.txt` links to investigation protocol + tool names. | Index updated |
| **FR-BA-010** | `brain_search` empty-state message aligns with humble copy (no unqualified “safe to build”). | Tool execute payload |

### 3.2 Non-functional

| ID | Requirement |
|----|-------------|
| **NFR-BA-001** | Neighborhood/doc_get pure + sync; no network in tool body except existing graph load. |
| **NFR-BA-002** | doc_get only reads under `docs/` of CRM root (REPO_ROOT / process.cwd resolved safely). |
| **NFR-BA-003** | Tool latency: neighborhood O(E) filtered; doc_get single file read. |
| **NFR-BA-004** | Existing brain unit suite remains green; new tests under `__tests__/unit/brain-*`. |

### 3.3 Deliverables (files)

| File | Action |
|------|--------|
| `lib/brain/neighborhood.ts` | **New** pure expand |
| `lib/brain/doc-get.ts` | **New** pure FS read + validate |
| `lib/brain/freshness.ts` | **New** pure metadata |
| `lib/wa-agent/tools/brain-neighborhood.ts` | **New** |
| `lib/wa-agent/tools/brain-doc-get.ts` | **New** |
| `lib/wa-agent/tools/brain-freshness.ts` | **New** (or fold into neighborhood) |
| `lib/wa-agent/tools/brain-search.ts` | **Edit** description + empty message |
| `lib/wa-agent/tools/index.ts` | Register tools |
| `lib/mcp/tools.ts` | Allowlist new names |
| `AGENTS.md`, `CLAUDE.md`, `docs/llms.txt` | Investigation protocol |
| `__tests__/unit/brain-neighborhood.test.ts` | **New** |
| `__tests__/unit/brain-doc-get.test.ts` | **New** |

### 3.4 P0 verification

1. `pnpm exec vitest run __tests__/unit/brain-` exit 0  
2. Execute pure functions: search “Brain ops” → neighborhood on hit → doc_get path → non-empty body  
3. MCP definitions list includes new tools  
4. Manual: Claude Code / MCP client can call tools (if env available)—else structural MCP_TOOL_NAMES assert

### 3.5 P0 done when

Agent with only MCP tools (no UI) can produce a grounded mini-RCA pack JSON for a known query without inventing node ids.

---

## 4. Phase P1 — RCA quality pack

**Duration:** ~1 week  
**Objective:** Symptom → structured investigation pack.

### 4.1 Requirements

| ID | Requirement |
|----|-------------|
| **FR-BA-101** | Failure-mode docs under `docs/RCA/failure-modes/*.md` with frontmatter: `type: failure-mode`, `brain_node`, `symptoms` (list or string), `summary`. |
| **FR-BA-102** | Corpus extractor already treats `failure-mode`; ensure joins + search haystack includes symptoms text (extend parse if needed). |
| **FR-BA-103** | Pure `buildRcaPack(graph, query)`: search → top N hits → for best architecture hit, neighborhood + linked docs summaries + freshness + matching failure-modes (keyword/node join). |
| **FR-BA-104** | Tool `brain_rca_pack` + MCP allowlist. |
| **FR-BA-105** | Seed ≥5 real portfolio FMs (email sync, partner room, posada/onboarding, brain load, booking/holds if known). |
| **FR-BA-106** | Skill file `docs/skills/investigate.md` or `.agents/skills/...` with the 8-step loop; AGENTS.md routes “bug/outage/500/RCA” → skill. |
| **FR-BA-107** | Optional HTTP `GET/POST /api/brain/rca` wrapping pure pack (auth same as other internal APIs)—only if WA/MCP insufficient. |

### 4.2 P1 verification

- Unit: pack for “brain ops” / “email” returns docs + topology keys  
- ≥5 FM files with valid frontmatter; regen graph shows them as docs  
- Agent simulation (script): pack JSON schema stable

### 4.3 P1 done when

Given a canned symptom string, `brain_rca_pack` returns ordered hypotheses with evidence paths without LLM.

---

## 5. Phase P2 — Remediation orchestration

**Duration:** ~1 week  
**Objective:** Safe fix path tied to Brain citations.

### 5.1 Requirements

| ID | Requirement |
|----|-------------|
| **FR-BA-201** | Skill `remediate.md`: after RCA pack, agent must (a) cite brain node ids, (b) run tests, (c) open PR description template with node ids + doc paths. |
| **FR-BA-202** | Tool or checklist `brain_remediation_gate` (read-only): input proposed files/summary → returns whether search was run, whether tests mentioned, missing citations warning. Soft gate (warn), not hard block unless configured. |
| **FR-BA-203** | PR template snippet in AGENTS.md: `Brain: <node ids>`, `Docs: <paths>`, `Hypothesis: …`. |
| **FR-BA-204** | No new prod-write tools. Migrations stay on `db-migrate.sh` rules. |
| **FR-BA-205** | Optional: `file_enhancement` / existing tools only—do not duplicate. |
| **FR-BA-206** | Write-back path: after incident, agent may **propose** FM markdown under `docs/RCA/failure-modes/` (git commit), never edit graph JSON. |

### 5.2 P2 verification

- Skill files exist and are linked from AGENTS.md  
- Gate function unit-tested on synthetic PR body  
- Dry-run agent checklist documented

### 5.3 P2 done when

Remediation playbook is enforceable via protocol + optional gate tool; human remains merge authority.

---

## 6. Phase P3 — Production signal join

**Duration:** ~2 weeks (depends on env access)  
**Objective:** Correlate live failure with topology + change.

### 6.1 Requirements

| ID | Requirement |
|----|-------------|
| **FR-BA-301** | Mapping table or extractor field: Sentry project / route pattern → brain surface/domain id (config file, deterministic). |
| **FR-BA-302** | Tool `brain_correlate_error` (or extend rca_pack): input error signature / route → search + neighborhood + optional Sentry fetch if `SENTRY_*` configured; degrade gracefully if missing. |
| **FR-BA-303** | Deploy/SHA emphasis: include “systems with SHA age &lt; 48h” in rca_pack when freshness available. |
| **FR-BA-304** | Liveness: if runtime health exists, attach to neighborhood; else null (no fake green). |
| **FR-BA-305** | Multi-agent optional: investigate / validate / remediate personas in protocol only (orchestration, not required multi-process). |
| **FR-BA-306** | Audit: tool calls should not leak secrets; Sentry tokens server-only. |

### 6.2 P3 verification

- Mapping covers top error routes or documents gaps  
- rca_pack with mock Sentry payload tested  
- Degrade path without Sentry still returns topology+docs  

### 6.3 P3 done when

End-to-end: symptom → pack including change/freshness → proposed fix path, with observability optional not mandatory.

---

## 7. Cross-cutting FR/NFR matrix

| ID | Statement |
|----|-----------|
| **FR-BA-401** | All brain_* tools registered once in `lib/wa-agent/tools/index.ts` and selectively MCP-exported. |
| **FR-BA-402** | Pure logic lives in `lib/brain/*`; tools are thin wrappers. |
| **FR-BA-403** | Graph integrity: docs corpus + tools never break `pnpm brain:build`. |
| **NFR-BA-401** | No LLM in extractors or pure brain tools. |
| **NFR-BA-402** | Path traversal / symlink escape blocked for doc reads. |
| **NFR-BA-403** | Tool results JSON-serializable, size-bounded (truncate bodies). |
| **NFR-BA-404** | Version: include `graphGeneratedAt` on every brain_* response. |

---

## 8. Orchestration (how to deliver without thrash)

### 8.1 Work packages (PR slices)

| PR | Scope | Merge gate |
|----|--------|------------|
| **PR-P0a** | Pure `neighborhood` + `doc-get` + `freshness` + unit tests | vitest brain-* green |
| **PR-P0b** | WA tools + MCP allowlist + search copy fix | vitest + typecheck |
| **PR-P0c** | AGENTS/CLAUDE/llms investigation protocol | docs only OK |
| **PR-P1a** | FM seed docs + corpus symptoms haystack | brain:build |
| **PR-P1b** | `buildRcaPack` + tool + tests | vitest |
| **PR-P1c** | investigate skill | docs |
| **PR-P2** | remediate skill + gate + PR template | docs + small pure fn |
| **PR-P3a** | route→node mapping config | config + tests |
| **PR-P3b** | Sentry optional correlate | feature-flagged |

### 8.2 Roles

| Role | Owns |
|------|------|
| **Implementer** | Code + unit tests per PR |
| **Reviewer** | Tool safety (path, secrets), description quality |
| **Verifier** | Run vitest + brain:build; MCP name list; one scripted chain |
| **Human** | Merge; approve any Sentry/prod env |

### 8.3 Dependency graph

```
P0a ──► P0b ──► P0c
              │
              ▼
         P1a ──► P1b ──► P1c
                        │
                        ▼
                       P2
                        │
                        ▼
                  P3a ──► P3b
```

P0c can parallel P0b. P1a can start after P0a (needs graph only).

### 8.4 Definition of Done (program)

- [x] P0 tools callable via MCP allowlist  
- [x] Investigation protocol in AGENTS.md  
- [x] P1 rca_pack + ≥5 FMs  
- [x] P2 remediation skill + citation template  
- [x] P3 mapping + optional Sentry; degrade without secrets  
- [x] Full `__tests__/unit/brain-*` green  
- [x] No hand-edited graph; regen only via `pnpm brain:build`

---

## 9. Risk register

| Risk | Mitigation |
|------|------------|
| Agents ignore tools | Strong AGENTS.md + tool descriptions; MCP-only surfaces |
| Doc path escape | Resolve realpath; prefix check under docs/ |
| Stale graph | Always return `graphGeneratedAt`; brain:check in CI |
| Neighborhood too large | Cap neighbors (e.g. 40 nodes); depth max 2 |
| FM spam | Seed curated FMs; type failure-mode only |
| Sentry scope creep | Optional; feature flag; no P0 dependency |

---

## 10. Goal prompt (copy-paste)

Use with Grok goal / implementer harness. Fill `{SCRATCH}` if required by harness.

```markdown
# Goal: Deliver Brain agent consumption P0→P3

## Goal kind
code-change

## Context
Repo: AGB-CRM (path /Users/tomas/AGB-CRM). Living Brain graph is derived (`pnpm brain:build`, BRAIN_SCIP=1). Phase 1 shipped: docs/** → doc/adr nodes, documents edges, searchBrain includes docs, docs/llms.txt, AGENTS.md. WA tool `brain_search` exists; MCP allowlists it in lib/mcp/tools.ts. Tool pattern: lib/wa-agent/tools/<name>.ts + register in index.ts + MCP_TOOL_NAMES.

Requirements source of truth:
docs/requirements/BRAIN-AGENT-CONSUMPTION-P0-P3.md

## Deliver (in order)

### P0 (ship first — do not skip)
1. Pure lib/brain/neighborhood.ts — expand node/edge by id, depth 1–2, include documents-linked docs, cap size; no throw on missing id.
2. Pure lib/brain/doc-get.ts — read only under docs/, block traversal, size cap; return body + meta.
3. Pure lib/brain/freshness.ts — generatedAt + commit SHAs (+ optional stale).
4. Tools: brain_neighborhood, brain_doc_get, brain_freshness (or fold freshness into neighborhood responses AND still expose freshness).
5. Register tools in lib/wa-agent/tools/index.ts; add to lib/mcp/tools.ts MCP_TOOL_NAMES.
6. Fix brain_search tool description (include doc/adr) and humble empty-state message (verify before building).
7. Update AGENTS.md + CLAUDE.md + docs/llms.txt with Investigation mode protocol (search → neighborhood → doc_get → cite ids; escalation rules).
8. Unit tests on real committed graph for neighborhood, doc-get, freshness; keep __tests__/unit/brain-* green.

### P1
9. Seed ≥5 docs/RCA/failure-modes/*.md with type: failure-mode + brain_node + symptoms.
10. lib/brain/rca-pack.ts + tool brain_rca_pack + MCP; unit tests.
11. Investigation skill doc linked from AGENTS.md.

### P2
12. Remediate skill + PR citation template in AGENTS.md.
13. Optional pure brain_remediation_gate (warn on missing citations/tests).
14. Write-back only via proposed FM markdown, never edit brain-graph.json by hand.

### P3
15. Deterministic route/error → brain node mapping config.
16. Optional Sentry correlate tool or rca_pack extension; must degrade if env missing.
17. Freshness/recent SHA emphasis in rca_pack.

## Constraints
- No LLM in graph extractors or pure brain tools.
- No inventing architecture nodes; graph only via brain:build.
- Prefer additive pure functions + thin tool wrappers.
- Path safety on all FS reads.
- Commit only brain/docs/agent-tool files; exclude unrelated WIP (login, macos-helper, brand).

## Verification plan
1. gating: pnpm exec vitest run __tests__/unit/brain- → exit 0; log to {SCRATCH}/brain-unit.log
2. gating: pnpm brain:build → exit 0; log to {SCRATCH}/brain-build.log
3. gating: Script or test chain: searchBrain → neighborhood → doc_get on a real doc path; capture JSON to {SCRATCH}/brain-tool-chain.log
4. gating: Assert MCP_TOOL_NAMES includes brain_neighborhood, brain_doc_get (and P1+ tools when shipped)
5. evidence: AGENTS.md contains Investigation mode; docs/llms.txt lists tools
6. After P1: brain_rca_pack unit test on real graph
7. After P3: degrade path without Sentry still returns pack

## Acceptance criteria
- P0: Agents can expand topology and read linked docs via tools; protocol written.
- P1: One-shot RCA pack tool + failure-mode seeds.
- P2: Remediation protocol with Brain citations.
- P3: Optional live-signal correlation without breaking offline diagnosis.
- All phases: brain unit tests green; no hand-broken graph integrity.

## Task checklist
- [x] P0 pure neighborhood + doc-get + freshness + tests
- [x] P0 tools + MCP allowlist + brain_search copy fix
- [x] P0 AGENTS/CLAUDE/llms investigation protocol
- [x] P1 failure-mode seeds + rca_pack tool + skill
- [x] P2 remediate skill + citation gate/template
- [x] P3 mapping + optional Sentry correlate
- [x] Final vitest + brain:build + evidence logs in {SCRATCH}

## Non-goals
LLM wiki writing into graph JSON; auto-merge PRs; unscoped production mutation; IcePanel rewrite; canvas chips for every doc.
```

---

## 11. How to use this

1. Open goal mode / implementer with the **§10 Goal prompt** (entire fenced block).  
2. Point the implementer at **`docs/requirements/BRAIN-AGENT-CONSUMPTION-P0-P3.md`** as SoT.  
3. Run **P0 only** first if you want a fast ship; leave P1–P3 as follow-on goals using the same checklist from the unchecked boxes.  
4. After each PR slice, require: `pnpm exec vitest run __tests__/unit/brain-` + (if extractors touched) `pnpm brain:build`.

---

## 12. Success metrics (program)

| Metric | Target |
|--------|--------|
| MCP brain_* tools | ≥4 (search, neighborhood, doc_get, freshness/rca) |
| Time-to-first grounded RCA (agent) | Topology + doc without human paste |
| Invented surface rate | Near zero when search used first |
| Offline diagnosis | Works with only committed graph + docs FS |
| Online diagnosis | Improves with Sentry when configured |

---

**Owner note:** P0 is the critical path. P1 multiplies RCA quality. P2 hardens change. P3 is optional signal join—do not block P0 on Sentry credentials.
