'use client';
import { useState, useEffect, useCallback } from 'react';
import { View, Text, TouchableOpacity, ScrollView, StyleSheet, Modal, ActivityIndicator, Platform } from 'react-native';
import { supabase } from '../../lib/supabase';
import { type TodoTask, parseNotes } from '../../lib/types';
import TaskForm from '../../components/TaskForm';

const PRIORITY_LABEL = ['', '最低', '低', '中', '高', '最高'];
const PRIORITY_COLOR: Record<number, { bg: string; text: string; border: string }> = {
  5: { bg: '#FEE2E2', text: '#DC2626', border: '#FCA5A5' },
  4: { bg: '#FEF3C7', text: '#D97706', border: '#FCD34D' },
  3: { bg: '#EDE9FE', text: '#7C3AED', border: '#C4B5FD' },
  2: { bg: '#DCFCE7', text: '#16A34A', border: '#86EFAC' },
  1: { bg: '#F1F5F9', text: '#64748B', border: '#CBD5E1' },
};
const STATUS_COLOR: Record<string, { bg: string; text: string }> = {
  pending:     { bg: '#F1F5F9', text: '#64748B' },
  in_progress: { bg: '#FEF3C7', text: '#D97706' },
  done:        { bg: '#DCFCE7', text: '#16A34A' },
  failed:      { bg: '#FEE2E2', text: '#DC2626' },
};
const STATUS_LABEL: Record<string, string> = {
  pending: '未着手', in_progress: '着手中', done: '達成', failed: '未達成',
};

function CheckBox({ done, onPress }: { done: boolean; onPress: () => void }) {
  return (
    <TouchableOpacity onPress={onPress} style={[cs.check, done && cs.checkDone]} activeOpacity={0.7}>
      {done && <Text style={cs.checkMark}>✓</Text>}
    </TouchableOpacity>
  );
}

function TaskCard({ task, onEdit, onDelete, onToggleDone }: {
  task: TodoTask;
  onEdit: () => void;
  onDelete: () => void;
  onToggleDone: () => void;
}) {
  const [confirmDel, setConfirmDel] = useState(false);
  const [showNotes, setShowNotes] = useState(false);
  const isDone = task.status === 'done';
  const pc = PRIORITY_COLOR[task.priority] ?? PRIORITY_COLOR[3];
  const sc = STATUS_COLOR[task.status] ?? STATUS_COLOR['pending'];
  const notes = parseNotes(task.progress_notes);

  return (
    <View style={[cs.card, isDone && cs.cardDone]}>
      <View style={cs.cardMain}>
        {/* チェックボックス */}
        <CheckBox done={isDone} onPress={onToggleDone} />

        {/* コンテンツ */}
        <View style={cs.cardBody}>
          {/* タイトル行 */}
          <View style={cs.titleRow}>
            <Text style={[cs.title, isDone && cs.titleDone]} numberOfLines={2}>{task.title}</Text>
            <View style={[cs.priorityTag, { backgroundColor: pc.bg, borderColor: pc.border }]}>
              <Text style={[cs.priorityTagTxt, { color: pc.text }]}>{PRIORITY_LABEL[task.priority]}</Text>
            </View>
          </View>

          {/* 得られる価値 */}
          {task.leverage && !isDone ? (
            <Text style={cs.leverage} numberOfLines={2}>{task.leverage}</Text>
          ) : null}

          {/* メタ情報行 */}
          <View style={cs.metaRow}>
            <View style={[cs.statusTag, { backgroundColor: sc.bg }]}>
              <Text style={[cs.statusTagTxt, { color: sc.text }]}>{STATUS_LABEL[task.status]}</Text>
            </View>
            {task.deadline_time ? (
              <Text style={cs.metaChip}>⏰ {task.deadline_time}</Text>
            ) : null}
            {task.estimated_minutes ? (
              <Text style={cs.metaChip}>
                {task.estimated_minutes >= 60 ? `${task.estimated_minutes / 60}h` : `${task.estimated_minutes}m`}
              </Text>
            ) : null}
            <View style={cs.spacer} />
            <TouchableOpacity onPress={onEdit} style={cs.actionBtn}>
              <Text style={cs.actionBtnTxt}>編集</Text>
            </TouchableOpacity>
            {confirmDel ? (
              <>
                <TouchableOpacity onPress={onDelete} style={[cs.actionBtn, cs.actionBtnRed]}>
                  <Text style={[cs.actionBtnTxt, { color: '#DC2626' }]}>削除</Text>
                </TouchableOpacity>
                <TouchableOpacity onPress={() => setConfirmDel(false)}>
                  <Text style={cs.cancelTxt}>戻る</Text>
                </TouchableOpacity>
              </>
            ) : (
              <TouchableOpacity onPress={() => setConfirmDel(true)}>
                <Text style={cs.deleteDot}>···</Text>
              </TouchableOpacity>
            )}
          </View>

          {/* 着手中メモ */}
          {task.status === 'in_progress' && notes.length > 0 && (
            <TouchableOpacity onPress={() => setShowNotes(!showNotes)} style={cs.notesToggle}>
              <Text style={cs.notesToggleTxt}>{showNotes ? '▲ メモを閉じる' : `▼ 進捗メモ ${notes.length}件`}</Text>
            </TouchableOpacity>
          )}
          {task.status === 'in_progress' && showNotes && notes.map((n, i) => (
            <View key={i} style={[cs.noteChip, n.type === 'stuck' ? cs.noteChipStuck : cs.noteChipDoing]}>
              <Text style={cs.noteChipLabel}>{n.type === 'doing' ? '▶' : '⚠'}</Text>
              <Text style={cs.noteChipBody}>{n.body}</Text>
            </View>
          ))}

          {/* 達成/未達成の理由 */}
          {task.status === 'done' && task.achieve_reason ? (
            <Text style={cs.achieveReason}>✅ {task.achieve_reason}</Text>
          ) : null}
          {task.status === 'failed' && task.fail_reason ? (
            <Text style={cs.failReason}>❌ {task.fail_reason}</Text>
          ) : null}
        </View>
      </View>
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
  const todayJp = `${today.getMonth() + 1}月${today.getDate()}日（${'日月火水木金土'[today.getDay()]}）`;

  const loadTasks = useCallback(async () => {
    const { data, error } = await supabase
      .from('todo_tasks').select('*').eq('date', todayStr).order('priority', { ascending: false });
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

  const handleToggleDone = async (task: TodoTask) => {
    const newStatus = task.status === 'done' ? 'pending' : 'done';
    const { error } = await supabase.from('todo_tasks').update({ status: newStatus }).eq('id', task.id as string);
    if (!error) loadTasks();
  };

  const doneCount = tasks.filter((t) => t.status === 'done').length;
  const total = tasks.length;

  if (loading) return <ActivityIndicator style={{ flex: 1, backgroundColor: '#F2F4F8' }} color="#6366f1" />;

  return (
    <View style={s.container}>
      <ScrollView contentContainerStyle={s.content} showsVerticalScrollIndicator={false}>

        {/* ヘッダー */}
        <View style={s.header}>
          <View>
            <Text style={s.todayLabel}>今日のタスク</Text>
            <Text style={s.todayDate}>{todayJp}</Text>
          </View>
          <View style={s.headerRight}>
            {total > 0 && (
              <View style={s.progressPill}>
                <Text style={s.progressTxt}>{doneCount} / {total} 完了</Text>
              </View>
            )}
            <TouchableOpacity onPress={() => supabase.auth.signOut()} style={s.logoutBtn}>
              <Text style={s.logoutTxt}>ログアウト</Text>
            </TouchableOpacity>
          </View>
        </View>

        {/* 進捗バー */}
        {total > 0 && (
          <View style={s.progressBar}>
            <View style={[s.progressFill, { width: `${Math.round((doneCount / total) * 100)}%` as `${number}%` }]} />
          </View>
        )}

        {/* エラー */}
        {errorMsg && (
          <View style={s.errorBanner}>
            <Text style={s.errorText}>❌ {errorMsg}</Text>
            <TouchableOpacity onPress={() => setErrorMsg(null)}>
              <Text style={s.errorClose}>✕</Text>
            </TouchableOpacity>
          </View>
        )}

        {tasks.length === 0 && (
          <View style={s.emptyState}>
            <Text style={s.emptyIcon}>✅</Text>
            <Text style={s.emptyTitle}>今日のタスクはまだありません</Text>
            <Text style={s.emptySub}>下のボタンから追加しよう</Text>
          </View>
        )}

        {/* タスクカード */}
        {tasks.map((t) => (
          <TaskCard
            key={t.id}
            task={t}
            onEdit={() => setEditTarget(t)}
            onDelete={() => handleDelete(t)}
            onToggleDone={() => handleToggleDone(t)}
          />
        ))}
      </ScrollView>

      {/* 追加ボタン */}
      <View style={s.addBarShadow}>
        <TouchableOpacity style={s.addBtn} onPress={() => setShowAdd(true)} activeOpacity={0.85}>
          <Text style={s.addBtnTxt}>＋ タスクを追加</Text>
        </TouchableOpacity>
      </View>

      {/* 追加モーダル */}
      <Modal visible={showAdd} animationType="slide" presentationStyle="pageSheet">
        <View style={s.modalContainer}>
          <View style={s.modalHeader}>
            <Text style={s.modalTitle}>新しいタスク</Text>
            <TouchableOpacity onPress={() => setShowAdd(false)} style={s.modalClose}>
              <Text style={s.modalCloseTxt}>✕</Text>
            </TouchableOpacity>
          </View>
          <TaskForm initial={{ date: todayStr }} onSave={handleAdd} saving={saving} onCancel={() => setShowAdd(false)} />
        </View>
      </Modal>

      {/* 編集モーダル */}
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

// ── CheckBox styles ──
const cs = StyleSheet.create({
  check: {
    width: 24, height: 24, borderRadius: 12,
    borderWidth: 2, borderColor: '#CBD5E1',
    backgroundColor: '#fff',
    alignItems: 'center', justifyContent: 'center',
    marginTop: 2,
  },
  checkDone: { backgroundColor: '#6366f1', borderColor: '#6366f1' },
  checkMark: { color: '#fff', fontSize: 13, fontWeight: '800' },

  card: {
    backgroundColor: '#fff',
    borderRadius: 16,
    padding: 16,
    marginBottom: 10,
    ...Platform.select({
      ios: { shadowColor: '#6366f1', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.06, shadowRadius: 8 },
      android: { elevation: 2 },
      default: { boxShadow: '0px 2px 8px rgba(99, 102, 241, 0.06)' } as any,
    }),
  },
  cardDone: { opacity: 0.65 },
  cardMain: { flexDirection: 'row', gap: 12 },
  cardBody: { flex: 1 },
  titleRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', gap: 8, marginBottom: 6 },
  title: { flex: 1, color: '#1A1D2E', fontSize: 15, fontWeight: '600', lineHeight: 22 },
  titleDone: { textDecorationLine: 'line-through', color: '#94A3B8' },
  priorityTag: { borderWidth: 1, borderRadius: 8, paddingHorizontal: 8, paddingVertical: 3 },
  priorityTagTxt: { fontSize: 11, fontWeight: '700' },
  leverage: { color: '#64748B', fontSize: 13, lineHeight: 19, marginBottom: 8 },
  metaRow: { flexDirection: 'row', alignItems: 'center', gap: 6, flexWrap: 'wrap' },
  statusTag: { borderRadius: 6, paddingHorizontal: 8, paddingVertical: 3 },
  statusTagTxt: { fontSize: 11, fontWeight: '600' },
  metaChip: { color: '#64748B', fontSize: 12, fontWeight: '500' },
  spacer: { flex: 1 },
  actionBtn: { backgroundColor: '#F1F5F9', borderRadius: 8, paddingHorizontal: 12, paddingVertical: 5 },
  actionBtnRed: { backgroundColor: '#FEE2E2' },
  actionBtnTxt: { color: '#6366f1', fontSize: 12, fontWeight: '600' },
  cancelTxt: { color: '#94A3B8', fontSize: 12 },
  deleteDot: { color: '#94A3B8', fontSize: 20, paddingHorizontal: 4, lineHeight: 20 },

  notesToggle: { marginTop: 8 },
  notesToggleTxt: { color: '#D97706', fontSize: 12, fontWeight: '600' },
  noteChip: { flexDirection: 'row', gap: 8, borderRadius: 8, padding: 10, marginTop: 6, borderLeftWidth: 2 },
  noteChipDoing: { backgroundColor: '#EDE9FE', borderLeftColor: '#6366f1' },
  noteChipStuck: { backgroundColor: '#FEF3C7', borderLeftColor: '#F59E0B' },
  noteChipLabel: { fontSize: 13 },
  noteChipBody: { color: '#374151', fontSize: 13, flex: 1, lineHeight: 18 },
  achieveReason: { color: '#16A34A', fontSize: 13, marginTop: 8, lineHeight: 20 },
  failReason: { color: '#DC2626', fontSize: 13, marginTop: 8, lineHeight: 20 },
});

// ── Screen styles ──
const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F2F4F8' },
  content: { padding: 16, paddingBottom: 100 },

  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 12 },
  todayLabel: { color: '#1A1D2E', fontSize: 22, fontWeight: '800', marginBottom: 2 },
  todayDate: { color: '#64748B', fontSize: 13, fontWeight: '500' },
  headerRight: { alignItems: 'flex-end', gap: 6 },
  progressPill: { backgroundColor: '#EDE9FE', borderRadius: 20, paddingHorizontal: 12, paddingVertical: 4 },
  progressTxt: { color: '#6366f1', fontSize: 12, fontWeight: '700' },
  logoutBtn: { paddingVertical: 2 },
  logoutTxt: { color: '#94A3B8', fontSize: 12 },

  progressBar: { height: 5, backgroundColor: '#E2E8F0', borderRadius: 3, marginBottom: 16 },
  progressFill: { height: 5, backgroundColor: '#6366f1', borderRadius: 3 },

  errorBanner: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', backgroundColor: '#FEE2E2', borderRadius: 10, padding: 12, marginBottom: 12, borderWidth: 1, borderColor: '#FCA5A5' },
  errorText: { color: '#DC2626', fontSize: 13, flex: 1 },
  errorClose: { color: '#DC2626', fontSize: 16, paddingLeft: 8 },

  emptyState: { alignItems: 'center', paddingTop: 60, paddingBottom: 20 },
  emptyIcon: { fontSize: 48, marginBottom: 12 },
  emptyTitle: { color: '#1A1D2E', fontSize: 17, fontWeight: '700', marginBottom: 6 },
  emptySub: { color: '#94A3B8', fontSize: 14 },

  addBarShadow: {
    position: 'absolute', bottom: 0, left: 0, right: 0,
    paddingHorizontal: 16, paddingBottom: 24, paddingTop: 12,
    backgroundColor: '#F2F4F8',
    borderTopWidth: 1, borderTopColor: '#E8EBF2',
  },
  addBtn: { backgroundColor: '#6366f1', borderRadius: 14, padding: 16, alignItems: 'center' },
  addBtnTxt: { color: '#fff', fontSize: 16, fontWeight: '700' },

  modalContainer: { flex: 1, backgroundColor: '#fff' },
  modalHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: 20, paddingBottom: 12, borderBottomWidth: 1, borderBottomColor: '#F1F5F9' },
  modalTitle: { fontSize: 18, fontWeight: '800', color: '#1A1D2E' },
  modalClose: { width: 32, height: 32, borderRadius: 16, backgroundColor: '#F1F5F9', alignItems: 'center', justifyContent: 'center' },
  modalCloseTxt: { color: '#64748B', fontSize: 16, fontWeight: '700' },
});
