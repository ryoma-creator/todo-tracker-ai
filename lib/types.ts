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
  risk: string;
  priority: number;
  status: TaskStatus;
  achieve_reason: string;
  fail_reason: string;
  due_date: string | null;
  deadline_time: string | null;
  estimated_minutes: number | null;
  progress_notes: string; // JSON: ProgressNote[]
  is_template?: boolean;
  category?: string;
  actual_minutes?: number | null;
};

const localDateStr = (d = new Date()) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

export const CATEGORIES = ['エンジニア', '学習', '仕事', '健康', '生活', '副業', 'その他'] as const;
export type Category = typeof CATEGORIES[number];

export const CATEGORY_COLOR: Record<string, { color: string; bg: string }> = {
  'エンジニア': { color: '#4F46E5', bg: '#EEF2FF' },
  '学習':       { color: '#7C3AED', bg: '#F5F3FF' },
  '仕事':       { color: '#0284C7', bg: '#E0F2FE' },
  '健康':       { color: '#059669', bg: '#ECFDF5' },
  '生活':       { color: '#D97706', bg: '#FFFBEB' },
  '副業':       { color: '#DB2777', bg: '#FDF2F8' },
  'その他':     { color: '#64748B', bg: '#F1F5F9' },
};

export const DEFAULT_TASK = (): TodoTask => ({
  date: localDateStr(),
  title: '',
  description: '',
  leverage: '',
  risk: '',
  priority: 3,
  status: 'pending',
  achieve_reason: '',
  fail_reason: '',
  due_date: null,
  deadline_time: null,
  estimated_minutes: null,
  progress_notes: '[]',
  category: 'その他',
});

export function parseNotes(raw: string | null | undefined): ProgressNote[] {
  try { return JSON.parse(raw ?? '[]') as ProgressNote[]; }
  catch { return []; }
}
