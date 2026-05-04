import { useState, useEffect, useCallback } from 'react';
import { View, Text, ScrollView, StyleSheet, ActivityIndicator, TouchableOpacity, Modal, Alert, Platform } from 'react-native';
import { supabase } from '../../lib/supabase';
import { type TodoTask, DEFAULT_TASK } from '../../lib/types';
import TaskForm from '../../components/TaskForm';

const STATUS_COLOR: Record<string, { bg: string; text: string }> = {
  pending:     { bg: '#F1F5F9', text: '#64748B' },
  in_progress: { bg: '#FEF3C7', text: '#D97706' },
  done:        { bg: '#DCFCE7', text: '#16A34A' },
  failed:      { bg: '#FEE2E2', text: '#DC2626' },
};
const STATUS_LABEL: Record<string, string> = {
  pending: '未着手', in_progress: '着手中', done: '達成', failed: '未達成',
};
const PRIORITY_LABEL = ['', '最低', '低', '中', '高', '最高'];
const PRIORITY_COLOR: Record<number, { bg: string; text: string; bar: string }> = {
  5: { bg: '#FEE2E2', text: '#DC2626', bar: '#EF4444' },
  4: { bg: '#FEF3C7', text: '#D97706', bar: '#F97316' },
  3: { bg: '#EDE9FE', text: '#7C3AED', bar: '#6366F1' },
  2: { bg: '#DCFCE7', text: '#16A34A', bar: '#22C55E' },
  1: { bg: '#F1F5F9', text: '#64748B', bar: '#94A3B8' },
};

type FilterRange = '30' | '90' | 'all';

function localDateStr(d = new Date()) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function formatDate(dateStr: string): { label: string; sub: string } {
  const today = new Date();
  const todayStr = localDateStr(today);
  const yesterday = new Date(today);
  yesterday.setDate(yesterday.getDate() - 1);

  if (dateStr === todayStr) return { label: '今日', sub: dateStr };
  if (dateStr === localDateStr(yesterday)) return { label: '昨日', sub: dateStr };

  const [y, m, day] = dateStr.split('-').map(Number);
  const target = new Date(y, m - 1, day);
  const todayMidnight = new Date(today.getFullYear(), today.getMonth(), today.getDate());
  const diff = Math.round((todayMidnight.getTime() - target.getTime()) / (1000 * 60 * 60 * 24));

  if (diff < 14) return { label: `${diff}日前`, sub: dateStr };
  return { label: `${m}月${day}日`, sub: dateStr };
}

function HistoryCard({ task, todayStr, onEdit, onMoveToToday }: {
  task: TodoTask;
  todayStr: string;
  onEdit: () => void;
  onMoveToToday: () => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const isPast = task.date < todayStr;
  const pc = PRIORITY_COLOR[task.priority] ?? PRIORITY_COLOR[3];
  const sc = STATUS_COLOR[task.status] ?? STATUS_COLOR['pending'];
  const { label: dateLabel, sub: dateSub } = formatDate(task.date);

  return (
    <View style={[cs.card, { borderLeftColor: pc.bar }]}>
      {/* ヘッダー */}
      <View style={cs.header}>
        <View style={cs.dateBlock}>
          <Text style={cs.dateLabel}>{dateLabel}</Text>
          <Text style={cs.dateSub}>{dateSub}</Text>
        </View>
        <View style={[cs.statusTag, { backgroundColor: sc.bg }]}>
          <Text style={[cs.statusTagTxt, { color: sc.text }]}>{STATUS_LABEL[task.status]}</Text>
        </View>
      </View>

      {/* タイトル */}
      <Text style={cs.title}>{task.title}</Text>

      {/* 優先度バッジ */}
      <View style={[cs.priorityTag, { backgroundColor: pc.bg }]}>
        <View style={[cs.priorityDot, { backgroundColor: pc.bar }]} />
        <Text style={[cs.priorityTxt, { color: pc.text }]}>優先度: {PRIORITY_LABEL[task.priority]}</Text>
      </View>

      {/* 得られる価値 */}
      {task.leverage ? (
        <View style={cs.leverageBox}>
          <Text style={cs.leverageLabel}>得られる価値</Text>
          <Text style={cs.leverageTxt} numberOfLines={expanded ? undefined : 2}>{task.leverage}</Text>
        </View>
      ) : null}

      {/* 未達成の理由（常時表示） */}
      {task.status === 'failed' && task.fail_reason ? (
        <View style={cs.failBox}>
          <Text style={cs.failLabel}>❌ 達成できなかった理由</Text>
          <Text style={cs.failTxt}>{task.fail_reason}</Text>
        </View>
      ) : null}

      {/* 達成の理由（常時表示） */}
      {task.status === 'done' && task.achieve_reason ? (
        <View style={cs.achieveBox}>
          <Text style={cs.achieveLabel}>✅ 達成できた理由</Text>
          <Text style={cs.achieveTxt}>{task.achieve_reason}</Text>
        </View>
      ) : null}

      {/* 展開: 詳細説明 */}
      {expanded && task.description ? (
        <Text style={cs.descTxt}>{task.description}</Text>
      ) : null}

      {/* フッター */}
      <View style={cs.footer}>
        <View style={cs.footerLeft}>
          {isPast && (
            <TouchableOpacity style={cs.moveBtn} onPress={onMoveToToday}>
              <Text style={cs.moveBtnTxt}>＋ 今日に追加</Text>
            </TouchableOpacity>
          )}
        </View>
        <View style={cs.footerRight}>
          <TouchableOpacity onPress={() => setExpanded(!expanded)}>
            <Text style={cs.expandHint}>{expanded ? '▲ 閉じる' : '▼ 詳細'}</Text>
          </TouchableOpacity>
          <TouchableOpacity style={cs.editBtn} onPress={onEdit}>
            <Text style={cs.editBtnTxt}>編集</Text>
          </TouchableOpacity>
        </View>
      </View>
    </View>
  );
}

export default function HistoryScreen() {
  const [tasks, setTasks] = useState<TodoTask[]>([]);
  const [loading, setLoading] = useState(true);
  const [editTarget, setEditTarget] = useState<TodoTask | null>(null);
  const [saving, setSaving] = useState(false);
  const [filter, setFilter] = useState<FilterRange>('30');
  const todayStr = localDateStr();

  const loadTasks = useCallback(async () => {
    let query = supabase.from('todo_tasks').select('*').order('date', { ascending: false });
    if (filter !== 'all') {
      const from = new Date();
      from.setDate(from.getDate() - parseInt(filter));
      query = query.gte('date', from.toISOString().slice(0, 10));
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

  const handleMoveToToday = async (task: TodoTask) => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;
    const { error } = await supabase.from('todo_tasks').insert({
      ...DEFAULT_TASK(),
      user_id: user.id,
      title: task.title,
      description: task.description,
      leverage: task.leverage,
      priority: task.priority,
      date: todayStr,
      status: 'pending',
    });
    if (!error) {
      Alert.alert('追加しました', '今日のタスクリストに追加しました');
      loadTasks();
    }
  };

  const total = tasks.length;
  const done = tasks.filter((t) => t.status === 'done').length;
  const inProgress = tasks.filter((t) => t.status === 'in_progress').length;
  const failed = tasks.filter((t) => t.status === 'failed').length;
  const rate = total > 0 ? Math.round((done / total) * 100) : 0;

  if (loading) return <ActivityIndicator style={{ flex: 1, backgroundColor: '#F2F4F8' }} color="#6366f1" />;

  return (
    <View style={s.container}>
      <ScrollView contentContainerStyle={s.content} showsVerticalScrollIndicator={false}>

        {/* サマリーカード */}
        <View style={s.summaryCard}>
          <Text style={s.summaryTitle}>サマリー</Text>
          <View style={s.statRow}>
            {[
              { num: total,      label: '総タスク',  color: '#1A1D2E' },
              { num: inProgress, label: '着手中',    color: '#D97706' },
              { num: done,       label: '達成',      color: '#16A34A' },
              { num: failed,     label: '未達成',    color: '#DC2626' },
              { num: `${rate}%`, label: '達成率',    color: '#6366f1' },
            ].map(({ num, label, color }) => (
              <View key={label} style={s.statBox}>
                <Text style={[s.statNum, { color }]}>{num}</Text>
                <Text style={s.statLabel}>{label}</Text>
              </View>
            ))}
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
          <HistoryCard
            key={t.id}
            task={t}
            todayStr={todayStr}
            onEdit={() => setEditTarget(t)}
            onMoveToToday={() => handleMoveToToday(t)}
          />
        ))}
      </ScrollView>

      {editTarget && (
        <Modal visible animationType="slide" presentationStyle="pageSheet">
          <View style={s.modalContainer}>
            <View style={s.modalHeader}>
              <Text style={s.modalTitle}>タスクを編集</Text>
              <TouchableOpacity onPress={() => setEditTarget(null)} style={s.modalClose}>
                <Text style={s.modalCloseTxt}>✕</Text>
              </TouchableOpacity>
            </View>
            <TaskForm initial={editTarget} onSave={handleEdit} saving={saving} onCancel={() => setEditTarget(null)} />
          </View>
        </Modal>
      )}
    </View>
  );
}

const cs = StyleSheet.create({
  card: {
    backgroundColor: '#fff',
    borderRadius: 16,
    padding: 16,
    marginBottom: 10,
    borderLeftWidth: 4,
    ...Platform.select({
      ios: { shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.05, shadowRadius: 6 },
      android: { elevation: 2 },
      default: { boxShadow: '0px 1px 6px rgba(0,0,0,0.05)' } as any,
    }),
  },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 10 },
  dateBlock: {},
  dateLabel: { color: '#1A1D2E', fontSize: 20, fontWeight: '800' },
  dateSub: { color: '#94A3B8', fontSize: 11, marginTop: 2 },
  statusTag: { borderRadius: 8, paddingHorizontal: 10, paddingVertical: 4 },
  statusTagTxt: { fontSize: 12, fontWeight: '700' },
  title: { color: '#1A1D2E', fontSize: 15, fontWeight: '600', marginBottom: 10, lineHeight: 22 },
  priorityTag: { flexDirection: 'row', alignItems: 'center', alignSelf: 'flex-start', borderRadius: 8, paddingHorizontal: 8, paddingVertical: 4, marginBottom: 10, gap: 6 },
  priorityDot: { width: 7, height: 7, borderRadius: 4 },
  priorityTxt: { fontSize: 12, fontWeight: '700' },
  leverageBox: { backgroundColor: '#F8F9FF', borderRadius: 10, padding: 12, marginBottom: 10, borderLeftWidth: 2, borderLeftColor: '#6366f1' },
  leverageLabel: { color: '#6366f1', fontSize: 11, fontWeight: '700', marginBottom: 4 },
  leverageTxt: { color: '#475569', fontSize: 13, lineHeight: 20 },
  failBox: { backgroundColor: '#FEF2F2', borderRadius: 10, padding: 12, marginBottom: 10, borderLeftWidth: 2, borderLeftColor: '#EF4444' },
  failLabel: { color: '#DC2626', fontSize: 12, fontWeight: '700', marginBottom: 6 },
  failTxt: { color: '#374151', fontSize: 13, lineHeight: 20 },
  achieveBox: { backgroundColor: '#F0FDF4', borderRadius: 10, padding: 12, marginBottom: 10, borderLeftWidth: 2, borderLeftColor: '#22C55E' },
  achieveLabel: { color: '#16A34A', fontSize: 12, fontWeight: '700', marginBottom: 6 },
  achieveTxt: { color: '#374151', fontSize: 13, lineHeight: 20 },
  descTxt: { color: '#94A3B8', fontSize: 13, lineHeight: 18, marginTop: 4, marginBottom: 8 },
  footer: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: 10 },
  footerLeft: { flex: 1 },
  footerRight: { flexDirection: 'row', gap: 12, alignItems: 'center' },
  moveBtn: { backgroundColor: '#F0FDF4', borderWidth: 1, borderColor: '#86EFAC', borderRadius: 8, paddingHorizontal: 12, paddingVertical: 6, alignSelf: 'flex-start' },
  moveBtnTxt: { color: '#16A34A', fontSize: 12, fontWeight: '700' },
  expandHint: { color: '#94A3B8', fontSize: 12 },
  editBtn: { backgroundColor: '#EDE9FE', borderRadius: 8, paddingHorizontal: 12, paddingVertical: 6 },
  editBtnTxt: { color: '#6366f1', fontSize: 12, fontWeight: '600' },
});

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F2F4F8' },
  content: { padding: 16, paddingBottom: 48 },

  summaryCard: {
    backgroundColor: '#fff', borderRadius: 16, padding: 20, marginBottom: 16,
    ...Platform.select({
      ios: { shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.06, shadowRadius: 8 },
      android: { elevation: 3 },
      default: { boxShadow: '0px 2px 8px rgba(0,0,0,0.06)' } as any,
    }),
  },
  summaryTitle: { color: '#1A1D2E', fontSize: 16, fontWeight: '800', marginBottom: 16 },
  statRow: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 16 },
  statBox: { alignItems: 'center' },
  statNum: { fontSize: 22, fontWeight: '800' },
  statLabel: { color: '#94A3B8', fontSize: 11, marginTop: 4, fontWeight: '500' },
  barBg: { height: 6, backgroundColor: '#E2E8F0', borderRadius: 3 },
  barFill: { height: 6, backgroundColor: '#6366f1', borderRadius: 3 },

  filterRow: { flexDirection: 'row', gap: 8, marginBottom: 16 },
  filterBtn: { flex: 1, paddingVertical: 10, borderRadius: 10, backgroundColor: '#fff', borderWidth: 1, borderColor: '#E2E8F0', alignItems: 'center' },
  filterBtnActive: { backgroundColor: '#EDE9FE', borderColor: '#A5B4FC' },
  filterBtnTxt: { color: '#94A3B8', fontSize: 13, fontWeight: '600' },
  filterBtnTxtActive: { color: '#6366f1', fontWeight: '700' },

  empty: { color: '#94A3B8', textAlign: 'center', marginTop: 60, fontSize: 15 },

  modalContainer: { flex: 1, backgroundColor: '#fff' },
  modalHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: 20, paddingBottom: 12, borderBottomWidth: 1, borderBottomColor: '#F1F5F9' },
  modalTitle: { fontSize: 18, fontWeight: '800', color: '#1A1D2E' },
  modalClose: { width: 32, height: 32, borderRadius: 16, backgroundColor: '#F1F5F9', alignItems: 'center', justifyContent: 'center' },
  modalCloseTxt: { color: '#64748B', fontSize: 16, fontWeight: '700' },
});
