# TASK-LINK-002 — CaneyCloud Ucaima: honest status + VAV channel

**Status:** review (channel connected 2026-07-14)  
**Repo:** `--TOURISM--`  
**Checklist:** `docs/checklists/INTEGRATION-CLOSE-LOOP-CRM-CC-VAV.md` §B  

## Done
1. ✅ `settings.onboarding.status=configured` (+ channel id + sync note)
2. ✅ `channels` row `code=vav` for tenant `35b05635-…`  
   - channel_id: `f773cfc1-f3d1-4611-a1ef-44b96d8631d2`  
   - webhook: `https://vamosavenezuela.com/api/pms/webhook/caneycloud`  
   - secret: **fleet-shared** (SEC-VAV-03; fixed after first mint)
3. ✅ Room-type mappings 4/4; initial sync enqueued + **9/9 published**
4. ✅ VAV received: `property.vav_enabled` + 4× `room_type.created` **processed**
5. ✅ Packages decision: **WA/internal packages stay; no auto-map to rate plans this pilot**  
   → `docs/checklists/UCAIMA-PACKAGES-CHANNEL-DECISION.md`
6. ⚠️ 4× `rate_plan.created` **failed on VAV** — missing `arrival_included` column (mig 093)  
   → rolled into TASK-LINK-003

## Acceptance
- Staff board honest ✅  
- Outbox published for property ✅  
- CRM: channel step completed; VAV id bound to real property ✅  
- Marketplace fully live ❌ blocked on LINK-003
