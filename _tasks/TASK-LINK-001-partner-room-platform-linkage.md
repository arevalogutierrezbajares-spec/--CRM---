# TASK-LINK-001 — Partner room platform linkage (CRM)

**Status:** review (migrated + Ucaima backfilled 2026-07-14)  
**Repo:** AGB-CRM  
**Checklist:** `docs/checklists/INTEGRATION-CLOSE-LOOP-CRM-CC-VAV.md` §A  

## Scope
- Migration + schema columns for Caney/VAV ids + onboarding status
- Room page chips + Platform linkage form
- Unit tests for chip derivation
- Backfill Campamento Ucaima room

## Files
- `supabase/migrations/20260714220000_partner_room_platform_linkage.sql`
- `db/schema.ts`, `db/queries/partner-access.ts`
- `app/(app)/partner-access/actions.ts`
- `components/partner-access/platform-linkage-form.tsx`
- `lib/partner-access/platform-linkage.ts`
- `app/(app)/partner-access/rooms/[id]/page.tsx`
- `__tests__/unit/platform-linkage.test.ts`
