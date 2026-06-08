-- Tasks (milestones) gain a free-text description, shown in the project
-- Tasks table alongside due date, priority, status, and assignee.
ALTER TABLE milestones ADD COLUMN IF NOT EXISTS description text;
