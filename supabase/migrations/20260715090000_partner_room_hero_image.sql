-- Generated hero images for partner rooms (xAI Grok, South America nature
-- themes). Additive + nullable: rooms without one keep the video/aurora hero.
alter table partner_rooms
  add column if not exists hero_image_storage_path text,
  add column if not exists hero_image_theme text,
  add column if not exists hero_image_prompt text,
  add column if not exists hero_image_generated_at timestamptz;
