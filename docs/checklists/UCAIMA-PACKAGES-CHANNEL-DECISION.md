# Ucaima packages → channel decision (2026-07-14)

## Decision (interim, operator-executable)

**Keep multi-night commercial packages as CaneyCloud *internal* packages**  
(TOPOCHI / SACAICA / KAVANARU family — `packages` + `package_prices`).

**Do not auto-map them to VAV marketplace rate plans in this pilot.**

### Why
1. Internal packages are **per-person fixed stay prices** (INV-8), not nightly curves.
2. Channel/VAV sells **rate_plan × nightly rate cells** (+ optional addons).
3. Naïve conversion (package total ÷ nights) would misprice occupancy classes and off-site nights (KAVANARU).
4. Channel already has 4× **Tarifa base** room-only plans for marketplace once VAV schema is fixed.

### What sells where (pilot)

| Offer | CaneyCloud | WhatsApp concierge | VAV marketplace |
|---|---|---|---|
| TOPOCHI / SACAICA / KAVANARU packages | ✅ packages table | ✅ `list_packages` / quote_package | ❌ not this pilot |
| Room-only Tarifa base | ✅ rate_plans | possible | ✅ after VAV mig 093 replay |
| Thu/Sun stay pattern | ✅ property stay pattern | ✅ enforced | ⚠️ need CTA or stay-pattern ingest |

### Follow-ups (separate tickets)
- **Package bridge design** (optional later): either  
  - (A) explicit marketplace rate plans with `is_package=true` + package-derived cells + min/max LOS = package nights, or  
  - (B) channel package SKU extension on the wire contract.  
- Do not silently sell $0 Tarifa base without pricing occupancy grid into sellable cells.

### Status after TASK-LINK-002
- VAV channel **connected**; property + room types mirrored.
- Rate plan mirror **blocked** on VAV missing `arrival_included` (mig 093).
- Packages decision **documented** (this file).
