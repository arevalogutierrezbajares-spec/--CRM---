-- Tasks (milestones) gain a free-text description, shown in the project
-- Tasks "Table" view alongside due date, priority, status and assignee.
ALTER TABLE milestones ADD COLUMN IF NOT EXISTS description text;
