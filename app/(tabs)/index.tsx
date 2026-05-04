'use client';
import { useState, useEffect, useCallback } from 'react';
import {
  View, Text, TouchableOpacity, ScrollView, StyleSheet,
  Modal, ActivityIndicator, Platform, useWindowDimensions,
} from 'react-native';
import { supabase } from '../../lib/supabase';
import { type TodoTask, parseNotes } from '../../lib/types';
import TaskForm from '../../components/TaskForm';

const PRIORITY_LABEL = ['', '最低', '低', '中', '高', '最高'];
const PRIORITY_COLOR: Record<number, { bg: string; text: string; dot: string }> = {
  5: { bg: '#FEE2E2', text: '#DC2626', dot: '#EF4444' },
  4: { bg: '#FEF3C7', text: '#D97706', dot: '#F59E0B' },
  3: { bg: '#EDE9FE', text: '#7C3AED', dot: '#6366F1' },
  2: { bg: '#DCFCE7', text: '#16A34A', dot: '#22C55E' },
  1: { bg: '#F1F5F9', text: '#64748B', dot: '#94A3B8' },
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
const STATUS_KEYS = ['pending', 'in_progress', 'done', 'failed'] as const;

// ── チェックボックス ──────────────────────────────
function CheckBox({ done, onPress }: { done: boolean; onPress: () => void }) {
  return (
    <TouchableOpacity onPress={onPress} style={[r.check, done && r.checkDone]} activeOpacity={0.7} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
      {done && <Text style={r.checkMark}>✓</Text>}
    </TouchableOpacity>
  );
}

// ── タスク行（コンパクト） ────────────────────────
function TaskRow({ task, onPress, onToggleDone }: {
  task: TodoTask;
  onPress: () => void;
  onToggleDone: () => void;
}) {
  const isDone = task.status === 'done';
  const pc = PRIORITY_COLOR[task.priority] ?? PRIORITY_COLOR[3];

  return (
    <TouchableOpacity style={r.row} onPress={onPress} activeOpacity={0.6}>
      <CheckBox done={isDone} onPress={onToggleDone} />
      <View style={r.rowBody}>
        <View style={r.rowTop}>
          <Text style={[r.rowTitle, isDone && r.rowTitleDone]} numberOfLines={1}>{task.title}</Text>
          <View style={[r.pill, { backgroundColor: pc.bg }]}>
            <View style={[r.pillDot, { backgroundColor: pc.dot }]} />
            <Text style={[r.pillTxt, { color: pc.text }]}>{PRIORITY_LABEL[task.priority]}</Text>
          </View>
        </View>
        {task.leverage && !isDone ? (
          <Text style={r.rowSub} numberOfLines={1}>{task.leverage}</Text>
        ) : null}
        <View style={r.rowMeta}>
          <View style={[r.statusDot, { backgroundColor: STATUS_COLOR[task.status]?.bg }]}>
            <Text style={[r.statusDotTxt, { color: STATUS_COLOR[task.status]?.text }]}>{STATUS_LABEL[task.status]}</Text>
          </View>
          {task.deadline_time ? <Text style={r.metaTxt}>⏰ {task.deadline_time}</Text> : null}
          {task.estimated_minutes ? (
            <Text style={r.metaTxt}>{task.estimated_minutes >= 60 ? `${task.estimated_minutes / 60}h` : `${task.estimated_minutes}m`}</Text>
          ) : null}
        </View>
      </View>
    </TouchableOpacity>
  );
}

// ── タスク詳細シート ──────────────────────────────
function DetailSheet({ task, onClose, onEdit, onDelete, onStatusChange }: {
  task: TodoTask;
  onClose: () => void;
  onEdit: () => void;
  onDelete: () => void;
  onStatusChange: (status: string) => void;
}) {
  const [confirmDel, setConfirmDel] = useState(false);
  const notes = parseNotes(task.progress_notes);
  const pc = PRIORITY_COLOR[task.priority] ?? PRIORITY_COLOR[3];

  return (
    <View style={d.sheet}>
      {/* ヘッダー */}
      <View style={d.sheetHeader}>
        <Text style={d.sheetTitle} numberOfLines={2}>{task.title}</Text>
        <TouchableOpacity onPress={onClose} style={d.closeBtn}>
          <Text style={d.closeBtnTxt}>✕</Text>
        </TouchableOpacity>
      </View>

      <ScrollView style={d.scroll} contentContainerStyle={d.scrollContent} showsVerticalScrollIndicator={false}>
        {/* ステータス切替 */}
        <View style={d.section}>
          <Text style={d.sectionLabel}>ステータス</Text>
          <View style={d.statusRow}>
            {STATUS_KEYS.map((key) => {
              const sc = STATUS_COLOR[key];
              const active = task.status === key;
              return (
                <TouchableOpacity
                  key={key}
                  onPress={() => onStatusChange(key)}
                  style={[d.statusBtn, active && { backgroundColor: sc.bg, borderColor: sc.text }]}
                >
                  <Text style={[d.statusBtnTxt, active && { color: sc.text, fontWeight: '700' }]}>{STATUS_LABEL[key]}</Text>
                </TouchableOpacity>
              );
            })}
          </View>
        </View>

        {/* メタ情報 */}
        <View style={d.metaGrid}>
          <View style={d.metaItem}>
            <Text style={d.metaLabel}>優先度</Text>
            <View style={[d.metaVal, { backgroundColor: pc.bg }]}>
              <View style={[d.metaDot, { backgroundColor: pc.dot }]} />
              <Text style={[d.metaValTxt, { color: pc.text }]}>{PRIORITY_LABEL[task.priority]}</Text>
            </View>
          </View>
          {task.deadline_time ? (
            <View style={d.metaItem}>
              <Text style={d.metaLabel}>締切時刻</Text>
              <Text style={d.metaValPlain}>⏰ {task.deadline_time}</Text>
            </View>
          ) : null}
          {task.estimated_minutes ? (
            <View style={d.metaItem}>
              <Text style={d.metaLabel}>所要時間</Text>
              <Text style={d.metaValPlain}>{task.estimated_minutes >= 60 ? `${task.estimated_minutes / 60}h` : `${task.estimated_minutes}m`}</Text>
            </View>
          ) : null}
        </View>

        {/* 得られる価値 */}
        {task.leverage ? (
          <View style={d.section}>
            <Text style={d.sectionLabel}>得られる価値</Text>
            <View style={d.leverageBox}>
              <Text style={d.leverageTxt}>{task.leverage}</Text>
            </View>
          </View>
        ) : null}

        {/* 説明 */}
        {task.description ? (
          <View style={d.section}>
            <Text style={d.sectionLabel}>詳細</Text>
            <Text style={d.descTxt}>{task.description}</Text>
          </View>
        ) : null}

        {/* 進捗メモ */}
        {notes.length > 0 ? (
          <View style={d.section}>
            <Text style={d.sectionLabel}>進捗メモ</Text>
            {notes.map((n, i) => (
              <View key={i} style={[d.noteChip, n.type === 'stuck' ? d.noteChipStuck : d.noteChipDoing]}>
                <Text style={d.noteLabel}>{n.type === 'doing' ? '▶' : '⚠'}</Text>
                <Text style={d.noteBody}>{n.body}</Text>
              </View>
            ))}
          </View>
        ) : null}

        {/* 未達成/達成の理由 */}
        {task.status === 'failed' && task.fail_reason ? (
          <View style={d.section}>
            <Text style={d.sectionLabel}>❌ 達成できなかった理由</Text>
            <View style={d.failBox}><Text style={d.failTxt}>{task.fail_reason}</Text></View>
          </View>
        ) : null}
        {task.status === 'done' && task.achieve_reason ? (
          <View style={d.section}>
            <Text style={d.sectionLabel}>✅ 達成できた理由</Text>
            <View style={d.achieveBox}><Text style={d.achieveTxt}>{task.achieve_reason}</Text></View>
          </View>
        ) : null}
      </ScrollView>

      {/* アクション */}
      <View style={d.actionBar}>
        <TouchableOpacity style={d.editBtn} onPress={onEdit}>
          <Text style={d.editBtnTxt}>編集する</Text>
        </TouchableOpacity>
        {confirmDel ? (
          <View style={d.confirmRow}>
            <TouchableOpacity style={d.delConfirmBtn} onPress={onDelete}>
              <Text style={d.delConfirmTxt}>削除する</Text>
            </TouchableOpacity>
            <TouchableOpacity onPress={() => setConfirmDel(false)}>
              <Text style={d.cancelTxt}>キャンセル</Text>
            </TouchableOpacity>
          </View>
        ) : (
          <TouchableOpacity style={d.delBtn} onPress={() => setConfirmDel(true)}>
            <Text style={d.delBtnTxt}>削除</Text>
          </TouchableOpacity>
        )}
      </View>
    </View>
  );
}

// ── メイン画面 ────────────────────────────────────
export default function TodayScreen() {
  const [tasks, setTasks] = useState<TodoTask[]>([]);
  const [loading, setLoading] = useState(true);
  const [showAdd, setShowAdd] = useState(false);
  const [detailTask, setDetailTask] = useState<TodoTask | null>(null);
  const [editTarget, setEditTarget] = useState<TodoTask | null>(null);
  const [saving, setSaving] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const { width } = useWindowDimensions();
  const isWide = width >= 768;

  const today = new Date();
  const todayStr = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;
  const DOW = ['日', '月', '火', '水', '木', '金', '土'];
  const todayJp = `${today.getMonth() + 1}月${today.getDate()}日（${DOW[today.getDay()]}）`;

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
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) { setSaving(false); return; }
    await supabase.from('todo_tasks').insert({ ...task, user_id: user.id });
    setShowAdd(false);
    loadTasks();
    setSaving(false);
  };

  const handleEdit = async (task: TodoTask) => {
    setSaving(true);
    await supabase.from('todo_tasks').update({
      title: task.title, description: task.description, leverage: task.leverage,
      priority: task.priority, status: task.status,
      achieve_reason: task.achieve_reason, fail_reason: task.fail_reason,
      due_date: task.due_date, deadline_time: task.deadline_time,
      estimated_minutes: task.estimated_minutes, progress_notes: task.progress_notes,
    }).eq('id', task.id as string);
    setEditTarget(null);
    setDetailTask(null);
    loadTasks();
    setSaving(false);
  };

  const handleDelete = async (task: TodoTask) => {
    await supabase.from('todo_tasks').delete().eq('id', task.id as string);
    setDetailTask(null);
    loadTasks();
  };

  const handleToggleDone = async (task: TodoTask) => {
    const s = task.status === 'done' ? 'pending' : 'done';
    await supabase.from('todo_tasks').update({ status: s }).eq('id', task.id as string);
    loadTasks();
  };

  const handleStatusChange = async (task: TodoTask, status: string) => {
    await supabase.from('todo_tasks').update({ status }).eq('id', task.id as string);
    setDetailTask((prev) => prev ? { ...prev, status: status as TodoTask['status'] } : null);
    loadTasks();
  };

  const doneCount = tasks.filter((t) => t.status === 'done').length;
  const total = tasks.length;
  const rate = total > 0 ? Math.round((doneCount / total) * 100) : 0;

  if (loading) return <ActivityIndicator style={{ flex: 1, backgroundColor: '#F2F4F8' }} color="#6366f1" />;

  const taskList = (
    <ScrollView contentContainerStyle={s.listContent} showsVerticalScrollIndicator={false}>
      {/* ヘッダー */}
      <View style={s.header}>
        <View>
          <Text style={s.headTitle}>今日のタスク</Text>
          <Text style={s.headDate}>{todayJp}</Text>
        </View>
        <View style={s.headRight}>
          {total > 0 && (
            <View style={s.pill}>
              <Text style={s.pillTxt}>{doneCount}/{total} 完了</Text>
            </View>
          )}
          <TouchableOpacity onPress={() => supabase.auth.signOut()}>
            <Text style={s.logoutTxt}>ログアウト</Text>
          </TouchableOpacity>
        </View>
      </View>

      {/* 進捗バー */}
      {total > 0 && (
        <View style={s.barWrap}>
          <View style={s.barBg}>
            <View style={[s.barFill, { width: `${rate}%` as `${number}%` }]} />
          </View>
          <Text style={s.barPct}>{rate}%</Text>
        </View>
      )}

      {errorMsg && (
        <View style={s.errorBanner}>
          <Text style={s.errorTxt}>⚠ {errorMsg}</Text>
          <TouchableOpacity onPress={() => setErrorMsg(null)}><Text style={s.errorClose}>✕</Text></TouchableOpacity>
        </View>
      )}

      {/* タスクリスト */}
      <View style={s.taskList}>
        {tasks.length === 0 ? (
          <View style={s.empty}>
            <Text style={s.emptyIcon}>☀️</Text>
            <Text style={s.emptyTitle}>今日のタスクを追加しよう</Text>
          </View>
        ) : (
          tasks.map((t, i) => (
            <View key={t.id}>
              <TaskRow
                task={t}
                onPress={() => setDetailTask(t)}
                onToggleDone={() => handleToggleDone(t)}
              />
              {i < tasks.length - 1 && <View style={s.divider} />}
            </View>
          ))
        )}
      </View>
    </ScrollView>
  );

  return (
    <View style={s.container}>
      {isWide ? (
        /* ── ワイド：2カラム ── */
        <View style={s.wide}>
          <View style={s.wideLeft}>
            {taskList}
            <TouchableOpacity style={s.addBtnWide} onPress={() => setShowAdd(true)}>
              <Text style={s.addBtnTxt}>＋ タスクを追加</Text>
            </TouchableOpacity>
          </View>
          {detailTask ? (
            <View style={s.wideRight}>
              <DetailSheet
                task={detailTask}
                onClose={() => setDetailTask(null)}
                onEdit={() => { setEditTarget(detailTask); }}
                onDelete={() => handleDelete(detailTask)}
                onStatusChange={(st) => handleStatusChange(detailTask, st)}
              />
            </View>
          ) : (
            <View style={s.wideRightEmpty}>
              <Text style={s.wideRightEmptyTxt}>タスクを選択すると詳細が表示されます</Text>
            </View>
          )}
        </View>
      ) : (
        /* ── モバイル：フル ── */
        <View style={{ flex: 1 }}>
          {taskList}
          <View style={s.addBarMobile}>
            <TouchableOpacity style={s.addBtnMobile} onPress={() => setShowAdd(true)}>
              <Text style={s.addBtnTxt}>＋ タスクを追加</Text>
            </TouchableOpacity>
          </View>
          {detailTask && (
            <Modal visible animationType="slide" presentationStyle="pageSheet">
              <DetailSheet
                task={detailTask}
                onClose={() => setDetailTask(null)}
                onEdit={() => { setEditTarget(detailTask); setDetailTask(null); }}
                onDelete={() => handleDelete(detailTask)}
                onStatusChange={(st) => handleStatusChange(detailTask, st)}
              />
            </Modal>
          )}
        </View>
      )}

      {/* 追加モーダル */}
      <Modal visible={showAdd} animationType="slide" presentationStyle="pageSheet">
        <View style={s.modalWrap}>
          <View style={s.modalHead}>
            <Text style={s.modalTitle}>新しいタスク</Text>
            <TouchableOpacity onPress={() => setShowAdd(false)} style={s.modalX}>
              <Text style={s.modalXTxt}>✕</Text>
            </TouchableOpacity>
          </View>
          <TaskForm initial={{ date: todayStr }} onSave={handleAdd} saving={saving} onCancel={() => setShowAdd(false)} />
        </View>
      </Modal>

      {/* 編集モーダル */}
      {editTarget && (
        <Modal visible animationType="slide" presentationStyle="pageSheet">
          <View style={s.modalWrap}>
            <View style={s.modalHead}>
              <Text style={s.modalTitle}>タスクを編集</Text>
              <TouchableOpacity onPress={() => setEditTarget(null)} style={s.modalX}>
                <Text style={s.modalXTxt}>✕</Text>
              </TouchableOpacity>
            </View>
            <TaskForm initial={editTarget} onSave={handleEdit} saving={saving} onCancel={() => setEditTarget(null)} />
          </View>
        </Modal>
      )}
    </View>
  );
}

// ─── Row styles ───────────────────────────────────────
const r = StyleSheet.create({
  check: { width: 22, height: 22, borderRadius: 11, borderWidth: 2, borderColor: '#CBD5E1', backgroundColor: '#fff', alignItems: 'center', justifyContent: 'center', marginTop: 1, flexShrink: 0 },
  checkDone: { backgroundColor: '#6366f1', borderColor: '#6366f1' },
  checkMark: { color: '#fff', fontSize: 12, fontWeight: '800' },
  row: { flexDirection: 'row', alignItems: 'flex-start', gap: 12, paddingVertical: 14, paddingHorizontal: 16 },
  rowBody: { flex: 1 },
  rowTop: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8, marginBottom: 4 },
  rowTitle: { flex: 1, color: '#1A1D2E', fontSize: 15, fontWeight: '600' },
  rowTitleDone: { textDecorationLine: 'line-through', color: '#94A3B8' },
  pill: { flexDirection: 'row', alignItems: 'center', gap: 4, borderRadius: 8, paddingHorizontal: 8, paddingVertical: 3, flexShrink: 0 },
  pillDot: { width: 6, height: 6, borderRadius: 3 },
  pillTxt: { fontSize: 11, fontWeight: '700' },
  rowSub: { color: '#94A3B8', fontSize: 12, marginBottom: 6, lineHeight: 16 },
  rowMeta: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  statusDot: { borderRadius: 6, paddingHorizontal: 7, paddingVertical: 2 },
  statusDotTxt: { fontSize: 11, fontWeight: '600' },
  metaTxt: { color: '#94A3B8', fontSize: 12 },
});

// ─── Detail Sheet styles ──────────────────────────────
const d = StyleSheet.create({
  sheet: { flex: 1, backgroundColor: '#fff' },
  sheetHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', padding: 20, paddingBottom: 16, borderBottomWidth: 1, borderBottomColor: '#F1F5F9' },
  sheetTitle: { flex: 1, color: '#1A1D2E', fontSize: 17, fontWeight: '800', lineHeight: 24, paddingRight: 12 },
  closeBtn: { width: 30, height: 30, borderRadius: 15, backgroundColor: '#F1F5F9', alignItems: 'center', justifyContent: 'center', flexShrink: 0 },
  closeBtnTxt: { color: '#64748B', fontSize: 14, fontWeight: '700' },
  scroll: { flex: 1 },
  scrollContent: { padding: 20, gap: 20, paddingBottom: 8 },
  section: { gap: 8 },
  sectionLabel: { color: '#64748B', fontSize: 12, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.5 },
  statusRow: { flexDirection: 'row', gap: 8, flexWrap: 'wrap' },
  statusBtn: { flex: 1, minWidth: 70, paddingVertical: 8, borderRadius: 10, borderWidth: 1.5, borderColor: '#E2E8F0', alignItems: 'center' },
  statusBtnTxt: { fontSize: 12, color: '#94A3B8', fontWeight: '500' },
  metaGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 12 },
  metaItem: { gap: 4 },
  metaLabel: { color: '#94A3B8', fontSize: 11, fontWeight: '600' },
  metaVal: { flexDirection: 'row', alignItems: 'center', gap: 5, borderRadius: 8, paddingHorizontal: 8, paddingVertical: 4 },
  metaDot: { width: 7, height: 7, borderRadius: 4 },
  metaValTxt: { fontSize: 13, fontWeight: '700' },
  metaValPlain: { color: '#374151', fontSize: 13, fontWeight: '600' },
  leverageBox: { backgroundColor: '#F8F9FF', borderRadius: 10, padding: 14, borderLeftWidth: 3, borderLeftColor: '#6366f1' },
  leverageTxt: { color: '#374151', fontSize: 14, lineHeight: 22 },
  descTxt: { color: '#64748B', fontSize: 14, lineHeight: 22 },
  noteChip: { flexDirection: 'row', gap: 8, borderRadius: 8, padding: 10, borderLeftWidth: 2 },
  noteChipDoing: { backgroundColor: '#EDE9FE', borderLeftColor: '#6366f1' },
  noteChipStuck: { backgroundColor: '#FEF3C7', borderLeftColor: '#F59E0B' },
  noteLabel: { fontSize: 13 },
  noteBody: { flex: 1, color: '#374151', fontSize: 13, lineHeight: 18 },
  failBox: { backgroundColor: '#FEF2F2', borderRadius: 10, padding: 14, borderLeftWidth: 3, borderLeftColor: '#EF4444' },
  failTxt: { color: '#374151', fontSize: 14, lineHeight: 22 },
  achieveBox: { backgroundColor: '#F0FDF4', borderRadius: 10, padding: 14, borderLeftWidth: 3, borderLeftColor: '#22C55E' },
  achieveTxt: { color: '#374151', fontSize: 14, lineHeight: 22 },
  actionBar: { flexDirection: 'row', gap: 12, padding: 16, paddingBottom: 28, borderTopWidth: 1, borderTopColor: '#F1F5F9', alignItems: 'center' },
  editBtn: { flex: 1, backgroundColor: '#6366f1', borderRadius: 12, padding: 14, alignItems: 'center' },
  editBtnTxt: { color: '#fff', fontSize: 15, fontWeight: '700' },
  delBtn: { backgroundColor: '#F1F5F9', borderRadius: 12, paddingHorizontal: 16, padding: 14 },
  delBtnTxt: { color: '#64748B', fontSize: 14, fontWeight: '600' },
  confirmRow: { flexDirection: 'row', gap: 10, alignItems: 'center' },
  delConfirmBtn: { backgroundColor: '#FEE2E2', borderRadius: 10, paddingHorizontal: 14, paddingVertical: 12 },
  delConfirmTxt: { color: '#DC2626', fontWeight: '700', fontSize: 13 },
  cancelTxt: { color: '#94A3B8', fontSize: 13 },
});

// ─── Screen styles ────────────────────────────────────
const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F2F4F8' },

  // リスト
  listContent: { paddingBottom: 100 },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', padding: 20, paddingBottom: 12 },
  headTitle: { color: '#1A1D2E', fontSize: 24, fontWeight: '800', marginBottom: 2 },
  headDate: { color: '#94A3B8', fontSize: 13 },
  headRight: { alignItems: 'flex-end', gap: 6 },
  pill: { backgroundColor: '#EDE9FE', borderRadius: 20, paddingHorizontal: 12, paddingVertical: 4 },
  pillTxt: { color: '#6366f1', fontSize: 12, fontWeight: '700' },
  logoutTxt: { color: '#CBD5E1', fontSize: 12 },

  barWrap: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 20, marginBottom: 12 },
  barBg: { flex: 1, height: 6, backgroundColor: '#E2E8F0', borderRadius: 3 },
  barFill: { height: 6, backgroundColor: '#6366f1', borderRadius: 3 },
  barPct: { color: '#6366f1', fontSize: 12, fontWeight: '700', width: 36, textAlign: 'right' },

  errorBanner: { marginHorizontal: 16, marginBottom: 12, flexDirection: 'row', backgroundColor: '#FEE2E2', borderRadius: 10, padding: 12, borderWidth: 1, borderColor: '#FCA5A5', alignItems: 'center', gap: 8 },
  errorTxt: { flex: 1, color: '#DC2626', fontSize: 13 },
  errorClose: { color: '#DC2626', fontSize: 16 },

  taskList: { backgroundColor: '#fff', marginHorizontal: 16, borderRadius: 16, ...Platform.select({ ios: { shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.06, shadowRadius: 8 }, android: { elevation: 2 }, default: { boxShadow: '0 2px 8px rgba(0,0,0,0.06)' } as any }) },
  divider: { height: 1, backgroundColor: '#F8FAFC', marginLeft: 50 },

  empty: { alignItems: 'center', paddingVertical: 48 },
  emptyIcon: { fontSize: 40, marginBottom: 12 },
  emptyTitle: { color: '#94A3B8', fontSize: 15 },

  // 追加ボタン
  addBarMobile: { position: 'absolute', bottom: 0, left: 0, right: 0, paddingHorizontal: 16, paddingBottom: 24, paddingTop: 10, backgroundColor: '#F2F4F8', borderTopWidth: 1, borderTopColor: '#E8EBF2' },
  addBtnMobile: { backgroundColor: '#6366f1', borderRadius: 14, padding: 16, alignItems: 'center' },
  addBtnWide: { margin: 16, marginTop: 8, backgroundColor: '#6366f1', borderRadius: 12, padding: 14, alignItems: 'center' },
  addBtnTxt: { color: '#fff', fontSize: 15, fontWeight: '700' },

  // ワイド2カラム
  wide: { flex: 1, flexDirection: 'row' },
  wideLeft: { flex: 1, borderRightWidth: 1, borderRightColor: '#E8EBF2' },
  wideRight: { width: 380, backgroundColor: '#fff' },
  wideRightEmpty: { width: 380, backgroundColor: '#fff', alignItems: 'center', justifyContent: 'center' },
  wideRightEmptyTxt: { color: '#CBD5E1', fontSize: 14 },

  // モーダル
  modalWrap: { flex: 1, backgroundColor: '#fff' },
  modalHead: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: 20, paddingBottom: 12, borderBottomWidth: 1, borderBottomColor: '#F1F5F9' },
  modalTitle: { fontSize: 18, fontWeight: '800', color: '#1A1D2E' },
  modalX: { width: 32, height: 32, borderRadius: 16, backgroundColor: '#F1F5F9', alignItems: 'center', justifyContent: 'center' },
  modalXTxt: { color: '#64748B', fontSize: 15, fontWeight: '700' },
});
