export type TaskStatus = 'pending' | 'in_progress' | 'done' | 'failed';

export type ProgressNote = {
  ts: string;       // ISO timestamp
  type: 'doing' | 'stuck';
  body: string;
};

export type TodoTask = {
  id?: string;
  user_id?: string;
  created_at?: string;
  date: string;
  title: string;
  description: string;
  leverage: string;
  priority: number;
  status: TaskStatus;
  achieve_reason: string;
  fail_reason: string;
  due_date: string | null;
  deadline_time: string | null;
  estimated_minutes: number | null;
  progress_notes: string; // JSON: ProgressNote[]
  is_template?: boolean;
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
  progress_notes: '[]',
});

export function parseNotes(raw: string | null | undefined): ProgressNote[] {
  try { return JSON.parse(raw ?? '[]') as ProgressNote[]; }
  catch { return []; }
}
