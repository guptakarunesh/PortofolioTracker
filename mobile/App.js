import React, { useMemo, useState } from 'react';
import { SafeAreaView, ScrollView, StatusBar, StyleSheet, Text, View, Pressable } from 'react-native';
import DashboardScreen from './src/screens/DashboardScreen';
import AssetsScreen from './src/screens/AssetsScreen';
import LiabilitiesScreen from './src/screens/LiabilitiesScreen';
import TransactionsScreen from './src/screens/TransactionsScreen';
import RemindersScreen from './src/screens/RemindersScreen';
import SettingsScreen from './src/screens/SettingsScreen';
import AuthScreen from './src/screens/AuthScreen';
import AccountScreen from './src/screens/AccountScreen';
import { api, setAuthToken } from './src/api/client';

const TABS = [
  { key: 'dashboard', label: 'Dashboard' },
  { key: 'assets', label: 'Assets' },
  { key: 'loans', label: 'Loans' },
  { key: 'tx', label: 'Transactions' },
  { key: 'reminders', label: 'Reminders' },
  { key: 'settings', label: 'Settings' },
  { key: 'account', label: 'Account' }
];

function ScreenRenderer({ tab, user, onLogout }) {
  switch (tab) {
    case 'dashboard':
      return <DashboardScreen />;
    case 'assets':
      return <AssetsScreen />;
    case 'loans':
      return <LiabilitiesScreen />;
    case 'tx':
      return <TransactionsScreen />;
    case 'reminders':
      return <RemindersScreen />;
    case 'settings':
      return <SettingsScreen />;
    case 'account':
      return <AccountScreen user={user} onLogout={onLogout} />;
    default:
      return <DashboardScreen />;
  }
}

export default function App() {
  const [activeTab, setActiveTab] = useState('dashboard');
  const [authLoading, setAuthLoading] = useState(false);
  const [authError, setAuthError] = useState('');
  const [user, setUser] = useState(null);

  const activeLabel = useMemo(
    () => TABS.find((t) => t.key === activeTab)?.label || 'Dashboard',
    [activeTab]
  );

  const handleAuthSuccess = (payload) => {
    setAuthToken(payload.token);
    setUser(payload.user);
    setAuthError('');
    setActiveTab('dashboard');
  };

  const handleLogin = async (payload) => {
    try {
      setAuthLoading(true);
      const result = await api.login(payload);
      handleAuthSuccess(result);
    } catch (e) {
      setAuthError(e.message);
      throw e;
    } finally {
      setAuthLoading(false);
    }
  };

  const handleRegister = async (payload) => {
    try {
      setAuthLoading(true);
      const result = await api.register(payload);
      handleAuthSuccess(result);
    } catch (e) {
      setAuthError(e.message);
      throw e;
    } finally {
      setAuthLoading(false);
    }
  };

  const handleLogout = async () => {
    try {
      await api.logout();
    } catch (_e) {
      // Ignore logout failure and clear local auth anyway.
    }
    setAuthToken(null);
    setUser(null);
    setActiveTab('dashboard');
  };

  if (!user) {
    return (
      <SafeAreaView style={styles.root}>
        <StatusBar barStyle="dark-content" />
        <View style={styles.header}>
          <Text style={styles.title}>Indian Investment Tracker</Text>
          <Text style={styles.subtitle}>Create account or login with mobile + MPIN</Text>
        </View>
        <ScrollView style={styles.body} contentContainerStyle={styles.bodyContent}>
          <AuthScreen onLogin={handleLogin} onRegister={handleRegister} loading={authLoading} />
          {!!authError && <Text style={styles.authError}>{authError}</Text>}
        </ScrollView>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.root}>
      <StatusBar barStyle="dark-content" />
      <View style={styles.header}>
        <Text style={styles.title}>Indian Investment Tracker</Text>
        <Text style={styles.subtitle}>{activeLabel} · {user.full_name}</Text>
      </View>

      <View style={styles.tabRow}>
        {TABS.map((tab) => (
          <Pressable
            key={tab.key}
            onPress={() => setActiveTab(tab.key)}
            style={[styles.tab, activeTab === tab.key && styles.tabActive]}
          >
            <Text style={[styles.tabText, activeTab === tab.key && styles.tabTextActive]}>{tab.label}</Text>
          </Pressable>
        ))}
      </View>

      <ScrollView style={styles.body} contentContainerStyle={styles.bodyContent}>
        <ScreenRenderer tab={activeTab} user={user} onLogout={handleLogout} />
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: '#eef5ff'
  },
  header: {
    paddingHorizontal: 16,
    paddingTop: 12,
    paddingBottom: 8
  },
  title: {
    fontSize: 22,
    fontWeight: '800',
    color: '#0f3557'
  },
  subtitle: {
    fontSize: 13,
    color: '#426b90'
  },
  tabRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    paddingHorizontal: 12,
    paddingBottom: 8
  },
  tab: {
    backgroundColor: '#fff',
    borderWidth: 1,
    borderColor: '#c8d8eb',
    borderRadius: 999,
    paddingVertical: 8,
    paddingHorizontal: 11
  },
  tabActive: {
    backgroundColor: '#0f5fb8',
    borderColor: '#0f5fb8'
  },
  tabText: {
    color: '#0f5fb8',
    fontWeight: '700',
    fontSize: 12
  },
  tabTextActive: {
    color: '#fff'
  },
  body: {
    flex: 1
  },
  bodyContent: {
    paddingHorizontal: 12,
    paddingBottom: 40
  },
  authError: {
    color: '#b3261e',
    marginTop: 8
  }
});
