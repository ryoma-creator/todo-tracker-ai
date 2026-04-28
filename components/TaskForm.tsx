import { useState } from 'react';
import { View, Text, TextInput, TouchableOpacity, ScrollView, StyleSheet, Switch } from 'react-native';
import { type TodoTask, DEFAULT_TASK } from '../lib/types';

const PRIORITY_LABELS = ['最低', '低', '中', '高', '最高'];

type Props = {
  initial?: Partial<TodoTask>;
  onSave: (task: TodoTask) => Promise<void>;
  saving: boolean;
  onCancel?: () => void;
};

export default function TaskForm({ initial, onSave, saving, onCancel }: Props) {
  const [task, setTask] = useState<TodoTask>({ ...DEFAULT_TASK(), ...initial });

  const update = <K extends keyof TodoTask>(key: K, val: TodoTask[K]) =>
    setTask((prev) => ({ ...prev, [key]: val }));

  const hasDueDate = task.due_date !== null;

  const toggleDueDate = (val: boolean) => {
    const today = new Date();
    const str = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;
    update('due_date', val ? str : null);
  };

  return (
    <ScrollView style={s.container} contentContainerStyle={s.content}>

      {/* タスク名 */}
      <Text style={s.label}>タスク名 *</Text>
      <TextInput
        style={s.input}
        value={task.title}
        onChangeText={(v) => update('title', v)}
        placeholder="何をやる？"
        placeholderTextColor="#333"
      />

      {/* 詳細 */}
      <Text style={s.label}>詳細（任意）</Text>
      <TextInput
        style={[s.input, s.textarea]}
        value={task.description}
        onChangeText={(v) => update('description', v)}
        placeholder="具体的な内容・手順など"
        placeholderTextColor="#333"
        multiline
        numberOfLines={3}
      />

      {/* レバレッジ・リターン */}
      <Text style={s.label}>やることでどんな価値がある？</Text>
      <TextInput
        style={[s.input, s.textarea]}
        value={task.leverage}
        onChangeText={(v) => update('leverage', v)}
        placeholder="例：商談が1件決まれば30万円の売上。スキルが上がれば長期的に時給が上がる。"
        placeholderTextColor="#333"
        multiline
        numberOfLines={3}
      />

      {/* 優先度 */}
      <Text style={s.label}>優先度</Text>
      <View style={s.row}>
        {PRIORITY_LABELS.map((label, i) => (
          <TouchableOpacity
            key={i}
            style={[s.priorityBtn, task.priority === i + 1 && s.active]}
            onPress={() => update('priority', i + 1)}
          >
            <Text style={[s.priorityTxt, task.priority === i + 1 && s.activeTxt]}>{label}</Text>
          </TouchableOpacity>
        ))}
      </View>

      {/* 期限日 */}
      <View style={s.toggleRow}>
        <Text style={s.toggleLbl}>期限日を設定する</Text>
        <Switch
          value={hasDueDate}
          onValueChange={toggleDueDate}
          trackColor={{ true: '#6366f1' }}
          thumbColor="#fff"
        />
      </View>
      {hasDueDate && (
        <TextInput
          style={s.input}
          value={task.due_date ?? ''}
          onChangeText={(v) => update('due_date', v)}
          placeholder="YYYY-MM-DD"
          placeholderTextColor="#333"
          keyboardType="numbers-and-punctuation"
        />
      )}

      {/* ステータス（編集時のみ） */}
      {initial?.id && (
        <>
          <View style={s.divider} />
          <Text style={s.label}>ステータス</Text>
          <View style={s.row}>
            {(['pending', 'done', 'failed'] as const).map((st) => (
              <TouchableOpacity
                key={st}
                style={[s.statusBtn, task.status === st && statusActive(st)]}
                onPress={() => update('status', st)}
              >
                <Text style={[s.statusTxt, task.status === st && s.activeTxt]}>
                  {st === 'pending' ? '未着手' : st === 'done' ? '達成' : '未達成'}
                </Text>
              </TouchableOpacity>
            ))}
          </View>

          {/* 達成理由 */}
          {task.status === 'done' && (
            <>
              <Text style={s.label}>達成できた理由</Text>
              <TextInput
                style={[s.input, s.textarea]}
                value={task.achieve_reason}
                onChangeText={(v) => update('achieve_reason', v)}
                placeholder="なぜ達成できた？何が効いた？"
                placeholderTextColor="#333"
                multiline
                numberOfLines={3}
              />
            </>
          )}

          {/* 未達成理由 */}
          {task.status === 'failed' && (
            <>
              <Text style={s.label}>達成できなかった理由</Text>
              <TextInput
                style={[s.input, s.textarea]}
                value={task.fail_reason}
                onChangeText={(v) => update('fail_reason', v)}
                placeholder="なぜ達成できなかった？何がボトルネックだった？"
                placeholderTextColor="#333"
                multiline
                numberOfLines={3}
              />
            </>
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
          style={[s.saveBtn, !task.title.trim() && s.saveBtnDisabled]}
          onPress={() => onSave(task)}
          disabled={saving || !task.title.trim()}
        >
          <Text style={s.saveTxt}>{saving ? '保存中...' : '保存'}</Text>
        </TouchableOpacity>
      </View>

    </ScrollView>
  );
}

const statusActive = (st: string) => ({
  backgroundColor: st === 'done' ? '#14532d' : st === 'failed' ? '#450a0a' : '#1e1b4b',
  borderColor: st === 'done' ? '#22c55e' : st === 'failed' ? '#ef4444' : '#6366f1',
});

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#0f0f0f' },
  content: { padding: 24, paddingBottom: 56 },
  label: { fontSize: 13, color: '#666', marginBottom: 8 },
  input: { backgroundColor: '#1a1a1a', color: '#fff', borderRadius: 12, padding: 14, fontSize: 15, marginBottom: 20 },
  textarea: { minHeight: 80, textAlignVertical: 'top' },
  row: { flexDirection: 'row', gap: 6, marginBottom: 20 },
  priorityBtn: { flex: 1, paddingVertical: 10, borderRadius: 10, borderWidth: 1, borderColor: '#222', alignItems: 'center' },
  priorityTxt: { color: '#444', fontSize: 11 },
  active: { backgroundColor: '#6366f1', borderColor: '#6366f1' },
  activeTxt: { color: '#fff', fontWeight: '600' },
  toggleRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 },
  toggleLbl: { fontSize: 15, color: '#ccc' },
  divider: { height: 1, backgroundColor: '#1e1e1e', marginVertical: 20 },
  statusBtn: { flex: 1, paddingVertical: 12, borderRadius: 10, borderWidth: 1, borderColor: '#222', alignItems: 'center' },
  statusTxt: { color: '#444', fontSize: 13 },
  btnRow: { flexDirection: 'row', gap: 12, marginTop: 8 },
  cancelBtn: { flex: 1, padding: 16, borderRadius: 12, borderWidth: 1, borderColor: '#333', alignItems: 'center' },
  cancelTxt: { color: '#666', fontSize: 15 },
  saveBtn: { flex: 2, backgroundColor: '#6366f1', borderRadius: 12, padding: 16, alignItems: 'center' },
  saveBtnDisabled: { backgroundColor: '#2d2d4e', opacity: 0.5 },
  saveTxt: { color: '#fff', fontSize: 16, fontWeight: '600' },
});
