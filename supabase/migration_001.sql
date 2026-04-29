-- migration_001: in_progress ステータス追加 + progress_notes カラム追加
-- Supabase SQL Editor で実行してください

-- 1. status の CHECK 制約を更新（in_progress を追加）
ALTER TABLE public.todo_tasks
  DROP CONSTRAINT IF EXISTS todo_tasks_status_check;

ALTER TABLE public.todo_tasks
  ADD CONSTRAINT todo_tasks_status_check
  CHECK (status IN ('pending', 'in_progress', 'done', 'failed'));

-- 2. progress_notes カラムを追加（既存データは空配列で初期化）
ALTER TABLE public.todo_tasks
  ADD COLUMN IF NOT EXISTS progress_notes text NOT NULL DEFAULT '[]';
