# AGB-CRM work required for VAV white-label storefronts

**Updated:** 2026-07-15 · **Owner line:** VAV LOB · Initiative (portals): `0a48de73`  
**Companion:** VAV repo `vav-storefront-phase0` / `VZ_Tourism_Project` · Overlord `section-client-portals`  
**Board:** [`_tasks/_BOARD.md`](../../_tasks/_BOARD.md) · Tasks: `TASK-AGB-SF-*`

This note is the single checklist of **everything that must land in AGB-CRM** (and AGB-operated secrets/ops) for the white-label storefront loop to be usable by Tomas in production. VAV-side code may already exist; AGB is the **control plane**.

---

## Split of ownership (do not blur)

| Surface | Owner | Notes |
|---------|--------|------|
| Offerings, rates, ARI, taxes, photos SoR | **CaneyCloud** | Operator configures in PMS; webhooks → VAV mirror |
| Booking engine, subdomain render, AI draft config | **VAV** | `*.vamosavenezuela.com`, quote→hold→book |
| Request queue, generate/preview/publish ops, partner linkage | **AGB-CRM** | MCP tools + (optional) UI for Tomas |
| Cross-repo task board (Caney deps) | **Overlord** `section-client-portals` | PORTAL-001/002 + SF tax webhook |

---

## Already in AGB (shipped stubs — verify live)

| Item | Where | Status |
|------|--------|--------|
| HMAC client to VAV | `lib/storefront/vav-client.ts` | Code present; needs env on deploy |
| MCP `create_storefront_request` | `lib/wa-agent/tools/create-storefront-request.ts` | Stubbed; allowlisted in `lib/mcp/tools.ts` |
| MCP `list_storefront_queue` | `lib/wa-agent/tools/list-storefront-queue.ts` | Stubbed |
| MCP `generate_storefront_draft` | `lib/wa-agent/tools/generate-storefront-draft.ts` | Stubbed (Phase 2) |
| MCP `get_storefront_preview_link` | `lib/wa-agent/tools/get-storefront-preview-link.ts` | Stubbed (Phase 2) |
| Unit tests for MCP registration + signed HTTP | `__tests__/unit/mcp-storefront-tools.test.ts` | Green locally |

**Not done:** production env values, live smoke against VAV staging/prod, operator playbook, partner-room bridge, notifications.

---

## AGB must-do backlog (tasked)

### P0 — Control plane live

1. **[TASK-AGB-SF-001](../../_tasks/TASK-AGB-SF-001-storefront-env-and-secrets.md)** — Configure `VAV_STOREFRONT_BASE_URL` + `VAV_STOREFRONT_SERVICE_SECRET` (and optional `_PREVIOUS`) on AGB Vercel/prod; document rotation with VAV twin secret.  
2. **[TASK-AGB-SF-002](../../_tasks/TASK-AGB-SF-002-storefront-mcp-live-smoke.md)** — Live-smoke all four MCP tools against VAV staging: create → list → generate-draft → preview-link; assert 401 on bad HMAC.  
3. **[TASK-AGB-SF-003](../../_tasks/TASK-AGB-SF-003-storefront-ops-playbook.md)** — Tomas ops playbook (claim queue → generate → preview → hand-edit note → publish handoff to VAV Phase 3). Until Phase 3 UI exists, playbook is MCP + VAV admin.

### P1 — Operator productization

4. **[TASK-AGB-SF-004](../../_tasks/TASK-AGB-SF-004-partner-room-storefront-bridge.md)** — From partner room / platform linkage (Ucaima), one action creates storefront request with brief defaults + VAV `providers.id` / `pms_tenant_id` resolved.  
5. **[TASK-AGB-SF-005](../../_tasks/TASK-AGB-SF-005-storefront-transition-notifications.md)** — Notify Tomas (+ optional provider WA/email) on request created / draft ready / approved / published (hooks into VAV status webhooks or poll).  
6. **[TASK-AGB-SF-006](../../_tasks/TASK-AGB-SF-006-storefront-queue-ui.md)** — Optional in-CRM queue UI (list requests, open preview, copy link) so ops isn’t MCP-only.

### P2 — Scale / quality

7. **[TASK-AGB-SF-007](../../_tasks/TASK-AGB-SF-007-storefront-patch-feedback.md)** — Map provider “request changes” comments to patch intents for VAV (not full re-roll); AGB captures structured feedback fields.  
8. **[TASK-AGB-SF-008](../../_tasks/TASK-AGB-SF-008-storefront-initiative-tracking.md)** — Keep AGB initiative `0a48de73` + this note + Overlord PORTAL tasks in sync; weekly board hygiene.

---

## Env checklist (AGB deploy)

```bash
# Required for any MCP storefront tool
VAV_STOREFRONT_BASE_URL=https://vamosavenezuela.com   # or staging URL
VAV_STOREFRONT_SERVICE_SECRET=<same as VAV VAV_STOREFRONT_SERVICE_SECRET>

# Optional dual-key window
VAV_STOREFRONT_SERVICE_SECRET_PREVIOUS=
```

VAV must have the matching secret and routes:
- `POST /api/internal/storefront/v1/requests`
- `GET  /api/internal/storefront/v1/queue`
- `POST /api/internal/storefront/v1/generate-draft`
- `GET  /api/internal/storefront/v1/preview-link`

---

## Explicitly NOT AGB (track on VAV / Overlord)

| Work | Track |
|------|--------|
| Live book from storefront (quote→hold→pay→PMS) | VAV Phase 4 + env |
| Provider approve → auto-publish | VAV Phase 3 |
| Wildcard DNS `*.vamosavenezuela.com` | VAV/Vercel infra |
| property.* `tax_config` on Caney webhooks | Overlord **TASK-PORTAL-003** |
| Media enumeration for portals | Overlord **TASK-PORTAL-001** |
| Mi Sitio content editor | Overlord **TASK-PORTAL-002** |
| WhatsApp booking on storefront | Caney concierge + VAV Phase 5 |

---

## Pilot path (Ucaima)

1. CaneyCloud: Ucaima property live, rooms/rates/ARI, tax flags set.  
2. VAV: provider mirror + listings published + `subdomain=ucaima`.  
3. AGB: SF-001/002 green → SF-004 create request from partner room.  
4. Tomas: generate draft → preview → (Phase 3) publish.  
5. Guest: `ucaima.vamosavenezuela.com` book end-to-end.

---

## Related docs

- VAV: `docs/custom-storefront-request-flow-gap-analysis.md`, `docs/storefront-phase-0-spec.md`  
- Sample: `/s/ucaima` on VAV (offline demo when no DB)  
- Overlord: `005- WIKI/operation-overlord/section-client-portals/TASKS.md`  
- Partner linkage: `TASK-LINK-001` / `TASK-LINK-002` / `TASK-LINK-003`
