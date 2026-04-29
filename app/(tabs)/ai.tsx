import { useState } from 'react';
import { View, Text, TouchableOpacity, ScrollView, StyleSheet, ActivityIndicator, TextInput } from 'react-native';
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

const LEVEL_COLOR: Record<AlertLevel, string> = {
  danger: '#ef4444',
  warning: '#f59e0b',
  good: '#22c55e',
};
const LEVEL_ICON: Record<AlertLevel, string> = {
  danger: '🚨',
  warning: '⚠️',
  good: '✅',
};

const QUICK_QUESTIONS = [
  '今週の未達成タスクのパターンは？',
  '最もレバレッジが高いタスクは何？',
  '達成率を上げるには何をすべき？',
  '今の自分にとって最優先事項は？',
];

// condition_logsからコンディションデータを取得
async function fetchConditionContext(limit = 30) {
  const { data } = await supabase
    .from('condition_logs')
    .select('date, sleep_hours, sleep_quality, fatigue, focus, mood, study_hours, memo')
    .order('date', { ascending: false })
    .limit(limit);

  if (!data || data.length === 0) return null;

  return data.map((c) => {
    const parts = [
      `[${c.date}] 睡眠${c.sleep_hours}h(質${c.sleep_quality})`,
      `疲労${c.fatigue}`,
      `集中${c.focus}`,
      c.mood != null ? `気分${c.mood}` : null,
      c.study_hours ? `学習${c.study_hours}h` : null,
      c.memo ? `メモ:${c.memo}` : null,
    ].filter(Boolean);
    return parts.join(' ');
  }).join('\n');
}

// 過去タスクを文字列に変換してAIに渡す
async function fetchTaskContext(limit = 30) {
  const { data } = await supabase
    .from('todo_tasks')
    .select('date, title, leverage, priority, status, achieve_reason, fail_reason, deadline_time, estimated_minutes')
    .order('date', { ascending: false })
    .limit(limit);

  if (!data || data.length === 0) return null;

  return data.map((t) => {
    const statusStr = t.status === 'done' ? '達成' : t.status === 'failed' ? '未達成' : t.status === 'in_progress' ? '着手中' : '未着手';
    const reasonStr = t.status === 'done' && t.achieve_reason
      ? ` 理由:${t.achieve_reason}`
      : t.status === 'failed' && t.fail_reason
        ? ` 理由:${t.fail_reason}`
        : '';
    const timeStr = t.deadline_time ? ` 締切:${t.deadline_time}` : '';
    const estStr = t.estimated_minutes ? ` 所要:${t.estimated_minutes}分` : '';
    return `[${t.date}] ${t.title}（優先度${t.priority}）→${statusStr}${reasonStr}${timeStr}${estStr}${t.leverage ? ` レバレッジ:${t.leverage}` : ''}`;
  }).join('\n');
}

// 今日の未着手タスクを取得してスケジュール提案に使う
async function fetchTodayPendingTasks() {
  const today = new Date();
  const dateStr = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;
  const { data } = await supabase
    .from('todo_tasks')
    .select('title, priority, deadline_time, estimated_minutes, leverage')
    .eq('date', dateStr)
    .eq('status', 'pending')
    .order('priority', { ascending: false });
  return data ?? [];
}

// パターン診断タブ
function DiagnosisTab() {
  const [diagnosis, setDiagnosis] = useState<Diagnosis | null>(null);
  const [loading, setLoading] = useState(false);
  const [done, setDone] = useState(false);
  const [step, setStep] = useState('');

  const runDiagnosis = async () => {
    setLoading(true);
    setStep('タスクデータを取得中...');

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 60000);

    try {
      const [taskContext, conditionContext] = await Promise.all([
        fetchTaskContext(30),
        fetchConditionContext(30),
      ]);

      if (!taskContext) {
        setDiagnosis({ alerts: [], priority: '', summary: '記録が少なすぎます。数日タスクを記録すると分析できます。' });
        setDone(true);
        return;
      }

      const recordCount = taskContext.split('\n').length;
      setStep(`${recordCount}件のタスク + コンディションデータをAIに送信中...`);
      await new Promise((r) => setTimeout(r, 300));
      setStep('AIが分析中... (通常15〜30秒)');

      const conditionSection = conditionContext
        ? `\n\n【コンディション記録（condition-tracker連携）】\n${conditionContext}`
        : '';

      const response = await openai.chat.completions.create({
        model: 'gpt-4o-mini',
        messages: [{
          role: 'system',
          content: `あなたはタスク管理・生産性の専門コーチ。以下のデータからパターン・傾向を分析し、改善提案をしてください。

【タスク記録】
${taskContext}${conditionSection}

コンディションデータがある場合は「睡眠時間とタスク達成率の相関」「疲労度が高い日の傾向」なども分析してください。

以下のJSON形式のみで返してください：
{
  "alerts": [
    {
      "level": "danger" | "warning" | "good",
      "title": "タイトル（15字以内）",
      "detail": "具体的な分析（数値・相関を含む）"
    }
  ],
  "priority": "今すぐ取り組むべき最優先事項（具体的に、1-2文）",
  "summary": "全体の傾向まとめ（40字以内）"
}

danger: 今すぐ対処が必要 / warning: 注意が必要 / good: うまくいっている点
アラートは最大5個。`,
        }],
        // @ts-expect-error signal はSDKの型定義にないが fetch レベルで有効
        signal: controller.signal,
      });

      setStep('結果を整形中...');
      const content = response.choices[0].message.content ?? '{}';
      const match = content.match(/\{[\s\S]*\}/);
      const parsed = JSON.parse(match ? match[0] : content) as Diagnosis;
      setDiagnosis(parsed);
      setDone(true);

    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : '不明なエラー';
      const isTimeout = msg.includes('abort') || msg.includes('AbortError');
      setDiagnosis({
        alerts: [],
        priority: '',
        summary: isTimeout ? 'タイムアウト（60秒）。ネット接続を確認して再試行してください。' : `エラー: ${msg}`,
      });
      setDone(true);
    } finally {
      clearTimeout(timeout);
      setLoading(false);
      setStep('');
    }
  };

  return (
    <ScrollView style={t.tabContent} contentContainerStyle={t.tabInner}>
      <Text style={t.diagTitle}>AI パターン診断</Text>
      <Text style={t.diagSub}>過去の記録から達成傾向・ボトルネックを分析します</Text>

      <TouchableOpacity style={t.diagBtn} onPress={runDiagnosis} disabled={loading}>
        {loading
          ? <ActivityIndicator color="#fff" />
          : <Text style={t.diagBtnTxt}>{done ? '再分析する' : '分析する'}</Text>}
      </TouchableOpacity>

      {loading && step ? (
        <View style={t.stepBox}>
          <Text style={t.stepText}>{step}</Text>
        </View>
      ) : null}

      {diagnosis && (
        <View style={t.result}>
          {/* 最優先事項 */}
          {diagnosis.priority ? (
            <View style={t.priorityBox}>
              <Text style={t.priorityLabel}>今すぐやること</Text>
              <Text style={t.priorityText}>{diagnosis.priority}</Text>
            </View>
          ) : null}

          {/* サマリー */}
          <View style={t.summaryBox}>
            <Text style={t.summaryText}>{diagnosis.summary}</Text>
          </View>

          {/* アラート */}
          {diagnosis.alerts.map((alert, i) => (
            <View key={i} style={[t.alertCard, { borderLeftColor: LEVEL_COLOR[alert.level] }]}>
              <View style={t.alertHeader}>
                <Text style={t.alertIcon}>{LEVEL_ICON[alert.level]}</Text>
                <Text style={[t.alertTitle, { color: LEVEL_COLOR[alert.level] }]}>{alert.title}</Text>
              </View>
              <Text style={t.alertDetail}>{alert.detail}</Text>
            </View>
          ))}
        </View>
      )}
    </ScrollView>
  );
}

// スケジュール提案タブ
function ScheduleTab() {
  const [schedule, setSchedule] = useState<Schedule | null>(null);
  const [loading, setLoading] = useState(false);
  const [step, setStep] = useState('');

  const runSchedule = async () => {
    setLoading(true);
    setStep('今日のタスクを取得中...');

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 60000);

    try {
      const [tasks, conditionContext] = await Promise.all([
        fetchTodayPendingTasks(),
        fetchConditionContext(3),
      ]);

      if (tasks.length === 0) {
        setSchedule({ items: [], advice: '今日の未着手タスクがありません。タスクを追加してから実行してください。' });
        return;
      }

      const taskList = tasks.map((t) => {
        const parts = [`・${t.title}（優先度${t.priority}）`];
        if (t.deadline_time) parts.push(`締切:${t.deadline_time}`);
        if (t.estimated_minutes) parts.push(`所要:${t.estimated_minutes}分`);
        if (t.leverage) parts.push(`価値:${t.leverage}`);
        return parts.join(' ');
      }).join('\n');

      setStep(`${tasks.length}件のタスクを分析中...`);

      const now = new Date();
      const currentTime = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;

      const response = await openai.chat.completions.create({
        model: 'gpt-4o-mini',
        messages: [{
          role: 'system',
          content: `あなたは生産性コーチ。今日の残りタスクを最適な順番・時間割で組み立ててください。

現在時刻: ${currentTime}

【今日の未着手タスク】
${taskList}

${conditionContext ? `【直近のコンディション】\n${conditionContext}` : ''}

以下のJSON形式のみで返してください：
{
  "items": [
    {
      "time": "開始時刻（例: 14:00）",
      "task": "タスク名",
      "duration": "所要時間（例: 30分）",
      "reason": "この順番にした理由（10字以内）"
    }
  ],
  "advice": "今日全体へのアドバイス（40字以内）"
}

優先度・締切・レバレッジ・コンディションを総合して最適な順番を決定すること。`,
        }],
        // @ts-expect-error signal はSDKの型定義にないが fetch レベルで有効
        signal: controller.signal,
      });

      const content = response.choices[0].message.content ?? '{}';
      const match = content.match(/\{[\s\S]*\}/);
      const parsed = JSON.parse(match ? match[0] : content) as Schedule;
      setSchedule(parsed);

    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : '不明なエラー';
      setSchedule({ items: [], advice: `エラー: ${msg}` });
    } finally {
      clearTimeout(timeout);
      setLoading(false);
      setStep('');
    }
  };

  return (
    <ScrollView style={t.tabContent} contentContainerStyle={t.tabInner}>
      <Text style={t.diagTitle}>今日のスケジュール提案</Text>
      <Text style={t.diagSub}>締切・優先度・レバレッジを元にAIが最適な時間割を組みます</Text>

      <TouchableOpacity style={t.diagBtn} onPress={runSchedule} disabled={loading}>
        {loading ? <ActivityIndicator color="#fff" /> : <Text style={t.diagBtnTxt}>スケジュールを生成</Text>}
      </TouchableOpacity>

      {loading && step ? (
        <View style={t.stepBox}>
          <Text style={t.stepText}>{step}</Text>
        </View>
      ) : null}

      {schedule && (
        <View style={t.result}>
          {schedule.advice ? (
            <View style={t.summaryBox}>
              <Text style={t.summaryText}>{schedule.advice}</Text>
            </View>
          ) : null}

          {schedule.items.map((item, i) => (
            <View key={i} style={t.scheduleCard}>
              <View style={t.scheduleHeader}>
                <Text style={t.scheduleTime}>{item.time}</Text>
                <Text style={t.scheduleDuration}>{item.duration}</Text>
              </View>
              <Text style={t.scheduleTask}>{item.task}</Text>
              <Text style={t.scheduleReason}>{item.reason}</Text>
            </View>
          ))}
        </View>
      )}
    </ScrollView>
  );
}

// チャットタブ
function ChatTab() {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);

  const sendMessage = async (text: string) => {
    if (!text.trim() || loading) return;
    setInput('');
    setLoading(true);

    const newMessages: Message[] = [...messages, { role: 'user', content: text }];
    setMessages(newMessages);

    const [taskContext, conditionContext] = await Promise.all([
      fetchTaskContext(14),
      fetchConditionContext(14),
    ]);

    const conditionSection = conditionContext
      ? `\n\n【コンディション記録】\n${conditionContext}`
      : '';

    const response = await openai.chat.completions.create({
      model: 'gpt-4o-mini',
      messages: [
        {
          role: 'system',
          content: `あなたはRyomaの生産性コーチ。
【過去14日のタスク記録】
${taskContext ?? 'まだ記録がありません'}${conditionSection}

・日本語・短く端的に答える
・コンディションとタスク達成の相関も踏まえてアドバイスする
・記録が少ない場合は「記録を続けると分析できます」と伝える`,
        },
        ...newMessages,
      ],
    });

    const aiContent = response.choices[0].message.content ?? '';
    setMessages([...newMessages, { role: 'assistant', content: aiContent }]);
    setLoading(false);
  };

  return (
    <View style={t.chatContainer}>
      <ScrollView style={t.messages} contentContainerStyle={t.messagesContent}>
        {messages.length === 0 && (
          <View>
            <Text style={t.hint}>タスクデータをもとに答えます</Text>
            <View style={t.quickBtns}>
              {QUICK_QUESTIONS.map((q) => (
                <TouchableOpacity key={q} style={t.quickBtn} onPress={() => sendMessage(q)}>
                  <Text style={t.quickBtnTxt}>{q}</Text>
                </TouchableOpacity>
              ))}
            </View>
          </View>
        )}
        {messages.map((m, i) => (
          <View key={i} style={[t.bubble, m.role === 'user' ? t.userBubble : t.aiBubble]}>
            <Text style={t.bubbleTxt}>{m.content}</Text>
          </View>
        ))}
        {loading && <ActivityIndicator color="#6366f1" style={{ marginTop: 16 }} />}
      </ScrollView>

      <View style={t.inputRow}>
        <TextInput
          style={t.input}
          value={input}
          onChangeText={setInput}
          placeholder="質問する..."
          placeholderTextColor="#444"
          returnKeyType="send"
          onSubmitEditing={() => sendMessage(input)}
        />
        <TouchableOpacity style={t.sendBtn} onPress={() => sendMessage(input)} disabled={loading}>
          <Text style={t.sendBtnTxt}>送信</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

export default function AIScreen() {
  const [tab, setTab] = useState<Tab>('diagnosis');

  return (
    <View style={t.container}>
      <View style={t.tabBar}>
        <TouchableOpacity
          style={[t.tabBtn, tab === 'diagnosis' && t.tabBtnActive]}
          onPress={() => setTab('diagnosis')}
        >
          <Text style={[t.tabBtnTxt, tab === 'diagnosis' && t.tabBtnTxtActive]}>パターン</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[t.tabBtn, tab === 'schedule' && t.tabBtnActive]}
          onPress={() => setTab('schedule')}
        >
          <Text style={[t.tabBtnTxt, tab === 'schedule' && t.tabBtnTxtActive]}>時間割</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[t.tabBtn, tab === 'chat' && t.tabBtnActive]}
          onPress={() => setTab('chat')}
        >
          <Text style={[t.tabBtnTxt, tab === 'chat' && t.tabBtnTxtActive]}>チャット</Text>
        </TouchableOpacity>
      </View>

      {tab === 'diagnosis' && <DiagnosisTab />}
      {tab === 'schedule' && <ScheduleTab />}
      {tab === 'chat' && <ChatTab />}
    </View>
  );
}

const t = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#0f0f0f' },
  tabBar: { flexDirection: 'row', borderBottomWidth: 1, borderBottomColor: '#1e1e1e' },
  tabBtn: { flex: 1, paddingVertical: 14, alignItems: 'center' },
  tabBtnActive: { borderBottomWidth: 2, borderBottomColor: '#6366f1' },
  tabBtnTxt: { color: '#555', fontSize: 14 },
  tabBtnTxtActive: { color: '#6366f1', fontWeight: '600' },
  tabContent: { flex: 1 },
  tabInner: { padding: 24, paddingBottom: 48 },
  diagTitle: { fontSize: 20, fontWeight: 'bold', color: '#fff', marginBottom: 6 },
  diagSub: { fontSize: 13, color: '#555', marginBottom: 24, lineHeight: 20 },
  diagBtn: { backgroundColor: '#6366f1', borderRadius: 12, padding: 14, alignItems: 'center', marginBottom: 16 },
  diagBtnTxt: { color: '#fff', fontSize: 15, fontWeight: '600' },
  stepBox: { backgroundColor: '#1a1a2e', borderRadius: 12, padding: 14, marginBottom: 16, borderWidth: 1, borderColor: '#2d2d4e', alignItems: 'center' },
  stepText: { color: '#a5b4fc', fontSize: 13, textAlign: 'center' },
  scheduleCard: { backgroundColor: '#1a1a1a', borderRadius: 12, padding: 16, borderLeftWidth: 3, borderLeftColor: '#6366f1' },
  scheduleHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 },
  scheduleTime: { color: '#6366f1', fontSize: 18, fontWeight: '800' },
  scheduleDuration: { color: '#555', fontSize: 12 },
  scheduleTask: { color: '#fff', fontSize: 15, fontWeight: '600', marginBottom: 4 },
  scheduleReason: { color: '#6b7280', fontSize: 12 },
  result: { gap: 12 },
  priorityBox: { backgroundColor: '#1e1b4b', borderRadius: 12, padding: 16, borderLeftWidth: 3, borderLeftColor: '#6366f1' },
  priorityLabel: { color: '#6366f1', fontSize: 11, fontWeight: '700', marginBottom: 6 },
  priorityText: { color: '#e0e7ff', fontSize: 15, lineHeight: 22 },
  summaryBox: { backgroundColor: '#1a1a1a', borderRadius: 12, padding: 16 },
  summaryText: { color: '#aaa', fontSize: 14, lineHeight: 22 },
  alertCard: { backgroundColor: '#1a1a1a', borderRadius: 12, padding: 16, borderLeftWidth: 3 },
  alertHeader: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 6 },
  alertIcon: { fontSize: 16 },
  alertTitle: { fontSize: 15, fontWeight: '700' },
  alertDetail: { color: '#888', fontSize: 13, lineHeight: 20 },
  chatContainer: { flex: 1 },
  messages: { flex: 1 },
  messagesContent: { padding: 20, paddingBottom: 8 },
  hint: { color: '#555', textAlign: 'center', marginTop: 32, marginBottom: 20, fontSize: 14 },
  quickBtns: { gap: 10 },
  quickBtn: { backgroundColor: '#1a1a1a', borderRadius: 12, padding: 14, borderWidth: 1, borderColor: '#2a2a2a' },
  quickBtnTxt: { color: '#aaa', fontSize: 14 },
  bubble: { borderRadius: 16, padding: 14, marginBottom: 12, maxWidth: '85%' },
  userBubble: { backgroundColor: '#6366f1', alignSelf: 'flex-end' },
  aiBubble: { backgroundColor: '#1a1a1a', alignSelf: 'flex-start' },
  bubbleTxt: { color: '#fff', fontSize: 15, lineHeight: 22 },
  inputRow: { flexDirection: 'row', padding: 16, gap: 12, borderTopWidth: 1, borderTopColor: '#222' },
  input: { flex: 1, backgroundColor: '#1a1a1a', color: '#fff', borderRadius: 24, paddingHorizontal: 20, paddingVertical: 12, fontSize: 15 },
  sendBtn: { backgroundColor: '#6366f1', borderRadius: 24, paddingHorizontal: 20, justifyContent: 'center' },
  sendBtnTxt: { color: '#fff', fontWeight: '600' },
});
