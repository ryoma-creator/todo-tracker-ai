import { Platform } from 'react-native';
import { Tabs } from 'expo-router';
import WebLayout from '../../components/WebLayout';

export default function TabLayout() {
  if (Platform.OS === 'web') {
    return <WebLayout />;
  }

  return (
    <Tabs
      screenOptions={{
        tabBarStyle: { backgroundColor: '#fff', borderTopColor: '#E8EBF2', height: 60, paddingBottom: 8 },
        tabBarActiveTintColor: '#4F46E5',
        tabBarInactiveTintColor: '#9CA3AF',
        tabBarLabelStyle: { fontSize: 12, fontWeight: '600' },
        headerStyle: { backgroundColor: '#fff' },
        headerTintColor: '#111827',
        headerShadowVisible: false,
        headerTitleStyle: { fontWeight: '700', fontSize: 18 },
      }}
    >
      <Tabs.Screen name="index" options={{ title: '今日' }} />
      <Tabs.Screen name="calendar" options={{ title: 'カレンダー' }} />
      <Tabs.Screen name="history" options={{ title: '履歴' }} />
      <Tabs.Screen name="ai" options={{ title: 'AI診断' }} />
    </Tabs>
  );
}
