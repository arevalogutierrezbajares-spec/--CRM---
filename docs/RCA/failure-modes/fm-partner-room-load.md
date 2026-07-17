---
brain_node: crm.partner-rooms
type: failure-mode
system: crm
title: Partner room fails to load
summary: Partner microsite blank, hero 403, or share link broken
symptoms: partner room, partner-access, room-hero
---

# Partner room fails to load

## Symptoms
partner room, partner-access, room-hero

## Investigation
1. `brain_search` / `brain_rca_pack` with symptom tokens
2. `brain_neighborhood` on linked architecture ids
3. `brain_doc_get` for related runbooks
4. Check `brain_freshness` and recent deploys on involved systems

## Likely causes
- Contract/deploy drift across systems
- Missing migration or env
- Auth/token failure on interchange

## Remediation notes
Cite Brain node ids in the PR. Run tests before merge. Prefer fix at owning system from the graph.
