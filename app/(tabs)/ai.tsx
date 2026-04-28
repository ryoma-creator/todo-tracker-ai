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
type Tab = 'diagnosis' | 'chat';

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

// 過去タスクを文字列に変換してAIに渡す
async function fetchTaskContext(limit = 30) {
  const { data } = await supabase
    .from('todo_tasks')
    .select('date, title, leverage, priority, status, achieve_reason, fail_reason')
    .order('date', { ascending: false })
    .limit(limit);

  if (!data || data.length === 0) return null;

  return data.map((t) => {
    const statusStr = t.status === 'done' ? '達成' : t.status === 'failed' ? '未達成' : '未着手';
    const reasonStr = t.status === 'done' && t.achieve_reason
      ? ` 理由:${t.achieve_reason}`
      : t.status === 'failed' && t.fail_reason
        ? ` 理由:${t.fail_reason}`
        : '';
    return `[${t.date}] ${t.title}（優先度${t.priority}）→${statusStr}${reasonStr}${t.leverage ? ` レバレッジ:${t.leverage}` : ''}`;
  }).join('\n');
}

// パターン診断タブ
function DiagnosisTab() {
  const [diagnosis, setDiagnosis] = useState<Diagnosis | null>(null);
  const [loading, setLoading] = useState(false);
  const [done, setDone] = useState(false);

  const runDiagnosis = async () => {
    setLoading(true);
    const context = await fetchTaskContext(30);

    if (!context) {
      setDiagnosis({ alerts: [], priority: '', summary: '記録が少なすぎます。数日タスクを記録すると分析できます。' });
      setLoading(false);
      setDone(true);
      return;
    }

    const response = await openai.chat.completions.create({
      model: 'gpt-4o-mini',
      messages: [{
        role: 'system',
        content: `あなたはタスク管理・生産性の専門コーチ。以下のタスク記録からパターン・傾向を分析し、改善提案をしてください。

データ：
${context}

以下のJSON形式のみで返してください：
{
  "alerts": [
    {
      "level": "danger" | "warning" | "good",
      "title": "タイトル（15字以内）",
      "detail": "具体的な分析（例：優先度4以上のタスクの達成率が30%と低い。高優先度の理由を再検討する必要がある）"
    }
  ],
  "priority": "今すぐ取り組むべき最優先事項（具体的に、1-2文）",
  "summary": "全体の傾向まとめ（40字以内）"
}

danger: 今すぐ対処が必要
warning: 注意が必要な傾向
good: うまくいっている点

アラートは最大5個。データから読み取れる具体的な数値や相関を示すこと。`,
      }],
    });

    try {
      const content = response.choices[0].message.content ?? '{}';
      const match = content.match(/\{[\s\S]*\}/);
      const parsed = JSON.parse(match ? match[0] : content) as Diagnosis;
      setDiagnosis(parsed);
    } catch {
      setDiagnosis({ alerts: [], priority: '', summary: '分析に失敗しました。再度お試しください。' });
    }

    setLoading(false);
    setDone(true);
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

    const context = await fetchTaskContext(14);

    const response = await openai.chat.completions.create({
      model: 'gpt-4o-mini',
      messages: [
        {
          role: 'system',
          content: `あなたはRyomaの生産性コーチ。
過去14日のタスク記録：
${context ?? 'まだ記録がありません'}

・日本語・短く端的に答える
・データに基づいた具体的なアドバイスを提供する
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
          <Text style={[t.tabBtnTxt, tab === 'diagnosis' && t.tabBtnTxtActive]}>パターン診断</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[t.tabBtn, tab === 'chat' && t.tabBtnActive]}
          onPress={() => setTab('chat')}
        >
          <Text style={[t.tabBtnTxt, tab === 'chat' && t.tabBtnTxtActive]}>チャット</Text>
        </TouchableOpacity>
      </View>

      {tab === 'diagnosis' ? <DiagnosisTab /> : <ChatTab />}
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
  diagBtn: { backgroundColor: '#6366f1', borderRadius: 12, padding: 14, alignItems: 'center', marginBottom: 28 },
  diagBtnTxt: { color: '#fff', fontSize: 15, fontWeight: '600' },
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
