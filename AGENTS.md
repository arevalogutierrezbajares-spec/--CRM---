# AGB-CRM — agent instructions

See **[CLAUDE.md](./CLAUDE.md)** for operational rules (migrations, commands).

## Documentation & THE BRAIN

| Resource | Path |
|----------|------|
| Docs index | [docs/llms.txt](./docs/llms.txt) |
| Map UI | `/brain` |
| Regen | `pnpm brain:build` |
| Investigate skill | [docs/skills/investigate.md](./docs/skills/investigate.md) |
| Remediate skill | [docs/skills/remediate.md](./docs/skills/remediate.md) |

### Brain tools (MCP / WA agent)

| Tool | When |
|------|------|
| `brain_search` | Locate code + docs + wires |
| `brain_neighborhood` | Blast radius after a hit |
| `brain_doc_get` | Read runbook/ADR body |
| `brain_freshness` | Trust the map |
| `brain_rca_pack` | One-shot investigation pack |
| `brain_remediation_gate` | Soft pre-PR checklist |
| `brain_correlate_error` | Map route/error → nodes (offline) |

## Investigation mode (bugs / outages / RCA)

**Trigger:** bug, 5xx, timeout, “broken”, incident, root cause.

1. Read skill [docs/skills/investigate.md](./docs/skills/investigate.md).
2. `brain_search` → `brain_rca_pack` → `brain_neighborhood` → `brain_doc_get`.
3. Cite **node ids** and **doc paths** only from tool results.
4. Empty search → verify synonyms; do **not** invent surfaces.

## Remediation mode (fixes)

**Trigger:** implementing a fix after diagnosis.

1. Read skill [docs/skills/remediate.md](./docs/skills/remediate.md).
2. Fix at owning system from the graph; run tests.
3. `brain_remediation_gate` on the PR body; include Brain citations.
4. Write-back failure modes as markdown under `docs/RCA/failure-modes/` only.

## PR citation template

```markdown
## Brain
- Nodes: `…`
- Docs: `docs/…`
- Hypothesis: …
## Tests
- [ ] commands + result
```

## Doc frontmatter (improves joins)

```yaml
---
brain_node: crm.capture
type: howto   # howto | explanation | reference | adr | failure-mode
summary: …
---
```
