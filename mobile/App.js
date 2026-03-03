import React, { useEffect, useState } from 'react';
import {
  SafeAreaView,
  ScrollView,
  StatusBar,
  StyleSheet,
  Text,
  View,
  Pressable,
  Modal,
  TextInput,
  Animated
} from 'react-native';
import * as LocalAuthentication from 'expo-local-authentication';
import * as SecureStore from 'expo-secure-store';
import DashboardScreen from './src/screens/DashboardScreen';
import AssetsScreen from './src/screens/AssetsScreen';
import LiabilitiesScreen from './src/screens/LiabilitiesScreen';
import RemindersScreen from './src/screens/RemindersScreen';
import SettingsScreen from './src/screens/SettingsScreen';
import PerformanceScreen from './src/screens/PerformanceScreen';
import AuthScreen from './src/screens/AuthScreen';
import AccountScreen from './src/screens/AccountScreen';
import LaunchScreen from './src/screens/LaunchScreen';
import SubscriptionScreen from './src/screens/SubscriptionScreen';
import FamilyScreen from './src/screens/FamilyScreen';
import { api, setAuthToken } from './src/api/client';
import { ThemeContext, THEMES } from './src/theme';

const ACCENT = '#0f766e';
const ACCENT_DARK = '#5eead4';
const FX_SYMBOLS = ['INR', 'USD', 'EUR', 'GBP', 'AED', 'SGD'];
const BIOMETRIC_CREDENTIALS_KEY = 'biometric_credentials_v1';

const TABS = [
  { key: 'dashboard', label: 'Dashboard' },
  { key: 'assets', label: 'Assets' },
  { key: 'loans', label: 'Liabilities' },
  { key: 'settings', label: 'Targets' },
  { key: 'performance', label: 'Performance' },
  { key: 'reminders', label: 'Reminders' },
  { key: 'account', label: 'Account' }
];
const PRIMARY_TAB_KEYS = ['dashboard', 'assets', 'loans', 'settings'];
const SECONDARY_TAB_KEYS = ['performance', 'reminders', 'account'];
const MENU_TAB_KEYS = [...SECONDARY_TAB_KEYS];
const PREMIUM_TAB_KEYS = new Set(['settings', 'performance', 'reminders']);

function toCamelCaseWords(value = '') {
  return String(value)
    .toLowerCase()
    .split(/\s+/)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ');
}

function ScreenRenderer({
  tab,
  user,
  onLogout,
  hideSensitive,
  onPrivacyConfigChanged,
  onCurrencyChanged,
  preferredCurrency,
  fxRates,
  biometricEnrolled,
  onEnrollBiometric,
  onDisableBiometric,
  subscriptionStatus,
  onOpenSubscription,
  onOpenFamily,
  accessRole,
  isAccountOwner,
  premiumActive,
  readOnly,
  onCloseSubscription,
  onCloseFamily,
  onThemeChange,
  themeKey
}) {
  switch (tab) {
    case 'dashboard':
      return <DashboardScreen hideSensitive={hideSensitive} preferredCurrency={preferredCurrency} fxRates={fxRates} />;
    case 'assets':
      return (
        <AssetsScreen
          hideSensitive={hideSensitive}
          preferredCurrency={preferredCurrency}
          fxRates={fxRates}
          subscriptionStatus={subscriptionStatus}
          onOpenSubscription={onOpenSubscription}
          readOnly={readOnly}
        />
      );
    case 'loans':
      return (
        <LiabilitiesScreen
          hideSensitive={hideSensitive}
          preferredCurrency={preferredCurrency}
          fxRates={fxRates}
          readOnly={readOnly}
        />
      );
    case 'performance':
      return (
        <PerformanceScreen
          hideSensitive={hideSensitive}
          preferredCurrency={preferredCurrency}
          fxRates={fxRates}
          premiumActive={premiumActive}
          onOpenSubscription={onOpenSubscription}
        />
      );
    case 'reminders':
      return (
        <RemindersScreen
          hideSensitive={hideSensitive}
          preferredCurrency={preferredCurrency}
          fxRates={fxRates}
          premiumActive={premiumActive}
          onOpenSubscription={onOpenSubscription}
        />
      );
    case 'settings':
      return <SettingsScreen premiumActive={premiumActive} onOpenSubscription={onOpenSubscription} readOnly={readOnly} />;
    case 'account':
      return (
        <AccountScreen
          user={user}
          onLogout={onLogout}
          onPrivacyConfigChanged={onPrivacyConfigChanged}
          onCurrencyChanged={onCurrencyChanged}
          biometricEnrolled={biometricEnrolled}
          onEnrollBiometric={onEnrollBiometric}
          onDisableBiometric={onDisableBiometric}
          subscriptionStatus={subscriptionStatus}
          onOpenSubscription={onOpenSubscription}
          onOpenFamily={onOpenFamily}
          premiumActive={premiumActive}
          preferredCurrency={preferredCurrency}
          onThemeChange={onThemeChange}
          themeKey={themeKey}
        />
      );
    case 'subscription':
      return (
        <SubscriptionScreen
          onClose={onCloseSubscription}
          onPurchased={onCloseSubscription}
          user={user}
        />
      );
    case 'family':
      return (
        <FamilyScreen
          premiumActive={premiumActive}
          accessRole={accessRole}
          isAccountOwner={isAccountOwner}
          onOpenSubscription={onOpenSubscription}
          onClose={onCloseFamily}
        />
      );
    default:
      return <DashboardScreen hideSensitive={hideSensitive} preferredCurrency={preferredCurrency} fxRates={fxRates} />;
  }
}

export default function App() {
  const [themeKey, setThemeKey] = useState('teal');
  const theme = THEMES[themeKey] || THEMES.teal;
  const isDarkTheme = themeKey === 'black';
  const [bootLoading, setBootLoading] = useState(true);
  const [launchVisible, setLaunchVisible] = useState(true);
  const launchOpacity = React.useRef(new Animated.Value(1)).current;
  const appOpacity = React.useRef(new Animated.Value(0)).current;
  const [activeTab, setActiveTab] = useState('dashboard');
  const [authLoading, setAuthLoading] = useState(false);
  const [authError, setAuthError] = useState('');
  const [user, setUser] = useState(null);
  const [hideSensitive, setHideSensitive] = useState(true);
  const [privacyPinEnabled, setPrivacyPinEnabled] = useState(false);
  const [privacyPin, setPrivacyPin] = useState('');
  const [pinModalVisible, setPinModalVisible] = useState(false);
  const [pinInput, setPinInput] = useState('');
  const [pinError, setPinError] = useState('');
  const [pendingPrivacyState, setPendingPrivacyState] = useState(true);
  const [preferredCurrency, setPreferredCurrency] = useState('INR');
  const [fxRates, setFxRates] = useState({ INR: 1 });
  const [moreMenuVisible, setMoreMenuVisible] = useState(false);
  const [biometricEnrolled, setBiometricEnrolled] = useState(false);
  const [lastLoginCreds, setLastLoginCreds] = useState(null);
  const [subscriptionStatus, setSubscriptionStatus] = useState(null);
  const [accessRole, setAccessRole] = useState('admin');
  const [accountOwner, setAccountOwner] = useState(null);
  const [isAccountOwner, setIsAccountOwner] = useState(true);
  const [prevTab, setPrevTab] = useState(null);
  const premiumActive =
    subscriptionStatus?.status === 'active' &&
    ['trial_premium', 'premium_monthly', 'premium_yearly'].includes(subscriptionStatus?.plan);
  const subscriptionActive = subscriptionStatus?.status === 'active';
  const readOnly = !subscriptionActive || accessRole === 'read';

  useEffect(() => {
    const timer = setTimeout(() => {
      setBootLoading(false);
      Animated.parallel([
        Animated.timing(launchOpacity, { toValue: 0, duration: 1200, useNativeDriver: true }),
        Animated.timing(appOpacity, { toValue: 1, duration: 1200, useNativeDriver: true })
      ]).start(() => setLaunchVisible(false));
    }, 7000);
    return () => clearTimeout(timer);
  }, []);

  useEffect(() => {
    SecureStore.getItemAsync(BIOMETRIC_CREDENTIALS_KEY)
      .then((raw) => {
        if (raw) setBiometricEnrolled(true);
      })
      .catch(() => {});
  }, []);

  const refreshFxRates = async () => {
    try {
      const payload = await api.getLiveFxRates({ base: 'INR', symbols: FX_SYMBOLS });
      const nextRates = payload?.rates || {};
      if (Object.keys(nextRates).length) {
        setFxRates({ INR: 1, ...nextRates });
      }
    } catch (_e) {
      // Keep last known FX map on failure.
    }
  };

  const refreshPrivacyConfig = async () => {
    try {
      const settings = await api.getSettings();
      const enabled = String(settings?.privacy_pin_enabled || '').toLowerCase();
      setPrivacyPinEnabled(enabled === '1' || enabled === 'true' || enabled === 'yes');
      setPrivacyPin(String(settings?.privacy_pin || ''));
      setPreferredCurrency(String(settings?.preferred_currency || 'INR'));
      if (settings?.ui_theme && THEMES[settings.ui_theme]) {
        setThemeKey(settings.ui_theme);
      }
      const biometric = String(settings?.biometric_login_enabled || '').toLowerCase();
      setBiometricEnrolled(biometric === '1' || biometric === 'true' || biometric === 'yes');
      refreshFxRates();
    } catch (_e) {
      setPrivacyPinEnabled(false);
      setPrivacyPin('');
      setPreferredCurrency('INR');
      setFxRates({ INR: 1 });
      setBiometricEnrolled(false);
    }
  };

  const refreshAccessContext = async () => {
    try {
      const info = await api.getFamilyAccess();
      setAccessRole(String(info?.role || 'admin'));
      setAccountOwner(info?.owner || null);
      setIsAccountOwner(Boolean(info?.is_owner));
    } catch (_e) {
      setAccessRole('admin');
      setAccountOwner(null);
      setIsAccountOwner(true);
    }
  };

  const refreshSubscription = async () => {
    try {
      const status = await api.getSubscriptionStatus();
      setSubscriptionStatus(status);
    } catch (_e) {
      setSubscriptionStatus(null);
    }
  };

  const handleAuthSuccess = (payload) => {
    setAuthToken(payload.token);
    setUser(payload.user);
    setAuthError('');
    setActiveTab('dashboard');
    refreshPrivacyConfig();
    refreshSubscription();
    refreshAccessContext();
  };

  const handleLogin = async (payload) => {
    try {
      setAuthLoading(true);
      const result = await api.login(payload);
      setLastLoginCreds({ mobile: payload.mobile, mpin: payload.mpin });
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
      setLastLoginCreds({ mobile: payload.mobile, mpin: payload.mpin });
      handleAuthSuccess(result);
    } catch (e) {
      setAuthError(e.message);
      throw e;
    } finally {
      setAuthLoading(false);
    }
  };

  const handleOtpSend = async (payload) => {
    try {
      setAuthLoading(true);
      setAuthError('');
      return await api.sendLoginOtp(payload);
    } catch (e) {
      setAuthError(e.message);
      throw e;
    } finally {
      setAuthLoading(false);
    }
  };

  const handleOtpVerify = async (payload) => {
    try {
      setAuthLoading(true);
      setAuthError('');
      const result = await api.verifyLoginOtp(payload);
      handleAuthSuccess(result);
      return result;
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
    setPinModalVisible(false);
    setPinInput('');
    setPinError('');
    setFxRates({ INR: 1 });
    setSubscriptionStatus(null);
    setAccessRole('admin');
    setAccountOwner(null);
    setIsAccountOwner(true);
  };

  const ensureBiometricReady = async () => {
    const hasHardware = await LocalAuthentication.hasHardwareAsync();
    if (!hasHardware) throw new Error('Biometric hardware not available on this device.');
    const enrolled = await LocalAuthentication.isEnrolledAsync();
    if (!enrolled) throw new Error('No Face ID / biometric profile is enrolled on this device.');
  };

  const saveBiometricCredentials = async (mobile, mpin) => {
    if (!mobile || !mpin) throw new Error('Login once with mobile + MPIN before enrolling Face ID.');
    await SecureStore.setItemAsync(BIOMETRIC_CREDENTIALS_KEY, JSON.stringify({ mobile, mpin }));
    setBiometricEnrolled(true);
  };

  const handleEnrollBiometric = async () => {
    await ensureBiometricReady();
    const auth = await LocalAuthentication.authenticateAsync({
      promptMessage: 'Confirm Face ID enrollment',
      fallbackLabel: 'Use device passcode'
    });
    if (!auth.success) throw new Error('Biometric verification failed.');
    await saveBiometricCredentials(lastLoginCreds?.mobile, lastLoginCreds?.mpin);
    await api.upsertSettings({ biometric_login_enabled: '1' }).catch(() => {});
  };

  const handleDisableBiometric = async () => {
    await SecureStore.deleteItemAsync(BIOMETRIC_CREDENTIALS_KEY).catch(() => {});
    await api.upsertSettings({ biometric_login_enabled: '0' }).catch(() => {});
    setBiometricEnrolled(false);
  };

  const handleBiometricLogin = async () => {
    await ensureBiometricReady();
    const raw = await SecureStore.getItemAsync(BIOMETRIC_CREDENTIALS_KEY);
    if (!raw) throw new Error('Face ID login is not enrolled on this device yet.');
    const creds = JSON.parse(raw);
    const auth = await LocalAuthentication.authenticateAsync({
      promptMessage: 'Login with Face ID',
      fallbackLabel: 'Use device passcode'
    });
    if (!auth.success) throw new Error('Biometric login canceled or failed.');
    await handleLogin({ mobile: String(creds.mobile || ''), mpin: String(creds.mpin || '') });
  };

  const handlePrivacyConfigChanged = (nextState) => {
    if (nextState?.preferredCurrency) {
      setPreferredCurrency(String(nextState.preferredCurrency));
      refreshFxRates();
      return;
    }
    refreshPrivacyConfig();
  };

  useEffect(() => {
    if (!user) return undefined;
    refreshFxRates();
    const timer = setInterval(refreshFxRates, 60_000);
    return () => clearInterval(timer);
  }, [user]);

  const togglePrivacy = () => {
    const next = !hideSensitive;
    if (!privacyPinEnabled) {
      setHideSensitive(next);
      return;
    }

    setPendingPrivacyState(next);
    setPinModalVisible(true);
    setPinInput('');
    setPinError('');
  };

  const handleTabSelect = (key) => {
    if (PREMIUM_TAB_KEYS.has(key) && !premiumActive) {
      setPrevTab(activeTab);
      setActiveTab('subscription');
      return;
    }
    setActiveTab(key);
  };

  const openSubscription = () => {
    setPrevTab(activeTab);
    setActiveTab('subscription');
  };

  const closeSubscription = () => {
    refreshSubscription();
    setActiveTab(prevTab || 'dashboard');
  };

  const openFamily = () => {
    if (!premiumActive) {
      setPrevTab(activeTab);
      setActiveTab('subscription');
      return;
    }
    setPrevTab(activeTab);
    setActiveTab('family');
  };

  const closeFamily = () => {
    setActiveTab(prevTab || 'dashboard');
  };

  const handleMaskedPinInput = (text) => {
    const digits = String(text || '').replace(/\D/g, '');
    if (!digits) {
      if (pinInput.length > 0 && String(text || '').length < pinInput.length) {
        setPinInput((prev) => prev.slice(0, -1));
      }
      return;
    }

    setPinInput((prev) => {
      if (String(text || '').length < prev.length) return prev.slice(0, -1);
      return `${prev}${digits}`.slice(0, 4);
    });
  };

  const mainContent = !user ? (
    <SafeAreaView style={[styles.root, { backgroundColor: theme.background }]}>
      <StatusBar barStyle={isDarkTheme ? 'light-content' : 'dark-content'} />
      <View style={styles.header}>
        <Text style={[styles.title, { color: theme.text }]}>Networth Manager</Text>
        <Text style={[styles.subtitle, { color: theme.muted }]}>
          Create account or login with mobile + MPIN or OTP
        </Text>
      </View>
      <ScrollView style={styles.body} contentContainerStyle={styles.bodyContent}>
        <AuthScreen
          onLogin={handleLogin}
          onRegister={handleRegister}
          onLoginWithBiometric={handleBiometricLogin}
          onRequestOtp={handleOtpSend}
          onVerifyOtp={handleOtpVerify}
          loading={authLoading}
        />
        {!!authError && <Text style={[styles.authError, { color: theme.danger }]}>{authError}</Text>}
      </ScrollView>
    </SafeAreaView>
  ) : (
    <SafeAreaView style={[styles.root, { backgroundColor: theme.background }]}>
      <StatusBar barStyle={isDarkTheme ? 'light-content' : 'dark-content'} />
      <View style={styles.header}>
        <Text style={[styles.title, { color: theme.text }]}>Networth Manager</Text>
        <Text style={[styles.subtitle, { color: theme.muted }]}>
          Welcome, {toCamelCaseWords(user.full_name)}
        </Text>
        <Text style={[styles.subtitle, { color: theme.muted }]}>
          Role: {String(accessRole || 'admin').toUpperCase()}
          {accountOwner && accountOwner.id !== user.id ? ` · Owner: ${accountOwner.full_name}` : ''}
        </Text>
        <Pressable style={styles.toggleWrap} onPress={togglePrivacy}>
          <Text style={[styles.toggleText, { color: theme.accent }]}>
            Privacy {hideSensitive ? 'ON' : 'OFF'}
          </Text>
        </Pressable>
      </View>

      {activeTab === 'subscription' ? (
        <View style={styles.body}>
          <View style={styles.bodyContent}>
            <ScreenRenderer
              tab={activeTab}
              user={user}
              onLogout={handleLogout}
              hideSensitive={hideSensitive}
              onPrivacyConfigChanged={handlePrivacyConfigChanged}
              onCurrencyChanged={(currency) => handlePrivacyConfigChanged({ preferredCurrency: currency })}
              preferredCurrency={preferredCurrency}
              fxRates={fxRates}
              biometricEnrolled={biometricEnrolled}
              onEnrollBiometric={handleEnrollBiometric}
              onDisableBiometric={handleDisableBiometric}
              subscriptionStatus={subscriptionStatus}
              onOpenSubscription={openSubscription}
              onOpenFamily={openFamily}
              accessRole={accessRole}
              isAccountOwner={isAccountOwner}
              premiumActive={premiumActive}
              readOnly={readOnly}
              onCloseSubscription={closeSubscription}
              onCloseFamily={closeFamily}
              onThemeChange={(nextKey) => {
                if (!THEMES[nextKey]) return;
                setThemeKey(nextKey);
                api.upsertSettings({ ui_theme: nextKey }).catch(() => {});
              }}
              themeKey={themeKey}
            />
          </View>
        </View>
      ) : (
        <ScrollView style={styles.body} contentContainerStyle={styles.bodyContent}>
          <ScreenRenderer
            tab={activeTab}
            user={user}
            onLogout={handleLogout}
            hideSensitive={hideSensitive}
            onPrivacyConfigChanged={handlePrivacyConfigChanged}
            onCurrencyChanged={(currency) => handlePrivacyConfigChanged({ preferredCurrency: currency })}
            preferredCurrency={preferredCurrency}
            fxRates={fxRates}
            biometricEnrolled={biometricEnrolled}
            onEnrollBiometric={handleEnrollBiometric}
            onDisableBiometric={handleDisableBiometric}
            subscriptionStatus={subscriptionStatus}
            onOpenSubscription={openSubscription}
            onOpenFamily={openFamily}
            accessRole={accessRole}
            isAccountOwner={isAccountOwner}
            premiumActive={premiumActive}
            readOnly={readOnly}
            onCloseSubscription={closeSubscription}
            onCloseFamily={closeFamily}
            onThemeChange={(nextKey) => {
              if (!THEMES[nextKey]) return;
              setThemeKey(nextKey);
              api.upsertSettings({ ui_theme: nextKey }).catch(() => {});
            }}
            themeKey={themeKey}
          />
        </ScrollView>
      )}

      <Modal visible={pinModalVisible} transparent animationType="fade">
        <View style={styles.modalBackdrop}>
          <View style={[styles.modalCard, { backgroundColor: theme.card, borderColor: theme.border }]}>
            <Text style={[styles.modalTitle, { color: theme.text }]}>Privacy PIN</Text>
            <Text style={[styles.modalSub, { color: theme.muted }]}>
              Enter 4-digit PIN to turn Privacy {pendingPrivacyState ? 'ON' : 'OFF'}.
            </Text>
            <TextInput
              style={[styles.modalInput, { borderColor: theme.border, backgroundColor: theme.inputBg, color: theme.inputText }]}
              value={'*'.repeat(pinInput.length)}
              onChangeText={handleMaskedPinInput}
              keyboardType="number-pad"
              secureTextEntry={false}
              maxLength={4}
            />
            {!!pinError && <Text style={[styles.pinError, { color: theme.danger }]}>{pinError}</Text>}
            <View style={styles.modalActions}>
              <Pressable
                style={[styles.modalBtn, styles.modalBtnGhost, { borderColor: theme.accent, backgroundColor: theme.card }]}
                onPress={() => setPinModalVisible(false)}
              >
                <Text style={[styles.modalBtnGhostText, { color: theme.accent }]}>Cancel</Text>
              </Pressable>
              <Pressable
                style={[styles.modalBtn, styles.modalBtnPrimary, { backgroundColor: theme.accent }]}
                onPress={() => {
                  if (!/^\d{4}$/.test(pinInput)) {
                    setPinError('PIN must be exactly 4 digits.');
                    return;
                  }
                  if (pinInput !== privacyPin) {
                    setPinError('Incorrect PIN.');
                    return;
                  }
                  setHideSensitive(pendingPrivacyState);
                  setPinModalVisible(false);
                }}
              >
                <Text style={styles.modalBtnPrimaryText}>Confirm</Text>
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>

      <View style={[styles.bottomNav, { backgroundColor: theme.card, borderTopColor: theme.border }]}>
        {PRIMARY_TAB_KEYS.map((key) => {
          const tab = TABS.find((t) => t.key === key);
          const active = activeTab === key;
          const locked = PREMIUM_TAB_KEYS.has(key) && !premiumActive;
          const label = tab?.label || key;
          return (
            <Pressable
              key={key}
              style={[styles.navItem, active && { backgroundColor: theme.accentSoft }]}
              onPress={() => handleTabSelect(key)}
            >
              <Text style={[
                styles.navText,
                { color: theme.muted },
                active && { color: theme.accent },
                locked && { color: theme.warn }
              ]}>
                {locked ? <Text style={[styles.lockIcon, { color: theme.warn }]}>🔒 </Text> : null}
                {label}
              </Text>
            </Pressable>
          );
        })}
        <Pressable
          style={[
            styles.navItem,
            SECONDARY_TAB_KEYS.includes(activeTab) && { backgroundColor: theme.accentSoft }
          ]}
          onPress={() => setMoreMenuVisible(true)}
        >
          <Text
            style={[
              styles.navText,
              styles.hamburgerText,
              { color: theme.muted },
              SECONDARY_TAB_KEYS.includes(activeTab) && { color: theme.accent }
            ]}
          >
            ≡
          </Text>
        </Pressable>
      </View>

      <Modal visible={moreMenuVisible} transparent animationType="fade">
        <Pressable style={styles.modalBackdrop} onPress={() => setMoreMenuVisible(false)}>
          <Pressable style={[styles.modalCard, { backgroundColor: theme.card, borderColor: theme.border }]} onPress={() => {}}>
            <Text style={[styles.modalTitle, { color: theme.text }]}>More</Text>
            <View style={styles.moreGrid}>
              {MENU_TAB_KEYS.map((key) => {
                const tab = TABS.find((t) => t.key === key);
                const active = activeTab === key;
                const locked = PREMIUM_TAB_KEYS.has(key) && !premiumActive;
                const label = tab?.label || key;
                return (
                  <Pressable
                    key={key}
                    style={[
                      styles.moreChip,
                      { borderColor: theme.border, backgroundColor: theme.card },
                      active && { borderColor: theme.accent, backgroundColor: theme.accentSoft }
                    ]}
                    onPress={() => {
                      handleTabSelect(key);
                      setMoreMenuVisible(false);
                    }}
                  >
                    <Text style={[
                      styles.moreChipText,
                      { color: theme.muted },
                      active && { color: theme.accent },
                      locked && { color: theme.warn }
                    ]}>
                      {locked ? <Text style={[styles.lockIcon, { color: theme.warn }]}>🔒 </Text> : null}
                      {label}
                    </Text>
                  </Pressable>
                );
              })}
            </View>
          </Pressable>
        </Pressable>
      </Modal>

    </SafeAreaView>
  );

  return (
    <ThemeContext.Provider value={{ theme, themeKey, setThemeKey }}>
      <View style={{ flex: 1 }}>
        <Animated.View style={{ flex: 1, opacity: appOpacity }}>{mainContent}</Animated.View>
        {launchVisible ? (
          <Animated.View style={[StyleSheet.absoluteFillObject, { opacity: launchOpacity }]}>
            <LaunchScreen dark={isDarkTheme} />
          </Animated.View>
        ) : null}
      </View>
    </ThemeContext.Provider>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: '#f7f9fc'
  },
  rootDark: {
    backgroundColor: '#12161c'
  },
  header: {
    paddingHorizontal: 16,
    paddingTop: 12,
    paddingBottom: 10
  },
  title: {
    fontSize: 24,
    fontWeight: '800',
    color: '#0f2f4d'
  },
  titleDark: {
    color: '#e7edf5'
  },
  subtitle: {
    fontSize: 13,
    marginTop: 2,
    color: '#5d7a95'
  },
  subtitleDark: {
    color: '#9db0c4'
  },
  toggleWrap: {
    marginTop: 6
  },
  toggleText: {
    color: ACCENT,
    fontWeight: '700',
    fontSize: 12
  },
  toggleTextDark: {
    color: ACCENT_DARK
  },
  body: {
    flex: 1
  },
  bodyContent: {
    paddingHorizontal: 14,
    paddingBottom: 84
  },
  authError: {
    color: '#b3261e',
    marginTop: 8
  },
  modalBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.35)',
    justifyContent: 'center',
    paddingHorizontal: 20
  },
  modalCard: {
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 14,
    borderWidth: 1,
    borderColor: '#dbe3ee'
  },
  modalCardDark: {
    backgroundColor: '#1b222b',
    borderColor: '#2e3b49'
  },
  modalTitle: {
    fontWeight: '800',
    color: '#0f2f4d'
  },
  modalSub: {
    color: '#607d99',
    marginTop: 4,
    marginBottom: 8
  },
  modalInput: {
    borderWidth: 1,
    borderColor: '#c9d8ea',
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 8,
    backgroundColor: '#fff'
  },
  modalInputDark: {
    borderColor: '#2d3b4a',
    backgroundColor: '#10161d',
    color: '#e7edf5'
  },
  pinError: {
    marginTop: 6,
    color: '#b3261e'
  },
  modalActions: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    gap: 8,
    marginTop: 10
  },
  modalBtn: {
    borderRadius: 999,
    paddingVertical: 8,
    paddingHorizontal: 12
  },
  modalBtnGhost: {
    borderWidth: 1,
    borderColor: ACCENT,
    backgroundColor: '#fff'
  },
  modalBtnPrimary: {
    backgroundColor: ACCENT
  },
  modalBtnGhostText: {
    color: ACCENT,
    fontWeight: '700'
  },
  modalBtnPrimaryText: {
    color: '#fff',
    fontWeight: '700'
  },
  bottomNav: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderTopWidth: 1,
    borderTopColor: '#d8e2ef',
    backgroundColor: '#ffffff',
    paddingHorizontal: 10,
    paddingTop: 8,
    paddingBottom: 10
  },
  bottomNavDark: {
    backgroundColor: '#161d26',
    borderTopColor: '#2d3b4a'
  },
  navItem: {
    flex: 1,
    alignItems: 'center',
    paddingVertical: 9,
    borderRadius: 10
  },
  navItemActive: {
    backgroundColor: '#ebf8f6'
  },
  navText: {
    color: '#35526e',
    fontWeight: '800',
    fontSize: 11,
    textAlign: 'center'
  },
  hamburgerText: {
    fontSize: 18,
    lineHeight: 18
  },
  navTextActive: {
    color: ACCENT
  },
  navTextLocked: {
    color: '#9a6b00'
  },
  lockIcon: {
    fontSize: 11
  },
  moreGrid: {
    marginVertical: 12,
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8
  },
  moreChip: {
    borderWidth: 1,
    borderColor: '#d4dde8',
    borderRadius: 999,
    paddingVertical: 8,
    paddingHorizontal: 12,
    backgroundColor: '#fff'
  },
  moreChipActive: {
    borderColor: ACCENT,
    backgroundColor: '#ebf8f6'
  },
  moreChipText: {
    color: '#35526e',
    fontWeight: '700'
  },
  moreChipTextActive: {
    color: ACCENT
  },
  moreChipTextLocked: {
    color: '#9a6b00'
  }
});
