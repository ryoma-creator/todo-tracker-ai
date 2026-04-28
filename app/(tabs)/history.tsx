import { useState, useEffect, useCallback } from 'react';
import { View, Text, ScrollView, StyleSheet, ActivityIndicator, TouchableOpacity, Modal, Alert } from 'react-native';
import { supabase } from '../../lib/supabase';
import { type TodoTask } from '../../lib/types';
import TaskForm from '../../components/TaskForm';

const STATUS_COLOR: Record<string, string> = {
  pending: '#6366f1',
  done: '#22c55e',
  failed: '#ef4444',
};
const STATUS_LABEL: Record<string, string> = { pending: '未着手', done: '達成', failed: '未達成' };
const PRIORITY_LABEL = ['', '最低', '低', '中', '高', '最高'];

function HistoryCard({ task, onEdit, onDelete }: { task: TodoTask; onEdit: () => void; onDelete: () => void }) {
  const [confirmDel, setConfirmDel] = useState(false);
  return (
    <View style={s.card}>
      <View style={s.cardHeader}>
        <Text style={s.dateText}>{task.date}</Text>
        <View style={[s.badge, { borderColor: STATUS_COLOR[task.status] }]}>
          <Text style={[s.badgeTxt, { color: STATUS_COLOR[task.status] }]}>{STATUS_LABEL[task.status]}</Text>
        </View>
      </View>
      <Text style={s.title}>{task.title}</Text>
      {task.leverage ? (
        <Text style={s.leverage} numberOfLines={2}>{task.leverage}</Text>
      ) : null}
      <View style={s.footer}>
        <Text style={s.priorityTxt}>優先度: {PRIORITY_LABEL[task.priority]}</Text>
        <View style={s.actions}>
          <TouchableOpacity style={s.editBtn} onPress={onEdit}>
            <Text style={s.editBtnTxt}>編集</Text>
          </TouchableOpacity>
          {confirmDel ? (
            <View style={s.confirmRow}>
              <TouchableOpacity style={s.confirmYesBtn} onPress={onDelete}>
                <Text style={s.confirmYesTxt}>削除</Text>
              </TouchableOpacity>
              <TouchableOpacity onPress={() => setConfirmDel(false)}>
                <Text style={s.confirmNo}>戻る</Text>
              </TouchableOpacity>
            </View>
          ) : (
            <TouchableOpacity style={s.deleteBtn} onPress={() => setConfirmDel(true)}>
              <Text style={s.deleteBtnTxt}>削除</Text>
            </TouchableOpacity>
          )}
        </View>
      </View>
      {task.status === 'done' && task.achieve_reason ? (
        <Text style={s.reasonGood}>✅ {task.achieve_reason}</Text>
      ) : null}
      {task.status === 'failed' && task.fail_reason ? (
        <Text style={s.reasonBad}>❌ {task.fail_reason}</Text>
      ) : null}
    </View>
  );
}

export default function HistoryScreen() {
  const [tasks, setTasks] = useState<TodoTask[]>([]);
  const [loading, setLoading] = useState(true);
  const [editTarget, setEditTarget] = useState<TodoTask | null>(null);
  const [saving, setSaving] = useState(false);

  const loadTasks = useCallback(async () => {
    const { data } = await supabase
      .from('todo_tasks').select('*').order('date', { ascending: false }).limit(100);
    if (data) setTasks(data as TodoTask[]);
    setLoading(false);
  }, []);

  useEffect(() => { loadTasks(); }, [loadTasks]);

  const handleEdit = async (task: TodoTask) => {
    setSaving(true);
    const { error } = await supabase.from('todo_tasks').update({
      title: task.title, description: task.description, leverage: task.leverage,
      priority: task.priority, status: task.status,
      achieve_reason: task.achieve_reason, fail_reason: task.fail_reason,
      due_date: task.due_date,
    }).eq('id', task.id as string);
    if (error) Alert.alert('エラー', error.message);
    else { setEditTarget(null); loadTasks(); }
    setSaving(false);
  };

  const handleDelete = async (task: TodoTask) => {
    const { error } = await supabase.from('todo_tasks').delete().eq('id', task.id as string);
    if (error) Alert.alert('エラー', error.message);
    else loadTasks();
  };

  // 統計計算
  const total = tasks.length;
  const done = tasks.filter((t) => t.status === 'done').length;
  const failed = tasks.filter((t) => t.status === 'failed').length;
  const rate = total > 0 ? Math.round((done / total) * 100) : 0;

  if (loading) return <ActivityIndicator style={{ flex: 1, backgroundColor: '#0f0f0f' }} color="#6366f1" />;

  return (
    <View style={s.container}>
      <ScrollView contentContainerStyle={s.content}>
        {/* 達成率サマリー */}
        <View style={s.summaryCard}>
          <Text style={s.summaryTitle}>全体統計</Text>
          <View style={s.summaryRow}>
            <View style={s.statBox}>
              <Text style={s.statNum}>{total}</Text>
              <Text style={s.statLabel}>総タスク</Text>
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
          {/* 達成率バー */}
          <View style={s.barBg}>
            <View style={[s.barFill, { width: `${rate}%` as `${number}%` }]} />
          </View>
        </View>

        {tasks.length === 0 && <Text style={s.empty}>記録がまだありません</Text>}

        {tasks.map((t) => (
          <HistoryCard
            key={t.id}
            task={t}
            onEdit={() => setEditTarget(t)}
            onDelete={() => handleDelete(t)}
          />
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
            <TaskForm
              initial={editTarget}
              onSave={handleEdit}
              saving={saving}
              onCancel={() => setEditTarget(null)}
            />
          </View>
        </Modal>
      )}
    </View>
  );
}

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#0f0f0f' },
  content: { padding: 20, paddingBottom: 48 },
  summaryCard: { backgroundColor: '#1a1a1a', borderRadius: 16, padding: 20, marginBottom: 20 },
  summaryTitle: { color: '#fff', fontSize: 16, fontWeight: '700', marginBottom: 16 },
  summaryRow: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 16 },
  statBox: { alignItems: 'center' },
  statNum: { color: '#fff', fontSize: 22, fontWeight: 'bold' },
  statLabel: { color: '#555', fontSize: 12, marginTop: 4 },
  barBg: { height: 6, backgroundColor: '#2a2a2a', borderRadius: 3 },
  barFill: { height: 6, backgroundColor: '#6366f1', borderRadius: 3 },
  empty: { color: '#555', textAlign: 'center', marginTop: 60, fontSize: 15 },
  card: { backgroundColor: '#1a1a1a', borderRadius: 16, padding: 16, marginBottom: 12 },
  cardHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 },
  dateText: { color: '#6366f1', fontSize: 13, fontWeight: '700' },
  badge: { borderWidth: 1, borderRadius: 8, paddingHorizontal: 10, paddingVertical: 3 },
  badgeTxt: { fontSize: 12, fontWeight: '600' },
  title: { color: '#fff', fontSize: 16, fontWeight: '600', marginBottom: 6 },
  leverage: { color: '#9ca3af', fontSize: 13, lineHeight: 20, marginBottom: 8 },
  footer: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  priorityTxt: { color: '#555', fontSize: 12 },
  actions: { flexDirection: 'row', gap: 8, alignItems: 'center' },
  editBtn: { backgroundColor: '#2a2a3e', borderRadius: 8, paddingHorizontal: 12, paddingVertical: 4 },
  editBtnTxt: { color: '#6366f1', fontSize: 12 },
  deleteBtn: { backgroundColor: '#2a1a1a', borderRadius: 8, paddingHorizontal: 12, paddingVertical: 4 },
  deleteBtnTxt: { color: '#ef4444', fontSize: 12 },
  confirmRow: { flexDirection: 'row', gap: 8, alignItems: 'center' },
  confirmYesBtn: { backgroundColor: '#ef4444', borderRadius: 8, paddingHorizontal: 10, paddingVertical: 4 },
  confirmYesTxt: { color: '#fff', fontSize: 12, fontWeight: '700' },
  confirmNo: { color: '#555', fontSize: 12 },
  reasonGood: { color: '#4ade80', fontSize: 13, marginTop: 8, lineHeight: 20 },
  reasonBad: { color: '#f87171', fontSize: 13, marginTop: 8, lineHeight: 20 },
  modalContainer: { flex: 1, backgroundColor: '#0f0f0f' },
  modalHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: 20, paddingBottom: 8 },
  modalTitle: { fontSize: 18, fontWeight: 'bold', color: '#fff' },
  closeBtn: { color: '#aaa', fontSize: 24, fontWeight: 'bold', paddingHorizontal: 4 },
});
