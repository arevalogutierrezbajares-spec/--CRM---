-- Partner room ↔ CaneyCloud / VAV hard links + ops status.
-- Closes the "CRM room has no property_id" gap so partner rooms can be
-- audited against live PMS + marketplace state.

ALTER TABLE partner_rooms
  ADD COLUMN IF NOT EXISTS caney_tenant_id text,
  ADD COLUMN IF NOT EXISTS caney_property_id text,
  ADD COLUMN IF NOT EXISTS vav_pms_property_id text,
  ADD COLUMN IF NOT EXISTS vav_listing_id text,
  ADD COLUMN IF NOT EXISTS caney_onboarding_status text,
  ADD COLUMN IF NOT EXISTS integration_notes text;

-- Free-text status vocabulary (app-enforced):
--   not_started | configured | awaiting_channel | live | blocked
COMMENT ON COLUMN partner_rooms.caney_tenant_id IS
  'CaneyCloud tenants.id (UUID text). Source of truth tenant for this partner.';
COMMENT ON COLUMN partner_rooms.caney_property_id IS
  'CaneyCloud properties.id (UUID text).';
COMMENT ON COLUMN partner_rooms.vav_pms_property_id IS
  'VAV pms_properties.pms_property_id — should equal caney_property_id when linked; vav-pending-* means scraped shell only.';
COMMENT ON COLUMN partner_rooms.vav_listing_id IS
  'VAV listings.id (or slug) when a storefront/marketplace listing exists.';
COMMENT ON COLUMN partner_rooms.caney_onboarding_status IS
  'Ops readiness: not_started | configured | awaiting_channel | live | blocked.';
COMMENT ON COLUMN partner_rooms.integration_notes IS
  'Free-form notes for dual-catalog / channel / VAV gaps.';

CREATE INDEX IF NOT EXISTS partner_rooms_caney_property_id_idx
  ON partner_rooms (caney_property_id)
  WHERE caney_property_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS partner_rooms_vav_pms_property_id_idx
  ON partner_rooms (vav_pms_property_id)
  WHERE vav_pms_property_id IS NOT NULL;
