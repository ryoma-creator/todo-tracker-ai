import { useState } from 'react';
import { View, Text, TextInput, TouchableOpacity, StyleSheet, Alert } from 'react-native';
import { supabase } from '../../lib/supabase';

export default function LoginScreen() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);

  const handleLogin = async () => {
    setLoading(true);
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) Alert.alert('ログインエラー', error.message);
    setLoading(false);
  };

  const handleSignUp = async () => {
    setLoading(true);
    const { error } = await supabase.auth.signUp({ email, password });
    if (error) Alert.alert('登録エラー', error.message);
    else Alert.alert('確認メール送信', 'メールを確認してください');
    setLoading(false);
  };

  return (
    <View style={s.container}>
      <View style={s.card}>
        <View style={s.logoRow}>
          <View style={s.logoIcon}><Text style={s.logoIconTxt}>✓</Text></View>
          <Text style={s.title}>Todo Tracker</Text>
        </View>
        <Text style={s.subtitle}>タスクを記録・分析して成果を最大化</Text>

        <TextInput
          style={s.input}
          placeholder="メールアドレス"
          placeholderTextColor="#9CA3AF"
          value={email}
          onChangeText={setEmail}
          autoCapitalize="none"
          keyboardType="email-address"
        />
        <TextInput
          style={s.input}
          placeholder="パスワード"
          placeholderTextColor="#9CA3AF"
          value={password}
          onChangeText={setPassword}
          secureTextEntry
        />

        <TouchableOpacity style={[s.button, loading && s.buttonDisabled]} onPress={handleLogin} disabled={loading}>
          <Text style={s.buttonText}>{loading ? 'ログイン中...' : 'ログイン'}</Text>
        </TouchableOpacity>

        <TouchableOpacity style={s.secondaryButton} onPress={handleSignUp} disabled={loading}>
          <Text style={s.secondaryButtonText}>アカウントを作成する</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

const s = StyleSheet.create({
  container: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 24, backgroundColor: '#F8FAFC' },
  card: { width: '100%', maxWidth: 400, backgroundColor: '#fff', borderRadius: 20, padding: 32, borderWidth: 1, borderColor: '#E5E7EB' },
  logoRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 10, marginBottom: 8 },
  logoIcon: { width: 36, height: 36, borderRadius: 10, backgroundColor: '#4F46E5', alignItems: 'center', justifyContent: 'center' },
  logoIconTxt: { color: '#fff', fontSize: 18, fontWeight: '800' },
  title: { fontSize: 24, fontWeight: '800', color: '#111827' },
  subtitle: { fontSize: 13, color: '#6B7280', textAlign: 'center', marginBottom: 28 },
  input: { backgroundColor: '#F9FAFB', color: '#111827', borderRadius: 10, padding: 14, marginBottom: 12, fontSize: 15, borderWidth: 1, borderColor: '#E5E7EB' },
  button: { backgroundColor: '#4F46E5', borderRadius: 12, padding: 16, alignItems: 'center', marginBottom: 12 },
  buttonDisabled: { backgroundColor: '#C7D2FE' },
  buttonText: { color: '#fff', fontSize: 15, fontWeight: '700' },
  secondaryButton: { alignItems: 'center', padding: 10 },
  secondaryButtonText: { color: '#4F46E5', fontSize: 14, fontWeight: '600' },
});
