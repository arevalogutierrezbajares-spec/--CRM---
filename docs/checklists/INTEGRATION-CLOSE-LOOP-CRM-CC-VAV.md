# Integration close-loop checklist — CRM · CaneyCloud · VAV

**Created:** 2026-07-14  
**Trigger:** E2E review of packages / day restrictions / CRM onboarding  
**Pilot property:** Campamento Ucaima  

Hard IDs (do not invent alternatives):

| System | Key | Value |
|---|---|---|
| CaneyCloud tenant | `tenants.id` | `35b05635-902e-4a47-a8c6-e614b605a037` |
| CaneyCloud property | `properties.id` | `fd0e8ceb-3534-4e50-88c5-4278b1351428` |
| CRM partner room | `partner_rooms.id` | `e353cbfd-3d16-4703-840b-c6d1e943b518` |
| CRM contact | org Ucaima | `e4e30f41-2d3a-4c93-ab2a-5fc4d497e7a6` |
| VAV shell (wrong) | `pms_properties.pms_property_id` | `vav-pending-70f0e8e6-e4f6-4c44-94e9-afc43c1618af` |

---

## A. AGB-CRM (relationship + capture)

| # | Task | Owner | Done when |
|---|---|---|---|
| A1 | Migration `20260714220000_partner_room_platform_linkage` applied | CRM | Columns exist on live |
| A2 | Partner room shows **Platform linkage** chips + form | CRM | Room page UI |
| A3 | Backfill Ucaima room with CC/VAV ids + status `awaiting_channel` | CRM | Chips show scrap shell + awaiting channel |
| A4 | Close stale next step “Finalizar datos…CaneyCloud” | CRM | Step completed |
| A5 | Add next steps: (1) connect VAV channel (2) bind VAV mirror (3) map packages→rate plans | CRM | 3 open steps |
| A6 | Deduplicate contacts (Jungle Rudy ×2, Canaima vs Ucaima) | CRM ops | One org + people |
| A7 | Posada wizard target API live **or** document “complex = workbook only” | CRM+CC | No silent 404 path |
| A8 | Extend intake contract (later): stay pattern + packages | CRM+CC | Spec ticket |

**CRM schema fields (A1):**  
`caney_tenant_id`, `caney_property_id`, `vav_pms_property_id`, `vav_listing_id`,  
`caney_onboarding_status` ∈ `not_started|configured|awaiting_channel|live|blocked`,  
`integration_notes`.

---

## B. CaneyCloud (source of truth)

| # | Task | Owner | Done when |
|---|---|---|---|
| B1 | Staff property onboarding status honest for Ucaima | CC | ✅ `configured` + channel note (2026-07-14) |
| B2 | Create `channels.code='vav'` for Ucaima tenant | CC | ✅ `f773cfc1-…` active; 9 events published |
| B3 | Map 6 packages → marketplace rate_plans **or** WA-only decision | CC product | ✅ **WA-only this pilot** — see `UCAIMA-PACKAGES-CHANNEL-DECISION.md` |
| B4 | Either expand CTA/CTD for non-Thu/Sun **or** stay-pattern ingest on VAV | CC+VAV | ⬜ open (LINK-003) |
| B5 | Confirm connect path for pilot (no fleet flag required) | CC | ✅ per-tenant connect + drain |
| B6 | Mount CRM import API **or** re-point wizard | CC | ⬜ still 404 |
| B7 | Workbook scripts golden path for Canaima-class | CC | ✅ documented |

**Ucaima commercial truth (already live):**  
6 packages + 216 prices · stay pattern Thu/Sun · 0 channel addons · 0 rate_restrictions · 4 empty `$0` “Tarifa base” rate plans.

---

## C. VAV (marketplace mirror)

| # | Task | Owner | Done when |
|---|---|---|---|
| C1 | Apply packages migrations (`093+`) on **prod** | VAV | ✅ 2026-07-14 |
| C2 | Bind real `pms_property_id=fd0e8ceb-…` + listing | VAV | ✅ `pms-1cdd4cac-campamento-ucaima` published |
| C3 | Stay pattern ingest + enforce | VAV | ✅ DB backfill + code in check.ts (deploy) |
| C4 | Hold `lines[]` for addons | VAV | ⬜ N/A until addons sold |
| C5 | Rate plans mirrored | VAV | ✅ 4× Tarifa base |
| C5b | ARI / availability cells | both | ⬜ CC inventory empty next 30d |
| C6 | Smoke quote → hold | both | ⬜ blocked on C5b |

---

## D. Acceptance (pilot)

| # | Check | Pass |
|---|---|---|
| D1 | CRM chips: Caney configured, VAV linked (not scrap), channel live | ☐ |
| D2 | Tourist calendar: arrivals only Thu/Sun (or documented override) | ☐ |
| D3 | Package (or mapped rate plan) price matches CC within tolerance | ☐ |
| D4 | Hold lands on CC with correct property + plan | ☐ |
| D5 | CRM next steps all closed or blocked with note | ☐ |

---

## Sequenced order

1. **A1–A5** (this change set) — CRM truth  
2. **B1** — staff board honesty  
3. **B2 + B5** — channel open  
4. **C1–C2** — VAV can receive  
5. **B3 + C5** — packages sellable  
6. **B4 + C3** — day rules  
7. **C4 + D\*** — booking E2E  
8. **A7/B6** — intake productization  

---

## Related code / docs

- CRM: `lib/partner-access/platform-linkage.ts`, partner room page Platform linkage card  
- CRM: `docs/posada-onboarding.md`, `docs/VAV-CaneyCloud-CRM-sync-status.md`  
- VAV: `docs/VAV-CaneyCloud-Provider-Architecture.md`  
- CC: `scripts/onboarding/clientes/campamento-ucaima/`, stay_pattern, packages  
