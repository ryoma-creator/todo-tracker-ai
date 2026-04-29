import { useState, useEffect, useCallback } from 'react';
import { View, Text, ScrollView, StyleSheet, ActivityIndicator, TouchableOpacity, Modal } from 'react-native';
import { supabase } from '../../lib/supabase';
import { type TodoTask } from '../../lib/types';
import TaskForm from '../../components/TaskForm';

const STATUS_COLOR: Record<string, string> = {
  pending: '#6366f1',
  in_progress: '#f59e0b',
  done: '#22c55e',
  failed: '#ef4444',
};
const STATUS_LABEL: Record<string, string> = {
  pending: '未着手', in_progress: '着手中', done: '達成', failed: '未達成',
};
const PRIORITY_LABEL = ['', '最低', '低', '中', '高', '最高'];

type FilterRange = '30' | '90' | 'all';

function HistoryCard({ task, onEdit }: { task: TodoTask; onEdit: () => void }) {
  const [expanded, setExpanded] = useState(false);

  return (
    <TouchableOpacity style={s.card} onPress={() => setExpanded(!expanded)} activeOpacity={0.8}>
      <View style={s.cardHeader}>
        <Text style={s.dateText}>{task.date}</Text>
        <View style={[s.badge, { borderColor: STATUS_COLOR[task.status] }]}>
          <Text style={[s.badgeTxt, { color: STATUS_COLOR[task.status] }]}>{STATUS_LABEL[task.status]}</Text>
        </View>
      </View>
      <Text style={s.title}>{task.title}</Text>

      {/* 得られる価値（常時表示） */}
      {task.leverage ? (
        <View style={s.leverageBox}>
          <Text style={s.leverageLabel}>得られる価値</Text>
          <Text style={s.leverageText} numberOfLines={expanded ? undefined : 2}>{task.leverage}</Text>
        </View>
      ) : null}

      {/* 展開時のみ表示 */}
      {expanded && (
        <>
          {task.status === 'done' && task.achieve_reason ? (
            <View style={s.reasonBox}>
              <Text style={s.reasonLabel}>✅ 達成できた理由</Text>
              <Text style={s.reasonText}>{task.achieve_reason}</Text>
            </View>
          ) : null}
          {task.status === 'failed' && task.fail_reason ? (
            <View style={[s.reasonBox, s.failBox]}>
              <Text style={[s.reasonLabel, s.failLabel]}>❌ 達成できなかった理由</Text>
              <Text style={s.reasonText}>{task.fail_reason}</Text>
            </View>
          ) : null}
          {task.description ? (
            <Text style={s.descText}>{task.description}</Text>
          ) : null}
        </>
      )}

      <View style={s.footer}>
        <Text style={s.priorityTxt}>優先度: {PRIORITY_LABEL[task.priority]}</Text>
        <View style={s.actions}>
          <Text style={s.expandHint}>{expanded ? '▲ 閉じる' : '▼ 詳細'}</Text>
          <TouchableOpacity style={s.editBtn} onPress={(e) => { e.stopPropagation?.(); onEdit(); }}>
            <Text style={s.editBtnTxt}>編集</Text>
          </TouchableOpacity>
        </View>
      </View>
    </TouchableOpacity>
  );
}

export default function HistoryScreen() {
  const [tasks, setTasks] = useState<TodoTask[]>([]);
  const [loading, setLoading] = useState(true);
  const [editTarget, setEditTarget] = useState<TodoTask | null>(null);
  const [saving, setSaving] = useState(false);
  const [filter, setFilter] = useState<FilterRange>('30');

  const loadTasks = useCallback(async () => {
    let query = supabase.from('todo_tasks').select('*').order('date', { ascending: false });

    if (filter !== 'all') {
      const days = parseInt(filter);
      const from = new Date();
      from.setDate(from.getDate() - days);
      const fromStr = from.toISOString().slice(0, 10);
      query = query.gte('date', fromStr);
    } else {
      query = query.limit(300);
    }

    const { data } = await query;
    if (data) setTasks(data as TodoTask[]);
    setLoading(false);
  }, [filter]);

  useEffect(() => { loadTasks(); }, [loadTasks]);

  const handleEdit = async (task: TodoTask) => {
    setSaving(true);
    const { error } = await supabase.from('todo_tasks').update({
      title: task.title, description: task.description, leverage: task.leverage,
      priority: task.priority, status: task.status,
      achieve_reason: task.achieve_reason, fail_reason: task.fail_reason,
      due_date: task.due_date, progress_notes: task.progress_notes,
    }).eq('id', task.id as string);
    if (!error) { setEditTarget(null); loadTasks(); }
    setSaving(false);
  };

  const total = tasks.length;
  const done = tasks.filter((t) => t.status === 'done').length;
  const inProgress = tasks.filter((t) => t.status === 'in_progress').length;
  const failed = tasks.filter((t) => t.status === 'failed').length;
  const rate = total > 0 ? Math.round((done / total) * 100) : 0;

  if (loading) return <ActivityIndicator style={{ flex: 1, backgroundColor: '#0f0f0f' }} color="#6366f1" />;

  return (
    <View style={s.container}>
      <ScrollView contentContainerStyle={s.content}>
        {/* 統計ダッシュボード */}
        <View style={s.summaryCard}>
          <Text style={s.summaryTitle}>サマリー</Text>
          <View style={s.statRow}>
            <View style={s.statBox}>
              <Text style={s.statNum}>{total}</Text>
              <Text style={s.statLabel}>総タスク</Text>
            </View>
            <View style={s.statBox}>
              <Text style={[s.statNum, { color: '#f59e0b' }]}>{inProgress}</Text>
              <Text style={s.statLabel}>着手中</Text>
            </View>
            <View style={s.statBox}>
              <Text style={[s.statNum, { color: '#22c55e' }]}>{done}</Text>
              <Text style={s.statLabel}>達成</Text>
            </View>
            <View style={s.statBox}>
              <Text style={[s.statNum, { color: '#ef4444' }]}>{failed}</Text>
              <Text style={s.statLabel}>未達成</Text>
            </View>
            <View style={s.statBox}>
              <Text style={[s.statNum, { color: '#6366f1' }]}>{rate}%</Text>
              <Text style={s.statLabel}>達成率</Text>
            </View>
          </View>
          <View style={s.barBg}>
            <View style={[s.barFill, { width: `${rate}%` as `${number}%` }]} />
          </View>
        </View>

        {/* 期間フィルター */}
        <View style={s.filterRow}>
          {([['30', '30日'], ['90', '90日'], ['all', '全期間']] as [FilterRange, string][]).map(([val, label]) => (
            <TouchableOpacity
              key={val}
              style={[s.filterBtn, filter === val && s.filterBtnActive]}
              onPress={() => setFilter(val)}
            >
              <Text style={[s.filterBtnTxt, filter === val && s.filterBtnTxtActive]}>{label}</Text>
            </TouchableOpacity>
          ))}
        </View>

        {tasks.length === 0 && <Text style={s.empty}>記録がまだありません</Text>}

        {tasks.map((t) => (
          <HistoryCard key={t.id} task={t} onEdit={() => setEditTarget(t)} />
        ))}
      </ScrollView>

      {editTarget && (
        <Modal visible animationType="slide" presentationStyle="pageSheet">
          <View style={s.modalContainer}>
            <View style={s.modalHeader}>
              <Text style={s.modalTitle}>タスクを編集</Text>
              <TouchableOpacity onPress={() => setEditTarget(null)}>
                <Text style={s.closeBtn}>✕</Text>
              </TouchableOpacity>
            </View>
            <TaskForm initial={editTarget} onSave={handleEdit} saving={saving} onCancel={() => setEditTarget(null)} />
          </View>
        </Modal>
      )}
    </View>
  );
}

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#0f0f0f' },
  content: { padding: 20, paddingBottom: 48 },
  summaryCard: { backgroundColor: '#1a1a1a', borderRadius: 16, padding: 20, marginBottom: 16 },
  summaryTitle: { color: '#fff', fontSize: 16, fontWeight: '700', marginBottom: 16 },
  statRow: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 16 },
  statBox: { alignItems: 'center' },
  statNum: { color: '#fff', fontSize: 20, fontWeight: 'bold' },
  statLabel: { color: '#555', fontSize: 11, marginTop: 4 },
  barBg: { height: 6, backgroundColor: '#2a2a2a', borderRadius: 3 },
  barFill: { height: 6, backgroundColor: '#6366f1', borderRadius: 3 },
  filterRow: { flexDirection: 'row', gap: 8, marginBottom: 16 },
  filterBtn: { flex: 1, paddingVertical: 8, borderRadius: 8, borderWidth: 1, borderColor: '#333', alignItems: 'center' },
  filterBtnActive: { backgroundColor: '#1e1b4b', borderColor: '#6366f1' },
  filterBtnTxt: { color: '#555', fontSize: 13 },
  filterBtnTxtActive: { color: '#6366f1', fontWeight: '600' },
  empty: { color: '#555', textAlign: 'center', marginTop: 60, fontSize: 15 },
  card: { backgroundColor: '#1a1a1a', borderRadius: 16, padding: 16, marginBottom: 12 },
  cardHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 },
  dateText: { color: '#6366f1', fontSize: 13, fontWeight: '700' },
  badge: { borderWidth: 1, borderRadius: 8, paddingHorizontal: 10, paddingVertical: 3 },
  badgeTxt: { fontSize: 12, fontWeight: '600' },
  title: { color: '#fff', fontSize: 16, fontWeight: '600', marginBottom: 10 },
  leverageBox: { backgroundColor: '#111827', borderRadius: 10, padding: 12, marginBottom: 8, borderLeftWidth: 2, borderLeftColor: '#6366f1' },
  leverageLabel: { color: '#6366f1', fontSize: 11, fontWeight: '700', marginBottom: 4 },
  leverageText: { color: '#9ca3af', fontSize: 13, lineHeight: 20 },
  reasonBox: { backgroundColor: '#0a1f0a', borderRadius: 10, padding: 12, marginBottom: 8, borderLeftWidth: 2, borderLeftColor: '#22c55e' },
  failBox: { backgroundColor: '#1f0a0a', borderLeftColor: '#ef4444' },
  reasonLabel: { color: '#4ade80', fontSize: 12, fontWeight: '700', marginBottom: 4 },
  failLabel: { color: '#f87171' },
  reasonText: { color: '#ccc', fontSize: 13, lineHeight: 20 },
  descText: { color: '#555', fontSize: 13, lineHeight: 18, marginTop: 4 },
  footer: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: 8 },
  priorityTxt: { color: '#555', fontSize: 12 },
  actions: { flexDirection: 'row', gap: 12, alignItems: 'center' },
  expandHint: { color: '#444', fontSize: 12 },
  editBtn: { backgroundColor: '#2a2a3e', borderRadius: 8, paddingHorizontal: 12, paddingVertical: 4 },
  editBtnTxt: { color: '#6366f1', fontSize: 12 },
  modalContainer: { flex: 1, backgroundColor: '#0f0f0f' },
  modalHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: 20, paddingBottom: 8 },
  modalTitle: { fontSize: 18, fontWeight: 'bold', color: '#fff' },
  closeBtn: { color: '#aaa', fontSize: 24, fontWeight: 'bold', paddingHorizontal: 4 },
});
