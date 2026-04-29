'use client';
import { useState, useEffect, useCallback } from 'react';
import { View, Text, TouchableOpacity, ScrollView, StyleSheet, Modal, ActivityIndicator } from 'react-native';
import { supabase } from '../../lib/supabase';
import { type TodoTask, parseNotes } from '../../lib/types';
import TaskForm from '../../components/TaskForm';

const STATUS_COLOR: Record<string, string> = {
  pending: '#6366f1',
  in_progress: '#f59e0b',
  done: '#22c55e',
  failed: '#ef4444',
};

const STATUS_LABEL: Record<string, string> = {
  pending: '未着手',
  in_progress: '着手中',
  done: '達成',
  failed: '未達成',
};

const PRIORITY_LABEL = ['', '最低', '低', '中', '高', '最高'];

const PRIORITY_STYLE: Record<number, { border: string; bg: string }> = {
  5: { border: '#ef4444', bg: '#1a0a0a' },
  4: { border: '#f97316', bg: '#1a0f0a' },
  3: { border: '#6366f1', bg: '#1a1a1a' },
  2: { border: '#22c55e', bg: '#0a1a0a' },
  1: { border: '#374151', bg: '#111111' },
};

function TaskCard({ task, onEdit, onDelete }: { task: TodoTask; onEdit: () => void; onDelete: () => void }) {
  const [confirmDel, setConfirmDel] = useState(false);
  const [showNotes, setShowNotes] = useState(false);
  const ps = PRIORITY_STYLE[task.priority] ?? PRIORITY_STYLE[3];
  const notes = parseNotes(task.progress_notes);

  return (
    <View style={[s.card, { backgroundColor: ps.bg, borderLeftColor: ps.border }]}>
      <View style={s.cardHeader}>
        <View style={s.badgeRow}>
          <View style={[s.priorityBadge, { backgroundColor: ps.border }]}>
            <Text style={s.priorityBadgeTxt}>{PRIORITY_LABEL[task.priority]}</Text>
          </View>
          <View style={[s.statusBadge, { borderColor: STATUS_COLOR[task.status] }]}>
            <Text style={[s.statusText, { color: STATUS_COLOR[task.status] }]}>
              {STATUS_LABEL[task.status]}
            </Text>
          </View>
        </View>
        <View style={s.cardActions}>
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

      <Text style={s.cardTitle}>{task.title}</Text>

      {task.leverage ? (
        <View style={s.leverageBox}>
          <Text style={s.leverageLabel}>得られる価値</Text>
          <Text style={s.leverageText}>{task.leverage}</Text>
        </View>
      ) : null}

      <View style={s.cardFooter}>
        <Text style={s.priorityTxt}>優先度: {PRIORITY_LABEL[task.priority]}</Text>
        {task.deadline_time ? (
          <Text style={s.deadlineTxt}>⏰ {task.deadline_time}まで</Text>
        ) : task.due_date ? (
          <Text style={s.dueTxt}>期限: {task.due_date}</Text>
        ) : null}
        {task.estimated_minutes ? (
          <Text style={s.estimatedTxt}>
            {task.estimated_minutes >= 60 ? `${task.estimated_minutes / 60}h` : `${task.estimated_minutes}m`}
          </Text>
        ) : null}
      </View>

      {/* 着手中メモ */}
      {task.status === 'in_progress' && notes.length > 0 && (
        <TouchableOpacity onPress={() => setShowNotes(!showNotes)} style={s.notesToggle}>
          <Text style={s.notesToggleTxt}>
            {showNotes ? '▲ メモを閉じる' : `▼ 進捗メモ ${notes.length}件`}
          </Text>
        </TouchableOpacity>
      )}
      {task.status === 'in_progress' && showNotes && notes.map((n, i) => (
        <View key={i} style={[s.noteChip, n.type === 'stuck' ? s.noteChipStuck : s.noteChipDoing]}>
          <Text style={s.noteChipLabel}>{n.type === 'doing' ? '▶' : '⚠'}</Text>
          <Text style={s.noteChipBody}>{n.body}</Text>
        </View>
      ))}

      {task.status === 'done' && task.achieve_reason ? (
        <Text style={s.reasonTxt}>✅ {task.achieve_reason}</Text>
      ) : null}
      {task.status === 'failed' && task.fail_reason ? (
        <Text style={[s.reasonTxt, s.failReason]}>❌ {task.fail_reason}</Text>
      ) : null}
    </View>
  );
}

export default function TodayScreen() {
  const [tasks, setTasks] = useState<TodoTask[]>([]);
  const [loading, setLoading] = useState(true);
  const [showAdd, setShowAdd] = useState(false);
  const [editTarget, setEditTarget] = useState<TodoTask | null>(null);
  const [saving, setSaving] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const today = new Date();
  const todayStr = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;

  const loadTasks = useCallback(async () => {
    const { data, error } = await supabase
      .from('todo_tasks')
      .select('*')
      .eq('date', todayStr)
      .order('priority', { ascending: false });
    if (error) setErrorMsg(error.message);
    if (data) setTasks(data as TodoTask[]);
    setLoading(false);
  }, [todayStr]);

  useEffect(() => { loadTasks(); }, [loadTasks]);

  const handleAdd = async (task: TodoTask) => {
    setSaving(true);
    setErrorMsg(null);
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) { setErrorMsg('ログインが必要です。'); setSaving(false); return; }
    const { error } = await supabase.from('todo_tasks').insert({ ...task, user_id: user.id });
    if (error) setErrorMsg(`保存エラー: ${error.message}`);
    else { setShowAdd(false); loadTasks(); }
    setSaving(false);
  };

  const handleEdit = async (task: TodoTask) => {
    setSaving(true);
    setErrorMsg(null);
    const { error } = await supabase.from('todo_tasks').update({
      title: task.title, description: task.description, leverage: task.leverage,
      priority: task.priority, status: task.status,
      achieve_reason: task.achieve_reason, fail_reason: task.fail_reason,
      due_date: task.due_date, deadline_time: task.deadline_time,
      estimated_minutes: task.estimated_minutes,
      progress_notes: task.progress_notes,
    }).eq('id', task.id as string);
    if (error) setErrorMsg(`更新エラー: ${error.message}`);
    else { setEditTarget(null); loadTasks(); }
    setSaving(false);
  };

  const handleDelete = async (task: TodoTask) => {
    setErrorMsg(null);
    const { error } = await supabase.from('todo_tasks').delete().eq('id', task.id as string);
    if (error) setErrorMsg(`削除エラー: ${error.message}`);
    else loadTasks();
  };

  const doneCount = tasks.filter((t) => t.status === 'done').length;
  const inProgressCount = tasks.filter((t) => t.status === 'in_progress').length;
  const failedCount = tasks.filter((t) => t.status === 'failed').length;

  if (loading) return <ActivityIndicator style={{ flex: 1, backgroundColor: '#0f0f0f' }} color="#6366f1" />;

  return (
    <View style={s.container}>
      <ScrollView contentContainerStyle={s.content}>
        <View style={s.header}>
          <View>
            <Text style={s.dateText}>{todayStr}</Text>
            <Text style={s.summaryText}>
              {tasks.length}件 ／ 着手中 {inProgressCount} ／ 達成 {doneCount} ／ 未達成 {failedCount}
            </Text>
          </View>
          <TouchableOpacity onPress={() => supabase.auth.signOut()}>
            <Text style={s.logoutTxt}>ログアウト</Text>
          </TouchableOpacity>
        </View>

        {errorMsg && (
          <View style={s.errorBanner}>
            <Text style={s.errorText}>❌ {errorMsg}</Text>
            <TouchableOpacity onPress={() => setErrorMsg(null)}>
              <Text style={s.errorClose}>✕</Text>
            </TouchableOpacity>
          </View>
        )}

        {tasks.length === 0 && <Text style={s.empty}>今日のタスクはまだありません</Text>}

        {tasks.map((t) => (
          <TaskCard key={t.id} task={t} onEdit={() => setEditTarget(t)} onDelete={() => handleDelete(t)} />
        ))}
      </ScrollView>

      <TouchableOpacity style={s.addBtn} onPress={() => setShowAdd(true)}>
        <Text style={s.addBtnTxt}>+ タスクを追加</Text>
      </TouchableOpacity>

      <Modal visible={showAdd} animationType="slide" presentationStyle="pageSheet">
        <View style={s.modalContainer}>
          <View style={s.modalHeader}>
            <Text style={s.modalTitle}>新しいタスク</Text>
            <TouchableOpacity onPress={() => setShowAdd(false)}>
              <Text style={s.closeBtn}>✕</Text>
            </TouchableOpacity>
          </View>
          <TaskForm initial={{ date: todayStr }} onSave={handleAdd} saving={saving} onCancel={() => setShowAdd(false)} />
        </View>
      </Modal>

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
  content: { padding: 20, paddingBottom: 100 },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 20 },
  errorBanner: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', backgroundColor: '#2a0a0a', borderRadius: 10, padding: 12, marginBottom: 12, borderWidth: 1, borderColor: '#ef4444' },
  errorText: { color: '#ef4444', fontSize: 13, flex: 1 },
  errorClose: { color: '#ef4444', fontSize: 16, paddingLeft: 8 },
  dateText: { color: '#6366f1', fontSize: 14, fontWeight: '700', marginBottom: 2 },
  summaryText: { color: '#555', fontSize: 13 },
  logoutTxt: { color: '#444', fontSize: 13, marginTop: 4 },
  empty: { color: '#555', textAlign: 'center', marginTop: 60, fontSize: 15 },
  card: { borderRadius: 16, padding: 16, marginBottom: 12, borderLeftWidth: 4 },
  cardHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 },
  badgeRow: { flexDirection: 'row', gap: 6, alignItems: 'center' },
  priorityBadge: { borderRadius: 6, paddingHorizontal: 8, paddingVertical: 3 },
  priorityBadgeTxt: { color: '#fff', fontSize: 11, fontWeight: '700' },
  statusBadge: { borderWidth: 1, borderRadius: 8, paddingHorizontal: 10, paddingVertical: 3 },
  statusText: { fontSize: 12, fontWeight: '600' },
  cardActions: { flexDirection: 'row', gap: 8, alignItems: 'center' },
  editBtn: { backgroundColor: '#2a2a3e', borderRadius: 8, paddingHorizontal: 12, paddingVertical: 4 },
  editBtnTxt: { color: '#6366f1', fontSize: 12 },
  deleteBtn: { backgroundColor: '#2a1a1a', borderRadius: 8, paddingHorizontal: 12, paddingVertical: 4 },
  deleteBtnTxt: { color: '#ef4444', fontSize: 12 },
  confirmRow: { flexDirection: 'row', gap: 8, alignItems: 'center' },
  confirmYesBtn: { backgroundColor: '#ef4444', borderRadius: 8, paddingHorizontal: 10, paddingVertical: 4 },
  confirmYesTxt: { color: '#fff', fontSize: 12, fontWeight: '700' },
  confirmNo: { color: '#555', fontSize: 12 },
  cardTitle: { color: '#fff', fontSize: 17, fontWeight: '600', marginBottom: 8 },
  leverageBox: { backgroundColor: '#111827', borderRadius: 10, padding: 12, marginBottom: 10, borderLeftWidth: 2, borderLeftColor: '#6366f1' },
  leverageLabel: { color: '#6366f1', fontSize: 11, fontWeight: '700', marginBottom: 4 },
  leverageText: { color: '#9ca3af', fontSize: 13, lineHeight: 20 },
  cardFooter: { flexDirection: 'row', gap: 16 },
  priorityTxt: { color: '#555', fontSize: 12 },
  deadlineTxt: { color: '#ef4444', fontSize: 12, fontWeight: '600' },
  dueTxt: { color: '#f59e0b', fontSize: 12 },
  estimatedTxt: { color: '#6b7280', fontSize: 12 },
  notesToggle: { marginTop: 10 },
  notesToggleTxt: { color: '#f59e0b', fontSize: 12 },
  noteChip: { flexDirection: 'row', gap: 8, borderRadius: 8, padding: 10, marginTop: 6, borderLeftWidth: 2 },
  noteChipDoing: { backgroundColor: '#1a1f2e', borderLeftColor: '#6366f1' },
  noteChipStuck: { backgroundColor: '#1f1a0a', borderLeftColor: '#f59e0b' },
  noteChipLabel: { fontSize: 13 },
  noteChipBody: { color: '#ccc', fontSize: 13, flex: 1, lineHeight: 18 },
  reasonTxt: { color: '#4ade80', fontSize: 13, marginTop: 8, lineHeight: 20 },
  failReason: { color: '#f87171' },
  addBtn: { position: 'absolute', bottom: 24, left: 20, right: 20, backgroundColor: '#6366f1', borderRadius: 14, padding: 18, alignItems: 'center' },
  addBtnTxt: { color: '#fff', fontSize: 16, fontWeight: '700' },
  modalContainer: { flex: 1, backgroundColor: '#0f0f0f' },
  modalHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: 20, paddingBottom: 8 },
  modalTitle: { fontSize: 18, fontWeight: 'bold', color: '#fff' },
  closeBtn: { color: '#aaa', fontSize: 24, fontWeight: 'bold', paddingHorizontal: 4 },
});
