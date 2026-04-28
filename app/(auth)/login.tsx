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
      <Text style={s.title}>Todo Tracker</Text>
      <Text style={s.subtitle}>タスクを記録・分析して成果を最大化</Text>

      <TextInput
        style={s.input}
        placeholder="メールアドレス"
        placeholderTextColor="#555"
        value={email}
        onChangeText={setEmail}
        autoCapitalize="none"
        keyboardType="email-address"
      />
      <TextInput
        style={s.input}
        placeholder="パスワード"
        placeholderTextColor="#555"
        value={password}
        onChangeText={setPassword}
        secureTextEntry
      />

      <TouchableOpacity style={s.button} onPress={handleLogin} disabled={loading}>
        <Text style={s.buttonText}>{loading ? '...' : 'ログイン'}</Text>
      </TouchableOpacity>

      <TouchableOpacity style={s.secondaryButton} onPress={handleSignUp} disabled={loading}>
        <Text style={s.secondaryButtonText}>新規登録</Text>
      </TouchableOpacity>
    </View>
  );
}

const s = StyleSheet.create({
  container: { flex: 1, justifyContent: 'center', padding: 32, backgroundColor: '#0f0f0f' },
  title: { fontSize: 28, fontWeight: 'bold', color: '#fff', textAlign: 'center', marginBottom: 8 },
  subtitle: { fontSize: 14, color: '#666', textAlign: 'center', marginBottom: 40 },
  input: { backgroundColor: '#1a1a1a', color: '#fff', borderRadius: 12, padding: 16, marginBottom: 12, fontSize: 16 },
  button: { backgroundColor: '#6366f1', borderRadius: 12, padding: 16, alignItems: 'center', marginBottom: 12 },
  buttonText: { color: '#fff', fontSize: 16, fontWeight: '600' },
  secondaryButton: { alignItems: 'center', padding: 12 },
  secondaryButtonText: { color: '#6366f1', fontSize: 14 },
});
