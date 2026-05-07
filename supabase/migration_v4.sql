-- やらないリスクフィールドを追加
alter table public.todo_tasks
  add column if not exists risk text not null default '';
