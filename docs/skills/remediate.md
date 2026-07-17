# Skill: Remediate (fix after RCA)

Use only after Investigation mode produced a grounded hypothesis with Brain citations.

## Protocol

1. Confirm **`brain_neighborhood`** on the owning system/domain.
2. Implement the minimal fix at the **owning system** from the graph.
3. Run tests (`pnpm exec vitest` / `tsc` as appropriate).
4. Call **`brain_remediation_gate`** with the PR body draft.
5. Open PR using the citation template below.
6. Optionally add/update a failure-mode note under `docs/RCA/failure-modes/` (markdown only — never hand-edit `brain-graph.json`).

## PR body template

```markdown
## Summary
…

## Brain
- Nodes: `crm.…`, `vav.…`, `ix…`
- Docs: `docs/…`
- Hypothesis: …

## Tests
- [ ] vitest / typecheck (note commands + result)

## Risk
…
```

## Stop rules

- Migrations: only via `scripts/db-migrate.sh` (see CLAUDE.md).
- No force-push, no prod secret changes from agent tools.
- If gate score &lt; 50 or tests fail twice → escalate to human.
