import { useState } from 'react';
import { View, Text, TextInput, TouchableOpacity, ScrollView, StyleSheet, Switch } from 'react-native';
import { type TodoTask, type ProgressNote, DEFAULT_TASK, parseNotes, CATEGORIES, CATEGORY_COLOR } from '../lib/types';

// ── 時刻ピッカー（15分刻み）──────────────────────────
function TimePicker({ value, onChange }: { value: string | null; onChange: (v: string | null) => void }) {
  const [open, setOpen] = useState(false);
  const hour   = value ? parseInt(value.split(':')[0], 10) : 9;
  const minute = value ? parseInt(value.split(':')[1], 10) : 0;

  const setTime = (h: number, m: number) => {
    onChange(`${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`);
  };

  return (
    <View>
      <TouchableOpacity
        style={[tp.display, open && tp.displayOpen]}
        onPress={() => { if (!open) setOpen(true); }}
        activeOpacity={0.7}
      >
        <Text style={value ? tp.displayTxt : tp.placeholder}>
          {value ? `⏰  ${value}` : '未設定（タップして設定）'}
        </Text>
        {value && (
          <TouchableOpacity
            onPress={() => { onChange(null); setOpen(false); }}
            hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
          >
            <Text style={tp.clearTxt}>✕</Text>
          </TouchableOpacity>
        )}
      </TouchableOpacity>

      {open && (
        <View style={tp.panel}>
          {/* 時 */}
          <View style={tp.pickerRow}>
            <Text style={tp.unitLabel}>時</Text>
            <TouchableOpacity style={tp.arrow} onPress={() => setTime(Math.max(0, hour - 1), minute)}>
              <Text style={tp.arrowTxt}>▲</Text>
            </TouchableOpacity>
            <Text style={tp.bigNum}>{String(hour).padStart(2, '0')}</Text>
            <TouchableOpacity style={tp.arrow} onPress={() => setTime(Math.min(23, hour + 1), minute)}>
              <Text style={tp.arrowTxt}>▼</Text>
            </TouchableOpacity>
          </View>

          {/* 分 */}
          <View style={tp.pickerRow}>
            <Text style={tp.unitLabel}>分</Text>
            <View style={tp.minBtns}>
              {[0, 15, 30, 45].map((m) => (
                <TouchableOpacity
                  key={m}
                  style={[tp.minBtn, minute === m && tp.minBtnActive]}
                  onPress={() => { setTime(hour, m); setOpen(false); }}
                >
                  <Text style={[tp.minBtnTxt, minute === m && tp.minBtnTxtActive]}>
                    {String(m).padStart(2, '0')}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
          </View>
        </View>
      )}
    </View>
  );
}

const PRIORITY_LABELS = ['最低', '低', '中', '高', '最高'];
const PRIORITY_COLORS = ['#9CA3AF', '#22C55E', '#4F46E5', '#F59E0B', '#EF4444'];

const STATUS_CONFIG = [
  { key: 'pending',     label: '未着手', bg: '#F1F5F9', text: '#64748B', activeBg: '#EEF2FF', activeText: '#4F46E5', activeBorder: '#6366F1' },
  { key: 'in_progress', label: '着手中', bg: '#F1F5F9', text: '#64748B', activeBg: '#FEF3C7', activeText: '#D97706', activeBorder: '#F59E0B' },
  { key: 'done',        label: '達成',   bg: '#F1F5F9', text: '#64748B', activeBg: '#DCFCE7', activeText: '#16A34A', activeBorder: '#22C55E' },
  { key: 'failed',      label: '未達成', bg: '#F1F5F9', text: '#64748B', activeBg: '#FEE2E2', activeText: '#DC2626', activeBorder: '#EF4444' },
] as const;

type Props = {
  initial?: Partial<TodoTask>;
  onSave: (task: TodoTask) => Promise<void>;
  saving: boolean;
  onCancel?: () => void;
};

export default function TaskForm({ initial, onSave, saving, onCancel }: Props) {
  const [task, setTask] = useState<TodoTask>({ ...DEFAULT_TASK(), ...initial });
  const [noteBody, setNoteBody] = useState('');
  const [noteType, setNoteType] = useState<'doing' | 'stuck'>('doing');

  const update = <K extends keyof TodoTask>(key: K, val: TodoTask[K]) =>
    setTask((prev) => ({ ...prev, [key]: val }));

  const notes = parseNotes(task.progress_notes);

  const addNote = () => {
    if (!noteBody.trim()) return;
    const newNote: ProgressNote = { ts: new Date().toISOString(), type: noteType, body: noteBody.trim() };
    update('progress_notes', JSON.stringify([...notes, newNote]));
    setNoteBody('');
  };

  const hasDueDate = task.due_date !== null;
  const toggleDueDate = (val: boolean) => {
    const today = new Date();
    const str = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;
    update('due_date', val ? str : null);
  };

  return (
    <ScrollView style={s.container} contentContainerStyle={s.content} showsVerticalScrollIndicator={false}>

      {/* タスク名 */}
      <View style={s.field}>
        <Text style={s.label}>タスク名 <Text style={s.required}>*</Text></Text>
        <TextInput
          style={s.input}
          value={task.title}
          onChangeText={(v) => update('title', v)}
          placeholder="何をやる？"
          placeholderTextColor="#9CA3AF"
        />
      </View>

      {/* 詳細 */}
      <View style={s.field}>
        <Text style={s.label}>詳細（任意）</Text>
        <TextInput
          style={[s.input, s.textarea]}
          value={task.description}
          onChangeText={(v) => update('description', v)}
          placeholder="具体的な内容・手順など"
          placeholderTextColor="#9CA3AF"
          multiline
          numberOfLines={3}
          textAlignVertical="top"
        />
      </View>

      {/* 得られる価値 */}
      <View style={s.field}>
        <Text style={s.label}>✅ やることでどんな価値がある？</Text>
        <TextInput
          style={[s.input, s.textarea]}
          value={task.leverage}
          onChangeText={(v) => update('leverage', v)}
          placeholder="例：amazonの試験に受かる可能性が上がる。スキルが上がれば長期的に時給が上がる。"
          placeholderTextColor="#9CA3AF"
          multiline
          numberOfLines={3}
          textAlignVertical="top"
        />
      </View>

      {/* やらないリスク */}
      <View style={s.field}>
        <Text style={s.label}>⚠️ やらないとどんなリスクがある？</Text>
        <TextInput
          style={[s.input, s.textarea, s.riskInput]}
          value={task.risk}
          onChangeText={(v) => update('risk', v)}
          placeholder="例：締め切りを逃して信頼を失う。技術的負債が積み重なり後で3倍の工数がかかる。"
          placeholderTextColor="#9CA3AF"
          multiline
          numberOfLines={3}
          textAlignVertical="top"
        />
      </View>

      {/* カテゴリー */}
      <View style={s.field}>
        <Text style={s.label}>カテゴリー</Text>
        <View style={[s.row, { flexWrap: 'wrap' }]}>
          {CATEGORIES.map((cat) => {
            const active = (task.category ?? 'その他') === cat;
            const col = CATEGORY_COLOR[cat];
            return (
              <TouchableOpacity
                key={cat}
                style={[s.catBtn, active && { backgroundColor: col.bg, borderColor: col.color }]}
                onPress={() => update('category', cat)}
              >
                {active && <View style={[s.catDot, { backgroundColor: col.color }]} />}
                <Text style={[s.catTxt, active && { color: col.color, fontWeight: '700' }]}>{cat}</Text>
              </TouchableOpacity>
            );
          })}
        </View>
      </View>

      {/* 優先度 */}
      <View style={s.field}>
        <Text style={s.label}>優先度</Text>
        <View style={s.row}>
          {PRIORITY_LABELS.map((label, i) => {
            const active = task.priority === i + 1;
            const color = PRIORITY_COLORS[i];
            return (
              <TouchableOpacity
                key={i}
                style={[s.segBtn, active && { backgroundColor: color + '18', borderColor: color }]}
                onPress={() => update('priority', i + 1)}
              >
                {active && <View style={[s.segDot, { backgroundColor: color }]} />}
                <Text style={[s.segTxt, active && { color, fontWeight: '700' }]}>{label}</Text>
              </TouchableOpacity>
            );
          })}
        </View>
      </View>

      {/* 締め切り時刻 */}
      <View style={s.field}>
        <Text style={s.label}>締め切り時刻（任意）</Text>
        <TimePicker
          value={task.deadline_time}
          onChange={(v) => update('deadline_time', v)}
        />
      </View>

      {/* 所要時間 */}
      <View style={s.field}>
        <Text style={s.label}>想定所要時間（分）</Text>
        <View style={s.row}>
          {[15, 30, 60, 90, 120].map((min) => {
            const active = task.estimated_minutes === min;
            return (
              <TouchableOpacity
                key={min}
                style={[s.segBtn, active && s.segBtnActive]}
                onPress={() => update('estimated_minutes', active ? null : min)}
              >
                <Text style={[s.segTxt, active && s.segTxtActive]}>
                  {min >= 60 ? `${min / 60}h` : `${min}m`}
                </Text>
              </TouchableOpacity>
            );
          })}
        </View>
      </View>

      {/* 期限日 */}
      <View style={s.field}>
        <View style={s.toggleRow}>
          <Text style={s.label} children="期限日を設定する" />
          <Switch
            value={hasDueDate}
            onValueChange={toggleDueDate}
            trackColor={{ false: '#E5E7EB', true: '#4F46E5' }}
            thumbColor="#fff"
          />
        </View>
        {hasDueDate && (
          <TextInput
            style={s.input}
            value={task.due_date ?? ''}
            onChangeText={(v) => update('due_date', v)}
            placeholder="YYYY-MM-DD"
            placeholderTextColor="#9CA3AF"
            keyboardType="numbers-and-punctuation"
          />
        )}
      </View>

      {/* ステータス・理由（編集時のみ） */}
      {initial?.id && (
        <>
          <View style={s.divider} />

          <View style={s.field}>
            <Text style={s.label}>ステータス</Text>
            <View style={s.row}>
              {STATUS_CONFIG.map((st) => {
                const active = task.status === st.key;
                return (
                  <TouchableOpacity
                    key={st.key}
                    style={[s.statusBtn, active && { backgroundColor: st.activeBg, borderColor: st.activeBorder }]}
                    onPress={() => update('status', st.key)}
                  >
                    <Text style={[s.statusTxt, active && { color: st.activeText, fontWeight: '700' }]}>{st.label}</Text>
                  </TouchableOpacity>
                );
              })}
            </View>
          </View>

          {/* 着手中メモ */}
          {task.status === 'in_progress' && (
            <View style={s.field}>
              <Text style={s.label}>進捗メモ（追記式）</Text>
              {notes.length > 0 && (
                <View style={s.noteList}>
                  {notes.map((n, i) => (
                    <View key={i} style={[s.noteItem, n.type === 'stuck' ? s.noteStuck : s.noteDoing]}>
                      <Text style={[s.noteTypeLabel, n.type === 'stuck' ? { color: '#D97706' } : { color: '#4F46E5' }]}>
                        {n.type === 'doing' ? '▶ やっていること' : '⚠ つまづき'}
                      </Text>
                      <Text style={s.noteBody}>{n.body}</Text>
                      <Text style={s.noteTs}>
                        {new Date(n.ts).toLocaleString('ja-JP', { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' })}
                      </Text>
                    </View>
                  ))}
                </View>
              )}
              <View style={s.noteTypeRow}>
                <TouchableOpacity
                  style={[s.noteTypeBtn, noteType === 'doing' && s.noteTypeBtnActive]}
                  onPress={() => setNoteType('doing')}
                >
                  <Text style={[s.noteTypeBtnTxt, noteType === 'doing' && { color: '#4F46E5', fontWeight: '700' }]}>▶ やっていること</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[s.noteTypeBtn, noteType === 'stuck' && s.noteTypeBtnStuck]}
                  onPress={() => setNoteType('stuck')}
                >
                  <Text style={[s.noteTypeBtnTxt, noteType === 'stuck' && { color: '#D97706', fontWeight: '700' }]}>⚠ つまづき</Text>
                </TouchableOpacity>
              </View>
              <View style={s.noteInputRow}>
                <TextInput
                  style={[s.input, s.noteInput]}
                  value={noteBody}
                  onChangeText={setNoteBody}
                  placeholder={noteType === 'doing' ? '今何をやっているか...' : '何につまづいているか...'}
                  placeholderTextColor="#9CA3AF"
                  multiline
                  textAlignVertical="top"
                />
                <TouchableOpacity style={s.noteAddBtn} onPress={addNote}>
                  <Text style={s.noteAddTxt}>追加</Text>
                </TouchableOpacity>
              </View>
            </View>
          )}

          {/* 達成理由 */}
          {task.status === 'done' && (
            <View style={s.field}>
              <Text style={s.label}>達成できた理由</Text>
              <TextInput
                style={[s.input, s.textarea]}
                value={task.achieve_reason}
                onChangeText={(v) => update('achieve_reason', v)}
                placeholder="なぜ達成できた？何が効いた？"
                placeholderTextColor="#9CA3AF"
                multiline
                numberOfLines={3}
                textAlignVertical="top"
              />
            </View>
          )}

          {/* 未達成理由 */}
          {task.status === 'failed' && (
            <View style={s.field}>
              <Text style={s.label}>達成できなかった理由</Text>
              <TextInput
                style={[s.input, s.textarea]}
                value={task.fail_reason}
                onChangeText={(v) => update('fail_reason', v)}
                placeholder="なぜ達成できなかった？何がボトルネックだった？"
                placeholderTextColor="#9CA3AF"
                multiline
                numberOfLines={3}
                textAlignVertical="top"
              />
            </View>
          )}
        </>
      )}

      {/* ボタン */}
      <View style={s.btnRow}>
        {onCancel && (
          <TouchableOpacity style={s.cancelBtn} onPress={onCancel}>
            <Text style={s.cancelTxt}>キャンセル</Text>
          </TouchableOpacity>
        )}
        <TouchableOpacity
          style={[s.saveBtn, (!task.title.trim() || saving) && s.saveBtnDisabled]}
          onPress={() => onSave(task)}
          disabled={saving || !task.title.trim()}
        >
          <Text style={s.saveTxt}>{saving ? '保存中...' : '保存'}</Text>
        </TouchableOpacity>
      </View>
    </ScrollView>
  );
}

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#fff' },
  content: { padding: 24, paddingBottom: 48 },

  field: { marginBottom: 20 },
  label: { fontSize: 13, color: '#6B7280', fontWeight: '600', marginBottom: 8 },
  required: { color: '#EF4444' },

  input: {
    backgroundColor: '#F9FAFB',
    color: '#111827',
    borderRadius: 10,
    padding: 14,
    fontSize: 15,
    borderWidth: 1,
    borderColor: '#E5E7EB',
  },
  textarea: { minHeight: 88, textAlignVertical: 'top' },
  riskInput: { borderColor: '#FCD34D', backgroundColor: '#FFFBEB' },

  row: { flexDirection: 'row', gap: 6, flexWrap: 'wrap' },

  segBtn: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 5, paddingVertical: 10, borderRadius: 10, borderWidth: 1.5, borderColor: '#E5E7EB', backgroundColor: '#F9FAFB' },
  segBtnActive: { backgroundColor: '#EEF2FF', borderColor: '#6366F1' },
  segDot: { width: 6, height: 6, borderRadius: 3 },
  segTxt: { color: '#9CA3AF', fontSize: 12, fontWeight: '500' },
  segTxtActive: { color: '#4F46E5', fontWeight: '700' },

  catBtn: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingVertical: 7, paddingHorizontal: 12, borderRadius: 20, borderWidth: 1.5, borderColor: '#E5E7EB', backgroundColor: '#F9FAFB', marginBottom: 6 },
  catDot: { width: 6, height: 6, borderRadius: 3 },
  catTxt: { color: '#9CA3AF', fontSize: 12, fontWeight: '500' },

  toggleRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 },

  divider: { height: 1, backgroundColor: '#F3F4F6', marginBottom: 20 },

  statusBtn: { flex: 1, paddingVertical: 10, borderRadius: 10, borderWidth: 1.5, borderColor: '#E5E7EB', alignItems: 'center', backgroundColor: '#F9FAFB' },
  statusTxt: { color: '#9CA3AF', fontSize: 13, fontWeight: '500' },

  noteList: { gap: 8, marginBottom: 12 },
  noteItem: { borderRadius: 10, padding: 12, borderLeftWidth: 3 },
  noteDoing: { backgroundColor: '#EEF2FF', borderLeftColor: '#6366F1' },
  noteStuck: { backgroundColor: '#FFFBEB', borderLeftColor: '#F59E0B' },
  noteTypeLabel: { fontSize: 11, fontWeight: '700', marginBottom: 4 },
  noteBody: { fontSize: 14, color: '#374151', lineHeight: 20 },
  noteTs: { fontSize: 11, color: '#9CA3AF', marginTop: 4 },

  noteTypeRow: { flexDirection: 'row', gap: 8, marginBottom: 10 },
  noteTypeBtn: { flex: 1, paddingVertical: 9, borderRadius: 8, borderWidth: 1.5, borderColor: '#E5E7EB', alignItems: 'center', backgroundColor: '#F9FAFB' },
  noteTypeBtnActive: { backgroundColor: '#EEF2FF', borderColor: '#6366F1' },
  noteTypeBtnStuck: { backgroundColor: '#FFFBEB', borderColor: '#F59E0B' },
  noteTypeBtnTxt: { color: '#9CA3AF', fontSize: 12 },

  noteInputRow: { flexDirection: 'row', gap: 8, alignItems: 'flex-start' },
  noteInput: { flex: 1, minHeight: 64 },
  noteAddBtn: { backgroundColor: '#4F46E5', borderRadius: 10, paddingHorizontal: 14, paddingVertical: 14, justifyContent: 'center' },
  noteAddTxt: { color: '#fff', fontSize: 13, fontWeight: '700' },

  btnRow: { flexDirection: 'row', gap: 12, marginTop: 8 },
  cancelBtn: { flex: 1, padding: 16, borderRadius: 12, borderWidth: 1.5, borderColor: '#E5E7EB', alignItems: 'center', backgroundColor: '#F9FAFB' },
  cancelTxt: { color: '#6B7280', fontSize: 15, fontWeight: '600' },
  saveBtn: { flex: 2, backgroundColor: '#4F46E5', borderRadius: 12, padding: 16, alignItems: 'center' },
  saveBtnDisabled: { backgroundColor: '#C7D2FE' },
  saveTxt: { color: '#fff', fontSize: 16, fontWeight: '700' },
});

// ── TimePicker スタイル ──────────────────────────────
const tp = StyleSheet.create({
  display: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', backgroundColor: '#F9FAFB', borderRadius: 10, padding: 14, borderWidth: 1, borderColor: '#E5E7EB' },
  displayOpen: { borderColor: '#6366F1', borderBottomLeftRadius: 0, borderBottomRightRadius: 0 },
  displayTxt: { color: '#111827', fontSize: 15 },
  placeholder: { color: '#9CA3AF', fontSize: 15 },
  clearTxt: { color: '#9CA3AF', fontSize: 14, paddingLeft: 8 },
  panel: { backgroundColor: '#F9FAFB', borderWidth: 1, borderTopWidth: 0, borderColor: '#6366F1', borderBottomLeftRadius: 10, borderBottomRightRadius: 10, padding: 14, gap: 14 },
  pickerRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  unitLabel: { color: '#6B7280', fontSize: 13, fontWeight: '600', width: 20 },
  arrow: { backgroundColor: '#EEF2FF', borderRadius: 8, width: 36, height: 36, alignItems: 'center', justifyContent: 'center' },
  arrowTxt: { color: '#4F46E5', fontSize: 14, fontWeight: '700' },
  bigNum: { color: '#111827', fontSize: 28, fontWeight: '800', width: 52, textAlign: 'center' },
  minBtns: { flexDirection: 'row', gap: 8, flex: 1 },
  minBtn: { flex: 1, paddingVertical: 10, borderRadius: 10, borderWidth: 1.5, borderColor: '#E5E7EB', backgroundColor: '#fff', alignItems: 'center' },
  minBtnActive: { backgroundColor: '#EEF2FF', borderColor: '#6366F1' },
  minBtnTxt: { color: '#9CA3AF', fontSize: 14, fontWeight: '600' },
  minBtnTxtActive: { color: '#4F46E5', fontWeight: '800' },
});
