---
brain_node: crm
type: failure-mode
system: crm
title: Posada onboarding timeout
summary: Onboarding intake 504/timeout between CRM and Caney
symptoms: posada, onboarding, caney auth, interchange
---

# Posada onboarding timeout

## Symptoms
posada, onboarding, caney auth, interchange

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
