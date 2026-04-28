-- todo_tasks テーブル
create table if not exists public.todo_tasks (
  id          uuid default gen_random_uuid() primary key,
  user_id     uuid references auth.users on delete cascade not null,
  created_at  timestamptz default now(),
  date        date not null,
  title       text not null,
  description text not null default '',
  leverage    text not null default '',
  priority    int  not null default 3 check (priority between 1 and 5),
  status      text not null default 'pending' check (status in ('pending', 'done', 'failed')),
  achieve_reason text not null default '',
  fail_reason    text not null default '',
  due_date       date,
  deadline_time  time,              -- 当日の締め切り時刻
  estimated_minutes int             -- 想定所要時間（分）
);

-- RLS 有効化
alter table public.todo_tasks enable row level security;

-- 自分のデータだけ読み書き可能
create policy "自分のタスクのみ参照" on public.todo_tasks
  for select using (auth.uid() = user_id);

create policy "自分のタスクのみ挿入" on public.todo_tasks
  for insert with check (auth.uid() = user_id);

create policy "自分のタスクのみ更新" on public.todo_tasks
  for update using (auth.uid() = user_id);

create policy "自分のタスクのみ削除" on public.todo_tasks
  for delete using (auth.uid() = user_id);

-- 日付・優先度でよく検索するのでインデックスを貼る
create index if not exists idx_todo_tasks_user_date on public.todo_tasks (user_id, date desc);
create index if not exists idx_todo_tasks_status    on public.todo_tasks (user_id, status);
