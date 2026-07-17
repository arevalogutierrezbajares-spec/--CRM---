# Skill: Investigate (RCA / diagnostics)

Use when the user reports a bug, outage, 5xx, timeout, “broken”, Sentry error, or asks for root cause.

## Protocol (mandatory)

1. **`brain_search`** with symptom tokens (and alternate phrasings if empty).
2. **`brain_rca_pack`** with the same query (one-shot pack).
3. **`brain_neighborhood`** on the primary architecture id (not only a doc hit).
4. **`brain_doc_get`** for every relevant `docs_ref` / doc|adr id.
5. **`brain_freshness`** if the pack is older or topology looks wrong.
6. Optionally **`brain_correlate_error`** if you have a route/stack string.
7. Form **ranked hypotheses** citing **node ids + doc paths** only from tool output.
8. Stop and escalate if two remediation attempts fail tests (do not invent surfaces).

## Output template

```
## Symptom
...
## Brain evidence
- Nodes: …
- Wires: …
- Docs: …
## Hypotheses (ordered)
1. …
## Next diagnostic steps
…
## Proposed remediation (if clear)
… (then use remediate skill)
```

## Never

- Invent API routes or domains not returned by tools
- Skip Brain tools and jump to random grepping first
- Treat empty search as permission to build without verification
