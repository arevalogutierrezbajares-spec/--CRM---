# AGB-CRM — agent instructions

See **[CLAUDE.md](./CLAUDE.md)** for operational rules (migrations, commands).

## Documentation & THE BRAIN

- **Index:** [docs/llms.txt](./docs/llms.txt) — curated entry points for LLM agents.
- **Map:** `/brain` — structural portfolio graph + rebuild-guard search (code **and** docs).
- **Regen:** `pnpm brain:build` — deterministic; includes `docs/**` corpus as `doc`/`adr` nodes.

### Root-cause / investigation pack

1. Read `docs/llms.txt` for the right how-to or ADR.
2. Search the Brain for the capability (`searchBrain` or UI) before adding routes/tables.
3. Follow `documents` links and `docs_ref` paths; cite `brain_node` ids in findings.

Optional YAML frontmatter on docs improves joins:

```yaml
---
brain_node: crm.capture
type: howto
summary: …
---
```
