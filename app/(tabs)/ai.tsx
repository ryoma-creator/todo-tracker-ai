import { useState } from 'react';
import { View, Text, TouchableOpacity, ScrollView, StyleSheet, ActivityIndicator, TextInput, Platform } from 'react-native';
import OpenAI from 'openai';
import { supabase } from '../../lib/supabase';

const openai = new OpenAI({
  apiKey: process.env.EXPO_PUBLIC_OPENAI_API_KEY,
  dangerouslyAllowBrowser: true,
});

type AlertLevel = 'danger' | 'warning' | 'good';
type DiagAlert = { level: AlertLevel; title: string; detail: string };
type Diagnosis = { alerts: DiagAlert[]; priority: string; summary: string };
type Message = { role: 'user' | 'assistant'; content: string };
type Tab = 'diagnosis' | 'schedule' | 'chat';
type ScheduleItem = { time: string; task: string; duration: string; reason: string };
type Schedule = { items: ScheduleItem[]; advice: string };

const LEVEL_STYLE: Record<AlertLevel, { bg: string; border: string; text: string; icon: string }> = {
  danger:  { bg: '#FEF2F2', border: '#EF4444', text: '#DC2626', icon: '🚨' },
  warning: { bg: '#FFFBEB', border: '#F59E0B', text: '#D97706', icon: '⚠️' },
  good:    { bg: '#F0FDF4', border: '#22C55E', text: '#16A34A', icon: '✅' },
};

const QUICK_QUESTIONS = [
  '今週の未達成タスクのパターンは？',
  '最もレバレッジが高いタスクは何？',
  '達成率を上げるには何をすべき？',
  '今の自分にとって最優先事項は？',
];

async function fetchConditionContext(limit = 30) {
  const { data } = await supabase
    .from('condition_logs')
    .select('date, sleep_hours, sleep_quality, fatigue, focus, mood, study_hours, memo')
    .order('date', { ascending: false })
    .limit(limit);
  if (!data || data.length === 0) return null;
  return data.map((c) => {
    const parts = [`[${c.date}] 睡眠${c.sleep_hours}h(質${c.sleep_quality})`, `疲労${c.fatigue}`, `集中${c.focus}`, c.mood != null ? `気分${c.mood}` : null, c.study_hours ? `学習${c.study_hours}h` : null, c.memo ? `メモ:${c.memo}` : null].filter(Boolean);
    return parts.join(' ');
  }).join('\n');
}

async function fetchTaskContext(limit = 30) {
  const { data } = await supabase
    .from('todo_tasks')
    .select('date, title, leverage, priority, status, achieve_reason, fail_reason, deadline_time, estimated_minutes')
    .order('date', { ascending: false })
    .limit(limit);
  if (!data || data.length === 0) return null;
  return data.map((t) => {
    const statusStr = t.status === 'done' ? '達成' : t.status === 'failed' ? '未達成' : t.status === 'in_progress' ? '着手中' : '未着手';
    const reasonStr = t.status === 'done' && t.achieve_reason ? ` 理由:${t.achieve_reason}` : t.status === 'failed' && t.fail_reason ? ` 理由:${t.fail_reason}` : '';
    return `[${t.date}] ${t.title}（優先度${t.priority}）→${statusStr}${reasonStr}${t.deadline_time ? ` 締切:${t.deadline_time}` : ''}${t.estimated_minutes ? ` 所要:${t.estimated_minutes}分` : ''}${t.leverage ? ` レバレッジ:${t.leverage}` : ''}`;
  }).join('\n');
}

async function fetchTodayPendingTasks() {
  const today = new Date();
  const dateStr = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;
  const { data } = await supabase.from('todo_tasks').select('title, priority, deadline_time, estimated_minutes, leverage').eq('date', dateStr).eq('status', 'pending').order('priority', { ascending: false });
  return data ?? [];
}

// ── パターン診断 ──────────────────────────────────────
function DiagnosisTab() {
  const [diagnosis, setDiagnosis] = useState<Diagnosis | null>(null);
  const [loading, setLoading] = useState(false);
  const [done, setDone] = useState(false);
  const [step, setStep] = useState('');

  const run = async () => {
    setLoading(true);
    setStep('タスクデータを取得中...');
    const timeoutPromise = new Promise<never>((_, rej) => setTimeout(() => rej(new Error('timeout')), 60000));
    try {
      const [taskContext, conditionContext] = await Promise.all([fetchTaskContext(30), fetchConditionContext(30)]);
      if (!taskContext) {
        setDiagnosis({ alerts: [], priority: '', summary: '記録が少なすぎます。数日タスクを記録すると分析できます。' });
        setDone(true); return;
      }
      setStep(`${taskContext.split('\n').length}件のタスクをAIに送信中...`);
      const response = await Promise.race([
        openai.chat.completions.create({
          model: 'gpt-4o-mini',
          messages: [{ role: 'system', content: `あなたはタスク管理・生産性の専門コーチ。以下のデータからパターン・傾向を分析し、改善提案をしてください。\n\n【タスク記録】\n${taskContext}${conditionContext ? `\n\n【コンディション記録】\n${conditionContext}` : ''}\n\nJSON形式のみで返してください：\n{\n  "alerts": [{"level": "danger"|"warning"|"good", "title": "15字以内", "detail": "具体的な分析"}],\n  "priority": "今すぐ取り組むべき最優先事項（1-2文）",\n  "summary": "全体の傾向まとめ（40字以内）"\n}\ndanger:今すぐ対処 / warning:注意 / good:うまくいっている点。アラートは最大5個。` }],
        }),
        timeoutPromise,
      ]);
      const content = response.choices[0].message.content ?? '{}';
      const match = content.match(/\{[\s\S]*\}/);
      setDiagnosis(JSON.parse(match ? match[0] : content) as Diagnosis);
      setDone(true);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : '不明なエラー';
      setDiagnosis({ alerts: [], priority: '', summary: msg === 'timeout' ? 'タイムアウト。ネット接続を確認して再試行してください。' : `エラー: ${msg}` });
      setDone(true);
    } finally { setLoading(false); setStep(''); }
  };

  return (
    <ScrollView style={a.tabContent} contentContainerStyle={a.tabInner} showsVerticalScrollIndicator={false}>
      <View style={a.pageHeader}>
        <Text style={a.pageTitle}>AIパターン診断</Text>
        <Text style={a.pageSub}>過去の記録から達成傾向・ボトルネックを分析します</Text>
      </View>

      <TouchableOpacity style={a.primaryBtn} onPress={run} disabled={loading} activeOpacity={0.8}>
        {loading ? <ActivityIndicator color="#fff" /> : <Text style={a.primaryBtnTxt}>{done ? '再分析する' : '✦ 分析を開始する'}</Text>}
      </TouchableOpacity>

      {loading && step ? (
        <View style={a.stepBox}>
          <ActivityIndicator color="#6366f1" size="small" />
          <Text style={a.stepTxt}>{step}</Text>
        </View>
      ) : null}

      {diagnosis && (
        <View style={a.resultWrap}>
          {diagnosis.priority ? (
            <View style={a.priorityCard}>
              <Text style={a.priorityCardLabel}>▶ 今すぐやること</Text>
              <Text style={a.priorityCardTxt}>{diagnosis.priority}</Text>
            </View>
          ) : null}
          {diagnosis.summary ? (
            <View style={a.summaryCard}>
              <Text style={a.summaryTxt}>{diagnosis.summary}</Text>
            </View>
          ) : null}
          {diagnosis.alerts.map((alert, i) => {
            const ls = LEVEL_STYLE[alert.level];
            return (
              <View key={i} style={[a.alertCard, { backgroundColor: ls.bg, borderLeftColor: ls.border }]}>
                <View style={a.alertHead}>
                  <Text style={a.alertIcon}>{ls.icon}</Text>
                  <Text style={[a.alertTitle, { color: ls.text }]}>{alert.title}</Text>
                </View>
                <Text style={a.alertDetail}>{alert.detail}</Text>
              </View>
            );
          })}
        </View>
      )}
    </ScrollView>
  );
}

// ── スケジュール提案 ──────────────────────────────────
function ScheduleTab() {
  const [schedule, setSchedule] = useState<Schedule | null>(null);
  const [loading, setLoading] = useState(false);
  const [step, setStep] = useState('');

  const run = async () => {
    setLoading(true);
    setStep('今日のタスクを取得中...');
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 60000);
    try {
      const [tasks, conditionContext] = await Promise.all([fetchTodayPendingTasks(), fetchConditionContext(3)]);
      if (tasks.length === 0) { setSchedule({ items: [], advice: '今日の未着手タスクがありません。タスクを追加してから実行してください。' }); return; }
      const taskList = tasks.map((t) => [`・${t.title}（優先度${t.priority}）`, t.deadline_time ? `締切:${t.deadline_time}` : null, t.estimated_minutes ? `所要:${t.estimated_minutes}分` : null, t.leverage ? `価値:${t.leverage}` : null].filter(Boolean).join(' ')).join('\n');
      setStep(`${tasks.length}件のタスクを分析中...`);
      const now = new Date();
      const response = await openai.chat.completions.create({
        model: 'gpt-4o-mini',
        messages: [{ role: 'system', content: `あなたは生産性コーチ。今日の残りタスクを最適な順番・時間割で組み立ててください。\n\n現在時刻: ${String(now.getHours()).padStart(2,'0')}:${String(now.getMinutes()).padStart(2,'0')}\n\n【今日の未着手タスク】\n${taskList}\n\n${conditionContext ? `【直近のコンディション】\n${conditionContext}` : ''}\n\nJSON形式のみで返してください：\n{\n  "items": [{"time": "14:00", "task": "タスク名", "duration": "30分", "reason": "理由10字以内"}],\n  "advice": "今日全体へのアドバイス（40字以内）"\n}` }],
        // @ts-expect-error signal
        signal: controller.signal,
      });
      const content = response.choices[0].message.content ?? '{}';
      const match = content.match(/\{[\s\S]*\}/);
      setSchedule(JSON.parse(match ? match[0] : content) as Schedule);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : '不明なエラー';
      setSchedule({ items: [], advice: `エラー: ${msg}` });
    } finally { clearTimeout(timeout); setLoading(false); setStep(''); }
  };

  return (
    <ScrollView style={a.tabContent} contentContainerStyle={a.tabInner} showsVerticalScrollIndicator={false}>
      <View style={a.pageHeader}>
        <Text style={a.pageTitle}>時間割を生成</Text>
        <Text style={a.pageSub}>締切・優先度・レバレッジを元にAIが最適な時間割を組みます</Text>
      </View>

      <TouchableOpacity style={a.primaryBtn} onPress={run} disabled={loading} activeOpacity={0.8}>
        {loading ? <ActivityIndicator color="#fff" /> : <Text style={a.primaryBtnTxt}>✦ スケジュールを生成</Text>}
      </TouchableOpacity>

      {loading && step ? (
        <View style={a.stepBox}>
          <ActivityIndicator color="#6366f1" size="small" />
          <Text style={a.stepTxt}>{step}</Text>
        </View>
      ) : null}

      {schedule && (
        <View style={a.resultWrap}>
          {schedule.advice ? <View style={a.summaryCard}><Text style={a.summaryTxt}>{schedule.advice}</Text></View> : null}
          {schedule.items.map((item, i) => (
            <View key={i} style={a.schedCard}>
              <View style={a.schedLeft}>
                <Text style={a.schedTime}>{item.time}</Text>
                <Text style={a.schedDur}>{item.duration}</Text>
              </View>
              <View style={a.schedRight}>
                <Text style={a.schedTask}>{item.task}</Text>
                <Text style={a.schedReason}>{item.reason}</Text>
              </View>
            </View>
          ))}
        </View>
      )}
    </ScrollView>
  );
}

// ── チャット ──────────────────────────────────────────
function ChatTab() {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);

  const send = async (text: string) => {
    if (!text.trim() || loading) return;
    setInput('');
    setLoading(true);
    const newMessages: Message[] = [...messages, { role: 'user', content: text }];
    setMessages(newMessages);
    const [taskContext, conditionContext] = await Promise.all([fetchTaskContext(14), fetchConditionContext(14)]);
    const response = await openai.chat.completions.create({
      model: 'gpt-4o-mini',
      messages: [
        { role: 'system', content: `あなたはRyomaの生産性コーチ。\n【過去14日のタスク記録】\n${taskContext ?? 'まだ記録がありません'}${conditionContext ? `\n\n【コンディション記録】\n${conditionContext}` : ''}\n・日本語・短く端的に答える\n・コンディションとタスク達成の相関も踏まえてアドバイスする` },
        ...newMessages,
      ],
    });
    setMessages([...newMessages, { role: 'assistant', content: response.choices[0].message.content ?? '' }]);
    setLoading(false);
  };

  return (
    <View style={a.chatWrap}>
      <ScrollView style={a.chatScroll} contentContainerStyle={a.chatContent} showsVerticalScrollIndicator={false}>
        {messages.length === 0 ? (
          <View>
            <Text style={a.chatHint}>タスクデータをもとに答えます</Text>
            <View style={a.quickList}>
              {QUICK_QUESTIONS.map((q) => (
                <TouchableOpacity key={q} style={a.quickBtn} onPress={() => send(q)} activeOpacity={0.7}>
                  <Text style={a.quickBtnTxt}>{q}</Text>
                  <Text style={a.quickArrow}>→</Text>
                </TouchableOpacity>
              ))}
            </View>
          </View>
        ) : null}
        {messages.map((m, i) => (
          <View key={i} style={[a.bubble, m.role === 'user' ? a.bubbleUser : a.bubbleAI]}>
            {m.role === 'assistant' && <Text style={a.bubbleRole}>AI</Text>}
            <Text style={[a.bubbleTxt, m.role === 'user' && { color: '#fff' }]}>{m.content}</Text>
          </View>
        ))}
        {loading && <ActivityIndicator color="#6366f1" style={{ marginTop: 16 }} />}
      </ScrollView>

      <View style={a.inputRow}>
        <TextInput
          style={a.input}
          value={input}
          onChangeText={setInput}
          placeholder="質問を入力..."
          placeholderTextColor="#94A3B8"
          returnKeyType="send"
          onSubmitEditing={() => send(input)}
        />
        <TouchableOpacity style={[a.sendBtn, (!input.trim() || loading) && a.sendBtnDisabled]} onPress={() => send(input)} disabled={!input.trim() || loading}>
          <Text style={a.sendBtnTxt}>送信</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

// ── メイン ────────────────────────────────────────────
export default function AIScreen() {
  const [tab, setTab] = useState<Tab>('diagnosis');
  const TABS: [Tab, string][] = [['diagnosis', 'パターン診断'], ['schedule', '時間割'], ['chat', 'チャット']];

  return (
    <View style={a.container}>
      {/* タブバー */}
      <View style={a.tabBar}>
        {TABS.map(([key, label]) => (
          <TouchableOpacity key={key} style={[a.tabBtn, tab === key && a.tabBtnActive]} onPress={() => setTab(key)}>
            <Text style={[a.tabBtnTxt, tab === key && a.tabBtnTxtActive]}>{label}</Text>
          </TouchableOpacity>
        ))}
      </View>

      {tab === 'diagnosis' && <DiagnosisTab />}
      {tab === 'schedule' && <ScheduleTab />}
      {tab === 'chat' && <ChatTab />}
    </View>
  );
}

const a = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F2F4F8' },

  // タブバー
  tabBar: { flexDirection: 'row', backgroundColor: '#fff', borderBottomWidth: 1, borderBottomColor: '#E8EBF2' },
  tabBtn: { flex: 1, paddingVertical: 14, alignItems: 'center', borderBottomWidth: 2, borderBottomColor: 'transparent' },
  tabBtnActive: { borderBottomColor: '#6366f1' },
  tabBtnTxt: { color: '#94A3B8', fontSize: 13, fontWeight: '600' },
  tabBtnTxtActive: { color: '#6366f1', fontWeight: '700' },

  // 共通
  tabContent: { flex: 1 },
  tabInner: { padding: 20, paddingBottom: 48, gap: 16 },
  pageHeader: { gap: 4 },
  pageTitle: { color: '#1A1D2E', fontSize: 22, fontWeight: '800' },
  pageSub: { color: '#64748B', fontSize: 13, lineHeight: 20 },
  primaryBtn: { backgroundColor: '#6366f1', borderRadius: 14, padding: 16, alignItems: 'center', ...Platform.select({ ios: { shadowColor: '#6366f1', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.3, shadowRadius: 8 }, android: { elevation: 4 }, default: { boxShadow: '0 4px 12px rgba(99,102,241,0.3)' } as any }) },
  primaryBtnTxt: { color: '#fff', fontSize: 15, fontWeight: '700' },
  stepBox: { flexDirection: 'row', gap: 10, backgroundColor: '#fff', borderRadius: 12, padding: 14, alignItems: 'center', borderWidth: 1, borderColor: '#E8EBF2' },
  stepTxt: { color: '#6366f1', fontSize: 13 },

  // 結果
  resultWrap: { gap: 12 },
  priorityCard: { backgroundColor: '#EDE9FE', borderRadius: 14, padding: 16, borderLeftWidth: 4, borderLeftColor: '#6366f1' },
  priorityCardLabel: { color: '#6366f1', fontSize: 11, fontWeight: '800', marginBottom: 6, letterSpacing: 0.5 },
  priorityCardTxt: { color: '#1A1D2E', fontSize: 15, lineHeight: 24, fontWeight: '600' },
  summaryCard: { backgroundColor: '#fff', borderRadius: 14, padding: 16, borderWidth: 1, borderColor: '#E8EBF2' },
  summaryTxt: { color: '#374151', fontSize: 14, lineHeight: 22 },
  alertCard: { borderRadius: 14, padding: 16, borderLeftWidth: 4 },
  alertHead: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 6 },
  alertIcon: { fontSize: 16 },
  alertTitle: { fontSize: 14, fontWeight: '800' },
  alertDetail: { color: '#374151', fontSize: 13, lineHeight: 20 },

  // スケジュール
  schedCard: { backgroundColor: '#fff', borderRadius: 14, padding: 16, flexDirection: 'row', gap: 16, borderWidth: 1, borderColor: '#E8EBF2' },
  schedLeft: { alignItems: 'center', minWidth: 52 },
  schedTime: { color: '#6366f1', fontSize: 18, fontWeight: '800' },
  schedDur: { color: '#94A3B8', fontSize: 11, marginTop: 2 },
  schedRight: { flex: 1, gap: 4 },
  schedTask: { color: '#1A1D2E', fontSize: 15, fontWeight: '600' },
  schedReason: { color: '#94A3B8', fontSize: 12 },

  // チャット
  chatWrap: { flex: 1 },
  chatScroll: { flex: 1 },
  chatContent: { padding: 20, paddingBottom: 8, gap: 12 },
  chatHint: { color: '#94A3B8', textAlign: 'center', marginBottom: 16, fontSize: 13 },
  quickList: { gap: 10 },
  quickBtn: { backgroundColor: '#fff', borderRadius: 12, padding: 16, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', borderWidth: 1, borderColor: '#E8EBF2' },
  quickBtnTxt: { color: '#374151', fontSize: 14, flex: 1 },
  quickArrow: { color: '#6366f1', fontSize: 16, fontWeight: '700' },
  bubble: { borderRadius: 16, padding: 14, maxWidth: '85%' },
  bubbleUser: { backgroundColor: '#6366f1', alignSelf: 'flex-end' },
  bubbleAI: { backgroundColor: '#fff', alignSelf: 'flex-start', borderWidth: 1, borderColor: '#E8EBF2' },
  bubbleRole: { color: '#6366f1', fontSize: 10, fontWeight: '800', marginBottom: 4 },
  bubbleTxt: { color: '#1A1D2E', fontSize: 14, lineHeight: 22 },
  inputRow: { flexDirection: 'row', padding: 16, gap: 10, borderTopWidth: 1, borderTopColor: '#E8EBF2', backgroundColor: '#fff' },
  input: { flex: 1, backgroundColor: '#F2F4F8', color: '#1A1D2E', borderRadius: 24, paddingHorizontal: 18, paddingVertical: 12, fontSize: 14, borderWidth: 1, borderColor: '#E2E8F0' },
  sendBtn: { backgroundColor: '#6366f1', borderRadius: 24, paddingHorizontal: 18, justifyContent: 'center' },
  sendBtnDisabled: { backgroundColor: '#C7D2FE' },
  sendBtnTxt: { color: '#fff', fontWeight: '700', fontSize: 14 },
});
