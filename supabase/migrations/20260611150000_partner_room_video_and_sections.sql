-- Partner room ambience + repository sections.
-- hero_video_key: preset background video key for the room hero (null = none).
-- category / room_section: which repository section an entry files under
-- (null = "Documentos" default section). Keys validated in app code against
-- REPO_SECTION_OPTIONS — plain text columns keep presets editable without DDL.

alter table partner_rooms add column if not exists hero_video_key text;
alter table partner_room_items add column if not exists category text;
alter table partner_shares add column if not exists room_section text;
