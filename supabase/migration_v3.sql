ALTER TABLE todo_tasks ADD COLUMN IF NOT EXISTS category text DEFAULT 'その他';
ALTER TABLE todo_tasks ADD COLUMN IF NOT EXISTS actual_minutes int DEFAULT NULL;
