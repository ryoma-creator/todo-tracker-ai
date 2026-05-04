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

type NavKey = 'all' | 'today' | 'in_progress' | 'done' | 'important' | 'ai';
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

        {/* AI分析 */}
        <View style={sb.divider} />
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
function TaskRow({ task, selected, onSelect, onToggleDone }: {
  task: TodoTask;
  selected: boolean;
  onSelect: () => void;
  onToggleDone: () => void;
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

// ── 詳細パネル ────────────────────────────────────────────────────
function DetailPanel({ task, onClose, onEdit, onDelete, onStatusChange }: {
  task: TodoTask;
  onClose: () => void;
  onEdit: () => void;
  onDelete: () => void;
  onStatusChange: (s: string) => void;
}) {
  const ps = PRIORITY_STYLE[task.priority] ?? PRIORITY_STYLE[3];
  const [confirmDel, setConfirmDel] = useState(false);

  return (
    <View style={dp.wrap}>
      {/* ヘッダー */}
      <View style={dp.header}>
        <Text style={dp.title} numberOfLines={3}>{task.title}</Text>
        <TouchableOpacity onPress={onClose} style={dp.closeBtn}>
          <Text style={dp.closeTxt}>✕</Text>
        </TouchableOpacity>
      </View>

      <ScrollView style={dp.scroll} contentContainerStyle={dp.scrollContent} showsVerticalScrollIndicator={false}>
        {/* ステータス */}
        <View style={dp.section}>
          <View style={dp.statusRow}>
            {Object.entries(STATUS_STYLE).map(([key, val]) => {
              const active = task.status === key;
              return (
                <TouchableOpacity
                  key={key}
                  onPress={() => onStatusChange(key)}
                  style={[dp.statusBtn, active && { backgroundColor: val.bg, borderColor: val.text }]}
                >
                  <Text style={[dp.statusBtnTxt, active && { color: val.text, fontWeight: '700' }]}>{val.label}</Text>
                </TouchableOpacity>
              );
            })}
          </View>
        </View>

        {/* メタ情報グリッド */}
        <View style={dp.metaGrid}>
          <View style={dp.metaItem}>
            <Text style={dp.metaLabel}>📅 期限</Text>
            <Text style={[dp.metaVal, { color: task.deadline_time ? '#DC2626' : C.sub }]}>
              {task.deadline_time ?? '未設定'}
            </Text>
          </View>
          <View style={dp.metaItem}>
            <Text style={dp.metaLabel}>🚩 優先度</Text>
            <View style={[dp.metaBadge, { backgroundColor: ps.bg }]}>
              <View style={[dp.metaDot, { backgroundColor: ps.dot }]} />
              <Text style={[dp.metaBadgeTxt, { color: ps.text }]}>{PRIORITY_LABEL[task.priority]}</Text>
            </View>
          </View>
          {task.estimated_minutes ? (
            <View style={dp.metaItem}>
              <Text style={dp.metaLabel}>⏱ 見積もり</Text>
              <Text style={dp.metaVal}>
                {task.estimated_minutes >= 60 ? `${task.estimated_minutes / 60}時間` : `${task.estimated_minutes}分`}
              </Text>
            </View>
          ) : null}
        </View>

        {/* 説明 */}
        {task.description ? (
          <View style={dp.section}>
            <Text style={dp.sectionTitle}>説明</Text>
            <Text style={dp.sectionBody}>{task.description}</Text>
          </View>
        ) : null}

        {/* 得られる価値 */}
        {task.leverage ? (
          <View style={dp.section}>
            <Text style={dp.sectionTitle}>得られる価値</Text>
            <View style={dp.leverageBox}>
              <Text style={dp.leverageTxt}>{task.leverage}</Text>
            </View>
          </View>
        ) : null}

        {/* 進捗メモ */}
        {(() => {
          const notes = parseNotes(task.progress_notes);
          if (!notes.length) return null;
          return (
            <View style={dp.section}>
              <Text style={dp.sectionTitle}>進捗メモ</Text>
              {notes.map((n, i) => (
                <View key={i} style={[dp.noteChip, n.type === 'stuck' ? dp.noteChipWarn : dp.noteChipInfo]}>
                  <Text style={dp.noteIcon}>{n.type === 'doing' ? '▶' : '⚠'}</Text>
                  <Text style={dp.noteTxt}>{n.body}</Text>
                </View>
              ))}
            </View>
          );
        })()}

        {/* 未達成理由 */}
        {task.status === 'failed' && task.fail_reason ? (
          <View style={dp.section}>
            <Text style={dp.sectionTitle}>❌ 達成できなかった理由</Text>
            <View style={dp.failBox}><Text style={dp.failTxt}>{task.fail_reason}</Text></View>
          </View>
        ) : null}

        {/* 達成理由 */}
        {task.status === 'done' && task.achieve_reason ? (
          <View style={dp.section}>
            <Text style={dp.sectionTitle}>✅ 達成できた理由</Text>
            <View style={dp.achieveBox}><Text style={dp.achieveTxt}>{task.achieve_reason}</Text></View>
          </View>
        ) : null}

        {/* AI チャット */}
        <AIMiniChat task={task} />
      </ScrollView>

      {/* アクション */}
      <View style={dp.actions}>
        <TouchableOpacity style={dp.editBtn} onPress={onEdit}>
          <Text style={dp.editTxt}>✏ 編集する</Text>
        </TouchableOpacity>
        {confirmDel ? (
          <View style={{ flexDirection: 'row', gap: 8, alignItems: 'center' }}>
            <TouchableOpacity style={dp.delConfirm} onPress={onDelete}>
              <Text style={dp.delConfirmTxt}>削除する</Text>
            </TouchableOpacity>
            <TouchableOpacity onPress={() => setConfirmDel(false)}>
              <Text style={{ color: C.muted, fontSize: 13 }}>戻る</Text>
            </TouchableOpacity>
          </View>
        ) : (
          <TouchableOpacity style={dp.delBtn} onPress={() => setConfirmDel(true)}>
            <Text style={dp.delTxt}>削除</Text>
          </TouchableOpacity>
        )}
      </View>
    </View>
  );
}

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

  // フィルタリング
  const filtered = tasks.filter((t) => {
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
    all: tasks.length,
    today: tasks.filter((t) => t.date === todayStr).length,
    in_progress: tasks.filter((t) => t.status === 'in_progress').length,
    done: tasks.filter((t) => t.status === 'done').length,
    important: tasks.filter((t) => t.priority === 5).length,
  };

  const NAV_LABELS: Record<NavKey, string> = {
    all: 'すべてのタスク', today: '今日のタスク', in_progress: '着手中',
    done: '完了したタスク', important: '重要なタスク', ai: 'AI診断',
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
    setSelected(null);
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
            onEdit={() => setEditTarget(selected)}
            onDelete={() => handleDelete(selected)}
            onStatusChange={(s) => handleStatusChange(selected, s)}
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
});

// 詳細パネル
const dp = StyleSheet.create({
  wrap: { flex: 1, backgroundColor: C.panel },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', padding: 20, paddingBottom: 16, borderBottomWidth: 1, borderBottomColor: C.border },
  title: { flex: 1, color: C.text, fontSize: 16, fontWeight: '800', lineHeight: 24, paddingRight: 12 },
  closeBtn: { width: 28, height: 28, borderRadius: 14, backgroundColor: '#F3F4F6', alignItems: 'center', justifyContent: 'center' },
  closeTxt: { color: C.sub, fontSize: 13, fontWeight: '700' },
  scroll: { flex: 1 },
  scrollContent: { padding: 20, gap: 18 },
  section: { gap: 8 },
  sectionTitle: { color: C.sub, fontSize: 12, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.5 },
  sectionBody: { color: C.text, fontSize: 14, lineHeight: 22 },
  statusRow: { flexDirection: 'row', gap: 6, flexWrap: 'wrap' },
  statusBtn: { paddingVertical: 6, paddingHorizontal: 12, borderRadius: 8, borderWidth: 1.5, borderColor: C.border },
  statusBtnTxt: { fontSize: 12, color: C.muted, fontWeight: '500' },
  metaGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 16 },
  metaItem: { gap: 4 },
  metaLabel: { color: C.sub, fontSize: 12, fontWeight: '600' },
  metaVal: { color: C.text, fontSize: 14, fontWeight: '600' },
  metaBadge: { flexDirection: 'row', alignItems: 'center', gap: 5, borderRadius: 8, paddingHorizontal: 8, paddingVertical: 4 },
  metaDot: { width: 7, height: 7, borderRadius: 4 },
  metaBadgeTxt: { fontSize: 13, fontWeight: '700' },
  leverageBox: { backgroundColor: '#F5F3FF', borderRadius: 10, padding: 14, borderLeftWidth: 3, borderLeftColor: C.primary },
  leverageTxt: { color: C.text, fontSize: 14, lineHeight: 22 },
  noteChip: { flexDirection: 'row', gap: 8, borderRadius: 8, padding: 10, borderLeftWidth: 2 },
  noteChipInfo: { backgroundColor: '#EEF2FF', borderLeftColor: C.primary },
  noteChipWarn: { backgroundColor: '#FFFBEB', borderLeftColor: '#F59E0B' },
  noteIcon: { fontSize: 13 },
  noteTxt: { flex: 1, color: C.text, fontSize: 13, lineHeight: 18 },
  failBox: { backgroundColor: '#FEF2F2', borderRadius: 10, padding: 14, borderLeftWidth: 3, borderLeftColor: '#EF4444' },
  failTxt: { color: C.text, fontSize: 14, lineHeight: 22 },
  achieveBox: { backgroundColor: '#F0FDF4', borderRadius: 10, padding: 14, borderLeftWidth: 3, borderLeftColor: '#22C55E' },
  achieveTxt: { color: C.text, fontSize: 14, lineHeight: 22 },
  actions: { flexDirection: 'row', gap: 10, padding: 16, borderTopWidth: 1, borderTopColor: C.border, alignItems: 'center' },
  editBtn: { flex: 1, backgroundColor: C.primary, borderRadius: 10, padding: 12, alignItems: 'center' },
  editTxt: { color: '#fff', fontSize: 14, fontWeight: '700' },
  delBtn: { backgroundColor: '#F3F4F6', borderRadius: 10, paddingHorizontal: 16, padding: 12 },
  delTxt: { color: C.sub, fontSize: 13, fontWeight: '600' },
  delConfirm: { backgroundColor: '#FEE2E2', borderRadius: 10, paddingHorizontal: 14, paddingVertical: 12 },
  delConfirmTxt: { color: '#DC2626', fontWeight: '700', fontSize: 13 },
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
