import React, { useEffect, useState } from 'react';
import {
  ScrollView,
  StatusBar,
  StyleSheet,
  Text,
  View,
  Pressable,
  Modal,
  TextInput,
  Image,
  Animated,
  useWindowDimensions,
  Alert,
  Platform,
  InteractionManager,
  KeyboardAvoidingView
} from 'react-native';
import { SafeAreaProvider, SafeAreaView } from 'react-native-safe-area-context';
import * as LocalAuthentication from 'expo-local-authentication';
import * as Notifications from 'expo-notifications';
import * as SecureStore from 'expo-secure-store';
import Constants from 'expo-constants';
import Svg, { Path, Line, Circle, Text as SvgText } from 'react-native-svg';
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
import OnboardingModal from './src/components/OnboardingModal';
import PillButton from './src/components/PillButton';
import { api, getAuthToken, setAuthToken } from './src/api/client';
import {
  canUseNativePhoneAuth,
  clearNativePhoneOtp,
  completeNativePhoneOtp,
  startNativePhoneOtp
} from './src/firebase/nativePhoneAuth';
import { FAQ_ITEMS } from './src/constants/faqs';
import { ThemeContext, THEMES } from './src/theme';
import { LanguageContext, translate } from './src/i18n';

const ACCENT = '#0f766e';
const ACCENT_DARK = '#5eead4';
const FX_SYMBOLS = ['INR', 'USD', 'EUR', 'GBP', 'AED', 'SGD'];
const BIOMETRIC_CREDENTIALS_KEY = 'biometric_credentials_v1';
const BIOMETRIC_SESSION_MAX_AGE_MS = 1000 * 60 * 60 * 24 * 3; // 3 days
const AUTH_SESSION_TOKEN_KEY = 'auth_session_token_v1';
const ONBOARDING_SKIPPED_KEY = 'onboarding_skipped_v1';
const REMINDER_NOTIFICATION_CACHE_KEY = 'reminder_notification_cache_v1';
const BRAND_ICON = require('./src/assets/app-icon.png');
const REMINDER_NOTIFICATION_TYPE = 'reminder_due';

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowBanner: true,
    shouldShowList: true,
    shouldPlaySound: true,
    shouldSetBadge: false
  })
});

const TABS = [
  { key: 'dashboard', labelKey: 'Dashboard' },
  { key: 'assets', labelKey: 'Assets' },
  { key: 'loans', labelKey: 'Liabilities' },
  { key: 'settings', labelKey: 'Targets' },
  { key: 'reminders', labelKey: 'Reminders' },
  { key: 'performance', labelKey: 'Net Worth Trend' },
  { key: 'account', labelKey: 'Account' }
];
const PRIMARY_TAB_KEYS = ['dashboard', 'assets', 'loans', 'settings', 'reminders'];
const PREMIUM_TAB_KEYS = new Set(['settings', 'performance', 'reminders']);
const AnimatedPressable = Animated.createAnimatedComponent(Pressable);

const TAB_ICONS = {
  dashboard: '📊',
  assets: '💵',
  loans: '💳',
  settings: '🎯',
  performance: '📈',
  reminders: '⏰',
  account: '👤'
};

function getPageHeaderCopy(tab, t) {
  switch (tab) {
    case 'assets':
      return {
        eyebrow: t('Assets'),
        title: t('Everything you own, in one place'),
        body: t('Track bank balances, investments, gold, property, and every other asset with a cleaner overview.')
      };
    case 'loans':
      return {
        eyebrow: t('Liabilities'),
        title: t('See every obligation clearly'),
        body: t('Review loans, credit dues, and outstanding amounts together so net worth stays honest and current.')
      };
    case 'settings':
      return {
        eyebrow: t('Targets'),
        title: t('Set the numbers you want to grow into'),
        body: t('Define yearly targets category by category and measure progress without digging through multiple screens.')
      };
    case 'reminders':
      return {
        eyebrow: t('Reminders'),
        title: t('Stay ahead of due dates'),
        body: t('Keep renewals, premiums, and review dates visible so important financial actions do not slip.')
      };
    case 'account':
      return {
        eyebrow: t('Account'),
        title: t('Control access, privacy, and support'),
        body: t('Manage security settings, family access, subscription details, and support options from one place.')
      };
    case 'performance':
      return {
        eyebrow: t('Net Worth Trend'),
        title: t('Review how net worth is moving'),
        body: t('Read month-end snapshots and compare asset, liability, and net worth movement over time.')
      };
    case 'family':
      return {
        eyebrow: t('Family'),
        title: t('Share visibility with the right people'),
        body: t('Grant access carefully, review permissions, and keep family sharing limited to what is actually needed.')
      };
    default:
      return null;
  }
}

function AiBrainIcon({ stroke, badgeFill, badgeText }) {
  return (
    <Svg width={22} height={22} viewBox="0 0 24 24" fill="none">
      <Path
        d="M7.5 4.5h7a5 5 0 0 1 5 5v5a5 5 0 0 1-5 5h-7a5 5 0 0 1-5-5v-5a5 5 0 0 1 5-5Z"
        fill={badgeFill}
        fillOpacity={0.12}
        stroke={stroke}
        strokeWidth={1.5}
      />
      <Path
        d="M8.2 10.8 10 7.4l1.3 2.6 1.4-2.3 1.4 3.1 1.6-.2"
        stroke={stroke}
        strokeWidth={1.5}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <Circle cx="16.9" cy="7.1" r="1.1" fill={stroke} />
      <Line x1="16.9" y1="4.9" x2="16.9" y2="3.6" stroke={stroke} strokeWidth={1.2} strokeLinecap="round" />
      <Line x1="19.1" y1="7.1" x2="20.4" y2="7.1" stroke={stroke} strokeWidth={1.2} strokeLinecap="round" />
      <Line x1="18.4" y1="5.6" x2="19.3" y2="4.7" stroke={stroke} strokeWidth={1.2} strokeLinecap="round" />
      <Circle cx="17.2" cy="17.2" r="3.8" fill={badgeFill} stroke={stroke} strokeWidth={1} />
      <SvgText
        x="17.2"
        y="18.5"
        fontSize="5.6"
        fontWeight="800"
        textAnchor="middle"
        fill={badgeText}
      >
        AI
      </SvgText>
    </Svg>
  );
}

function toInitialsFromName(value = '') {
  const raw = String(value || '').trim();
  if (/^[A-Za-z]{1,2}$/.test(raw)) return raw.toUpperCase();
  const parts = raw
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part.charAt(0).toUpperCase());
  if (parts.length) return parts.join('');
  const letters = raw.replace(/[^A-Za-z]/g, '').toUpperCase();
  if (letters.length >= 2) return letters.slice(0, 2);
  return letters || 'NA';
}

function EyeToggleIcon({ stroke, closed = false }) {
  return (
    <Svg width={22} height={22} viewBox="0 0 24 24" fill="none">
      <Path
        d="M2 12s3.6-6 10-6 10 6 10 6-3.6 6-10 6-10-6-10-6Z"
        stroke={stroke}
        strokeWidth={1.8}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <Circle cx="12" cy="12" r="3" stroke={stroke} strokeWidth={1.8} />
      {closed ? <Line x1="4" y1="20" x2="20" y2="4" stroke={stroke} strokeWidth={2} strokeLinecap="round" /> : null}
    </Svg>
  );
}

function SupportIcon({ stroke }) {
  return (
    <Svg width={20} height={20} viewBox="0 0 24 24" fill="none">
      <Path
        d="M12 3a8 8 0 0 0-8 8v1.5A2.5 2.5 0 0 0 6.5 15H8v-4H6a6 6 0 0 1 12 0h-2v4h2.2c-.5 2.1-2.4 3.5-5 3.5h-1.2V21h1.2c4.2 0 6.8-2.5 6.8-6V11a8 8 0 0 0-8-8Z"
        stroke={stroke}
        strokeWidth={1.7}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <Circle cx="12" cy="15.5" r="1.1" fill={stroke} />
      <Path d="M10.8 10.4a1.6 1.6 0 1 1 2.4 1.4c-.5.3-.9.8-.9 1.4v.2" stroke={stroke} strokeWidth={1.5} strokeLinecap="round" />
    </Svg>
  );
}

function LockIcon({ stroke }) {
  return (
    <Svg width={28} height={28} viewBox="0 0 24 24" fill="none">
      <Path
        d="M8 10V7.8C8 5.7 9.8 4 12 4s4 1.7 4 3.8V10"
        stroke={stroke}
        strokeWidth={1.9}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <Path
        d="M7 10.2h10a1.8 1.8 0 0 1 1.8 1.8v6A1.8 1.8 0 0 1 17 19.8H7A1.8 1.8 0 0 1 5.2 18v-6A1.8 1.8 0 0 1 7 10.2Z"
        stroke={stroke}
        strokeWidth={1.9}
        strokeLinejoin="round"
      />
    </Svg>
  );
}

function FingerprintIcon({ stroke }) {
  return (
    <Svg width={28} height={28} viewBox="0 0 24 24" fill="none">
      <Path d="M12 3.5c-4.4 0-8 3.6-8 8 0 1.6.5 3.2 1.4 4.5" stroke={stroke} strokeWidth={1.8} strokeLinecap="round" />
      <Path d="M12 7c-2.5 0-4.5 2-4.5 4.5 0 1.2.4 2.4 1.1 3.3" stroke={stroke} strokeWidth={1.8} strokeLinecap="round" />
      <Path d="M12 10.5c-.6 0-1 .4-1 1 0 1.9-.7 3.7-2 5.1" stroke={stroke} strokeWidth={1.8} strokeLinecap="round" />
      <Path d="M12 5.2c3.5 0 6.3 2.8 6.3 6.3 0 3.7-1.2 7.1-3.5 9.8" stroke={stroke} strokeWidth={1.8} strokeLinecap="round" />
      <Path d="M12 8.8c1.5 0 2.7 1.2 2.7 2.7 0 2.9-.8 5.5-2.4 7.8" stroke={stroke} strokeWidth={1.8} strokeLinecap="round" />
    </Svg>
  );
}

function parseDueDateAtNine(dateValue) {
  const match = String(dateValue || '').trim().match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!match) return null;
  const y = Number(match[1]);
  const m = Number(match[2]);
  const d = Number(match[3]);
  const date = new Date(y, m - 1, d, 9, 0, 0, 0);
  if (Number.isNaN(date.getTime())) return null;
  return date;
}

function addDays(date, days) {
  const next = new Date(date.getTime());
  next.setDate(next.getDate() + Number(days || 0));
  return next;
}

function formatReminderDate(value) {
  const date = parseDueDateAtNine(value);
  if (!date) return String(value || '');
  return date.toLocaleDateString();
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
  onOpenOnboarding,
  onRegisterOnboardingTarget,
  onMeasureOnboardingTarget,
  onGetOnboardingZoomStyle,
  onThemeChange,
  themeKey,
  onRemindersChanged,
  onRequestScrollTo,
  onOpenSupport
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
          onRequestScrollTo={onRequestScrollTo}
        />
      );
    case 'loans':
      return (
        <LiabilitiesScreen
          hideSensitive={hideSensitive}
          preferredCurrency={preferredCurrency}
          fxRates={fxRates}
          readOnly={readOnly}
          onRequestScrollTo={onRequestScrollTo}
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
          onRemindersChanged={onRemindersChanged}
          onRequestScrollTo={onRequestScrollTo}
        />
      );
    case 'settings':
      return (
        <SettingsScreen
          premiumActive={premiumActive}
          onOpenSubscription={onOpenSubscription}
          readOnly={readOnly}
          onRequestScrollTo={onRequestScrollTo}
        />
      );
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
          onOpenSupport={onOpenSupport}
          onOpenOnboarding={onOpenOnboarding}
          onRegisterOnboardingTarget={onRegisterOnboardingTarget}
          onMeasureOnboardingTarget={onMeasureOnboardingTarget}
          onGetOnboardingZoomStyle={onGetOnboardingZoomStyle}
          premiumActive={premiumActive}
          preferredCurrency={preferredCurrency}
          onThemeChange={onThemeChange}
          themeKey={themeKey}
          onRequestScrollTo={onRequestScrollTo}
        />
      );
    case 'subscription':
      return (
        <SubscriptionScreen
          onClose={onCloseSubscription}
          onPurchased={() => {}}
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
          onRequestScrollTo={onRequestScrollTo}
        />
      );
    default:
      return <DashboardScreen hideSensitive={hideSensitive} preferredCurrency={preferredCurrency} fxRates={fxRates} />;
  }
}

export default function App() {
  const { height: screenHeight } = useWindowDimensions();
  const [themeKey, setThemeKey] = useState('teal');
  const theme = THEMES[themeKey] || THEMES.teal;
  const isDarkTheme = themeKey === 'black';
  const [language, setLanguage] = useState('en');
  const t = React.useCallback((key, vars) => translate(language, key, vars), [language]);
  const [launchVisible, setLaunchVisible] = useState(true);
  const launchOpacity = React.useRef(new Animated.Value(1)).current;
  const appOpacity = React.useRef(new Animated.Value(0)).current;
  const launchTransitionStartedRef = React.useRef(false);
  const [activeTab, setActiveTab] = useState('dashboard');
  const [authLoading, setAuthLoading] = useState(false);
  const [authError, setAuthError] = useState('');
  const [user, setUser] = useState(null);
  const [sessionRestoring, setSessionRestoring] = useState(true);
  const [hideSensitive, setHideSensitive] = useState(true);
  const [pinSetupRequired, setPinSetupRequired] = useState(false);
  const [pinSetupVisible, setPinSetupVisible] = useState(false);
  const [pinSetupInput, setPinSetupInput] = useState('');
  const [pinSetupError, setPinSetupError] = useState('');
  const [preferredCurrency, setPreferredCurrency] = useState('INR');
  const [fxRates, setFxRates] = useState({ INR: 1 });
  const [aiVisible, setAiVisible] = useState(false);
  const [aiLoading, setAiLoading] = useState(false);
  const [aiError, setAiError] = useState('');
  const [aiPayload, setAiPayload] = useState(null);
  const [supportVisible, setSupportVisible] = useState(false);
  const [supportChatMode, setSupportChatMode] = useState(false);
  const [supportChatInput, setSupportChatInput] = useState('');
  const [supportChatLoading, setSupportChatLoading] = useState(false);
  const [supportHistoryLoading, setSupportHistoryLoading] = useState(false);
  const [supportChatMessages, setSupportChatMessages] = useState([]);
  const [onboardingVisible, setOnboardingVisible] = useState(false);
  const [onboardingIndex, setOnboardingIndex] = useState(0);
  const [onboardingTargets, setOnboardingTargets] = useState({});
  const [biometricEnrolled, setBiometricEnrolled] = useState(false);
  const [subscriptionStatus, setSubscriptionStatus] = useState(null);
  const [accessRole, setAccessRole] = useState('admin');
  const [accountOwner, setAccountOwner] = useState(null);
  const [isAccountOwner, setIsAccountOwner] = useState(true);
  const [prevTab, setPrevTab] = useState(null);
  const [lastNotifId, setLastNotifId] = useState(null);
  const [reminderSyncVersion, setReminderSyncVersion] = useState(0);
  const [pendingReminderPrompt, setPendingReminderPrompt] = useState(null);
  const [remotePushReady, setRemotePushReady] = useState(false);
  const contentScrollRef = React.useRef(null);
  const supportChatScrollRef = React.useRef(null);
  const onboardingTargetRefs = React.useRef({});
  const onboardingZoom = React.useRef(new Animated.Value(0)).current;
  const handledNotificationResponses = React.useRef(new Set());
  const premiumActive =
    subscriptionStatus?.status === 'active' &&
    ['trial_premium', 'premium_monthly', 'premium_yearly'].includes(subscriptionStatus?.plan);
  const subscriptionActive = subscriptionStatus?.status === 'active';
  const readOnly = !subscriptionActive || accessRole === 'read';
  const pageHeaderCopy = user ? getPageHeaderCopy(activeTab, t) : null;
  const onboardingSteps = React.useMemo(
    () => [
      {
        tab: 'dashboard',
        targetKey: 'tab_dashboard',
        panel: 'top',
        title: t('Start on Dashboard'),
        body: t('See net worth, assets, and liabilities together.\nUse this page first for a quick financial check.')
      },
      {
        tab: 'assets',
        targetKey: 'tab_assets',
        panel: 'top',
        title: t('Track your Assets'),
        body: t('Add investments, deposits, property, and cash here.\nKeep values updated so your totals stay accurate.')
      },
      {
        tab: 'loans',
        targetKey: 'tab_loans',
        panel: 'top',
        title: t('Track your Liabilities'),
        body: t('Record loans, cards, and dues in one place.\nThis keeps your net worth realistic and current.')
      },
      {
        tab: 'settings',
        targetKey: 'tab_settings',
        panel: 'top',
        title: t('Set yearly Targets'),
        body: t('Add yearly goals for the categories that matter.\nThe dashboard will show how close you are to target.')
      },
      {
        tab: 'reminders',
        targetKey: 'tab_reminders',
        panel: 'top',
        title: t('Use smart Reminders'),
        body: t('Track bills, renewals, and follow-ups here.\nStay ahead of due dates from one screen.')
      },
      {
        tab: 'dashboard',
        targetKey: 'ai_button',
        panel: 'middle',
        blurBackground: true,
        title: t('Use AI Insights'),
        body: t('Get a quick summary of your portfolio here.\nUse it when you want the main takeaways fast.')
      },
      {
        tab: 'dashboard',
        targetKey: 'account_chip',
        panel: 'top',
        blurBackground: true,
        title: t('Manage Account'),
        body: t('Open Account to manage biometrics, privacy, language, theme, and subscription.\nYou can review family access, support options, and security settings here.\nUse this area whenever you need control changes instead of portfolio updates.')
      }
    ],
    [t]
  );
  const supportFaqs = React.useMemo(() => FAQ_ITEMS.map((item) => ({ ...item })), []);

  const setOnboardingTargetRef = (key, node) => {
    if (!key) return;
    if (!node) {
      delete onboardingTargetRefs.current[key];
      return;
    }
    onboardingTargetRefs.current[key] = node;
  };

  const measureOnboardingTarget = React.useCallback((key) => {
    if (!key) return;
    const node = onboardingTargetRefs.current[key];
    if (!node || typeof node.measureInWindow !== 'function') return;
    requestAnimationFrame(() => {
      node.measureInWindow((x, y, width, height) => {
        if (!(width > 0 && height > 0)) return;
        const next = {
          x: Math.max(0, Number(x) || 0),
          y: Math.max(0, Number(y) || 0),
          width: Number(width) || 0,
          height: Number(height) || 0
        };
        setOnboardingTargets((prev) => {
          const current = prev[key];
          if (
            current &&
            Math.abs(current.x - next.x) < 1 &&
            Math.abs(current.y - next.y) < 1 &&
            Math.abs(current.width - next.width) < 1 &&
            Math.abs(current.height - next.height) < 1
          ) {
            return prev;
          }
          return { ...prev, [key]: next };
        });
      });
    });
  }, []);

  const openAiInsights = async () => {
    setAiVisible(true);
    setAiError('');
    setAiPayload(null);

    if (!user) return;
    if (!premiumActive) return;
    try {
      setAiLoading(true);
      const data = await api.getAiInsights();
      setAiPayload(data || null);
    } catch (e) {
      setAiError(String(e?.message || e));
    } finally {
      setAiLoading(false);
    }
  };

  const openSupport = React.useCallback(() => {
    setAiVisible(false);
    setSupportVisible(true);
    setSupportChatMode(false);
  }, []);

  const closeSupport = React.useCallback(() => {
    setSupportVisible(false);
    setSupportChatMode(false);
    setSupportChatInput('');
    setSupportChatLoading(false);
    setSupportHistoryLoading(false);
  }, []);

  const openSupportChat = React.useCallback(async () => {
    setSupportChatMode(true);
    if (!user) {
      setSupportChatMessages((prev) =>
        prev.length
          ? prev
          : [
              {
                role: 'assistant',
                text: t('Hi! I am your support assistant. Ask me about OTP login, biometric login, reminders, family access, subscription, or account setup.')
              }
            ]
      );
      return;
    }
    setSupportHistoryLoading(true);
    try {
      const data = await api.getSupportChatHistory(800);
      const items = Array.isArray(data?.items) ? data.items : [];
      const normalized = items
        .map((item) => ({
          role: item?.role === 'assistant' ? 'assistant' : 'user',
          text: String(item?.text || '').trim()
        }))
        .filter((item) => item.text);
      if (normalized.length) {
        setSupportChatMessages(normalized);
      } else {
        setSupportChatMessages([
          {
            role: 'assistant',
            text: t('Hi! I am your support assistant. Ask me about OTP login, biometric login, reminders, family access, subscription, or account setup.')
          }
        ]);
      }
    } catch (_e) {
      setSupportChatMessages((prev) =>
        prev.length
          ? prev
          : [
              {
                role: 'assistant',
                text: t('Hi! I am your support assistant. Ask me about OTP login, biometric login, reminders, family access, subscription, or account setup.')
              }
            ]
      );
    } finally {
      setSupportHistoryLoading(false);
    }
  }, [t, user]);

  const sendSupportMessage = React.useCallback(async () => {
    const message = String(supportChatInput || '').trim();
    if (!message || supportChatLoading) return;
    const historyForApi = supportChatMessages
      .slice(-8)
      .map((item) => ({
        role: item.role === 'assistant' ? 'assistant' : 'user',
        text: String(item.text || '')
      }));
    const nextHistory = [...supportChatMessages, { role: 'user', text: message }];
    setSupportChatMessages(nextHistory);
    setSupportChatInput('');
    setSupportChatLoading(true);
    try {
      const result = await api.chatSupportAgent({
        message,
        history: historyForApi
      });
      const reply = String(result?.reply || '').trim() || t('Support is currently unavailable. Please try again shortly.');
      setSupportChatMessages((prev) => [...prev, { role: 'assistant', text: reply }]);
    } catch (e) {
      setSupportChatMessages((prev) => [
        ...prev,
        { role: 'assistant', text: t('Could not connect to support right now. Please check your network and try again.') }
      ]);
    } finally {
      setSupportChatLoading(false);
    }
  }, [supportChatInput, supportChatLoading, supportChatMessages, t]);

  const reminderCacheKey = React.useMemo(() => {
    const ownerId = accountOwner?.id || user?.id || 'guest';
    return `${REMINDER_NOTIFICATION_CACHE_KEY}:${ownerId}`;
  }, [accountOwner?.id, user?.id]);

  const triggerReminderSync = React.useCallback(() => {
    setReminderSyncVersion((prev) => prev + 1);
  }, []);

  const loadReminderNotificationIds = React.useCallback(async () => {
    try {
      const raw = await SecureStore.getItemAsync(reminderCacheKey);
      if (!raw) return [];
      const parsed = JSON.parse(raw);
      return Array.isArray(parsed) ? parsed.filter((id) => typeof id === 'string' && id) : [];
    } catch (_e) {
      return [];
    }
  }, [reminderCacheKey]);

  const saveReminderNotificationIds = React.useCallback(
    async (ids) => {
      await SecureStore.setItemAsync(reminderCacheKey, JSON.stringify(Array.isArray(ids) ? ids : [])).catch(() => {});
    },
    [reminderCacheKey]
  );

  const ensureNotificationPermission = React.useCallback(async () => {
    const current = await Notifications.getPermissionsAsync().catch(() => null);
    if (current?.granted) return true;
    const asked = await Notifications.requestPermissionsAsync({
      ios: { allowAlert: true, allowSound: true, allowBadge: true }
    }).catch(() => null);
    return Boolean(asked?.granted);
  }, []);

  const registerRemotePushToken = React.useCallback(async () => {
    if (!user) {
      setRemotePushReady(false);
      return false;
    }
    const allowed = await ensureNotificationPermission();
    if (!allowed) {
      setRemotePushReady(false);
      return false;
    }

    const projectId =
      Constants?.expoConfig?.extra?.eas?.projectId ||
      Constants?.easConfig?.projectId ||
      undefined;
    const tokenResult = await (projectId
      ? Notifications.getExpoPushTokenAsync({ projectId })
      : Notifications.getExpoPushTokenAsync()).catch(() => null);
    const token = String(tokenResult?.data || '').trim();
    if (!token) {
      setRemotePushReady(false);
      return false;
    }

    await api.registerPushToken({ token, platform: Platform.OS }).catch(() => null);
    setRemotePushReady(true);
    return true;
  }, [ensureNotificationPermission, user]);

  const clearLocalReminderNotifications = React.useCallback(async () => {
    const existingIds = await loadReminderNotificationIds();
    if (existingIds.length) {
      await Promise.all(existingIds.map((id) => Notifications.cancelScheduledNotificationAsync(id).catch(() => {})));
    }
    await saveReminderNotificationIds([]);
  }, [loadReminderNotificationIds, saveReminderNotificationIds]);

  const syncReminderNotifications = React.useCallback(async () => {
    if (!user || !premiumActive || remotePushReady) return;
    const allowed = await ensureNotificationPermission();
    if (!allowed) return;

    const existingIds = await loadReminderNotificationIds();
    if (existingIds.length) {
      await Promise.all(existingIds.map((id) => Notifications.cancelScheduledNotificationAsync(id).catch(() => {})));
    }

    const rows = await api.getReminders().catch(() => []);
    const items = Array.isArray(rows)
      ? rows.filter((row) => String(row?.status || '').toLowerCase() !== 'completed')
      : [];

    const now = Date.now();
    const nextIds = [];

    for (const item of items) {
      const dueDate = parseDueDateAtNine(item?.due_date);
      if (!dueDate) continue;

      const reminderId = Number(item?.id || 0);
      if (!reminderId) continue;
      const description = String(item?.description || 'Reminder').trim() || 'Reminder';
      const daysBefore = Math.max(0, Number(item?.alert_days_before || 0));
      const preAlertDate = daysBefore > 0 ? addDays(dueDate, -daysBefore) : null;
      const payload = {
        type: REMINDER_NOTIFICATION_TYPE,
        reminderId,
        dueDate: String(item?.due_date || ''),
        description
      };

      if (preAlertDate && preAlertDate.getTime() > now) {
        const id = await Notifications.scheduleNotificationAsync({
          content: {
            title: t('Upcoming Reminder'),
            body: t('{name} due on {date}', { name: description, date: formatReminderDate(item?.due_date) }),
            sound: true,
            channelId: 'reminders',
            data: payload
          },
          trigger: preAlertDate
        }).catch(() => null);
        if (id) nextIds.push(id);
      }

      if (dueDate.getTime() > now) {
        const id = await Notifications.scheduleNotificationAsync({
          content: {
            title: t('Reminder Due Today'),
            body: description,
            sound: true,
            channelId: 'reminders',
            data: payload
          },
          trigger: dueDate
        }).catch(() => null);
        if (id) nextIds.push(id);
      }
    }

    await saveReminderNotificationIds(nextIds);
  }, [ensureNotificationPermission, loadReminderNotificationIds, premiumActive, remotePushReady, saveReminderNotificationIds, t, user]);

  const runReminderAction = React.useCallback(
    async (reminderId, action) => {
      if (!reminderId || !user) return;
      if (action === 'complete') {
        await api.updateReminderStatus(reminderId, 'Completed');
      } else if (action === 'snooze') {
        await api.snoozeReminder(reminderId, 1);
      }
      triggerReminderSync();
    },
    [triggerReminderSync, user]
  );

  const openReminderActionPopup = React.useCallback(
    (payload) => {
      if (!user) return;
      const reminderId = Number(payload?.reminderId || 0);
      if (!reminderId) return;
      const description = String(payload?.description || t('Reminder')).trim() || t('Reminder');
      setActiveTab('reminders');
      Alert.alert(t('Reminder'), description, [
        { text: t('Open Reminder'), style: 'cancel' },
        {
          text: t('Snooze 1 day'),
          onPress: () => {
            runReminderAction(reminderId, 'snooze').catch((e) => {
              Alert.alert(t('Reminder'), String(e?.message || e));
            });
          }
        },
        {
          text: t('Complete'),
          onPress: () => {
            runReminderAction(reminderId, 'complete').catch((e) => {
              Alert.alert(t('Reminder'), String(e?.message || e));
            });
          }
        }
      ]);
    },
    [runReminderAction, t, user]
  );

  const handleReminderNotificationTap = React.useCallback(
    (payload) => {
      const reminderId = Number(payload?.reminderId || 0);
      if (!reminderId) return;
      const normalized = {
        reminderId,
        description: String(payload?.description || ''),
        dueDate: String(payload?.dueDate || '')
      };
      if (!user) {
        setPendingReminderPrompt(normalized);
        return;
      }
      openReminderActionPopup(normalized);
    },
    [openReminderActionPopup, user]
  );

  const finishLaunchTransition = React.useCallback(() => {
    if (launchTransitionStartedRef.current) return;
    launchTransitionStartedRef.current = true;
    Animated.parallel([
      Animated.timing(launchOpacity, { toValue: 0, duration: 1200, useNativeDriver: true }),
      Animated.timing(appOpacity, { toValue: 1, duration: 1200, useNativeDriver: true })
    ]).start(() => setLaunchVisible(false));
  }, [appOpacity, launchOpacity]);

  useEffect(() => {
    const timer = setTimeout(() => {
      finishLaunchTransition();
    }, 7000);
    return () => clearTimeout(timer);
  }, [finishLaunchTransition]);

  useEffect(() => {
    if (Platform.OS !== 'android') return;
    Notifications.setNotificationChannelAsync('reminders', {
      name: 'Reminders',
      importance: Notifications.AndroidImportance.HIGH,
      vibrationPattern: [0, 300, 200, 300],
      lockscreenVisibility: Notifications.AndroidNotificationVisibility.PUBLIC
    }).catch(() => {});
  }, []);

  useEffect(() => {
    SecureStore.getItemAsync(BIOMETRIC_CREDENTIALS_KEY)
      .then((raw) => {
        if (raw) setBiometricEnrolled(true);
      })
      .catch(() => {});
  }, []);

  useEffect(() => {
    if (!onboardingVisible) return;
    const timers = [];
    const interaction = InteractionManager.runAfterInteractions(() => {
      [80, 220, 420].forEach((delay) => {
        const timer = setTimeout(() => {
          measureOnboardingTarget('content');
          measureOnboardingTarget('ai_button');
          measureOnboardingTarget('privacy_toggle');
          measureOnboardingTarget('account_chip');
          measureOnboardingTarget('tab_dashboard');
          measureOnboardingTarget('tab_assets');
          measureOnboardingTarget('tab_loans');
          measureOnboardingTarget('tab_settings');
          measureOnboardingTarget('tab_reminders');
        }, delay);
        timers.push(timer);
      });
    });
    return () => {
      interaction.cancel();
      timers.forEach((timer) => clearTimeout(timer));
    };
  }, [onboardingVisible, onboardingIndex, activeTab, measureOnboardingTarget]);

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
      const savedPin = String(settings?.privacy_pin || '');
      setPinSetupRequired(!savedPin);
      setPreferredCurrency(String(settings?.preferred_currency || 'INR'));
      const lang = String(settings?.language || 'en').toLowerCase();
      setLanguage(lang === 'hi' ? 'hi' : 'en');
      if (settings?.ui_theme && THEMES[settings.ui_theme]) {
        setThemeKey(settings.ui_theme);
      }
      const biometric = String(settings?.biometric_login_enabled || '').toLowerCase();
      setBiometricEnrolled(biometric === '1' || biometric === 'true' || biometric === 'yes');
      refreshFxRates();
    } catch (_e) {
      setPinSetupRequired(Boolean(user));
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

  useEffect(() => {
    let cancelled = false;
    const bootstrapSession = async () => {
      try {
        const savedToken = String((await SecureStore.getItemAsync(AUTH_SESSION_TOKEN_KEY).catch(() => null)) || '').trim();
        if (!savedToken) {
          setAuthToken(null);
          return;
        }
        setAuthToken(savedToken);
        const profile = await api.me();
        if (cancelled) return;
        setUser(profile);
        setAuthError('');
        setActiveTab('dashboard');
        await Promise.allSettled([
          refreshPrivacyConfig(),
          refreshSubscription(),
          refreshAccessContext(),
          api.postSecurityContext().catch(() => {})
        ]);
      } catch (_e) {
        setAuthToken(null);
        if (!cancelled) {
          setUser(null);
          setAuthError('');
        }
        await SecureStore.deleteItemAsync(AUTH_SESSION_TOKEN_KEY).catch(() => {});
      } finally {
        if (!cancelled) setSessionRestoring(false);
      }
    };
    bootstrapSession().catch(() => {
      if (!cancelled) setSessionRestoring(false);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  const saveBiometricSession = async (token, profile) => {
    const sessionToken = String(token || '').trim();
    const mobile = String(profile?.mobile || '').trim();
    if (!sessionToken || !mobile) {
      throw new Error(t('Complete one OTP login before enrolling biometric login.'));
    }
    const savedRaw = await SecureStore.getItemAsync(BIOMETRIC_CREDENTIALS_KEY).catch(() => null);
    let existingSessionStartedAt = '';
    if (savedRaw) {
      try {
        const saved = JSON.parse(savedRaw);
        existingSessionStartedAt = String(saved?.session_started_at || '').trim();
      } catch (_e) {
        existingSessionStartedAt = '';
      }
    }
    const nextSessionStartedAt = new Date().toISOString();
    await SecureStore.setItemAsync(
      BIOMETRIC_CREDENTIALS_KEY,
      JSON.stringify({
        token: sessionToken,
        mobile,
        full_name: String(profile?.full_name || '').trim(),
        enrolled_at: existingSessionStartedAt || nextSessionStartedAt,
        session_started_at: nextSessionStartedAt
      })
    );
    setBiometricEnrolled(true);
  };

  const handleAuthSuccess = async (payload, options = {}) => {
    setAuthToken(payload.token);
    await SecureStore.setItemAsync(AUTH_SESSION_TOKEN_KEY, String(payload?.token || '')).catch(() => {});
    setUser(payload.user);
    setAuthError('');
    setActiveTab('dashboard');
    setPinSetupVisible(false);
    if (biometricEnrolled && options.refreshBiometric !== false) {
      await saveBiometricSession(payload.token, payload.user).catch(() => {});
    }
    refreshPrivacyConfig();
    refreshSubscription();
    refreshAccessContext();
    api.postSecurityContext().catch(() => {});
    InteractionManager.runAfterInteractions(() => {
      setTimeout(() => {
        openOnboardingAfterLogin().catch(() => {});
      }, 180);
    });
  };

  const handleRegister = async (payload) => {
    try {
      setAuthLoading(true);
      setAuthError('');
      const result = canUseNativePhoneAuth()
        ? await (async () => {
            const verified = await completeNativePhoneOtp(payload?.otp);
            return api.register({
              ...payload,
              firebase_id_token: verified.firebase_id_token
            });
          })()
        : await api.register(payload);
      await handleAuthSuccess(result);
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
      if (canUseNativePhoneAuth()) {
        return await startNativePhoneOtp(payload?.mobile);
      }
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
      const result = canUseNativePhoneAuth()
        ? await (async () => {
            const verified = await completeNativePhoneOtp(payload?.otp);
            return api.verifyLoginOtp({
              mobile: payload?.mobile,
              firebase_id_token: verified.firebase_id_token
            });
          })()
        : await api.verifyLoginOtp(payload);
      await handleAuthSuccess(result);
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
    await SecureStore.deleteItemAsync(AUTH_SESSION_TOKEN_KEY).catch(() => {});
    setUser(null);
    setActiveTab('dashboard');
    setPinSetupRequired(false);
    setPinSetupVisible(false);
    setPinSetupInput('');
    setPinSetupError('');
    setOnboardingVisible(false);
    setOnboardingIndex(0);
    setPendingReminderPrompt(null);
    setRemotePushReady(false);
    setFxRates({ INR: 1 });
    setSubscriptionStatus(null);
    setAccessRole('admin');
    setAccountOwner(null);
    setIsAccountOwner(true);
    clearNativePhoneOtp();
  };

  const ensureBiometricReady = async () => {
    const hasHardware = await LocalAuthentication.hasHardwareAsync();
    if (!hasHardware) throw new Error(t('Biometric hardware not available on this device.'));
    const enrolled = await LocalAuthentication.isEnrolledAsync();
    if (!enrolled) throw new Error(t('No biometric profile is enrolled on this device.'));
  };

  const handleEnrollBiometric = async () => {
    await ensureBiometricReady();
    const auth = await LocalAuthentication.authenticateAsync({
      promptMessage: t('Confirm biometric enrollment'),
      fallbackLabel: t('Use device passcode')
    });
    if (!auth.success) throw new Error(t('Biometric verification failed.'));
    await saveBiometricSession(getAuthToken(), user);
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
    if (!raw) throw new Error(t('Biometric login is not enrolled on this device yet.'));
    let creds = null;
    try {
      creds = JSON.parse(raw);
    } catch (_e) {
      throw new Error(t('Biometric login is not enrolled on this device yet.'));
    }
    const sessionStartedAt = String(creds?.session_started_at || creds?.enrolled_at || '').trim();
    const sessionStartedAtMs = Date.parse(sessionStartedAt);
    if (sessionStartedAtMs && Date.now() - sessionStartedAtMs > BIOMETRIC_SESSION_MAX_AGE_MS) {
      setAuthToken(null);
      await SecureStore.deleteItemAsync(AUTH_SESSION_TOKEN_KEY).catch(() => {});
      throw new Error(t('Biometric login needs one OTP refresh after 3 days. Login with OTP once to continue.'));
    }
    const auth = await LocalAuthentication.authenticateAsync({
      promptMessage: t('Login with biometrics'),
      fallbackLabel: t('Use device passcode')
    });
    if (!auth.success) throw new Error(t('Biometric login canceled or failed.'));
    const storedToken = String(creds?.token || '').trim();
    if (!storedToken) {
      throw new Error(t('Biometric session is not available on this device.'));
    }
    setAuthToken(storedToken);
    try {
      const profile = await api.me();
      await handleAuthSuccess({ token: storedToken, user: profile }, { refreshBiometric: false });
    } catch (e) {
      setAuthToken(null);
      await SecureStore.deleteItemAsync(AUTH_SESSION_TOKEN_KEY).catch(() => {});
      if (Number(e?.status || 0) === 401) {
        throw new Error(t('Biometric session is no longer valid. Login with OTP once to refresh it.'));
      }
      throw new Error(t('Biometric login could not be completed right now. Try again.'));
    }
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

  useEffect(() => {
    if (!user) return undefined;
    api.postSecurityContext().catch(() => {});
    const timer = setInterval(() => {
      api.postSecurityContext().catch(() => {});
    }, 10 * 60_000);
    return () => clearInterval(timer);
  }, [user]);

  useEffect(() => {
    if (!user) {
      setRemotePushReady(false);
      return;
    }
    registerRemotePushToken().catch(() => {
      setRemotePushReady(false);
    });
  }, [registerRemotePushToken, user]);

  useEffect(() => {
    if (!remotePushReady) return;
    clearLocalReminderNotifications().catch(() => {});
  }, [clearLocalReminderNotifications, remotePushReady]);

  useEffect(() => {
    if (!user) return undefined;
    let cancelled = false;
    const safeParsePayload = (raw) => {
      if (!raw) return {};
      if (typeof raw === 'object') return raw;
      try {
        return JSON.parse(String(raw));
      } catch {
        return {};
      }
    };
    const checkNotifications = async () => {
      try {
        const payload = await api.getNotifications({ unread: true, limit: 5 });
        const items = Array.isArray(payload?.items) ? payload.items : [];
        if (!items.length) return;
        const latestId = Number(items[0]?.id || 0);
        if (!latestId || latestId === lastNotifId || cancelled) return;
        setLastNotifId(latestId);
        const latest = items[0];
        if (String(latest?.type || '') === REMINDER_NOTIFICATION_TYPE) {
          const parsed = safeParsePayload(latest?.payload);
          handleReminderNotificationTap({
            reminderId: Number(parsed?.reminderId || 0),
            description: String(parsed?.description || latest?.body || ''),
            dueDate: String(parsed?.dueDate || '')
          });
        } else {
          Alert.alert(String(latest?.title || 'Notification'), String(latest?.body || ''));
        }
        await api.markAllNotificationsRead().catch(() => {});
      } catch (_e) {
        // Ignore notification polling issues.
      }
    };
    checkNotifications().catch(() => {});
    const timer = setInterval(() => {
      checkNotifications().catch(() => {});
    }, 25_000);
    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, [user, lastNotifId, handleReminderNotificationTap]);

  useEffect(() => {
    const onResponse = (response) => {
      const requestId = String(response?.notification?.request?.identifier || '');
      if (requestId) {
        if (handledNotificationResponses.current.has(requestId)) return;
        handledNotificationResponses.current.add(requestId);
      }
      const data = response?.notification?.request?.content?.data || {};
      if (String(data?.type || '') !== REMINDER_NOTIFICATION_TYPE) return;
      handleReminderNotificationTap({
        reminderId: Number(data?.reminderId || 0),
        description: String(data?.description || ''),
        dueDate: String(data?.dueDate || '')
      });
    };

    const responseSub = Notifications.addNotificationResponseReceivedListener(onResponse);
    Notifications.getLastNotificationResponseAsync()
      .then((response) => {
        if (response) onResponse(response);
      })
      .catch(() => {});

    return () => {
      responseSub.remove();
    };
  }, [handleReminderNotificationTap]);

  useEffect(() => {
    if (!user || !pendingReminderPrompt) return;
    openReminderActionPopup(pendingReminderPrompt);
    setPendingReminderPrompt(null);
  }, [openReminderActionPopup, pendingReminderPrompt, user]);

  useEffect(() => {
    if (!user || !premiumActive) return;
    syncReminderNotifications().catch(() => {});
  }, [premiumActive, reminderSyncVersion, syncReminderNotifications, user]);

  const togglePrivacy = () => {
    setHideSensitive((prev) => !prev);
  };

  const handleTabSelect = (key) => {
    if (PREMIUM_TAB_KEYS.has(key) && !premiumActive) {
      setPrevTab(activeTab);
      setActiveTab('subscription');
      return;
    }
    setActiveTab(key);
  };

  useEffect(() => {
    if (!onboardingVisible || !user) return;
    const step = onboardingSteps[onboardingIndex];
    if (!step?.tab) return;
    if (step.tab !== activeTab) {
      setActiveTab(step.tab);
    }
  }, [onboardingVisible, onboardingIndex, onboardingSteps, activeTab, user]);

  useEffect(() => {
    const step = onboardingSteps[onboardingIndex];
    if (!onboardingVisible || !step?.targetKey) {
      onboardingZoom.stopAnimation();
      onboardingZoom.setValue(0);
      return undefined;
    }
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(onboardingZoom, { toValue: 1, duration: 840, useNativeDriver: true }),
        Animated.timing(onboardingZoom, { toValue: 0, duration: 840, useNativeDriver: true })
      ])
    );
    loop.start();
    return () => loop.stop();
  }, [onboardingVisible, onboardingIndex, onboardingSteps, onboardingZoom]);

  const getOnboardingZoomStyle = React.useCallback(
    (targetKey) => {
      const activeKey = onboardingSteps[onboardingIndex]?.targetKey;
      if (!onboardingVisible || !targetKey || activeKey !== targetKey) return null;
      return {
        transform: [
          {
            scale: onboardingZoom.interpolate({
              inputRange: [0, 0.5, 1],
              outputRange: [1, 1.14, 1]
            })
          }
        ],
        backgroundColor: theme.accentSoft,
        borderRadius: 18,
        borderColor: theme.accent,
        shadowColor: theme.accent,
        shadowOpacity: 0.2,
        shadowRadius: 12,
        shadowOffset: { width: 0, height: 4 },
        elevation: 8
      };
    },
    [onboardingVisible, onboardingSteps, onboardingIndex, onboardingZoom, theme.accentSoft, theme.accent]
  );

  useEffect(() => {
    if (!onboardingVisible || !user || activeTab === 'subscription') return;
    const step = onboardingSteps[onboardingIndex];
    const scroller = contentScrollRef.current;
    if (!step || !scroller || typeof scroller.scrollTo !== 'function') return;

    const timer = setTimeout(() => {
      scroller.scrollTo({ y: 0, animated: true });
    }, 80);
    return () => clearTimeout(timer);
  }, [onboardingVisible, onboardingIndex, onboardingSteps, activeTab, user, screenHeight, measureOnboardingTarget]);

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

  const closeOnboarding = () => {
    setOnboardingVisible(false);
    setOnboardingIndex(0);
    if (user && pinSetupRequired) {
      requestAnimationFrame(() => {
        setPinSetupVisible(true);
      });
    }
  };

  const openOnboarding = () => {
    setAiVisible(false);
    setOnboardingIndex(0);
    setOnboardingTargets({});
    setPinSetupVisible(false);
    setOnboardingVisible(true);
  };

  const skipOnboarding = async () => {
    await SecureStore.setItemAsync(ONBOARDING_SKIPPED_KEY, '1').catch(() => {});
    closeOnboarding();
  };

  const openOnboardingAfterLogin = async () => {
    const skipped = await SecureStore.getItemAsync(ONBOARDING_SKIPPED_KEY).catch(() => null);
    if (skipped === '1') return;
    openOnboarding();
  };

  const handleSecurityPinInput = (text) => {
    const digits = String(text || '').replace(/\D/g, '').slice(0, 4);
    setPinSetupInput(digits);
  };

  const saveSecurityPin = async () => {
    if (!/^\d{4}$/.test(pinSetupInput)) {
      setPinSetupError(t('PIN must be exactly 4 digits.'));
      return;
    }
    await api.upsertSettings({ privacy_pin: pinSetupInput, privacy_pin_enabled: '1' });
    setPinSetupRequired(false);
    setPinSetupVisible(false);
    setPinSetupInput('');
    setPinSetupError('');
  };
  const roleLabel = String(accessRole || 'admin').toLowerCase() === 'admin' ? t('Admin') : t('Family');
  const requestMainScroll = React.useCallback((targetY = 0) => {
    const scroller = contentScrollRef.current;
    if (!scroller || typeof scroller.scrollTo !== 'function') return;
    const rawY = Number(targetY);
    const y = Number.isFinite(rawY) ? Math.max(0, rawY) : 0;
    scroller.scrollTo({ y, animated: true });
  }, []);

  useEffect(() => {
    if (!user || onboardingVisible || activeTab === 'subscription') return;
    const timer = setTimeout(() => {
      requestMainScroll(0);
    }, 40);
    return () => clearTimeout(timer);
  }, [activeTab, onboardingVisible, requestMainScroll, user]);

  useEffect(() => {
    if (!user) return;
    if (onboardingVisible) {
      if (pinSetupVisible) setPinSetupVisible(false);
      return;
    }
    setPinSetupVisible(Boolean(pinSetupRequired));
  }, [user, onboardingVisible, pinSetupRequired]);

  useEffect(() => {
    if (!supportVisible || !supportChatMode) return;
    const timer = setTimeout(() => {
      supportChatScrollRef.current?.scrollToEnd?.({ animated: true });
    }, 40);
    return () => clearTimeout(timer);
  }, [supportChatMessages, supportVisible, supportChatMode]);

  useEffect(() => {
    setSupportChatMessages([]);
    setSupportChatMode(false);
    setSupportChatInput('');
    setSupportHistoryLoading(false);
    setSupportChatLoading(false);
  }, [user?.id]);

  const mainContent = sessionRestoring ? (
    <SafeAreaView style={[styles.root, { backgroundColor: theme.background }]}>
      <StatusBar barStyle={isDarkTheme ? 'light-content' : 'dark-content'} />
      <View style={styles.authRestoreState}>
        <View style={[styles.authLogoBadge, styles.authHeroLogoBadge, { backgroundColor: '#0f172a', borderColor: theme.border }]}>
          <Image source={BRAND_ICON} style={styles.headerLogoLarge} resizeMode="cover" />
        </View>
        <Text style={[styles.title, styles.authTitle, styles.authHeaderCenter]}>{t('Restoring your secure session...')}</Text>
      </View>
    </SafeAreaView>
  ) : !user ? (
    <SafeAreaView style={[styles.root, { backgroundColor: theme.background }]}>
      <StatusBar barStyle={isDarkTheme ? 'light-content' : 'dark-content'} />
      <KeyboardAvoidingView
        style={styles.body}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        keyboardVerticalOffset={Platform.OS === 'ios' ? 8 : 0}
      >
        <ScrollView
          style={styles.body}
          contentContainerStyle={styles.authPageContent}
          keyboardShouldPersistTaps="handled"
          keyboardDismissMode={Platform.OS === 'ios' ? 'interactive' : 'on-drag'}
          contentInsetAdjustmentBehavior="automatic"
          showsVerticalScrollIndicator
          alwaysBounceVertical
        >
          <View style={styles.authHero}>
            <View style={[styles.authHeroPanel, { backgroundColor: theme.accent }]}>
              <View style={styles.authHeroBlend}>
                <View style={[styles.authHeroGlow, styles.authHeroGlowLeft, { backgroundColor: '#10b981' }]} />
                <View style={[styles.authHeroGlow, styles.authHeroGlowRight, { backgroundColor: '#2563eb' }]} />
              </View>
              <View style={styles.authHeroContent}>
                <View style={[styles.authLogoBadge, styles.authHeroLogoBadge, { backgroundColor: '#0f172a', borderColor: 'rgba(255,255,255,0.24)' }]}>
                  <Image source={BRAND_ICON} style={styles.headerLogoLarge} resizeMode="cover" />
                </View>
                <Text style={styles.authHeroTitle}>{t('Take Control of Your Wealth')}</Text>
                <Text style={styles.authHeroLead}>
                  {t('Your wealth data stays private, encrypted, protected, and visible only to you.')}
                </Text>
              </View>
            </View>
          </View>
          <View style={styles.authFormSection}>
            <AuthScreen
              onRegister={handleRegister}
              onLoginWithBiometric={handleBiometricLogin}
              onRequestOtp={handleOtpSend}
              onVerifyOtp={handleOtpVerify}
              biometricReady={biometricEnrolled}
              loading={authLoading}
              externalMessage={authError}
            />
          </View>
          <View style={styles.authAssuranceSection}>
            <View style={[styles.authAssuranceCard, styles.authAssuranceCardGlossy, { backgroundColor: '#eef5ff', borderColor: '#7db2ff' }]}>
              <View style={[styles.authAssuranceIconChip, styles.authAssuranceIconChipGlossy, { backgroundColor: '#2563eb' }]}>
                <LockIcon stroke="#ffffff" />
              </View>
              <View style={styles.authAssuranceCopy}>
                <Text style={[styles.authAssuranceTitle, styles.authAssuranceTitleLeft, { color: theme.text }]}>{t('Encrypted & Private')}</Text>
                <Text style={[styles.authAssuranceBody, styles.authAssuranceBodyLeft, { color: theme.muted }]}>
                  {t('Your sensitive wealth data is encrypted so it stays protected and unreadable to others.')}
                </Text>
              </View>
            </View>
            <View style={[styles.authAssuranceCard, styles.authAssuranceCardGlossy, { backgroundColor: '#edfdf5', borderColor: '#62d99d' }]}>
              <View style={[styles.authAssuranceIconChip, styles.authAssuranceIconChipGlossy, { backgroundColor: '#059669' }]}>
                <FingerprintIcon stroke="#ffffff" />
              </View>
              <View style={styles.authAssuranceCopy}>
                <Text style={[styles.authAssuranceTitle, styles.authAssuranceTitleLeft, { color: theme.text }]}>{t('Only You Can Unlock It')}</Text>
                <Text style={[styles.authAssuranceBody, styles.authAssuranceBodyLeft, { color: theme.muted }]}>
                  {t('Biometric login, OTP verification, and your Privacy PIN help ensure only you can access sensitive information.')}
                </Text>
              </View>
            </View>
            <View style={[styles.authAssuranceCard, styles.authAssuranceCardGlossy, { backgroundColor: '#fff9e8', borderColor: '#f5c84c' }]}>
              <View style={[styles.authAssuranceIconChip, styles.authAssuranceIconChipGlossy, { backgroundColor: '#d97706' }]}>
                <EyeToggleIcon stroke="#ffffff" closed />
              </View>
              <View style={styles.authAssuranceCopy}>
                <Text style={[styles.authAssuranceTitle, styles.authAssuranceTitleLeft, { color: theme.text }]}>{t("We Can’t Simply Peek Inside")}</Text>
                <Text style={[styles.authAssuranceBody, styles.authAssuranceBodyLeft, { color: theme.muted }]}>
                  {t('Your private details are designed to stay under your control, not visible to staff, developers, or unauthorized viewers.')}
                </Text>
              </View>
            </View>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  ) : (
    <SafeAreaView style={[styles.root, { backgroundColor: theme.background }]}>
      <StatusBar barStyle={isDarkTheme ? 'light-content' : 'dark-content'} />
      {activeTab === 'dashboard' ? (
        <View style={styles.header}>
          <View style={[styles.headerUtilityCard, { backgroundColor: theme.accent, borderColor: theme.accent }]}>
            <View style={styles.headerMainRow}>
              <AnimatedPressable
                ref={(node) => setOnboardingTargetRef('account_chip', node)}
                collapsable={false}
                onLayout={() => measureOnboardingTarget('account_chip')}
                style={[
                  styles.accountCapsule,
                  { backgroundColor: theme.accentSoft, borderColor: theme.border },
                  getOnboardingZoomStyle('account_chip')
                ]}
                onPress={() => handleTabSelect('account')}
                hitSlop={8}
              >
                <View style={[styles.accountAvatar, { backgroundColor: theme.accent, borderColor: theme.accent }]}>
                  <Text style={styles.accountAvatarText}>{toInitialsFromName(user.full_name)}</Text>
                </View>
                <View style={styles.accountMeta}>
                  <Text style={[styles.accountCapsuleText, { color: theme.text }]} numberOfLines={1}>
                    {user.full_name || t('Account')}
                  </Text>
                  <Text style={[styles.accountRoleText, { color: theme.accent }]}>{roleLabel}</Text>
                </View>
                <Text style={[styles.accountChevron, { color: theme.accent }]}>{'\u203A'}</Text>
              </AnimatedPressable>
              <View style={[styles.headerLogoBadge, { backgroundColor: theme.background, borderColor: theme.border }]}>
                <Image source={BRAND_ICON} style={styles.headerLogoCompact} resizeMode="cover" />
              </View>
            </View>
            <View style={styles.headerActions}>
              <Pressable
                ref={(node) => setOnboardingTargetRef('privacy_toggle', node)}
                collapsable={false}
                onLayout={() => measureOnboardingTarget('privacy_toggle')}
                style={[styles.eyeToggleButton, { borderColor: theme.border, backgroundColor: theme.background }]}
                onPress={togglePrivacy}
                accessibilityRole="button"
                accessibilityLabel={hideSensitive ? 'Show values' : 'Hide values'}
              >
                <Text style={[styles.eyeToggleLabel, { color: theme.accent }]}>{t('Privacy')}</Text>
                <EyeToggleIcon stroke={theme.accent} closed={hideSensitive} />
              </Pressable>
              <AnimatedPressable
                ref={(node) => setOnboardingTargetRef('ai_button', node)}
                collapsable={false}
                onLayout={() => measureOnboardingTarget('ai_button')}
                style={[
                  styles.aiBtn,
                  { backgroundColor: theme.background, borderColor: theme.border },
                  getOnboardingZoomStyle('ai_button')
                ]}
                onPress={() => openAiInsights().catch(() => {})}
                hitSlop={8}
              >
                <View style={styles.aiBtnContent}>
                  <AiBrainIcon stroke={theme.accent} badgeFill={theme.accent} badgeText={theme.card} />
                  <Text style={[styles.aiBtnText, { color: theme.accent }]}>{t('AI Insights')}</Text>
                </View>
              </AnimatedPressable>
            </View>
          </View>
        </View>
      ) : pageHeaderCopy && activeTab !== 'subscription' ? (
        <View style={styles.header}>
          <View style={[styles.pageTitleBar, { backgroundColor: theme.accent }]}>
            <Text style={styles.pageTitleBarText}>{pageHeaderCopy.eyebrow}</Text>
          </View>
        </View>
      ) : null}

      {activeTab === 'subscription' ? (
        <View
          style={styles.subscriptionBody}
          ref={(node) => setOnboardingTargetRef('content', node)}
          collapsable={false}
          onLayout={() => measureOnboardingTarget('content')}
        >
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
            onOpenOnboarding={openOnboarding}
            onRegisterOnboardingTarget={setOnboardingTargetRef}
            onMeasureOnboardingTarget={measureOnboardingTarget}
            onGetOnboardingZoomStyle={getOnboardingZoomStyle}
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
            onRemindersChanged={triggerReminderSync}
            onRequestScrollTo={requestMainScroll}
            onOpenSupport={openSupport}
          />
        </View>
      ) : (
        <KeyboardAvoidingView
          style={styles.body}
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
          keyboardVerticalOffset={Platform.OS === 'ios' ? 8 : 0}
        >
          <ScrollView
            ref={contentScrollRef}
            style={styles.body}
            contentContainerStyle={styles.bodyContent}
            keyboardShouldPersistTaps="handled"
            keyboardDismissMode={Platform.OS === 'ios' ? 'interactive' : 'on-drag'}
            contentInsetAdjustmentBehavior="automatic"
            showsVerticalScrollIndicator
            alwaysBounceVertical
          >
            {pageHeaderCopy && activeTab !== 'subscription' ? (
              <View style={[styles.pageIntroCard, { backgroundColor: theme.card, borderColor: theme.border }]}>
                <Text style={[styles.pageIntroEyebrow, { color: theme.accent }]}>{pageHeaderCopy.eyebrow}</Text>
                <Text style={[styles.pageIntroTitle, { color: theme.text }]}>{pageHeaderCopy.title}</Text>
                <Text style={[styles.pageIntroBody, { color: theme.muted }]}>{pageHeaderCopy.body}</Text>
              </View>
            ) : null}
            <View
              ref={(node) => setOnboardingTargetRef('content', node)}
              collapsable={false}
              onLayout={() => measureOnboardingTarget('content')}
            >
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
                onOpenOnboarding={openOnboarding}
                onRegisterOnboardingTarget={setOnboardingTargetRef}
                onMeasureOnboardingTarget={measureOnboardingTarget}
                onGetOnboardingZoomStyle={getOnboardingZoomStyle}
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
                onRemindersChanged={triggerReminderSync}
                onRequestScrollTo={requestMainScroll}
                onOpenSupport={openSupport}
              />
            </View>
          </ScrollView>
        </KeyboardAvoidingView>
      )}

      <Modal visible={pinSetupVisible} transparent animationType="fade">
        <View style={styles.modalBackdrop}>
          <View style={[styles.modalCard, { backgroundColor: theme.card, borderColor: theme.border }]}>
            <Text style={[styles.modalTitle, { color: theme.text }]}>{t('Set Security PIN')}</Text>
            <Text style={[styles.modalSub, { color: theme.muted }]}>
              {t('Set a 4-digit PIN to unlock full sensitive details like identifiers and contact numbers.')}
            </Text>
            <TextInput
              style={[styles.modalInput, { borderColor: theme.border, backgroundColor: theme.inputBg, color: theme.inputText }]}
              value={pinSetupInput}
              onChangeText={handleSecurityPinInput}
              keyboardType="number-pad"
              secureTextEntry
              maxLength={4}
            />
            {!!pinSetupError && <Text style={[styles.pinError, { color: theme.danger }]}>{pinSetupError}</Text>}
            <View style={styles.modalActions}>
              <Pressable
                style={[styles.modalBtn, styles.modalBtnPrimary, { backgroundColor: theme.accent }]}
                onPress={() => saveSecurityPin().catch((e) => setPinSetupError(String(e?.message || e)))}
              >
                <Text style={styles.modalBtnPrimaryText}>{t('Save PIN')}</Text>
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>

      {activeTab !== 'subscription' ? (
        <View style={[styles.bottomNav, { backgroundColor: theme.card, borderTopColor: theme.border }]}>
          {PRIMARY_TAB_KEYS.map((key) => {
            const tab = TABS.find((t) => t.key === key);
            const active = activeTab === key;
            const locked = PREMIUM_TAB_KEYS.has(key) && !premiumActive;
            const label = t(tab?.labelKey || key);
            const onboardingKey =
              key === 'dashboard'
                ? 'tab_dashboard'
                : key === 'assets'
                  ? 'tab_assets'
                  : key === 'loans'
                    ? 'tab_loans'
                    : key === 'settings'
                      ? 'tab_settings'
                      : key === 'reminders'
                        ? 'tab_reminders'
                    : null;
            return (
              <AnimatedPressable
                key={key}
                ref={onboardingKey ? (node) => setOnboardingTargetRef(onboardingKey, node) : undefined}
                collapsable={false}
                onLayout={onboardingKey ? () => measureOnboardingTarget(onboardingKey) : undefined}
                style={[
                  styles.navItem,
                  active && { backgroundColor: theme.accentSoft },
                  getOnboardingZoomStyle(onboardingKey)
                ]}
                onPress={() => handleTabSelect(key)}
              >
                <View style={styles.navTextWrap}>
                  <Text style={[styles.navIcon, { color: active ? theme.accent : theme.muted }]}>{TAB_ICONS[key] || '•'}</Text>
                  <Text style={[
                    styles.navText,
                    { color: theme.muted },
                    active && { color: theme.accent },
                    locked && { color: theme.warn }
                  ]}>
                    {locked ? <Text style={[styles.lockIcon, { color: theme.warn }]}>🔒 </Text> : null}
                    {label}
                  </Text>
                </View>
              </AnimatedPressable>
            );
          })}
        </View>
      ) : null}

    </SafeAreaView>
  );

  return (
    <SafeAreaProvider>
      <LanguageContext.Provider value={{ language, setLanguage, t }}>
        <ThemeContext.Provider value={{ theme, themeKey, setThemeKey }}>
          <View style={{ flex: 1 }}>
          <Animated.View style={{ flex: 1, opacity: appOpacity }}>{mainContent}</Animated.View>
          <Modal visible={aiVisible} transparent animationType="fade">
          <View style={styles.modalBackdrop}>
            <Pressable style={StyleSheet.absoluteFillObject} onPress={() => setAiVisible(false)} />
            <View
              style={[
                styles.aiModalCard,
                { backgroundColor: theme.card, borderColor: theme.border, maxHeight: Math.round(screenHeight * 0.84) }
              ]}
            >
              <ScrollView
                style={[styles.aiModalScroll, { maxHeight: Math.round(screenHeight * 0.7) }]}
                contentContainerStyle={styles.aiModalScrollContent}
                showsVerticalScrollIndicator
                nestedScrollEnabled
              >
                <Text style={[styles.modalTitle, { color: theme.text }]}>{t('AI Insights')}</Text>
                {!user ? (
                  <Text style={[styles.aiDisclaimer, { color: theme.muted }]}>
                    {t('Login to view AI-enabled portfolio insights and a brief news-aware context.')}
                  </Text>
                ) : null}

                {user && !premiumActive ? (
                  <Text style={[styles.aiDisclaimer, { color: theme.muted }]}>
                    {t('AI Insights is a premium feature. Upgrade to unlock a personal summary and a news-aware context.')}
                  </Text>
                ) : null}

                {user && premiumActive ? (
                  <Text style={[styles.aiDisclaimer, { color: theme.muted }]}>
                    {String(
                      aiPayload?.disclaimer ||
                        t(
                          'AI-generated content for awareness only. It can be incomplete, incorrect, or outdated. Please research further and consult your financial advisor before making decisions.'
                        )
                    )}
                  </Text>
                ) : null}

                {aiLoading ? <Text style={[styles.subtitle, { color: theme.muted }]}>{t('Loading...')}</Text> : null}
                {!!aiError ? <Text style={[styles.authError, { color: theme.danger }]}>{aiError}</Text> : null}

                {premiumActive ? (
                  <View style={styles.aiBullets}>
                    {(() => {
                      const personal = Array.isArray(aiPayload?.personal_bullets)
                        ? aiPayload.personal_bullets
                        : Array.isArray(aiPayload?.bullets)
                          ? aiPayload.bullets
                          : [];
                      const news = Array.isArray(aiPayload?.news_bullets)
                        ? aiPayload.news_bullets
                        : [];

                      return (
                        <>
                          {personal.length ? (
                            <>
                              <Text style={[styles.aiSectionTitle, { color: theme.text }]}>{t('Personal Summary')}</Text>
                              {personal.slice(0, 4).map((line, idx) => (
                                <Text key={`p-${idx}-${String(line).slice(0, 20)}`} style={[styles.aiBulletText, { color: theme.text }]}>
                                  • {String(line)}
                                </Text>
                              ))}
                            </>
                          ) : null}
                          {news.length ? (
                            <>
                              <Text style={[styles.aiSectionTitle, { color: theme.text, marginTop: 10 }]}>
                                {t('News & Market Context')}
                              </Text>
                              {news.slice(0, 5).map((line, idx) => (
                                <Text key={`n-${idx}-${String(line).slice(0, 20)}`} style={[styles.aiBulletText, { color: theme.text }]}>
                                  • {String(line)}
                                </Text>
                              ))}
                            </>
                          ) : null}
                        </>
                      );
                    })()}
                  </View>
                ) : null}

                {premiumActive && !!aiPayload?.as_of ? (
                  <Text style={[styles.aiAsOf, { color: theme.muted }]}>
                    {t('As of: {date}', { date: String(aiPayload.as_of).replace('T', ' ').slice(0, 19) })}
                  </Text>
                ) : null}

                <View style={styles.rowTight}>
                  {user && premiumActive ? (
                    <PillButton label={t('Refresh')} kind="ghost" onPress={() => openAiInsights().catch(() => {})} disabled={aiLoading} />
                  ) : null}
                  {user && !premiumActive ? (
                    <PillButton label={t('Upgrade')} kind="ghost" onPress={openSubscription} />
                  ) : null}
                  <PillButton label={t('Close')} kind="ghost" onPress={() => setAiVisible(false)} />
                </View>
              </ScrollView>
            </View>
          </View>
        </Modal>
          {supportVisible ? (
            <SafeAreaView style={[styles.supportOverlay, { backgroundColor: theme.background }]}>
              <View style={[styles.supportPageHeader, { borderBottomColor: theme.border, backgroundColor: theme.card }]}>
                <Pressable
                  style={[styles.supportPageBackBtn, { borderColor: theme.border, backgroundColor: theme.background }]}
                  onPress={closeSupport}
                >
                  <Text style={[styles.supportPageBackText, { color: theme.text }]}>← {t('Back')}</Text>
                </Pressable>
                <Text style={[styles.supportPageTitle, { color: theme.text }]}>
                  {supportChatMode ? t('Support AI Chat') : t('Support')}
                </Text>
                <View style={styles.supportPageSpacer} />
              </View>

              {!supportChatMode ? (
                <ScrollView
                  style={styles.body}
                  contentContainerStyle={styles.supportPageContent}
                  keyboardShouldPersistTaps="handled"
                  keyboardDismissMode={Platform.OS === 'ios' ? 'interactive' : 'on-drag'}
                  contentInsetAdjustmentBehavior="automatic"
                  showsVerticalScrollIndicator
                  alwaysBounceVertical
                >
                  <Text style={[styles.aiDisclaimer, { color: theme.muted }]}>{t('Please review these FAQs first.')}</Text>
                  {supportFaqs.map((item) => (
                    <View
                      key={item.q}
                      style={[styles.supportFaqCard, { borderColor: theme.border, backgroundColor: theme.card }]}
                    >
                      <Text style={[styles.supportFaqQuestion, { color: theme.text }]}>{t(item.q)}</Text>
                      <Text style={[styles.supportFaqAnswer, { color: theme.muted }]}>{t(item.a)}</Text>
                    </View>
                  ))}
                  <Pressable onPress={() => openSupportChat().catch(() => {})} hitSlop={8} style={styles.supportChatLinkWrap}>
                    <Text style={[styles.supportChatLink, { color: theme.accent }]}>
                      {t('Still need help? Chat with AI Support')}
                    </Text>
                  </Pressable>
                </ScrollView>
              ) : (
                <View style={styles.supportPageChatArea}>
                  <Text style={[styles.aiDisclaimer, { color: theme.muted }]}>
                    {t('Share your issue. I can help with OTP login, biometric login, subscription, privacy PIN, and common app setup steps.')}
                  </Text>
                  <ScrollView
                    ref={supportChatScrollRef}
                    style={[styles.supportChatScroll, { borderColor: theme.border, backgroundColor: theme.card }]}
                    contentContainerStyle={styles.supportChatScrollContent}
                    keyboardShouldPersistTaps="handled"
                    keyboardDismissMode={Platform.OS === 'ios' ? 'interactive' : 'on-drag'}
                    contentInsetAdjustmentBehavior="automatic"
                    showsVerticalScrollIndicator
                  >
                    {supportHistoryLoading ? (
                      <Text style={[styles.supportTyping, { color: theme.muted }]}>{t('Loading previous chats...')}</Text>
                    ) : null}
                    {supportChatMessages.map((item, idx) => (
                      <View
                        key={`${item.role}-${idx}`}
                        style={[
                          styles.supportBubble,
                          item.role === 'user'
                            ? { alignSelf: 'flex-end', backgroundColor: theme.accentSoft, borderColor: theme.accent }
                            : { alignSelf: 'flex-start', backgroundColor: theme.background, borderColor: theme.border }
                        ]}
                      >
                        <Text style={[styles.supportBubbleText, { color: theme.text }]}>{item.text}</Text>
                      </View>
                    ))}
                    {supportChatLoading ? (
                      <Text style={[styles.supportTyping, { color: theme.muted }]}>{t('Support is typing...')}</Text>
                    ) : null}
                  </ScrollView>
                  <View style={styles.supportChatInputRow}>
                    <TextInput
                      style={[
                        styles.supportChatInput,
                        { borderColor: theme.border, backgroundColor: theme.inputBg, color: theme.inputText }
                      ]}
                      placeholder={t('Describe your issue')}
                      placeholderTextColor={theme.muted}
                      value={supportChatInput}
                      onChangeText={setSupportChatInput}
                      multiline
                      maxLength={500}
                    />
                    <View style={styles.rowTight}>
                      <PillButton label={t('Back to FAQs')} kind="ghost" onPress={() => setSupportChatMode(false)} />
                      <PillButton
                        label={t('Send')}
                        kind="ghost"
                        onPress={() => sendSupportMessage().catch(() => {})}
                        disabled={!String(supportChatInput || '').trim() || supportChatLoading || supportHistoryLoading}
                      />
                    </View>
                  </View>
                </View>
              )}
            </SafeAreaView>
          ) : null}
          <OnboardingModal
            visible={onboardingVisible}
            steps={onboardingSteps}
            index={onboardingIndex}
            targets={onboardingTargets}
            onBack={() => setOnboardingIndex((prev) => Math.max(0, prev - 1))}
            onNext={() => {
              if (onboardingIndex >= onboardingSteps.length - 1) {
                closeOnboarding();
                return;
              }
              setOnboardingIndex((prev) => Math.min(onboardingSteps.length - 1, prev + 1));
            }}
            onSkip={() => skipOnboarding().catch(() => {})}
            t={t}
            theme={theme}
          />
          {launchVisible ? (
            <Animated.View style={[StyleSheet.absoluteFillObject, { opacity: launchOpacity }]}>
              <LaunchScreen dark={isDarkTheme} onDone={finishLaunchTransition} />
            </Animated.View>
          ) : null}
          </View>
        </ThemeContext.Provider>
      </LanguageContext.Provider>
    </SafeAreaProvider>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: '#f7f9fc'
  },
  supportOverlay: {
    ...StyleSheet.absoluteFillObject,
    zIndex: 1200,
    elevation: 1200
  },
  rootDark: {
    backgroundColor: '#12161c'
  },
  header: {
    paddingHorizontal: 16,
    paddingTop: 12,
    paddingBottom: 10
  },
  authHeaderTopRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 12
  },
  authLogoBadge: {
    width: 86,
    height: 86,
    borderRadius: 43,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
    alignSelf: 'center',
    marginBottom: 12
  },
  authHeaderCenter: {
    textAlign: 'center',
    alignSelf: 'center'
  },
  headerLogo: {
    width: 56,
    height: 56,
    borderRadius: 12
  },
  headerLogoLarge: {
    width: 84,
    height: 84,
    borderRadius: 20,
    alignSelf: 'center'
  },
  authSubtitle: {
    marginTop: 8,
    textAlign: 'center',
    fontSize: 14,
    lineHeight: 20,
    maxWidth: 280,
    alignSelf: 'center',
    fontWeight: '600'
  },
  authHero: {
    paddingHorizontal: 16,
    paddingTop: 10
  },
  authHeroPanel: {
    minHeight: 320,
    borderRadius: 30,
    overflow: 'hidden',
    position: 'relative',
    justifyContent: 'center'
  },
  authHeroBlend: {
    ...StyleSheet.absoluteFillObject
  },
  authHeroGlow: {
    position: 'absolute',
    borderRadius: 999,
    opacity: 0.36
  },
  authHeroGlowLeft: {
    width: 240,
    height: 240,
    left: -40,
    top: -25
  },
  authHeroGlowRight: {
    width: 300,
    height: 300,
    right: -90,
    top: -30
  },
  authHeroContent: {
    paddingHorizontal: 24,
    paddingVertical: 34,
    alignItems: 'center'
  },
  authHeroLogoBadge: {
    width: 108,
    height: 108,
    borderRadius: 54
  },
  authHeroTitle: {
    marginTop: 8,
    color: '#ffffff',
    textAlign: 'center',
    fontSize: 40,
    lineHeight: 44,
    fontWeight: '800',
    letterSpacing: -1.2
  },
  authHeroLead: {
    marginTop: 18,
    color: 'rgba(255,255,255,0.94)',
    textAlign: 'center',
    fontSize: 20,
    lineHeight: 29,
    fontWeight: '500',
    maxWidth: 320
  },
  authAssuranceSection: {
    paddingHorizontal: 22,
    paddingTop: 26,
    gap: 28
  },
  authFormSection: {
    marginTop: 30
  },
  authAssuranceCard: {
    borderWidth: 1,
    borderRadius: 24,
    paddingHorizontal: 18,
    paddingVertical: 20,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 16
  },
  authAssuranceCardGlossy: {
    shadowColor: '#0f172a',
    shadowOpacity: 0.1,
    shadowRadius: 14,
    shadowOffset: { width: 0, height: 8 },
    elevation: 3
  },
  authAssuranceCopy: {
    flex: 1
  },
  authAssuranceIconChip: {
    width: 58,
    height: 58,
    borderRadius: 29,
    alignItems: 'center',
    justifyContent: 'center'
  },
  authAssuranceIconChipGlossy: {
    shadowColor: '#0f172a',
    shadowOpacity: 0.16,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 5 },
    elevation: 3
  },
  authAssuranceTitle: {
    fontSize: 24,
    lineHeight: 30,
    fontWeight: '800'
  },
  authAssuranceTitleLeft: {
    textAlign: 'left',
    fontSize: 20,
    lineHeight: 26
  },
  authAssuranceBody: {
    marginTop: 10,
    fontSize: 17,
    lineHeight: 29,
    maxWidth: 330
  },
  authAssuranceBodyLeft: {
    textAlign: 'left',
    fontSize: 15,
    lineHeight: 22,
    marginTop: 6,
    maxWidth: undefined
  },
  headerActions: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8
  },
  headerUtilityCard: {
    borderWidth: 1,
    borderRadius: 22,
    paddingHorizontal: 12,
    paddingVertical: 12,
    gap: 10,
    shadowColor: '#0b1b2b',
    shadowOpacity: 0.08,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 6 },
    elevation: 4
  },
  pageIntroCard: {
    borderWidth: 1,
    borderRadius: 22,
    paddingHorizontal: 16,
    paddingVertical: 15,
    marginHorizontal: 16,
    marginTop: 6,
    marginBottom: 12,
    shadowColor: '#0b1b2b',
    shadowOpacity: 0.06,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 6 },
    elevation: 3
  },
  pageTitleBar: {
    minHeight: 44,
    borderRadius: 16,
    paddingHorizontal: 14,
    paddingVertical: 10,
    justifyContent: 'center'
  },
  pageTitleBarText: {
    color: '#ffffff',
    fontSize: 14,
    fontWeight: '900',
    letterSpacing: 1,
    textTransform: 'uppercase'
  },
  pageIntroEyebrow: {
    fontSize: 11,
    fontWeight: '900',
    letterSpacing: 1.1,
    textTransform: 'uppercase',
    marginBottom: 6
  },
  pageIntroTitle: {
    fontSize: 21,
    fontWeight: '900',
    letterSpacing: 0.2,
    marginBottom: 6
  },
  pageIntroBody: {
    fontSize: 13,
    lineHeight: 19,
    fontWeight: '600'
  },
  headerMainRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12
  },
  headerLogoBadge: {
    width: 54,
    height: 54,
    borderRadius: 18,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0
  },
  headerLogoCompact: {
    width: 36,
    height: 36,
    borderRadius: 10
  },
  aiBtn: {
    borderWidth: 1,
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 10,
    elevation: 10,
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center'
  },
  aiBtnContent: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8
  },
  aiBtnText: {
    fontWeight: '900',
    letterSpacing: 0.3,
    fontSize: 12
  },
  accountCapsule: {
    minHeight: 56,
    flex: 1,
    borderRadius: 18,
    borderWidth: 1,
    paddingHorizontal: 10,
    paddingVertical: 10,
    justifyContent: 'center',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    shadowColor: '#0b1b2b',
    shadowOpacity: 0.06,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 4 },
    elevation: 2
  },
  accountCapsuleText: {
    fontWeight: '900',
    fontSize: 13,
    letterSpacing: 0.3
  },
  accountMeta: {
    flex: 1,
    minWidth: 0
  },
  accountRoleText: {
    marginTop: 2,
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 0.4,
    textTransform: 'uppercase'
  },
  accountChevron: {
    fontSize: 24,
    fontWeight: '800',
    lineHeight: 24,
    marginLeft: 4
  },
  accountAvatar: {
    width: 40,
    height: 40,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1
  },
  accountAvatarText: {
    color: '#ffffff',
    fontWeight: '900',
    fontSize: 16,
    letterSpacing: 0.4
  },
  title: {
    fontSize: 24,
    fontWeight: '800',
    color: '#0f2f4d'
  },
  authTitle: {
    color: '#0d6f74'
  },
  titleDark: {
    color: '#e7edf5'
  },
  subtitle: {
    fontSize: 13,
    marginTop: 2,
    color: '#5d7a95',
    fontWeight: '600'
  },
  subtitleDark: {
    color: '#9db0c4'
  },
  eyeToggleButton: {
    borderWidth: 1,
    borderRadius: 999,
    flex: 1,
    height: 44,
    paddingHorizontal: 10,
    alignItems: 'center',
    justifyContent: 'center',
    flexDirection: 'row',
    gap: 8,
    shadowColor: '#0b1b2b',
    shadowOpacity: 0.05,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 4 },
    elevation: 2
  },
  eyeToggleLabel: {
    fontSize: 12,
    fontWeight: '700'
  },
  body: {
    flex: 1
  },
  subscriptionBody: {
    flex: 1,
    paddingHorizontal: 14,
    paddingBottom: 16
  },
  bodyContent: {
    flexGrow: 1,
    paddingHorizontal: 14,
    paddingBottom: 84
  },
  authPageContent: {
    paddingBottom: 84
  },
  authRestoreState: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 24
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
  aiModalCard: {
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 14,
    borderWidth: 1,
    borderColor: '#dbe3ee',
    minHeight: 0
  },
  aiModalScroll: {
    flexGrow: 0,
    flexShrink: 1,
    minHeight: 0
  },
  aiModalScrollContent: {
    paddingBottom: 6
  },
  aiDisclaimer: {
    marginTop: 6,
    lineHeight: 18,
    fontSize: 12
  },
  aiBullets: {
    marginTop: 10,
    gap: 8
  },
  aiSectionTitle: {
    fontSize: 12,
    letterSpacing: 0.4,
    textTransform: 'uppercase',
    fontWeight: '800'
  },
  aiBulletText: {
    fontSize: 13,
    lineHeight: 18,
    fontWeight: '600'
  },
  aiAsOf: {
    marginTop: 10,
    fontSize: 11
  },
  rowTight: {
    marginTop: 12,
    flexDirection: 'row',
    gap: 10,
    flexWrap: 'wrap'
  },
  supportFaqCard: {
    marginTop: 10,
    borderWidth: 1,
    borderRadius: 12,
    padding: 12
  },
  supportFaqQuestion: {
    fontSize: 14,
    fontWeight: '800',
    marginBottom: 8
  },
  supportFaqAnswer: {
    fontSize: 13,
    lineHeight: 19,
    fontWeight: '600'
  },
  supportChatLinkWrap: {
    marginTop: 12
  },
  supportChatLink: {
    fontWeight: '800',
    fontSize: 13
  },
  supportPageHeader: {
    borderBottomWidth: 1,
    paddingHorizontal: 14,
    paddingVertical: 10,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between'
  },
  supportPageBackBtn: {
    borderWidth: 1,
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 8
  },
  supportPageBackText: {
    fontSize: 13,
    fontWeight: '700'
  },
  supportPageTitle: {
    fontSize: 16,
    fontWeight: '800'
  },
  supportPageSpacer: {
    width: 72
  },
  supportPageContent: {
    flexGrow: 1,
    paddingHorizontal: 14,
    paddingBottom: 30
  },
  supportPageChatArea: {
    flex: 1,
    paddingHorizontal: 14,
    paddingBottom: 16
  },
  supportChatWrap: {
    minHeight: 0,
    gap: 10
  },
  supportChatScroll: {
    borderWidth: 1,
    borderRadius: 10,
    flex: 1,
    minHeight: 0
  },
  supportChatScrollContent: {
    padding: 10,
    gap: 8
  },
  supportBubble: {
    maxWidth: '92%',
    borderWidth: 1,
    borderRadius: 12,
    paddingHorizontal: 10,
    paddingVertical: 8
  },
  supportBubbleText: {
    fontSize: 13,
    lineHeight: 18,
    fontWeight: '600'
  },
  supportTyping: {
    fontSize: 12,
    fontWeight: '700'
  },
  supportChatInputRow: {
    gap: 8
  },
  supportChatInput: {
    borderWidth: 1,
    borderRadius: 10,
    paddingHorizontal: 10,
    paddingVertical: 9,
    maxHeight: 96
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
  navTextWrap: {
    alignItems: 'center',
    justifyContent: 'center',
    gap: 2
  },
  navIcon: {
    fontSize: 14,
    lineHeight: 16
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
  moreChipRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6
  },
  moreChipIcon: {
    fontSize: 14
  },
  moreChipTextActive: {
    color: ACCENT
  },
  moreChipTextLocked: {
    color: '#9a6b00'
  }
});
