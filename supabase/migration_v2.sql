-- タスクのテンプレート（殿堂入り）フラグを追加
ALTER TABLE todo_tasks ADD COLUMN IF NOT EXISTS is_template boolean DEFAULT false;
