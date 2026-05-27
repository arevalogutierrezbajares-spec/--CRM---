-- Projects: optional dark-mode logo variant for proper contrast on dark theme.

ALTER TABLE "projects" ADD COLUMN IF NOT EXISTS "logo_url_dark" text;
