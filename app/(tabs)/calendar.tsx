import { useState, useEffect, useCallback } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ActivityIndicator, ScrollView } from 'react-native';
import { supabase } from '../../lib/supabase';
import { type TodoTask } from '../../lib/types';

const WEEK_DAYS = ['日', '月', '火', '水', '木', '金', '土'];

type DaySummary = { total: number; done: number; failed: number; in_progress: number };

function getDayColor(s: DaySummary): { bg: string; text: string } {
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

export default function CalendarScreen() {
  const now = new Date();
  const [year, setYear] = useState(now.getFullYear());
  const [month, setMonth] = useState(now.getMonth());
  const [dayMap, setDayMap] = useState<Record<string, DaySummary>>({});
  const [loading, setLoading] = useState(true);
  const [selectedDate, setSelectedDate] = useState<string | null>(null);
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
      data.forEach((t: { date: string; status: string }) => {
        if (!map[t.date]) map[t.date] = { total: 0, done: 0, failed: 0, in_progress: 0 };
        map[t.date].total++;
        if (t.status === 'done') map[t.date].done++;
        else if (t.status === 'failed') map[t.date].failed++;
        else if (t.status === 'in_progress') map[t.date].in_progress++;
      });
    }
    setDayMap(map);
    setLoading(false);
  }, []);

  useEffect(() => { loadMonth(year, month); }, [year, month, loadMonth]);

  const loadDay = async (date: string) => {
    setSelectedDate(date);
    const { data } = await supabase.from('todo_tasks').select('*').eq('date', date).order('priority', { ascending: false });
    setDayTasks((data ?? []) as TodoTask[]);
  };

  const prevMonth = () => {
    if (month === 0) { setYear(y => y - 1); setMonth(11); }
    else setMonth(m => m - 1);
    setSelectedDate(null);
  };
  const nextMonth = () => {
    if (month === 11) { setYear(y => y + 1); setMonth(0); }
    else setMonth(m => m + 1);
    setSelectedDate(null);
  };

  const firstDay = new Date(year, month, 1).getDay();
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const cells: (number | null)[] = [
    ...Array(firstDay).fill(null),
    ...Array.from({ length: daysInMonth }, (_, i) => i + 1),
  ];
  while (cells.length % 7 !== 0) cells.push(null);

  const todayStr = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
  const recordedDays = Object.keys(dayMap).length;

  const STATUS_LABEL: Record<string, { label: string; color: string }> = {
    done:        { label: '達成',   color: '#16A34A' },
    failed:      { label: '未達成', color: '#DC2626' },
    in_progress: { label: '着手中', color: '#D97706' },
    pending:     { label: '未着手', color: '#6B7280' },
  };

  return (
    <ScrollView style={s.container} contentContainerStyle={s.content}>
      {/* ヘッダー */}
      <View style={s.header}>
        <TouchableOpacity onPress={prevMonth} style={s.arrow}>
          <Text style={s.arrowTxt}>‹</Text>
        </TouchableOpacity>
        <View style={s.titleBlock}>
          <Text style={s.monthTitle}>{year}年 {month + 1}月</Text>
          <Text style={s.subTitle}>{recordedDays}日記録済み</Text>
        </View>
        <TouchableOpacity onPress={nextMonth} style={s.arrow}>
          <Text style={s.arrowTxt}>›</Text>
        </TouchableOpacity>
      </View>

      {/* 曜日ヘッダー */}
      <View style={s.weekRow}>
        {WEEK_DAYS.map((d, i) => (
          <Text key={d} style={[s.weekDay, i === 0 && s.sun, i === 6 && s.sat]}>{d}</Text>
        ))}
      </View>

      {/* グリッド */}
      {loading ? (
        <ActivityIndicator color="#4F46E5" style={{ marginTop: 40 }} />
      ) : (
        <View style={s.grid}>
          {cells.map((day, idx) => {
            if (!day) return <View key={`e-${idx}`} style={s.cell} />;
            const dateStr = `${year}-${pad(month + 1)}-${pad(day)}`;
            const summary = dayMap[dateStr];
            const isToday = dateStr === todayStr;
            const isSel = selectedDate === dateStr;
            const col = summary ? getDayColor(summary) : { bg: 'transparent', text: '#9CA3AF' };
            const emoji = summary ? getDayEmoji(summary) : '';
            const isSun = idx % 7 === 0;
            const isSat = idx % 7 === 6;
            return (
              <TouchableOpacity
                key={dateStr}
                style={[
                  s.cell,
                  summary && { backgroundColor: col.bg },
                  isToday && s.todayBorder,
                  isSel && s.selectedBorder,
                ]}
                onPress={() => loadDay(dateStr)}
                activeOpacity={0.7}
              >
                <Text style={[
                  s.dayNum,
                  { color: summary ? col.text : (isSun ? '#EF4444' : isSat ? '#4F46E5' : '#9CA3AF') },
                  isToday && s.todayNum,
                ]}>
                  {day}
                </Text>
                {emoji ? <Text style={s.emoji}>{emoji}</Text> : null}
                {summary && summary.total > 0 ? (
                  <Text style={[s.countTxt, { color: col.text }]}>{summary.done}/{summary.total}</Text>
                ) : null}
              </TouchableOpacity>
            );
          })}
        </View>
      )}

      {/* 凡例 */}
      <View style={s.legend}>
        {[
          { bg: '#DCFCE7', label: '達成率80%+' },
          { bg: '#FEF9C3', label: '達成率50%+' },
          { bg: '#FEE2E2', label: '未達成あり' },
          { bg: '#EEF2FF', label: '進行中' },
        ].map(({ bg, label }) => (
          <View key={label} style={s.legendItem}>
            <View style={[s.legendDot, { backgroundColor: bg }]} />
            <Text style={s.legendTxt}>{label}</Text>
          </View>
        ))}
      </View>

      {/* 選択日のタスク一覧 */}
      {selectedDate && (
        <View style={s.dayPanel}>
          <Text style={s.dayPanelTitle}>
            {selectedDate} のタスク
            {dayTasks.length > 0 ? ` (${dayTasks.length}件)` : ''}
          </Text>
          {dayTasks.length === 0 ? (
            <Text style={s.noTask}>タスクなし</Text>
          ) : (
            dayTasks.map((t) => {
              const st = STATUS_LABEL[t.status] ?? { label: t.status, color: '#6B7280' };
              return (
                <View key={t.id} style={s.taskRow}>
                  <View style={[s.statusDot, { backgroundColor: st.color }]} />
                  <View style={s.taskInfo}>
                    <Text style={[s.taskTitle, t.status === 'done' && s.doneTitle]}>{t.title}</Text>
                    {t.fail_reason ? (
                      <Text style={s.taskSub}>未達成理由: {t.fail_reason}</Text>
                    ) : t.achieve_reason ? (
                      <Text style={s.taskSubGreen}>達成理由: {t.achieve_reason}</Text>
                    ) : null}
                  </View>
                  <View style={[s.statusBadge, { backgroundColor: st.color + '18' }]}>
                    <Text style={[s.statusBadgeTxt, { color: st.color }]}>{st.label}</Text>
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

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F8FAFC' },
  content: { padding: 16, paddingBottom: 40 },

  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 },
  arrow: { padding: 8 },
  arrowTxt: { color: '#4F46E5', fontSize: 32, fontWeight: 'bold' },
  titleBlock: { alignItems: 'center' },
  monthTitle: { color: '#111827', fontSize: 18, fontWeight: '800' },
  subTitle: { color: '#9CA3AF', fontSize: 12, marginTop: 2 },

  weekRow: { flexDirection: 'row', marginBottom: 4 },
  weekDay: { flex: 1, textAlign: 'center', color: '#9CA3AF', fontSize: 12, fontWeight: '600', paddingVertical: 6 },
  sun: { color: '#EF4444' },
  sat: { color: '#4F46E5' },

  grid: { flexDirection: 'row', flexWrap: 'wrap', marginBottom: 16 },
  cell: {
    width: '14.285%',
    aspectRatio: 0.85,
    borderRadius: 8,
    padding: 3,
    marginVertical: 2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  todayBorder: { borderWidth: 2, borderColor: '#4F46E5' },
  selectedBorder: { borderWidth: 2, borderColor: '#F59E0B' },
  dayNum: { fontSize: 12, fontWeight: '600' },
  todayNum: { color: '#4F46E5', fontWeight: '800' },
  emoji: { fontSize: 14, marginTop: 1 },
  countTxt: { fontSize: 9, fontWeight: '700', marginTop: 1 },

  legend: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 20 },
  legendItem: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  legendDot: { width: 12, height: 12, borderRadius: 3 },
  legendTxt: { fontSize: 11, color: '#6B7280' },

  dayPanel: { backgroundColor: '#fff', borderRadius: 16, padding: 16, borderWidth: 1, borderColor: '#E5E7EB' },
  dayPanelTitle: { fontSize: 14, fontWeight: '700', color: '#111827', marginBottom: 12 },
  noTask: { color: '#9CA3AF', fontSize: 13, textAlign: 'center', paddingVertical: 12 },

  taskRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 10, paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: '#F3F4F6' },
  statusDot: { width: 8, height: 8, borderRadius: 4, marginTop: 5 },
  taskInfo: { flex: 1 },
  taskTitle: { fontSize: 14, color: '#111827', fontWeight: '500' },
  doneTitle: { color: '#9CA3AF', textDecorationLine: 'line-through' },
  taskSub: { fontSize: 12, color: '#EF4444', marginTop: 3 },
  taskSubGreen: { fontSize: 12, color: '#16A34A', marginTop: 3 },
  statusBadge: { borderRadius: 6, paddingHorizontal: 8, paddingVertical: 3 },
  statusBadgeTxt: { fontSize: 11, fontWeight: '700' },
});
