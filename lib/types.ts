export type TaskStatus = 'pending' | 'done' | 'failed';

export type TodoTask = {
  id?: string;
  user_id?: string;
  created_at?: string;
  date: string;           // 対象日 YYYY-MM-DD
  title: string;          // タスク名
  description: string;    // 詳細説明
  leverage: string;       // やることで得られるレバレッジ・リターン
  priority: number;       // 優先度 1-5
  status: TaskStatus;
  achieve_reason: string; // 達成できた理由
  fail_reason: string;    // 達成できなかった理由
  due_date: string | null;
  deadline_time: string | null;  // 締め切り時刻 HH:MM
  estimated_minutes: number | null; // 想定所要時間（分）
};

const localDateStr = (d = new Date()) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

export const DEFAULT_TASK = (): TodoTask => ({
  date: localDateStr(),
  title: '',
  description: '',
  leverage: '',
  priority: 3,
  status: 'pending',
  achieve_reason: '',
  fail_reason: '',
  due_date: null,
  deadline_time: null,
  estimated_minutes: null,
});
