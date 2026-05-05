import { useState, useEffect, useCallback, useRef } from 'react';
import {
  View, Text, TouchableOpacity, ScrollView, StyleSheet,
  TextInput, ActivityIndicator, Modal,
} from 'react-native';
import OpenAI from 'openai';
import { supabase } from '../lib/supabase';
import { type TodoTask, DEFAULT_TASK, parseNotes } from '../lib/types';
import TaskForm from './TaskForm';

// ── 定数 ─────────────────────────────────────────────────────────
const C = {
  bg:        '#F8FAFC',
  sidebar:   '#FFFFFF',
  panel:     '#FFFFFF',
  card:      '#FFFFFF',
  border:    '#E5E7EB',
  primary:   '#4F46E5',
  primaryBg: '#EEF2FF',
  text:      '#111827',
  sub:       '#6B7280',
  muted:     '#9CA3AF',
  done:      '#D1D5DB',
};

const PRIORITY_LABEL = ['', '最低', '低', '中', '高', '最高'];
const PRIORITY_STYLE: Record<number, { bg: string; text: string; dot: string }> = {
  5: { bg: '#FEE2E2', text: '#DC2626', dot: '#EF4444' },
  4: { bg: '#FEF3C7', text: '#D97706', dot: '#F59E0B' },
  3: { bg: '#EEF2FF', text: '#4F46E5', dot: '#6366F1' },
  2: { bg: '#DCFCE7', text: '#16A34A', dot: '#22C55E' },
  1: { bg: '#F3F4F6', text: '#6B7280', dot: '#9CA3AF' },
};
const STATUS_STYLE: Record<string, { bg: string; text: string; label: string }> = {
  pending:     { bg: '#F3F4F6', text: '#6B7280', label: '未着手' },
  in_progress: { bg: '#FEF3C7', text: '#D97706', label: '着手中' },
  done:        { bg: '#DCFCE7', text: '#16A34A', label: '達成' },
  failed:      { bg: '#FEE2E2', text: '#DC2626', label: '未達成' },
};

type NavKey = 'all' | 'today' | 'in_progress' | 'done' | 'important' | 'ai' | 'review' | 'calendar' | 'templates';
type FilterKey = 'all' | 'active' | 'done';
type AIChatMsg = { role: 'user' | 'assistant'; content: string };

const openai = new OpenAI({
  apiKey: process.env.EXPO_PUBLIC_OPENAI_API_KEY,
  dangerouslyAllowBrowser: true,
});

function localDateStr(d = new Date()) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}
function relDate(dateStr: string) {
  const today = localDateStr();
  const tomorrow = localDateStr(new Date(Date.now() + 86400000));
  if (dateStr === today) return { label: '今日', color: '#DC2626' };
  if (dateStr === tomorrow) return { label: '明日', color: '#D97706' };
  const [, m, d] = dateStr.split('-');
  return { label: `${parseInt(m)}月${parseInt(d)}日`, color: C.sub };
}

// ── サイドバー ────────────────────────────────────────────────────
function Sidebar({ nav, setNav, counts, onAdd, onLogout, userEmail }: {
  nav: NavKey;
  setNav: (n: NavKey) => void;
  counts: Record<string, number>;
  onAdd: () => void;
  onLogout: () => void;
  userEmail: string;
}) {
  const navItems: { key: NavKey; icon: string; label: string; countKey: string }[] = [
    { key: 'all',         icon: '📋', label: 'すべてのタスク',  countKey: 'all' },
    { key: 'today',       icon: '📅', label: '今日のタスク',    countKey: 'today' },
    { key: 'in_progress', icon: '🔄', label: '着手中',          countKey: 'in_progress' },
    { key: 'done',        icon: '✅', label: '完了したタスク',   countKey: 'done' },
    { key: 'important',   icon: '⭐', label: '重要なタスク',    countKey: 'important' },
    { key: 'calendar',    icon: '📆', label: 'カレンダー',       countKey: 'all' },
    { key: 'templates',   icon: '🏆', label: '殿堂入り',         countKey: 'templates' },
  ];

  return (
    <View style={sb.wrap}>
      {/* ロゴ */}
      <View style={sb.logo}>
        <View style={sb.logoIcon}><Text style={sb.logoIconTxt}>✓</Text></View>
        <Text style={sb.logoTxt}>Todo Tracker</Text>
      </View>

      {/* 追加ボタン */}
      <TouchableOpacity style={sb.addBtn} onPress={onAdd} activeOpacity={0.85}>
        <Text style={sb.addBtnTxt}>＋ 新しいタスク</Text>
      </TouchableOpacity>

      {/* ナビ */}
      <ScrollView style={sb.navScroll} showsVerticalScrollIndicator={false}>
        <View style={sb.section}>
          {navItems.map(({ key, icon, label, countKey }) => {
            const active = nav === key;
            const count = counts[countKey] ?? 0;
            return (
              <TouchableOpacity
                key={key}
                style={[sb.navItem, active && sb.navItemActive]}
                onPress={() => setNav(key)}
                activeOpacity={0.7}
              >
                <Text style={sb.navIcon}>{icon}</Text>
                <Text style={[sb.navLabel, active && sb.navLabelActive]}>{label}</Text>
                {count > 0 && (
                  <View style={[sb.navBadge, active && sb.navBadgeActive]}>
                    <Text style={[sb.navBadgeTxt, active && sb.navBadgeTxtActive]}>{count}</Text>
                  </View>
                )}
              </TouchableOpacity>
            );
          })}
        </View>

        {/* 振り返り・AI */}
        <View style={sb.divider} />
        <TouchableOpacity
          style={[sb.navItem, nav === 'review' && sb.navItemActive]}
          onPress={() => setNav('review')}
          activeOpacity={0.7}
        >
          <Text style={sb.navIcon}>🔍</Text>
          <Text style={[sb.navLabel, nav === 'review' && sb.navLabelActive]}>振り返り</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[sb.aiBox, nav === 'ai' && sb.aiBoxActive]}
          onPress={() => setNav('ai')}
          activeOpacity={0.8}
        >
          <View style={sb.aiBoxHeader}>
            <Text style={sb.aiBoxIcon}>✦</Text>
            <Text style={[sb.aiBoxTitle, nav === 'ai' && { color: C.primary }]}>AI 診断</Text>
          </View>
          <Text style={sb.aiBoxSub}>タスクをAIが分析・改善</Text>
        </TouchableOpacity>
      </ScrollView>

      {/* ユーザー */}
      <View style={sb.userRow}>
        <View style={sb.userAvatar}>
          <Text style={sb.userAvatarTxt}>{userEmail[0]?.toUpperCase() ?? 'U'}</Text>
        </View>
        <View style={sb.userInfo}>
          <Text style={sb.userEmail} numberOfLines={1}>{userEmail}</Text>
        </View>
        <TouchableOpacity onPress={onLogout}>
          <Text style={sb.logoutTxt}>ログアウト</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

// ── タスク行 ──────────────────────────────────────────────────────
function TaskRow({ task, selected, onSelect, onToggleDone, onDuplicate }: {
  task: TodoTask;
  selected: boolean;
  onSelect: () => void;
  onToggleDone: () => void;
  onDuplicate: () => void;
}) {
  const isDone = task.status === 'done';
  const ps = PRIORITY_STYLE[task.priority] ?? PRIORITY_STYLE[3];
  const rd = relDate(task.date);

  return (
    <TouchableOpacity
      style={[tr.row, selected && tr.rowSelected]}
      onPress={onSelect}
      activeOpacity={0.7}
    >
      {/* チェック */}
      <TouchableOpacity
        style={[tr.check, isDone && tr.checkDone]}
        onPress={(e) => { e.stopPropagation?.(); onToggleDone(); }}
        hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
      >
        {isDone && <Text style={tr.checkMark}>✓</Text>}
      </TouchableOpacity>

      {/* タイトル */}
      <Text style={[tr.title, isDone && tr.titleDone]} numberOfLines={1}>{task.title}</Text>

      {/* 優先度バッジ */}
      <View style={[tr.priorityBadge, { backgroundColor: ps.bg }]}>
        <Text style={[tr.priorityBadgeTxt, { color: ps.text }]}>{PRIORITY_LABEL[task.priority]}</Text>
      </View>

      {/* 日付 */}
      <Text style={[tr.date, { color: rd.color }]}>{rd.label}</Text>

      {/* ステータスドット */}
      {task.status !== 'pending' && (
        <View style={[tr.statusDot, { backgroundColor: STATUS_STYLE[task.status]?.bg }]}>
          <Text style={[tr.statusDotTxt, { color: STATUS_STYLE[task.status]?.text }]}>
            {STATUS_STYLE[task.status]?.label}
          </Text>
        </View>
      )}

      {/* 複製ボタン */}
      <TouchableOpacity
        style={tr.dupBtn}
        onPress={(e) => { e.stopPropagation?.(); onDuplicate(); }}
        hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
      >
        <Text style={tr.dupTxt}>⧉</Text>
      </TouchableOpacity>
    </TouchableOpacity>
  );
}

// ── AI チャット（詳細パネル内） ───────────────────────────────────
const QUICK_QS = ['このタスクを完了するコツは？', '類似タスクの成功パターンは？', '先延ばしを防ぐには？'];

function AIMiniChat({ task }: { task: TodoTask }) {
  const [messages, setMessages] = useState<AIChatMsg[]>([]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);

  const send = async (text: string) => {
    if (!text.trim() || loading) return;
    setInput('');
    setLoading(true);
    const next: AIChatMsg[] = [...messages, { role: 'user', content: text }];
    setMessages(next);
    const { data } = await supabase.from('todo_tasks')
      .select('date,title,status,fail_reason,achieve_reason')
      .order('date', { ascending: false }).limit(14);
    const history = data?.map((t) => `[${t.date}] ${t.title} → ${t.status}`).join('\n') ?? '';
    const res = await openai.chat.completions.create({
      model: 'gpt-4o-mini',
      messages: [
        { role: 'system', content: `タスク「${task.title}」についてのコーチ。\n過去記録:\n${history}\n短く日本語で答える。` },
        ...next,
      ],
    });
    setMessages([...next, { role: 'assistant', content: res.choices[0].message.content ?? '' }]);
    setLoading(false);
  };

  return (
    <View style={ai.wrap}>
      <View style={ai.header}>
        <Text style={ai.title}>AIに質問する</Text>
        <View style={ai.betaBadge}><Text style={ai.betaTxt}>Beta</Text></View>
      </View>
      {messages.length === 0 && (
        <View style={ai.quickWrap}>
          {QUICK_QS.map((q) => (
            <TouchableOpacity key={q} style={ai.quickBtn} onPress={() => send(q)}>
              <Text style={ai.quickTxt}>{q}</Text>
            </TouchableOpacity>
          ))}
        </View>
      )}
      {messages.map((m, i) => (
        <View key={i} style={[ai.bubble, m.role === 'user' ? ai.bubbleUser : ai.bubbleAI]}>
          <Text style={[ai.bubbleTxt, m.role === 'user' && { color: '#fff' }]}>{m.content}</Text>
        </View>
      ))}
      {loading && <ActivityIndicator color={C.primary} style={{ marginVertical: 8 }} />}
      <View style={ai.inputRow}>
        <TextInput
          style={ai.input}
          value={input}
          onChangeText={setInput}
          placeholder="質問を入力..."
          placeholderTextColor={C.muted}
          onSubmitEditing={() => send(input)}
          returnKeyType="send"
        />
        <TouchableOpacity style={ai.sendBtn} onPress={() => send(input)} disabled={loading}>
          <Text style={ai.sendTxt}>➤</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

// ── 詳細パネル（インライン編集対応） ─────────────────────────────
const PRIORITY_LABELS_DP = ['最低', '低', '中', '高', '最高'];

function DetailPanel({ task, onClose, onSave, onOpenModal, onDelete, onDuplicate, onAddTemplate }: {
  task: TodoTask;
  onClose: () => void;
  onSave: (t: TodoTask) => Promise<void>;
  onOpenModal: () => void;
  onDelete: () => void;
  onDuplicate: () => void;
  onAddTemplate: () => void;
}) {
  const [local, setLocal] = useState<TodoTask>(task);
  const [saving, setSaving] = useState(false);
  const [confirmDel, setConfirmDel] = useState(false);

  // タスクが切り替わったらローカル状態をリセット
  useEffect(() => { setLocal(task); setConfirmDel(false); }, [task.id]);

  const upd = <K extends keyof TodoTask>(key: K, val: TodoTask[K]) =>
    setLocal((prev) => ({ ...prev, [key]: val }));

  const isDirty = JSON.stringify(local) !== JSON.stringify(task);

  const handleSave = async () => {
    setSaving(true);
    await onSave(local);
    setSaving(false);
  };

  const notes = parseNotes(local.progress_notes);

  return (
    <View style={dp.wrap}>
      {/* ヘッダー */}
      <View style={dp.header}>
        <View style={{ flex: 1, paddingRight: 12 }}>
          <TextInput
            style={dp.titleInput}
            value={local.title}
            onChangeText={(v) => upd('title', v)}
            placeholder="タスク名"
            placeholderTextColor={C.muted}
            multiline
          />
        </View>
        <TouchableOpacity onPress={onClose} style={dp.closeBtn}>
          <Text style={dp.closeTxt}>✕</Text>
        </TouchableOpacity>
      </View>

      <ScrollView style={dp.scroll} contentContainerStyle={dp.scrollContent} showsVerticalScrollIndicator={false}>

        {/* ステータス */}
        <View style={dp.section}>
          <Text style={dp.sectionTitle}>ステータス</Text>
          <View style={dp.statusRow}>
            {Object.entries(STATUS_STYLE).map(([key, val]) => {
              const active = local.status === key;
              return (
                <TouchableOpacity
                  key={key}
                  onPress={() => upd('status', key as TodoTask['status'])}
                  style={[dp.statusBtn, active && { backgroundColor: val.bg, borderColor: val.text }]}
                >
                  <Text style={[dp.statusBtnTxt, active && { color: val.text, fontWeight: '700' }]}>{val.label}</Text>
                </TouchableOpacity>
              );
            })}
          </View>
        </View>

        {/* 優先度 */}
        <View style={dp.section}>
          <Text style={dp.sectionTitle}>優先度</Text>
          <View style={dp.priorityRow}>
            {PRIORITY_LABELS_DP.map((label, i) => {
              const level = i + 1;
              const ps = PRIORITY_STYLE[level];
              const active = local.priority === level;
              return (
                <TouchableOpacity
                  key={level}
                  onPress={() => upd('priority', level)}
                  style={[dp.priorityBtn, active && { backgroundColor: ps.bg, borderColor: ps.dot }]}
                >
                  {active && <View style={[dp.priorityDot, { backgroundColor: ps.dot }]} />}
                  <Text style={[dp.priorityBtnTxt, active && { color: ps.text, fontWeight: '700' }]}>{label}</Text>
                </TouchableOpacity>
              );
            })}
          </View>
        </View>

        {/* 締切・見積もり */}
        <View style={dp.twoCol}>
          <View style={{ flex: 1 }}>
            <Text style={dp.sectionTitle}>📅 締切時刻</Text>
            <TextInput
              style={dp.smallInput}
              value={local.deadline_time ?? ''}
              onChangeText={(v) => upd('deadline_time', v || null)}
              placeholder="例: 18:00"
              placeholderTextColor={C.muted}
            />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={dp.sectionTitle}>⏱ 見積もり</Text>
            <View style={dp.minRow}>
              {[15, 30, 60, 90, 120].map((m) => {
                const active = local.estimated_minutes === m;
                return (
                  <TouchableOpacity
                    key={m}
                    onPress={() => upd('estimated_minutes', active ? null : m)}
                    style={[dp.minBtn, active && dp.minBtnActive]}
                  >
                    <Text style={[dp.minBtnTxt, active && dp.minBtnTxtActive]}>
                      {m >= 60 ? `${m / 60}h` : `${m}m`}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </View>
          </View>
        </View>

        {/* 得られる価値 */}
        <View style={dp.section}>
          <Text style={dp.sectionTitle}>得られる価値</Text>
          <TextInput
            style={[dp.fieldInput, dp.fieldInputMulti]}
            value={local.leverage}
            onChangeText={(v) => upd('leverage', v)}
            placeholder="このタスクをやることでどんな価値がある？"
            placeholderTextColor={C.muted}
            multiline
            textAlignVertical="top"
          />
        </View>

        {/* 説明 */}
        <View style={dp.section}>
          <Text style={dp.sectionTitle}>説明</Text>
          <TextInput
            style={[dp.fieldInput, dp.fieldInputMulti]}
            value={local.description}
            onChangeText={(v) => upd('description', v)}
            placeholder="具体的な内容・手順など"
            placeholderTextColor={C.muted}
            multiline
            textAlignVertical="top"
          />
        </View>

        {/* 達成/未達成の理由 */}
        {local.status === 'done' && (
          <View style={dp.section}>
            <Text style={dp.sectionTitle}>✅ 達成できた理由</Text>
            <TextInput
              style={[dp.fieldInput, dp.fieldInputMulti, dp.achieveInput]}
              value={local.achieve_reason}
              onChangeText={(v) => upd('achieve_reason', v)}
              placeholder="なぜ達成できた？何が効いた？"
              placeholderTextColor="#86EFAC"
              multiline
              textAlignVertical="top"
            />
          </View>
        )}
        {local.status === 'failed' && (
          <View style={dp.section}>
            <Text style={dp.sectionTitle}>❌ 達成できなかった理由</Text>
            <TextInput
              style={[dp.fieldInput, dp.fieldInputMulti, dp.failInput]}
              value={local.fail_reason}
              onChangeText={(v) => upd('fail_reason', v)}
              placeholder="何がボトルネックだった？"
              placeholderTextColor="#FCA5A5"
              multiline
              textAlignVertical="top"
            />
          </View>
        )}

        {/* 進捗メモ（表示のみ） */}
        {notes.length > 0 && (
          <View style={dp.section}>
            <Text style={dp.sectionTitle}>進捗メモ</Text>
            {notes.map((n, i) => (
              <View key={i} style={[dp.noteChip, n.type === 'stuck' ? dp.noteChipWarn : dp.noteChipInfo]}>
                <Text style={dp.noteIcon}>{n.type === 'doing' ? '▶' : '⚠'}</Text>
                <Text style={dp.noteTxt}>{n.body}</Text>
              </View>
            ))}
          </View>
        )}

        {/* AI チャット */}
        <AIMiniChat task={local} />
      </ScrollView>

      {/* アクションバー */}
      <View style={dp.actions}>
        {/* 変更保存 or 変更なし表示 */}
        {isDirty ? (
          <TouchableOpacity style={dp.saveBtn} onPress={handleSave} disabled={saving}>
            <Text style={dp.saveBtnTxt}>{saving ? '保存中...' : '変更を保存'}</Text>
          </TouchableOpacity>
        ) : (
          <View style={dp.savedIndicator}>
            <Text style={dp.savedTxt}>✓ 保存済み</Text>
          </View>
        )}

        <View style={dp.actionRight}>
          {/* 複製 */}
          <TouchableOpacity style={dp.dupBtn} onPress={onDuplicate}>
            <Text style={dp.dupTxt}>⧉ 複製</Text>
          </TouchableOpacity>

          {/* 殿堂入り */}
          <TouchableOpacity style={[dp.templateBtn, task.is_template && dp.templateBtnActive]} onPress={onAddTemplate}>
            <Text style={[dp.templateTxt, task.is_template && dp.templateTxtActive]}>
              {task.is_template ? '🏆 殿堂入り済み' : '🏆 殿堂入り'}
            </Text>
          </TouchableOpacity>

          {/* モーダルで詳細編集 */}
          <TouchableOpacity style={dp.modalEditBtn} onPress={onOpenModal}>
            <Text style={dp.modalEditTxt}>⛶ 全画面編集</Text>
          </TouchableOpacity>

          {/* 削除 */}
          {confirmDel ? (
            <View style={{ flexDirection: 'row', gap: 8, alignItems: 'center' }}>
              <TouchableOpacity style={dp.delConfirm} onPress={onDelete}>
                <Text style={dp.delConfirmTxt}>削除</Text>
              </TouchableOpacity>
              <TouchableOpacity onPress={() => setConfirmDel(false)}>
                <Text style={{ color: C.muted, fontSize: 12 }}>戻る</Text>
              </TouchableOpacity>
            </View>
          ) : (
            <TouchableOpacity style={dp.delBtn} onPress={() => setConfirmDel(true)}>
              <Text style={dp.delTxt}>削除</Text>
            </TouchableOpacity>
          )}
        </View>
      </View>
    </View>
  );
}

// ── 振り返りパネル ────────────────────────────────────────────────
type ReviewFilter = 'fail' | 'stuck' | 'achieve';

// ──────────────────────────────────────────────────────────
// CalendarPanel
// ──────────────────────────────────────────────────────────
const WEEK_DAYS_CAL = ['日', '月', '火', '水', '木', '金', '土'];

type DaySummary = { total: number; done: number; failed: number };

function getDayColors(s: DaySummary): { bg: string; text: string } {
  if (s.total === 0) return { bg: 'transparent', text: '#9CA3AF' };
  const rate = s.done / s.total;
  if (rate >= 0.8) return { bg: '#DCFCE7', text: '#15803D' };
  if (rate >= 0.5) return { bg: '#FEF9C3', text: '#A16207' };
  if (s.failed > 0)  return { bg: '#FEE2E2', text: '#B91C1C' };
  return { bg: '#EEF2FF', text: '#4338CA' };
}

function getDayEmoji(s: DaySummary): string {
  if (s.total === 0) return '';
  const rate = s.done / s.total;
  if (rate >= 0.8) return '✅';
  if (rate >= 0.5) return '🙂';
  if (s.failed > 0) return '😓';
  return '⏳';
}

const STATUS_LABEL_CAL: Record<string, { label: string; color: string }> = {
  done:        { label: '達成',   color: '#16A34A' },
  failed:      { label: '未達成', color: '#DC2626' },
  in_progress: { label: '着手中', color: '#D97706' },
  pending:     { label: '未着手', color: '#6B7280' },
};

function CalendarPanel() {
  const now = new Date();
  const [year, setYear]   = useState(now.getFullYear());
  const [month, setMonth] = useState(now.getMonth());
  const [dayMap, setDayMap]     = useState<Record<string, DaySummary>>({});
  const [loading, setLoading]   = useState(true);
  const [selDate, setSelDate]   = useState<string | null>(null);
  const [dayTasks, setDayTasks] = useState<TodoTask[]>([]);

  const pad = (n: number) => String(n).padStart(2, '0');

  const loadMonth = useCallback(async (y: number, m: number) => {
    setLoading(true);
    const from = `${y}-${pad(m + 1)}-01`;
    const lastDay = new Date(y, m + 1, 0).getDate();
    const to = `${y}-${pad(m + 1)}-${pad(lastDay)}`;
    const { data } = await supabase.from('todo_tasks').select('date,status').gte('date', from).lte('date', to);
    const map: Record<string, DaySummary> = {};
    if (data) {
      (data as { date: string; status: string }[]).forEach((t) => {
        if (!map[t.date]) map[t.date] = { total: 0, done: 0, failed: 0 };
        map[t.date].total++;
        if (t.status === 'done')   map[t.date].done++;
        if (t.status === 'failed') map[t.date].failed++;
      });
    }
    setDayMap(map);
    setLoading(false);
  }, []);

  useEffect(() => { loadMonth(year, month); }, [year, month, loadMonth]);

  const loadDay = async (date: string) => {
    setSelDate(date);
    const { data } = await supabase.from('todo_tasks').select('*').eq('date', date).order('priority', { ascending: false });
    setDayTasks((data ?? []) as TodoTask[]);
  };

  const prevMonth = () => {
    if (month === 0) { setYear(y => y - 1); setMonth(11); } else setMonth(m => m - 1);
    setSelDate(null);
  };
  const nextMonth = () => {
    if (month === 11) { setYear(y => y + 1); setMonth(0); } else setMonth(m => m + 1);
    setSelDate(null);
  };

  const firstDay  = new Date(year, month, 1).getDay();
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const cells: (number | null)[] = [
    ...Array(firstDay).fill(null),
    ...Array.from({ length: daysInMonth }, (_, i) => i + 1),
  ];
  while (cells.length % 7 !== 0) cells.push(null);

  const todayStr = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;

  return (
    <ScrollView style={cal.wrap} contentContainerStyle={cal.content} showsVerticalScrollIndicator={false}>
      {/* ヘッダー */}
      <View style={cal.header}>
        <TouchableOpacity onPress={prevMonth} style={cal.arrow}>
          <Text style={cal.arrowTxt}>‹</Text>
        </TouchableOpacity>
        <View style={cal.titleBlock}>
          <Text style={cal.monthTitle}>{year}年 {month + 1}月</Text>
          <Text style={cal.subTitle}>{Object.keys(dayMap).length}日記録済み</Text>
        </View>
        <TouchableOpacity onPress={nextMonth} style={cal.arrow}>
          <Text style={cal.arrowTxt}>›</Text>
        </TouchableOpacity>
      </View>

      {/* 曜日 */}
      <View style={cal.weekRow}>
        {WEEK_DAYS_CAL.map((d, i) => (
          <Text key={d} style={[cal.weekDay, i === 0 && cal.sun, i === 6 && cal.sat]}>{d}</Text>
        ))}
      </View>

      {/* グリッド */}
      {loading ? (
        <ActivityIndicator color="#4F46E5" style={{ marginTop: 40 }} />
      ) : (
        <View style={cal.grid}>
          {cells.map((day, idx) => {
            if (!day) return <View key={`e-${idx}`} style={cal.cell} />;
            const dateStr = `${year}-${pad(month + 1)}-${pad(day)}`;
            const summary = dayMap[dateStr];
            const isToday = dateStr === todayStr;
            const isSel   = selDate === dateStr;
            const col = summary ? getDayColors(summary) : { bg: 'transparent', text: '#9CA3AF' };
            const emoji = summary ? getDayEmoji(summary) : '';
            const isSun = idx % 7 === 0;
            const isSat = idx % 7 === 6;
            return (
              <TouchableOpacity
                key={dateStr}
                style={[
                  cal.cell,
                  summary && { backgroundColor: col.bg },
                  isToday && cal.todayBorder,
                  isSel && cal.selBorder,
                ]}
                onPress={() => loadDay(dateStr)}
                activeOpacity={0.7}
              >
                <Text style={[
                  cal.dayNum,
                  { color: summary ? col.text : (isSun ? '#EF4444' : isSat ? '#4F46E5' : '#9CA3AF') },
                  isToday && cal.todayNum,
                ]}>
                  {day}
                </Text>
                {emoji ? <Text style={cal.emoji}>{emoji}</Text> : null}
                {summary && summary.total > 0 ? (
                  <Text style={[cal.countTxt, { color: col.text }]}>{summary.done}/{summary.total}</Text>
                ) : null}
              </TouchableOpacity>
            );
          })}
        </View>
      )}

      {/* 凡例 */}
      <View style={cal.legend}>
        {[
          { bg: '#DCFCE7', label: '達成率80%+' },
          { bg: '#FEF9C3', label: '達成率50%+' },
          { bg: '#FEE2E2', label: '未達成あり' },
          { bg: '#EEF2FF', label: '進行中' },
        ].map(({ bg, label }) => (
          <View key={label} style={cal.legendItem}>
            <View style={[cal.legendDot, { backgroundColor: bg }]} />
            <Text style={cal.legendTxt}>{label}</Text>
          </View>
        ))}
      </View>

      {/* 選択日タスク */}
      {selDate && (
        <View style={cal.dayPanel}>
          <Text style={cal.dayPanelTitle}>{selDate} のタスク{dayTasks.length > 0 ? ` (${dayTasks.length}件)` : ''}</Text>
          {dayTasks.length === 0 ? (
            <Text style={cal.noTask}>タスクなし</Text>
          ) : (
            dayTasks.map((t) => {
              const st = STATUS_LABEL_CAL[t.status] ?? { label: t.status, color: '#6B7280' };
              return (
                <View key={t.id} style={cal.taskRow}>
                  <View style={[cal.statusDot, { backgroundColor: st.color }]} />
                  <View style={cal.taskInfo}>
                    <Text style={[cal.taskTitle, t.status === 'done' && cal.doneTitle]}>{t.title}</Text>
                    {t.fail_reason ? <Text style={cal.taskSubRed}>未達成理由: {t.fail_reason}</Text>
                      : t.achieve_reason ? <Text style={cal.taskSubGreen}>達成理由: {t.achieve_reason}</Text>
                      : null}
                  </View>
                  <View style={[cal.badge, { backgroundColor: st.color + '18' }]}>
                    <Text style={[cal.badgeTxt, { color: st.color }]}>{st.label}</Text>
                  </View>
                </View>
              );
            })
          )}
        </View>
      )}
    </ScrollView>
  );
}

const cal = StyleSheet.create({
  wrap: { flex: 1, backgroundColor: '#F8FAFC' },
  content: { padding: 24, paddingBottom: 48, maxWidth: 700 },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 },
  arrow: { padding: 8 },
  arrowTxt: { color: '#4F46E5', fontSize: 32, fontWeight: 'bold' },
  titleBlock: { alignItems: 'center' },
  monthTitle: { color: '#111827', fontSize: 20, fontWeight: '800' },
  subTitle: { color: '#9CA3AF', fontSize: 12, marginTop: 2 },
  weekRow: { flexDirection: 'row', marginBottom: 4 },
  weekDay: { flex: 1, textAlign: 'center', color: '#9CA3AF', fontSize: 12, fontWeight: '600', paddingVertical: 6 },
  sun: { color: '#EF4444' },
  sat: { color: '#4F46E5' },
  grid: { flexDirection: 'row', flexWrap: 'wrap', marginBottom: 16 },
  cell: { width: '14.285%', aspectRatio: 0.9, borderRadius: 10, padding: 3, marginVertical: 2, alignItems: 'center', justifyContent: 'center' },
  todayBorder: { borderWidth: 2, borderColor: '#4F46E5' },
  selBorder: { borderWidth: 2, borderColor: '#F59E0B' },
  dayNum: { fontSize: 13, fontWeight: '600' },
  todayNum: { color: '#4F46E5', fontWeight: '800' },
  emoji: { fontSize: 15, marginTop: 1 },
  countTxt: { fontSize: 10, fontWeight: '700', marginTop: 1 },
  legend: { flexDirection: 'row', flexWrap: 'wrap', gap: 10, marginBottom: 24 },
  legendItem: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  legendDot: { width: 12, height: 12, borderRadius: 3 },
  legendTxt: { fontSize: 11, color: '#6B7280' },
  dayPanel: { backgroundColor: '#fff', borderRadius: 16, padding: 20, borderWidth: 1, borderColor: '#E5E7EB' },
  dayPanelTitle: { fontSize: 15, fontWeight: '700', color: '#111827', marginBottom: 14 },
  noTask: { color: '#9CA3AF', fontSize: 13, textAlign: 'center', paddingVertical: 12 },
  taskRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 12, paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: '#F3F4F6' },
  statusDot: { width: 8, height: 8, borderRadius: 4, marginTop: 5 },
  taskInfo: { flex: 1 },
  taskTitle: { fontSize: 14, color: '#111827', fontWeight: '500' },
  doneTitle: { color: '#9CA3AF', textDecorationLine: 'line-through' },
  taskSubRed: { fontSize: 12, color: '#EF4444', marginTop: 3 },
  taskSubGreen: { fontSize: 12, color: '#16A34A', marginTop: 3 },
  badge: { borderRadius: 6, paddingHorizontal: 8, paddingVertical: 3 },
  badgeTxt: { fontSize: 11, fontWeight: '700' },
});

// ──────────────────────────────────────────────────────────
// TemplatesPanel（殿堂入り一覧）
// ──────────────────────────────────────────────────────────
function TemplatesPanel({ onCopy }: { onCopy: (task: TodoTask) => Promise<void> }) {
  const [templates, setTemplates] = useState<TodoTask[]>([]);
  const [loading, setLoading] = useState(true);
  const [copying, setCopying] = useState<string | null>(null);
  const [removing, setRemoving] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    const { data } = await supabase.from('todo_tasks').select('*').eq('is_template', true).order('priority', { ascending: false });
    setTemplates((data ?? []) as TodoTask[]);
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  const handleCopy = async (t: TodoTask) => {
    setCopying(t.id!);
    await onCopy(t);
    setCopying(null);
  };

  const handleRemove = async (t: TodoTask) => {
    setRemoving(t.id!);
    await supabase.from('todo_tasks').update({ is_template: false }).eq('id', t.id!);
    setTemplates((prev) => prev.filter((x) => x.id !== t.id));
    setRemoving(null);
  };

  if (loading) return <ActivityIndicator color={C.primary} style={{ marginTop: 40 }} />;

  return (
    <ScrollView style={tpl.wrap} contentContainerStyle={tpl.content} showsVerticalScrollIndicator={false}>
      <View style={tpl.headerRow}>
        <Text style={tpl.heading}>🏆 殿堂入りタスク</Text>
        <Text style={tpl.sub}>よく使うタスクのテンプレート。「今日にコピー」で即追加。</Text>
      </View>

      {templates.length === 0 ? (
        <View style={tpl.empty}>
          <Text style={tpl.emptyIcon}>🏆</Text>
          <Text style={tpl.emptyTxt}>まだ殿堂入りタスクがありません</Text>
          <Text style={tpl.emptyHint}>タスク詳細パネルの「🏆 殿堂入り」ボタンで登録できます</Text>
        </View>
      ) : (
        templates.map((t) => {
          const ps = PRIORITY_STYLE[t.priority] ?? PRIORITY_STYLE[3];
          return (
            <View key={t.id} style={tpl.card}>
              <View style={tpl.cardTop}>
                <View style={[tpl.priorityBadge, { backgroundColor: ps.bg }]}>
                  <Text style={[tpl.priorityTxt, { color: ps.text }]}>{PRIORITY_LABEL[t.priority]}</Text>
                </View>
                <Text style={tpl.title}>{t.title}</Text>
              </View>
              {t.leverage ? <Text style={tpl.leverage} numberOfLines={2}>{t.leverage}</Text> : null}
              {t.description ? <Text style={tpl.desc} numberOfLines={2}>{t.description}</Text> : null}
              <View style={tpl.cardActions}>
                <TouchableOpacity
                  style={[tpl.copyBtn, copying === t.id && tpl.copyBtnDisabled]}
                  onPress={() => handleCopy(t)}
                  disabled={copying === t.id}
                >
                  <Text style={tpl.copyTxt}>{copying === t.id ? 'コピー中...' : '⧉ 今日にコピー'}</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={tpl.removeBtn}
                  onPress={() => handleRemove(t)}
                  disabled={removing === t.id}
                >
                  <Text style={tpl.removeTxt}>{removing === t.id ? '...' : '殿堂入りを外す'}</Text>
                </TouchableOpacity>
              </View>
            </View>
          );
        })
      )}
    </ScrollView>
  );
}

const tpl = StyleSheet.create({
  wrap: { flex: 1, backgroundColor: C.bg },
  content: { padding: 24, paddingBottom: 48, maxWidth: 700 },
  headerRow: { marginBottom: 24 },
  heading: { fontSize: 20, fontWeight: '800', color: C.text, marginBottom: 6 },
  sub: { fontSize: 13, color: C.sub },
  empty: { alignItems: 'center', paddingVertical: 60 },
  emptyIcon: { fontSize: 48, marginBottom: 12 },
  emptyTxt: { fontSize: 16, color: C.sub, fontWeight: '600', marginBottom: 8 },
  emptyHint: { fontSize: 13, color: C.muted, textAlign: 'center' },
  card: { backgroundColor: '#fff', borderRadius: 16, padding: 18, marginBottom: 14, borderWidth: 1, borderColor: C.border },
  cardTop: { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 8 },
  priorityBadge: { borderRadius: 6, paddingHorizontal: 8, paddingVertical: 3 },
  priorityTxt: { fontSize: 11, fontWeight: '700' },
  title: { flex: 1, fontSize: 16, fontWeight: '700', color: C.text },
  leverage: { fontSize: 13, color: C.primary, marginBottom: 4, lineHeight: 18 },
  desc: { fontSize: 13, color: C.sub, lineHeight: 18, marginBottom: 8 },
  cardActions: { flexDirection: 'row', gap: 10, marginTop: 12 },
  copyBtn: { flexDirection: 'row', alignItems: 'center', backgroundColor: C.primary, borderRadius: 10, paddingHorizontal: 16, paddingVertical: 10 },
  copyBtnDisabled: { opacity: 0.5 },
  copyTxt: { color: '#fff', fontSize: 13, fontWeight: '700' },
  removeBtn: { borderRadius: 10, paddingHorizontal: 14, paddingVertical: 10, borderWidth: 1, borderColor: C.border },
  removeTxt: { color: C.sub, fontSize: 12, fontWeight: '600' },
});

function ReviewPanel() {
  const [activeFilter, setActiveFilter] = useState<ReviewFilter>('fail');
  const [failTasks, setFailTasks]     = useState<TodoTask[]>([]);
  const [stuckItems, setStuckItems]   = useState<{ task: string; note: string; date: string; ts: string }[]>([]);
  const [achieveTasks, setAchieveTasks] = useState<TodoTask[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const load = async () => {
      setLoading(true);
      const { data } = await supabase
        .from('todo_tasks')
        .select('id,title,date,status,fail_reason,achieve_reason,progress_notes,priority')
        .order('date', { ascending: false })
        .limit(200);

      if (!data) { setLoading(false); return; }

      setFailTasks(data.filter((t) => t.status === 'failed' && t.fail_reason) as TodoTask[]);
      setAchieveTasks(data.filter((t) => t.status === 'done' && t.achieve_reason) as TodoTask[]);

      // progress_notes の中から type='stuck' のものを抽出
      const stuck: typeof stuckItems = [];
      for (const t of data) {
        const notes = parseNotes(t.progress_notes);
        for (const n of notes) {
          if (n.type === 'stuck') {
            stuck.push({ task: t.title, note: n.body, date: t.date, ts: n.ts });
          }
        }
      }
      stuck.sort((a, b) => b.ts.localeCompare(a.ts));
      setStuckItems(stuck);
      setLoading(false);
    };
    load();
  }, []);

  const TABS: { key: ReviewFilter; icon: string; label: string; count: number; color: string }[] = [
    { key: 'fail',    icon: '❌', label: '未達成の理由',   count: failTasks.length,    color: '#DC2626' },
    { key: 'stuck',   icon: '⚠️', label: 'つまづき',       count: stuckItems.length,   color: '#D97706' },
    { key: 'achieve', icon: '✅', label: '達成できた理由',  count: achieveTasks.length, color: '#16A34A' },
  ];

  const activeTab = TABS.find((t) => t.key === activeFilter)!;

  return (
    <View style={{ flex: 1, backgroundColor: C.bg }}>
      {/* ヘッダー */}
      <View style={rv.header}>
        <Text style={rv.title}>振り返り</Text>
        <Text style={rv.sub}>失敗・つまづき・成功から学ぶ</Text>
      </View>

      {/* フィルタータブ */}
      <View style={rv.tabBar}>
        {TABS.map((tab) => (
          <TouchableOpacity
            key={tab.key}
            style={[rv.tab, activeFilter === tab.key && { borderBottomColor: tab.color }]}
            onPress={() => setActiveFilter(tab.key)}
          >
            <Text style={rv.tabIcon}>{tab.icon}</Text>
            <Text style={[rv.tabLabel, activeFilter === tab.key && { color: tab.color, fontWeight: '700' }]}>
              {tab.label}
            </Text>
            <View style={[rv.tabBadge, { backgroundColor: tab.color + '18' }]}>
              <Text style={[rv.tabBadgeTxt, { color: tab.color }]}>{tab.count}</Text>
            </View>
          </TouchableOpacity>
        ))}
      </View>

      {loading ? (
        <ActivityIndicator style={{ marginTop: 60 }} color={C.primary} />
      ) : (
        <ScrollView contentContainerStyle={rv.list} showsVerticalScrollIndicator={false}>
          {/* 未達成の理由 */}
          {activeFilter === 'fail' && (
            failTasks.length === 0 ? (
              <View style={rv.empty}><Text style={rv.emptyTxt}>未達成タスクの記録がまだありません</Text></View>
            ) : failTasks.map((t) => (
              <View key={t.id} style={rv.card}>
                <View style={rv.cardTop}>
                  <View style={rv.failDot} />
                  <Text style={rv.cardTitle}>{t.title}</Text>
                  <Text style={rv.cardDate}>{t.date}</Text>
                </View>
                <View style={rv.reasonBox}>
                  <Text style={rv.reasonLabel}>なぜ達成できなかったか</Text>
                  <Text style={rv.failReason}>{t.fail_reason}</Text>
                </View>
              </View>
            ))
          )}

          {/* つまづき */}
          {activeFilter === 'stuck' && (
            stuckItems.length === 0 ? (
              <View style={rv.empty}><Text style={rv.emptyTxt}>つまづきメモがまだありません</Text></View>
            ) : stuckItems.map((item, i) => (
              <View key={i} style={rv.card}>
                <View style={rv.cardTop}>
                  <View style={rv.stuckDot} />
                  <Text style={rv.cardTitle}>{item.task}</Text>
                  <Text style={rv.cardDate}>{item.date}</Text>
                </View>
                <View style={rv.stuckBox}>
                  <Text style={rv.reasonLabel}>つまづいた内容</Text>
                  <Text style={rv.stuckReason}>{item.note}</Text>
                </View>
              </View>
            ))
          )}

          {/* 達成できた理由 */}
          {activeFilter === 'achieve' && (
            achieveTasks.length === 0 ? (
              <View style={rv.empty}><Text style={rv.emptyTxt}>達成タスクの記録がまだありません</Text></View>
            ) : achieveTasks.map((t) => (
              <View key={t.id} style={rv.card}>
                <View style={rv.cardTop}>
                  <View style={rv.achieveDot} />
                  <Text style={rv.cardTitle}>{t.title}</Text>
                  <Text style={rv.cardDate}>{t.date}</Text>
                </View>
                <View style={rv.achieveBox}>
                  <Text style={rv.reasonLabel}>なぜ達成できたか</Text>
                  <Text style={rv.achieveReason}>{t.achieve_reason}</Text>
                </View>
              </View>
            ))
          )}
        </ScrollView>
      )}
    </View>
  );
}

const rv = StyleSheet.create({
  header: { padding: 24, paddingBottom: 12, borderBottomWidth: 1, borderBottomColor: C.border, backgroundColor: C.panel },
  title: { color: C.text, fontSize: 22, fontWeight: '800', marginBottom: 4 },
  sub: { color: C.sub, fontSize: 13 },
  tabBar: { flexDirection: 'row', backgroundColor: C.panel, borderBottomWidth: 1, borderBottomColor: C.border },
  tab: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, paddingVertical: 14, borderBottomWidth: 2, borderBottomColor: 'transparent' },
  tabIcon: { fontSize: 14 },
  tabLabel: { fontSize: 12, color: C.muted, fontWeight: '500' },
  tabBadge: { borderRadius: 10, paddingHorizontal: 7, paddingVertical: 2 },
  tabBadgeTxt: { fontSize: 11, fontWeight: '700' },
  list: { padding: 20, gap: 12 },
  empty: { alignItems: 'center', paddingTop: 60 },
  emptyTxt: { color: C.muted, fontSize: 14 },
  card: { backgroundColor: C.panel, borderRadius: 14, padding: 16, borderWidth: 1, borderColor: C.border, gap: 12 },
  cardTop: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  failDot:    { width: 10, height: 10, borderRadius: 5, backgroundColor: '#EF4444', flexShrink: 0 },
  stuckDot:   { width: 10, height: 10, borderRadius: 5, backgroundColor: '#F59E0B', flexShrink: 0 },
  achieveDot: { width: 10, height: 10, borderRadius: 5, backgroundColor: '#22C55E', flexShrink: 0 },
  cardTitle: { flex: 1, color: C.text, fontSize: 14, fontWeight: '600' },
  cardDate: { color: C.muted, fontSize: 12, flexShrink: 0 },
  reasonBox:  { backgroundColor: '#FEF2F2', borderRadius: 10, padding: 14, borderLeftWidth: 3, borderLeftColor: '#EF4444' },
  stuckBox:   { backgroundColor: '#FFFBEB', borderRadius: 10, padding: 14, borderLeftWidth: 3, borderLeftColor: '#F59E0B' },
  achieveBox: { backgroundColor: '#F0FDF4', borderRadius: 10, padding: 14, borderLeftWidth: 3, borderLeftColor: '#22C55E' },
  reasonLabel: { fontSize: 11, fontWeight: '700', color: C.muted, marginBottom: 6 },
  failReason:    { color: '#374151', fontSize: 14, lineHeight: 22 },
  stuckReason:   { color: '#374151', fontSize: 14, lineHeight: 22 },
  achieveReason: { color: '#374151', fontSize: 14, lineHeight: 22 },
});

// ── AI診断パネル ──────────────────────────────────────────────────
type AlertLevel = 'danger' | 'warning' | 'good';
const LEVEL_STYLE: Record<AlertLevel, { bg: string; border: string; text: string; icon: string }> = {
  danger:  { bg: '#FEF2F2', border: '#EF4444', text: '#DC2626', icon: '🚨' },
  warning: { bg: '#FFFBEB', border: '#F59E0B', text: '#D97706', icon: '⚠️' },
  good:    { bg: '#F0FDF4', border: '#22C55E', text: '#16A34A', icon: '✅' },
};

function AIDiagPanel() {
  const [diagnosis, setDiagnosis] = useState<{
    alerts: { level: AlertLevel; title: string; detail: string }[];
    priority: string; summary: string;
  } | null>(null);
  const [schedule, setSchedule] = useState<{
    items: { time: string; task: string; duration: string; reason: string }[];
    advice: string;
  } | null>(null);
  const [tab, setTab] = useState<'diag' | 'schedule' | 'chat'>('diag');
  const [loading, setLoading] = useState(false);
  const [step, setStep] = useState('');
  const [chatMsgs, setChatMsgs] = useState<AIChatMsg[]>([]);
  const [chatInput, setChatInput] = useState('');
  const [chatLoading, setChatLoading] = useState(false);

  const runDiag = async () => {
    setLoading(true); setStep('データ取得中...');
    try {
      const { data } = await supabase.from('todo_tasks').select('date,title,leverage,priority,status,achieve_reason,fail_reason').order('date', { ascending: false }).limit(30);
      if (!data?.length) { setDiagnosis({ alerts: [], priority: '', summary: '記録が少なすぎます。' }); return; }
      const taskStr = data.map((t) => `[${t.date}] ${t.title}（優先度${t.priority}）→${t.status}${t.fail_reason ? ` 理由:${t.fail_reason}` : ''}`).join('\n');
      setStep('AIが分析中...');
      const res = await openai.chat.completions.create({
        model: 'gpt-4o-mini',
        messages: [{ role: 'system', content: `タスク管理コーチ。以下を分析してJSON返却。\n${taskStr}\n\n{"alerts":[{"level":"danger"|"warning"|"good","title":"15字以内","detail":"分析"}],"priority":"最優先事項1-2文","summary":"40字以内の傾向"}` }],
      });
      const m = (res.choices[0].message.content ?? '').match(/\{[\s\S]*\}/);
      setDiagnosis(JSON.parse(m ? m[0] : '{}'));
    } catch { setDiagnosis({ alerts: [], priority: '', summary: 'エラーが発生しました。' }); }
    finally { setLoading(false); setStep(''); }
  };

  const runSchedule = async () => {
    setLoading(true); setStep('今日のタスク取得中...');
    try {
      const today = localDateStr();
      const { data } = await supabase.from('todo_tasks').select('title,priority,deadline_time,estimated_minutes').eq('date', today).eq('status', 'pending').order('priority', { ascending: false });
      if (!data?.length) { setSchedule({ items: [], advice: '今日の未着手タスクがありません。' }); return; }
      const taskStr = data.map((t) => `${t.title}（優先度${t.priority}${t.deadline_time ? ` 締切:${t.deadline_time}` : ''}${t.estimated_minutes ? ` 所要:${t.estimated_minutes}分` : ''}）`).join('\n');
      const now = new Date();
      setStep('スケジュール生成中...');
      const res = await openai.chat.completions.create({
        model: 'gpt-4o-mini',
        messages: [{ role: 'system', content: `現在${String(now.getHours()).padStart(2,'0')}:${String(now.getMinutes()).padStart(2,'0')}。最適な時間割をJSON返却。\n${taskStr}\n\n{"items":[{"time":"HH:MM","task":"名前","duration":"XX分","reason":"10字以内"}],"advice":"40字以内"}` }],
      });
      const m = (res.choices[0].message.content ?? '').match(/\{[\s\S]*\}/);
      setSchedule(JSON.parse(m ? m[0] : '{}'));
    } catch { setSchedule({ items: [], advice: 'エラーが発生しました。' }); }
    finally { setLoading(false); setStep(''); }
  };

  const sendChat = async (text: string) => {
    if (!text.trim() || chatLoading) return;
    setChatInput('');
    setChatLoading(true);
    const next: AIChatMsg[] = [...chatMsgs, { role: 'user', content: text }];
    setChatMsgs(next);
    const { data } = await supabase.from('todo_tasks').select('date,title,status,fail_reason').order('date', { ascending: false }).limit(14);
    const history = data?.map((t) => `[${t.date}] ${t.title}→${t.status}${t.fail_reason ? ` 理由:${t.fail_reason}` : ''}`).join('\n') ?? '';
    const res = await openai.chat.completions.create({
      model: 'gpt-4o-mini',
      messages: [
        { role: 'system', content: `生産性コーチ。過去記録:\n${history}\n短く日本語で答える。` },
        ...next,
      ],
    });
    setChatMsgs([...next, { role: 'assistant', content: res.choices[0].message.content ?? '' }]);
    setChatLoading(false);
  };

  const TABS: [typeof tab, string][] = [['diag', 'パターン診断'], ['schedule', '時間割'], ['chat', 'チャット']];

  return (
    <View style={{ flex: 1, backgroundColor: C.bg }}>
      <View style={diag.header}>
        <Text style={diag.title}>AI 診断</Text>
        <Text style={diag.sub}>タスクデータをAIが分析して改善提案します</Text>
      </View>
      <View style={diag.tabBar}>
        {TABS.map(([key, label]) => (
          <TouchableOpacity key={key} style={[diag.tabBtn, tab === key && diag.tabBtnActive]} onPress={() => setTab(key)}>
            <Text style={[diag.tabTxt, tab === key && diag.tabTxtActive]}>{label}</Text>
          </TouchableOpacity>
        ))}
      </View>
      <ScrollView contentContainerStyle={diag.content} showsVerticalScrollIndicator={false}>
        {tab === 'diag' && (
          <>
            <TouchableOpacity style={diag.runBtn} onPress={runDiag} disabled={loading}>
              {loading ? <ActivityIndicator color="#fff" /> : <Text style={diag.runBtnTxt}>✦ {diagnosis ? '再分析する' : '分析を開始する'}</Text>}
            </TouchableOpacity>
            {loading && step ? <View style={diag.stepBox}><ActivityIndicator color={C.primary} size="small" /><Text style={diag.stepTxt}>{step}</Text></View> : null}
            {diagnosis && (
              <View style={diag.resultWrap}>
                {diagnosis.priority ? <View style={diag.priorityCard}><Text style={diag.priorityLabel}>▶ 今すぐやること</Text><Text style={diag.priorityTxt}>{diagnosis.priority}</Text></View> : null}
                {diagnosis.summary ? <View style={diag.summaryCard}><Text style={diag.summaryTxt}>{diagnosis.summary}</Text></View> : null}
                {diagnosis.alerts.map((a, i) => {
                  const ls = LEVEL_STYLE[a.level];
                  return (
                    <View key={i} style={[diag.alertCard, { backgroundColor: ls.bg, borderLeftColor: ls.border }]}>
                      <View style={diag.alertHead}><Text>{ls.icon}</Text><Text style={[diag.alertTitle, { color: ls.text }]}>{a.title}</Text></View>
                      <Text style={diag.alertDetail}>{a.detail}</Text>
                    </View>
                  );
                })}
              </View>
            )}
          </>
        )}
        {tab === 'schedule' && (
          <>
            <TouchableOpacity style={diag.runBtn} onPress={runSchedule} disabled={loading}>
              {loading ? <ActivityIndicator color="#fff" /> : <Text style={diag.runBtnTxt}>✦ {schedule ? '再生成する' : 'スケジュールを生成'}</Text>}
            </TouchableOpacity>
            {loading && step ? <View style={diag.stepBox}><ActivityIndicator color={C.primary} size="small" /><Text style={diag.stepTxt}>{step}</Text></View> : null}
            {schedule && (
              <View style={diag.resultWrap}>
                {schedule.advice ? <View style={diag.summaryCard}><Text style={diag.summaryTxt}>{schedule.advice}</Text></View> : null}
                {schedule.items.map((item, i) => (
                  <View key={i} style={diag.schedCard}>
                    <View style={diag.schedLeft}>
                      <Text style={diag.schedTime}>{item.time}</Text>
                      <Text style={diag.schedDur}>{item.duration}</Text>
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text style={diag.schedTask}>{item.task}</Text>
                      <Text style={diag.schedReason}>{item.reason}</Text>
                    </View>
                  </View>
                ))}
              </View>
            )}
          </>
        )}
        {tab === 'chat' && (
          <View style={{ gap: 12 }}>
            {chatMsgs.length === 0 && (
              <>
                <Text style={{ color: C.muted, textAlign: 'center', marginBottom: 8 }}>タスクデータをもとに答えます</Text>
                {['今週の未達成パターンは？', '最もレバレッジが高いタスクは？', '達成率を上げるには？', '今の最優先事項は？'].map((q) => (
                  <TouchableOpacity key={q} style={diag.quickBtn} onPress={() => sendChat(q)}>
                    <Text style={diag.quickTxt}>{q}</Text>
                    <Text style={{ color: C.primary, fontWeight: '700' }}>→</Text>
                  </TouchableOpacity>
                ))}
              </>
            )}
            {chatMsgs.map((m, i) => (
              <View key={i} style={[diag.bubble, m.role === 'user' ? diag.bubbleUser : diag.bubbleAI]}>
                <Text style={[{ fontSize: 14, lineHeight: 22 }, m.role === 'user' && { color: '#fff' }]}>{m.content}</Text>
              </View>
            ))}
            {chatLoading && <ActivityIndicator color={C.primary} />}
            <View style={diag.chatInput}>
              <TextInput style={diag.chatInputField} value={chatInput} onChangeText={setChatInput} placeholder="質問を入力..." placeholderTextColor={C.muted} onSubmitEditing={() => sendChat(chatInput)} returnKeyType="send" />
              <TouchableOpacity style={diag.chatSendBtn} onPress={() => sendChat(chatInput)} disabled={chatLoading}>
                <Text style={{ color: '#fff', fontWeight: '700' }}>送信</Text>
              </TouchableOpacity>
            </View>
          </View>
        )}
      </ScrollView>
    </View>
  );
}

// ── メイン WebLayout ──────────────────────────────────────────────
export default function WebLayout() {
  const [tasks, setTasks] = useState<TodoTask[]>([]);
  const [loading, setLoading] = useState(true);
  const [nav, setNav] = useState<NavKey>('today');
  const [filter, setFilter] = useState<FilterKey>('all');
  const [selected, setSelected] = useState<TodoTask | null>(null);
  const [showAdd, setShowAdd] = useState(false);
  const [editTarget, setEditTarget] = useState<TodoTask | null>(null);
  const [saving, setSaving] = useState(false);
  const [userEmail, setUserEmail] = useState('');

  const todayStr = localDateStr();

  useEffect(() => {
    supabase.auth.getUser().then(({ data: { user } }) => {
      if (user?.email) setUserEmail(user.email);
    });
  }, []);

  const loadTasks = useCallback(async () => {
    const { data } = await supabase.from('todo_tasks').select('*').order('date', { ascending: false }).order('priority', { ascending: false });
    if (data) setTasks(data as TodoTask[]);
    setLoading(false);
  }, []);

  useEffect(() => { loadTasks(); }, [loadTasks]);

  // フィルタリング（テンプレートは通常リストから除外）
  const filtered = tasks.filter((t) => {
    if (t.is_template) return false;
    const navOk = (() => {
      if (nav === 'all') return true;
      if (nav === 'today') return t.date === todayStr;
      if (nav === 'in_progress') return t.status === 'in_progress';
      if (nav === 'done') return t.status === 'done';
      if (nav === 'important') return t.priority === 5;
      return true;
    })();
    const filterOk = (() => {
      if (filter === 'all') return true;
      if (filter === 'active') return t.status !== 'done';
      if (filter === 'done') return t.status === 'done';
      return true;
    })();
    return navOk && filterOk;
  });

  const counts = {
    all: tasks.filter((t) => !t.is_template).length,
    today: tasks.filter((t) => !t.is_template && t.date === todayStr).length,
    in_progress: tasks.filter((t) => !t.is_template && t.status === 'in_progress').length,
    done: tasks.filter((t) => !t.is_template && t.status === 'done').length,
    important: tasks.filter((t) => !t.is_template && t.priority === 5).length,
    templates: tasks.filter((t) => t.is_template).length,
  };

  const NAV_LABELS: Record<NavKey, string> = {
    all: 'すべてのタスク', today: '今日のタスク', in_progress: '着手中',
    done: '完了したタスク', important: '重要なタスク', ai: 'AI診断', review: '振り返り', calendar: 'カレンダー', templates: '殿堂入り',
  };
  const FILTER_TABS: [FilterKey, string][] = [['all', 'すべて'], ['active', '未完了'], ['done', '完了']];

  const handleAdd = async (task: TodoTask) => {
    setSaving(true);
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) { setSaving(false); return; }
    await supabase.from('todo_tasks').insert({ ...task, user_id: user.id });
    setShowAdd(false);
    loadTasks();
    setSaving(false);
  };

  const updateTask = async (task: TodoTask) => {
    await supabase.from('todo_tasks').update({
      title: task.title, description: task.description, leverage: task.leverage,
      priority: task.priority, status: task.status,
      achieve_reason: task.achieve_reason, fail_reason: task.fail_reason,
      due_date: task.due_date, deadline_time: task.deadline_time,
      estimated_minutes: task.estimated_minutes, progress_notes: task.progress_notes,
    }).eq('id', task.id as string);
  };

  // インライン保存（右パネルから）
  const handleInlineSave = async (task: TodoTask) => {
    await updateTask(task);
    setSelected(task); // パネルの表示を更新
    loadTasks();
  };

  // モーダル編集保存
  const handleEdit = async (task: TodoTask) => {
    setSaving(true);
    await updateTask(task);
    setEditTarget(null);
    setSelected(task); // 保存後もパネルを開いたまま
    loadTasks();
    setSaving(false);
  };

  const handleDelete = async (task: TodoTask) => {
    await supabase.from('todo_tasks').delete().eq('id', task.id as string);
    setSelected(null);
    loadTasks();
  };

  const handleToggleDone = async (task: TodoTask) => {
    const s = task.status === 'done' ? 'pending' : 'done';
    await supabase.from('todo_tasks').update({ status: s }).eq('id', task.id as string);
    loadTasks();
  };

  const handleStatusChange = async (task: TodoTask, status: string) => {
    await supabase.from('todo_tasks').update({ status }).eq('id', task.id as string);
    setSelected((prev) => prev ? { ...prev, status: status as TodoTask['status'] } : null);
    loadTasks();
  };

  const handleDuplicate = async (task: TodoTask) => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;
    const copy = {
      user_id: user.id,
      title: task.title, description: task.description, leverage: task.leverage,
      priority: task.priority, date: todayStr, status: 'pending' as const,
      achieve_reason: '', fail_reason: '', due_date: null,
      deadline_time: task.deadline_time, estimated_minutes: task.estimated_minutes,
      progress_notes: '[]', is_template: false,
    };
    const { data } = await supabase.from('todo_tasks').insert(copy).select().single();
    loadTasks();
    if (data) setSelected(data as TodoTask);
  };

  const handleAddTemplate = async (task: TodoTask) => {
    const next = !task.is_template;
    await supabase.from('todo_tasks').update({ is_template: next }).eq('id', task.id as string);
    setSelected({ ...task, is_template: next });
    loadTasks();
  };

  const handleCopyFromTemplate = async (task: TodoTask) => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;
    const copy = {
      user_id: user.id,
      title: task.title, description: task.description, leverage: task.leverage,
      priority: task.priority, date: todayStr, status: 'pending' as const,
      achieve_reason: '', fail_reason: '', due_date: null,
      deadline_time: task.deadline_time, estimated_minutes: task.estimated_minutes,
      progress_notes: '[]', is_template: false,
    };
    const { data } = await supabase.from('todo_tasks').insert(copy).select().single();
    loadTasks();
    if (data) { setSelected(data as TodoTask); setNav('today'); }
  };

  if (loading) return <ActivityIndicator style={{ flex: 1, backgroundColor: C.bg }} color={C.primary} />;

  return (
    <View style={w.root}>
      {/* ── 左サイドバー ── */}
      <Sidebar
        nav={nav}
        setNav={setNav}
        counts={counts}
        onAdd={() => setShowAdd(true)}
        onLogout={() => supabase.auth.signOut()}
        userEmail={userEmail}
      />

      {/* ── メインコンテンツ ── */}
      {nav === 'ai' ? (
        <View style={w.main}><AIDiagPanel /></View>
      ) : nav === 'review' ? (
        <View style={w.main}><ReviewPanel /></View>
      ) : nav === 'calendar' ? (
        <View style={w.main}><CalendarPanel /></View>
      ) : nav === 'templates' ? (
        <View style={w.main}><TemplatesPanel onCopy={handleCopyFromTemplate} /></View>
      ) : (
        <View style={w.main}>
          {/* ヘッダー */}
          <View style={w.mainHeader}>
            <Text style={w.mainTitle}>{NAV_LABELS[nav]}</Text>
            <View style={w.filterRow}>
              {FILTER_TABS.map(([key, label]) => (
                <TouchableOpacity
                  key={key}
                  style={[w.filterBtn, filter === key && w.filterBtnActive]}
                  onPress={() => setFilter(key)}
                >
                  <Text style={[w.filterBtnTxt, filter === key && w.filterBtnTxtActive]}>{label}</Text>
                </TouchableOpacity>
              ))}
            </View>
          </View>

          {/* タスクリスト */}
          <ScrollView style={w.listScroll} contentContainerStyle={w.listContent} showsVerticalScrollIndicator={false}>
            {filtered.length === 0 ? (
              <View style={w.empty}>
                <Text style={w.emptyIcon}>📋</Text>
                <Text style={w.emptyTxt}>タスクがありません</Text>
              </View>
            ) : (
              filtered.map((t, i) => (
                <View key={t.id}>
                  <TaskRow
                    task={t}
                    selected={selected?.id === t.id}
                    onSelect={() => setSelected(t)}
                    onToggleDone={() => handleToggleDone(t)}
                    onDuplicate={() => handleDuplicate(t)}
                  />
                  {i < filtered.length - 1 && <View style={w.divider} />}
                </View>
              ))
            )}
          </ScrollView>
        </View>
      )}

      {/* ── 右詳細パネル ── */}
      <View style={w.panel}>
        {selected ? (
          <DetailPanel
            task={selected}
            onClose={() => setSelected(null)}
            onSave={handleInlineSave}
            onOpenModal={() => setEditTarget(selected)}
            onDelete={() => handleDelete(selected)}
            onDuplicate={() => handleDuplicate(selected)}
            onAddTemplate={() => handleAddTemplate(selected)}
          />
        ) : (
          <View style={w.panelEmpty}>
            <Text style={w.panelEmptyIcon}>👆</Text>
            <Text style={w.panelEmptyTxt}>タスクを選択すると{'\n'}詳細が表示されます</Text>
          </View>
        )}
      </View>

      {/* 追加モーダル */}
      <Modal visible={showAdd} animationType="fade" transparent>
        <View style={w.modalOverlay}>
          <View style={w.modalBox}>
            <View style={w.modalHead}>
              <Text style={w.modalTitle}>新しいタスク</Text>
              <TouchableOpacity onPress={() => setShowAdd(false)} style={w.modalX}>
                <Text style={w.modalXTxt}>✕</Text>
              </TouchableOpacity>
            </View>
            <TaskForm initial={{ date: todayStr }} onSave={handleAdd} saving={saving} onCancel={() => setShowAdd(false)} />
          </View>
        </View>
      </Modal>

      {/* 編集モーダル */}
      {editTarget && (
        <Modal visible animationType="fade" transparent>
          <View style={w.modalOverlay}>
            <View style={w.modalBox}>
              <View style={w.modalHead}>
                <Text style={w.modalTitle}>タスクを編集</Text>
                <TouchableOpacity onPress={() => setEditTarget(null)} style={w.modalX}>
                  <Text style={w.modalXTxt}>✕</Text>
                </TouchableOpacity>
              </View>
              <TaskForm initial={editTarget} onSave={handleEdit} saving={saving} onCancel={() => setEditTarget(null)} />
            </View>
          </View>
        </Modal>
      )}
    </View>
  );
}

// ═══════════════════════════════ STYLES ══════════════════════════

// サイドバー
const sb = StyleSheet.create({
  wrap: { width: 240, backgroundColor: C.sidebar, borderRightWidth: 1, borderRightColor: C.border, flexDirection: 'column' },
  logo: { flexDirection: 'row', alignItems: 'center', gap: 10, padding: 20, paddingBottom: 16 },
  logoIcon: { width: 32, height: 32, borderRadius: 8, backgroundColor: C.primary, alignItems: 'center', justifyContent: 'center' },
  logoIconTxt: { color: '#fff', fontSize: 16, fontWeight: '800' },
  logoTxt: { color: C.text, fontSize: 16, fontWeight: '800' },
  addBtn: { marginHorizontal: 16, marginBottom: 16, backgroundColor: C.primary, borderRadius: 10, padding: 12, alignItems: 'center' },
  addBtnTxt: { color: '#fff', fontSize: 14, fontWeight: '700' },
  navScroll: { flex: 1 },
  section: { paddingHorizontal: 8, gap: 2 },
  navItem: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 9, paddingHorizontal: 12, borderRadius: 8 },
  navItemActive: { backgroundColor: C.primaryBg },
  navIcon: { fontSize: 15, width: 20, textAlign: 'center' },
  navLabel: { flex: 1, color: C.sub, fontSize: 14, fontWeight: '500' },
  navLabelActive: { color: C.primary, fontWeight: '700' },
  navBadge: { backgroundColor: '#E5E7EB', borderRadius: 10, paddingHorizontal: 8, paddingVertical: 2 },
  navBadgeActive: { backgroundColor: C.primaryBg },
  navBadgeTxt: { color: C.sub, fontSize: 12, fontWeight: '600' },
  navBadgeTxtActive: { color: C.primary },
  divider: { height: 1, backgroundColor: C.border, marginHorizontal: 16, marginVertical: 12 },
  aiBox: { marginHorizontal: 12, marginBottom: 8, backgroundColor: C.primaryBg, borderRadius: 12, padding: 14 },
  aiBoxActive: { borderWidth: 1.5, borderColor: C.primary },
  aiBoxHeader: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 4 },
  aiBoxIcon: { color: C.primary, fontSize: 14, fontWeight: '800' },
  aiBoxTitle: { color: C.sub, fontSize: 14, fontWeight: '700' },
  aiBoxSub: { color: C.muted, fontSize: 12 },
  userRow: { flexDirection: 'row', alignItems: 'center', gap: 10, padding: 16, borderTopWidth: 1, borderTopColor: C.border },
  userAvatar: { width: 32, height: 32, borderRadius: 16, backgroundColor: C.primary, alignItems: 'center', justifyContent: 'center' },
  userAvatarTxt: { color: '#fff', fontWeight: '700', fontSize: 14 },
  userInfo: { flex: 1 },
  userEmail: { color: C.sub, fontSize: 12 },
  logoutTxt: { color: C.muted, fontSize: 12 },
});

// タスク行
const tr = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 13, paddingHorizontal: 20 },
  rowSelected: { backgroundColor: '#F5F3FF' },
  check: { width: 20, height: 20, borderRadius: 10, borderWidth: 1.5, borderColor: '#D1D5DB', backgroundColor: '#fff', alignItems: 'center', justifyContent: 'center', flexShrink: 0 },
  checkDone: { backgroundColor: C.primary, borderColor: C.primary },
  checkMark: { color: '#fff', fontSize: 11, fontWeight: '800' },
  title: { flex: 1, color: C.text, fontSize: 14, fontWeight: '500' },
  titleDone: { textDecorationLine: 'line-through', color: C.done },
  priorityBadge: { borderRadius: 6, paddingHorizontal: 8, paddingVertical: 3 },
  priorityBadgeTxt: { fontSize: 11, fontWeight: '700' },
  date: { fontSize: 13, fontWeight: '500', minWidth: 36, textAlign: 'right' },
  statusDot: { borderRadius: 6, paddingHorizontal: 8, paddingVertical: 3 },
  statusDotTxt: { fontSize: 11, fontWeight: '600' },
  dupBtn: { padding: 4, opacity: 0.4 },
  dupTxt: { fontSize: 15, color: C.text },
});

// 詳細パネル
const dp = StyleSheet.create({
  wrap: { flex: 1, backgroundColor: C.panel },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', padding: 16, paddingBottom: 12, borderBottomWidth: 1, borderBottomColor: C.border },
  titleInput: { color: C.text, fontSize: 16, fontWeight: '700', lineHeight: 24, padding: 0 },
  closeBtn: { width: 28, height: 28, borderRadius: 14, backgroundColor: '#F3F4F6', alignItems: 'center', justifyContent: 'center', flexShrink: 0 },
  closeTxt: { color: C.sub, fontSize: 13, fontWeight: '700' },
  scroll: { flex: 1 },
  scrollContent: { padding: 16, gap: 16, paddingBottom: 8 },
  section: { gap: 6 },
  sectionTitle: { color: C.sub, fontSize: 11, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.5 },
  statusRow: { flexDirection: 'row', gap: 5, flexWrap: 'wrap' },
  statusBtn: { flex: 1, paddingVertical: 7, paddingHorizontal: 8, borderRadius: 8, borderWidth: 1.5, borderColor: C.border, alignItems: 'center', minWidth: 60 },
  statusBtnTxt: { fontSize: 12, color: C.muted, fontWeight: '500' },
  priorityRow: { flexDirection: 'row', gap: 5, flexWrap: 'wrap' },
  priorityBtn: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 4, paddingVertical: 7, borderRadius: 8, borderWidth: 1.5, borderColor: C.border, minWidth: 44 },
  priorityDot: { width: 6, height: 6, borderRadius: 3 },
  priorityBtnTxt: { fontSize: 11, color: C.muted, fontWeight: '500' },
  twoCol: { flexDirection: 'row', gap: 12 },
  smallInput: { backgroundColor: '#F9FAFB', borderWidth: 1, borderColor: C.border, borderRadius: 8, padding: 10, fontSize: 13, color: C.text, marginTop: 6 },
  minRow: { flexDirection: 'row', gap: 4, flexWrap: 'wrap', marginTop: 6 },
  minBtn: { paddingHorizontal: 8, paddingVertical: 6, borderRadius: 6, borderWidth: 1, borderColor: C.border, backgroundColor: '#F9FAFB' },
  minBtnActive: { backgroundColor: '#EEF2FF', borderColor: C.primary },
  minBtnTxt: { fontSize: 11, color: C.muted },
  minBtnTxtActive: { color: C.primary, fontWeight: '700' },
  fieldInput: { backgroundColor: '#F9FAFB', borderWidth: 1, borderColor: C.border, borderRadius: 8, padding: 10, fontSize: 13, color: C.text },
  fieldInputMulti: { minHeight: 72, textAlignVertical: 'top' },
  achieveInput: { backgroundColor: '#F0FDF4', borderColor: '#86EFAC' },
  failInput: { backgroundColor: '#FEF2F2', borderColor: '#FCA5A5' },
  noteChip: { flexDirection: 'row', gap: 8, borderRadius: 8, padding: 10, borderLeftWidth: 2 },
  noteChipInfo: { backgroundColor: '#EEF2FF', borderLeftColor: C.primary },
  noteChipWarn: { backgroundColor: '#FFFBEB', borderLeftColor: '#F59E0B' },
  noteIcon: { fontSize: 13 },
  noteTxt: { flex: 1, color: C.text, fontSize: 13, lineHeight: 18 },
  // アクションバー
  actions: { flexDirection: 'row', alignItems: 'center', gap: 8, padding: 12, borderTopWidth: 1, borderTopColor: C.border },
  saveBtn: { flex: 1, backgroundColor: C.primary, borderRadius: 10, padding: 11, alignItems: 'center' },
  saveBtnTxt: { color: '#fff', fontSize: 13, fontWeight: '700' },
  savedIndicator: { flex: 1, alignItems: 'center', paddingVertical: 11 },
  savedTxt: { color: '#16A34A', fontSize: 13, fontWeight: '600' },
  actionRight: { flexDirection: 'row', gap: 6, alignItems: 'center' },
  modalEditBtn: { backgroundColor: '#F3F4F6', borderRadius: 8, paddingHorizontal: 10, paddingVertical: 9 },
  modalEditTxt: { color: C.sub, fontSize: 12, fontWeight: '600' },
  dupBtn: { backgroundColor: '#EEF2FF', borderRadius: 8, paddingHorizontal: 10, paddingVertical: 9 },
  dupTxt: { color: '#4338CA', fontSize: 12, fontWeight: '600' },
  templateBtn: { backgroundColor: '#F3F4F6', borderRadius: 8, paddingHorizontal: 10, paddingVertical: 9 },
  templateBtnActive: { backgroundColor: '#FEF9C3' },
  templateTxt: { color: C.sub, fontSize: 12, fontWeight: '600' },
  templateTxtActive: { color: '#92400E', fontWeight: '700' },
  delBtn: { backgroundColor: '#FEE2E2', borderRadius: 8, paddingHorizontal: 10, paddingVertical: 9 },
  delTxt: { color: '#DC2626', fontSize: 12, fontWeight: '600' },
  delConfirm: { backgroundColor: '#FEE2E2', borderRadius: 8, paddingHorizontal: 12, paddingVertical: 9 },
  delConfirmTxt: { color: '#DC2626', fontWeight: '700', fontSize: 12 },
});

// AI mini chat
const ai = StyleSheet.create({
  wrap: { gap: 10, borderTopWidth: 1, borderTopColor: C.border, paddingTop: 16 },
  header: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  title: { color: C.text, fontSize: 13, fontWeight: '700' },
  betaBadge: { backgroundColor: '#EEF2FF', borderRadius: 4, paddingHorizontal: 6, paddingVertical: 2 },
  betaTxt: { color: C.primary, fontSize: 10, fontWeight: '700' },
  quickWrap: { gap: 6 },
  quickBtn: { backgroundColor: '#F5F3FF', borderRadius: 8, padding: 10, borderWidth: 1, borderColor: '#DDD6FE' },
  quickTxt: { color: C.primary, fontSize: 13 },
  bubble: { borderRadius: 12, padding: 12 },
  bubbleUser: { backgroundColor: C.primary, alignSelf: 'flex-end', maxWidth: '85%' },
  bubbleAI: { backgroundColor: '#F3F4F6', alignSelf: 'flex-start', maxWidth: '85%' },
  bubbleTxt: { color: C.text, fontSize: 13, lineHeight: 20 },
  inputRow: { flexDirection: 'row', gap: 8 },
  input: { flex: 1, backgroundColor: '#F3F4F6', borderRadius: 20, paddingHorizontal: 14, paddingVertical: 8, fontSize: 13, color: C.text },
  sendBtn: { backgroundColor: C.primary, borderRadius: 20, paddingHorizontal: 14, justifyContent: 'center' },
  sendTxt: { color: '#fff', fontSize: 14 },
});

// AI診断パネル
const diag = StyleSheet.create({
  header: { padding: 24, paddingBottom: 12, borderBottomWidth: 1, borderBottomColor: C.border },
  title: { color: C.text, fontSize: 22, fontWeight: '800', marginBottom: 4 },
  sub: { color: C.sub, fontSize: 13 },
  tabBar: { flexDirection: 'row', backgroundColor: C.panel, borderBottomWidth: 1, borderBottomColor: C.border },
  tabBtn: { flex: 1, paddingVertical: 14, alignItems: 'center', borderBottomWidth: 2, borderBottomColor: 'transparent' },
  tabBtnActive: { borderBottomColor: C.primary },
  tabTxt: { color: C.muted, fontSize: 13, fontWeight: '600' },
  tabTxtActive: { color: C.primary, fontWeight: '700' },
  content: { padding: 24, gap: 14 },
  runBtn: { backgroundColor: C.primary, borderRadius: 12, padding: 16, alignItems: 'center' },
  runBtnTxt: { color: '#fff', fontSize: 15, fontWeight: '700' },
  stepBox: { flexDirection: 'row', gap: 10, backgroundColor: C.panel, borderRadius: 10, padding: 14, alignItems: 'center', borderWidth: 1, borderColor: C.border },
  stepTxt: { color: C.primary, fontSize: 13 },
  resultWrap: { gap: 12 },
  priorityCard: { backgroundColor: '#EEF2FF', borderRadius: 12, padding: 16, borderLeftWidth: 4, borderLeftColor: C.primary },
  priorityLabel: { color: C.primary, fontSize: 11, fontWeight: '800', marginBottom: 6 },
  priorityTxt: { color: C.text, fontSize: 14, lineHeight: 22, fontWeight: '600' },
  summaryCard: { backgroundColor: C.panel, borderRadius: 12, padding: 16, borderWidth: 1, borderColor: C.border },
  summaryTxt: { color: C.text, fontSize: 14, lineHeight: 22 },
  alertCard: { borderRadius: 12, padding: 16, borderLeftWidth: 4 },
  alertHead: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 6 },
  alertTitle: { fontSize: 14, fontWeight: '800' },
  alertDetail: { color: '#374151', fontSize: 13, lineHeight: 20 },
  schedCard: { backgroundColor: C.panel, borderRadius: 12, padding: 16, flexDirection: 'row', gap: 16, borderWidth: 1, borderColor: C.border },
  schedLeft: { alignItems: 'center', minWidth: 52 },
  schedTime: { color: C.primary, fontSize: 18, fontWeight: '800' },
  schedDur: { color: C.muted, fontSize: 11, marginTop: 2 },
  schedTask: { color: C.text, fontSize: 14, fontWeight: '600' },
  schedReason: { color: C.muted, fontSize: 12 },
  quickBtn: { backgroundColor: C.panel, borderRadius: 10, padding: 14, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', borderWidth: 1, borderColor: C.border },
  quickTxt: { color: C.text, fontSize: 14, flex: 1 },
  bubble: { borderRadius: 14, padding: 12 },
  bubbleUser: { backgroundColor: C.primary, alignSelf: 'flex-end', maxWidth: '80%' },
  bubbleAI: { backgroundColor: '#F3F4F6', alignSelf: 'flex-start', maxWidth: '80%' },
  chatInput: { flexDirection: 'row', gap: 10, marginTop: 4 },
  chatInputField: { flex: 1, backgroundColor: '#F3F4F6', borderRadius: 24, paddingHorizontal: 16, paddingVertical: 10, fontSize: 14, color: C.text },
  chatSendBtn: { backgroundColor: C.primary, borderRadius: 24, paddingHorizontal: 16, justifyContent: 'center' },
});

// メイン
const w = StyleSheet.create({
  root: { flex: 1, flexDirection: 'row', backgroundColor: C.bg },
  main: { flex: 1, flexDirection: 'column', borderRightWidth: 1, borderRightColor: C.border },
  mainHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 24, paddingVertical: 18, borderBottomWidth: 1, borderBottomColor: C.border, backgroundColor: C.panel },
  mainTitle: { color: C.text, fontSize: 20, fontWeight: '800' },
  filterRow: { flexDirection: 'row', gap: 2, backgroundColor: '#F3F4F6', borderRadius: 10, padding: 3 },
  filterBtn: { paddingHorizontal: 14, paddingVertical: 7, borderRadius: 8 },
  filterBtnActive: { backgroundColor: C.panel, shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.08, shadowRadius: 2 },
  filterBtnTxt: { color: C.muted, fontSize: 13, fontWeight: '600' },
  filterBtnTxtActive: { color: C.text, fontWeight: '700' },
  listScroll: { flex: 1 },
  listContent: { paddingVertical: 8 },
  divider: { height: 1, backgroundColor: '#F3F4F6', marginLeft: 52 },
  empty: { alignItems: 'center', paddingTop: 80 },
  emptyIcon: { fontSize: 40, marginBottom: 12 },
  emptyTxt: { color: C.muted, fontSize: 15 },
  panel: { width: 360, backgroundColor: C.panel },
  panelEmpty: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 12 },
  panelEmptyIcon: { fontSize: 36 },
  panelEmptyTxt: { color: C.muted, fontSize: 14, textAlign: 'center', lineHeight: 22 },
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.4)', alignItems: 'center', justifyContent: 'center' },
  modalBox: { backgroundColor: C.panel, borderRadius: 16, width: 600, maxHeight: '85%', overflow: 'hidden' },
  modalHead: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: 20, borderBottomWidth: 1, borderBottomColor: C.border },
  modalTitle: { fontSize: 18, fontWeight: '800', color: C.text },
  modalX: { width: 30, height: 30, borderRadius: 15, backgroundColor: '#F3F4F6', alignItems: 'center', justifyContent: 'center' },
  modalXTxt: { color: C.sub, fontSize: 14, fontWeight: '700' },
});
