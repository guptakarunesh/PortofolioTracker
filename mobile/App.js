import React, { useEffect, useState } from 'react';
import {
  ScrollView,
  StatusBar,
  StyleSheet,
  Text,
  View,
  ActivityIndicator,
  Pressable,
  Modal,
  TextInput,
  Image,
  ImageBackground,
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
import Svg, { Defs, LinearGradient, Path, Line, Circle, Rect, Stop, Text as SvgText } from 'react-native-svg';
import DashboardScreen from './src/screens/DashboardScreen';
import AssetsScreen from './src/screens/AssetsScreen';
import LiabilitiesScreen from './src/screens/LiabilitiesScreen';
import RemindersScreen from './src/screens/RemindersScreen';
import SettingsScreen from './src/screens/SettingsScreen';
import PerformanceScreen from './src/screens/PerformanceScreen';
import AuthScreen from './src/screens/AuthScreen';
import AccountScreen from './src/screens/AccountScreen';
import SubscriptionScreen from './src/screens/SubscriptionScreen';
import FamilyScreen from './src/screens/FamilyScreen';
import OnboardingModal from './src/components/OnboardingModal';
import PillButton from './src/components/PillButton';
import { api, setAuthToken } from './src/api/client';
import {
  canUseNativePhoneAuth,
  clearNativePhoneOtp,
  completeNativePhoneOtp,
  formatNativePhoneAuthError,
  isNativePhoneAuthNetworkError,
  startNativePhoneOtp
} from './src/firebase/nativePhoneAuth';
import { FAQ_ITEMS } from './src/constants/faqs';
import { ThemeContext, THEMES, normalizeThemeKey } from './src/theme';
import { LanguageContext, translate } from './src/i18n';
import { BRAND } from './src/brand';

const ACCENT = BRAND.colors.accentBlue;
const ACCENT_DARK = BRAND.colors.accentGreen;
const FX_SYMBOLS = ['INR', 'USD', 'EUR', 'GBP', 'AED', 'SGD'];
const BIOMETRIC_CREDENTIALS_KEY = 'biometric_credentials_v1';
const BIOMETRIC_SESSION_MAX_AGE_MS = 1000 * 60 * 60 * 24 * 3; // 3 days
const AUTH_SESSION_TOKEN_KEY = 'auth_session_token_v1';
const AUTH_INTRO_SEEN_KEY = 'auth_intro_seen_v1';
const LAST_KNOWN_USER_MOBILE_KEY = 'last_known_user_mobile_v1';
const ONBOARDING_SKIPPED_KEY = 'onboarding_skipped_v1';
const REMINDER_NOTIFICATION_CACHE_KEY = 'reminder_notification_cache_v1';
const BRAND_ICON = require('./src/assets/networth-icon.png');
const HEADER_BRAND_ICON = require('./src/assets/app-icon.png');
const AUTH_HEADER_LOCKUP = require('./src/assets/worthio-logo-lockup-header.png');
const AUTH_LOGON_BACKGROUND = require('./src/assets/worthio-logon-background.png');
const REMINDER_NOTIFICATION_TYPE = 'reminder_due';
const EXPO_PUSH_ENABLED = String(process.env.EXPO_PUBLIC_ENABLE_EXPO_PUSH || '').trim() === '1';

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
const PREMIUM_TAB_KEYS = new Set(['settings', 'reminders']);
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

function PremiumBadgeIcon() {
  return (
    <View style={styles.navPremiumBadge}>
      <Text style={styles.navPremiumBadgeText}>★</Text>
    </View>
  );
}

function LogoutIcon({ stroke }) {
  return (
    <Svg width={20} height={20} viewBox="0 0 24 24" fill="none">
      <Path
        d="M14 4h2.2A2.8 2.8 0 0 1 19 6.8v10.4A2.8 2.8 0 0 1 16.2 20H14"
        stroke={stroke}
        strokeWidth={1.8}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <Path
        d="M10 16.5 14.5 12 10 7.5"
        stroke={stroke}
        strokeWidth={1.8}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <Path d="M14.2 12H5" stroke={stroke} strokeWidth={1.8} strokeLinecap="round" />
    </Svg>
  );
}

function NoLinkIcon({ stroke }) {
  return (
    <Svg width={24} height={24} viewBox="0 0 24 24" fill="none">
      <Path
        d="M9.8 8.2 8.3 6.7a3.3 3.3 0 0 0-4.7 4.7l1.5 1.5a3.3 3.3 0 0 0 4.7 0l1.4-1.4"
        stroke={stroke}
        strokeWidth={1.9}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <Path
        d="m14.2 15.8 1.5 1.5a3.3 3.3 0 1 0 4.7-4.7l-1.5-1.5a3.3 3.3 0 0 0-4.7 0l-1.4 1.4"
        stroke={stroke}
        strokeWidth={1.9}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <Line x1="7" y1="17" x2="17" y2="7" stroke={stroke} strokeWidth={2.2} strokeLinecap="round" />
    </Svg>
  );
}

function WorthioShellBackground() {
  return (
    <View style={StyleSheet.absoluteFill} pointerEvents="none">
      <Svg width="100%" height="100%" viewBox="0 0 100 100" preserveAspectRatio="none" style={StyleSheet.absoluteFill}>
        <Defs>
          <LinearGradient id="worthioAppShellGradient" x1="0%" y1="0%" x2="100%" y2="100%">
            <Stop offset="0%" stopColor="#0B1F3A" />
            <Stop offset="58%" stopColor="#10284A" />
            <Stop offset="100%" stopColor="#132844" />
          </LinearGradient>
        </Defs>
        <Rect x="0" y="0" width="100" height="100" fill="url(#worthioAppShellGradient)" />
        <Circle cx="86" cy="14" r="24" fill="rgba(10,132,255,0.08)" />
        <Circle cx="92" cy="92" r="26" fill="rgba(0,200,150,0.10)" />
        <Circle cx="6" cy="78" r="22" fill="rgba(46,211,247,0.06)" />
      </Svg>
    </View>
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
          subscriptionStatus={subscriptionStatus}
          onOpenSubscription={onOpenSubscription}
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
  const [themeKey, setThemeKey] = useState('worthio');
  const normalizedThemeKey = normalizeThemeKey(themeKey);
  const theme = THEMES[normalizedThemeKey] || THEMES.worthio;
  const isDarkTheme = normalizedThemeKey === 'worthio';
  const [language, setLanguage] = useState('en');
  const t = React.useCallback((key, vars) => translate(language, key, vars), [language]);
  const [activeTab, setActiveTab] = useState('dashboard');
  const [authLoading, setAuthLoading] = useState(false);
  const [authError, setAuthError] = useState('');
  const [user, setUser] = useState(null);
  const [otpFlowProvider, setOtpFlowProvider] = useState(null);
  const [sessionRestoring, setSessionRestoring] = useState(true);
  const [authIntroSeen, setAuthIntroSeen] = useState(false);
  const [authInitialExposureActive, setAuthInitialExposureActive] = useState(false);
  const [lastKnownUserMobile, setLastKnownUserMobile] = useState('');
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
  const [premiumPrompt, setPremiumPrompt] = useState(null);
  const [onboardingVisible, setOnboardingVisible] = useState(false);
  const [onboardingIndex, setOnboardingIndex] = useState(0);
  const [onboardingTargets, setOnboardingTargets] = useState({});
  const [biometricEnrolled, setBiometricEnrolled] = useState(false);
  const [subscriptionStatus, setSubscriptionStatus] = useState(null);
  const [accessRole, setAccessRole] = useState('admin');
  const [accountOwner, setAccountOwner] = useState(null);
  const [isAccountOwner, setIsAccountOwner] = useState(true);
  const [canManageSubscription, setCanManageSubscription] = useState(true);
  const [subscriptionAdminInitials, setSubscriptionAdminInitials] = useState([]);
  const [leaveFamilyLoading, setLeaveFamilyLoading] = useState(false);
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
  const premiumPromptContent = React.useMemo(() => {
    const targetsStep = onboardingSteps.find((step) => step.targetKey === 'tab_settings');
    const remindersStep = onboardingSteps.find((step) => step.targetKey === 'tab_reminders');
    const aiStep = onboardingSteps.find((step) => step.targetKey === 'ai_button');
    return {
      settings: {
        title: t('Targets'),
        body: targetsStep?.body || t('Add yearly goals for the categories that matter. The dashboard will show how close you are to target.')
      },
      reminders: {
        title: t('Reminders'),
        body: remindersStep?.body || t('Track bills, renewals, and follow-ups here. Stay ahead of due dates from one screen.')
      },
      ai: {
        title: t('AI Insights'),
        body:
          String(aiStep?.body || '')
            .replace(/\s*\n+\s*/g, ' ')
            .trim() || t('Get a quick summary of your portfolio here. Use it when you want the main takeaways fast.')
      }
    };
  }, [onboardingSteps, t]);

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
    setAiError('');
    if (!user) return;
    if (!premiumActive) {
      setPremiumPrompt(premiumPromptContent.ai);
      return;
    }
    setAiVisible(true);
    try {
      setAiLoading(true);
      const data = await api.getAiInsights({ forceRefresh: __DEV__ });
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
    if (!EXPO_PUSH_ENABLED) {
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
    if (!projectId) {
      setRemotePushReady(false);
      return false;
    }
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
      if (settings?.ui_theme) {
        setThemeKey(normalizeThemeKey(settings.ui_theme));
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
      setCanManageSubscription(Boolean(info?.can_manage_subscription));
      setSubscriptionAdminInitials(Array.isArray(info?.admin_initials) ? info.admin_initials : []);
      return info;
    } catch (_e) {
      setAccessRole('admin');
      setAccountOwner(null);
      setIsAccountOwner(true);
      setCanManageSubscription(true);
      setSubscriptionAdminInitials([]);
      return null;
    }
  };

  const refreshSubscription = async () => {
    try {
      const status = await api.getSubscriptionStatus();
      setSubscriptionStatus(status);
      return status;
    } catch (_e) {
      setSubscriptionStatus(null);
      return null;
    }
  };

  useEffect(() => {
    let cancelled = false;
    const bootstrapSession = async () => {
      try {
        const [savedTokenRaw, savedIntroSeenRaw, savedLastMobileRaw] = await Promise.all([
          SecureStore.getItemAsync(AUTH_SESSION_TOKEN_KEY).catch(() => null),
          SecureStore.getItemAsync(AUTH_INTRO_SEEN_KEY).catch(() => null),
          SecureStore.getItemAsync(LAST_KNOWN_USER_MOBILE_KEY).catch(() => null)
        ]);
        const savedToken = String(savedTokenRaw || '').trim();
        const savedIntroSeen = String(savedIntroSeenRaw || '').trim() === '1';
        const savedLastMobile = String(savedLastMobileRaw || '').trim();
        if (!cancelled) {
          setAuthIntroSeen(savedIntroSeen);
          setAuthInitialExposureActive(!savedIntroSeen);
          setLastKnownUserMobile(savedLastMobile);
        }
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

  const saveBiometricSession = async (profile) => {
    const mobile = String(profile?.mobile || '').trim();
    if (!mobile) {
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
    const resolvedMobile = String(payload?.user?.mobile || '').trim();
    if (resolvedMobile) {
      await SecureStore.setItemAsync(LAST_KNOWN_USER_MOBILE_KEY, resolvedMobile).catch(() => {});
      setLastKnownUserMobile(resolvedMobile);
    }
    setUser(payload.user);
    setAuthInitialExposureActive(false);
    setAuthError('');
    setActiveTab('dashboard');
    setPinSetupVisible(false);
    if (biometricEnrolled && options.refreshBiometric !== false) {
      await saveBiometricSession(payload.user).catch(() => {});
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
      const shouldUseNativeOtp = otpFlowProvider === 'native' && canUseNativePhoneAuth();
      const result = shouldUseNativeOtp
        ? await (async () => {
            const verified = await completeNativePhoneOtp(payload?.otp);
            return api.register({
              ...payload,
              firebase_id_token: verified.firebase_id_token
            });
          })()
        : await api.register(payload);
      setOtpFlowProvider(null);
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
        try {
          const result = await startNativePhoneOtp(payload?.mobile);
          setOtpFlowProvider('native');
          return result;
        } catch (nativeError) {
          if (isNativePhoneAuthNetworkError(nativeError)) {
            clearNativePhoneOtp();
            const result = await api.sendLoginOtp(payload);
            setOtpFlowProvider('backend');
            return result;
          }
          const friendly = formatNativePhoneAuthError(nativeError);
          setAuthError(friendly);
          throw new Error(friendly);
        }
      }
      const result = await api.sendLoginOtp(payload);
      setOtpFlowProvider('backend');
      return result;
    } catch (e) {
      setAuthError(formatNativePhoneAuthError(e));
      throw e;
    } finally {
      setAuthLoading(false);
    }
  };

  const handleOtpVerify = async (payload) => {
    try {
      setAuthLoading(true);
      setAuthError('');
      const shouldUseNativeOtp = otpFlowProvider === 'native' && canUseNativePhoneAuth();
      const result = shouldUseNativeOtp
        ? await (async () => {
            const verified = await completeNativePhoneOtp(payload?.otp);
            return api.verifyLoginOtp({
              mobile: payload?.mobile,
              firebase_id_token: verified.firebase_id_token
            });
          })()
        : await api.verifyLoginOtp(payload);
      setOtpFlowProvider(null);
      await handleAuthSuccess(result);
      return result;
    } catch (e) {
      const friendly = formatNativePhoneAuthError(e);
      setAuthError(friendly);
      throw new Error(friendly);
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
    setCanManageSubscription(true);
    setSubscriptionAdminInitials([]);
    setLeaveFamilyLoading(false);
    setAuthInitialExposureActive(false);
    setAuthIntroSeen(true);
    await SecureStore.setItemAsync(AUTH_INTRO_SEEN_KEY, '1').catch(() => {});
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
    await saveBiometricSession(user);
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
    const storedMobile = String(creds?.mobile || '').trim();
    if (!storedMobile) {
      throw new Error(t('Biometric session is not available on this device.'));
    }
    try {
      const result = await api.loginWithBiometric({ mobile: storedMobile });
      await handleAuthSuccess(result, { refreshBiometric: false });
    } catch (e) {
      setAuthToken(null);
      await SecureStore.deleteItemAsync(AUTH_SESSION_TOKEN_KEY).catch(() => {});
      throw new Error(String(e?.message || t('Biometric login could not be completed right now. Try again.')));
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
      if (key === 'settings') setPremiumPrompt(premiumPromptContent.settings);
      if (key === 'reminders') setPremiumPrompt(premiumPromptContent.reminders);
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
    const targetKey = step?.targetKey;
    const targetReady = targetKey ? Boolean(onboardingTargets[targetKey]) : false;
    if (!onboardingVisible || !targetKey || (step?.tab && step.tab !== activeTab) || !targetReady) {
      onboardingZoom.stopAnimation();
      onboardingZoom.setValue(0);
      return undefined;
    }
    onboardingZoom.setValue(0);
    let loop = null;
    const timer = setTimeout(() => {
      loop = Animated.loop(
        Animated.sequence([
          Animated.timing(onboardingZoom, { toValue: 1, duration: 840, useNativeDriver: true }),
          Animated.timing(onboardingZoom, { toValue: 0, duration: 840, useNativeDriver: true })
        ])
      );
      loop.start();
    }, 120);
    return () => {
      clearTimeout(timer);
      if (loop) loop.stop();
    };
  }, [onboardingVisible, onboardingIndex, onboardingSteps, onboardingZoom, activeTab, onboardingTargets]);

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
    setPremiumPrompt(null);
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

  const handleLeaveFamilyAccess = async () => {
    try {
      setLeaveFamilyLoading(true);
      await api.leaveFamilyAccess();
      const [nextStatus] = await Promise.all([refreshSubscription(), refreshAccessContext()]);
      setActiveTab('dashboard');
      if (nextStatus?.status !== 'active') {
        openSubscription();
      }
    } catch (e) {
      Alert.alert(t('Could not update family access'), e?.message || t('Please try again.'));
    } finally {
      setLeaveFamilyLoading(false);
    }
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
  const accountShortName = String(user?.full_name || '')
    .trim()
    .split(/\s+/)
    .filter(Boolean)[0] || t('Account');
  const isFamilyMember = !isAccountOwner;
  const normalizedAdminInitials = React.useMemo(
    () =>
      [...new Set((Array.isArray(subscriptionAdminInitials) ? subscriptionAdminInitials : [])
        .map((value) => String(value || '').trim())
        .filter(Boolean))],
    [subscriptionAdminInitials]
  );
  const subscriptionDaysRemaining = React.useMemo(() => {
    if (subscriptionStatus?.status !== 'active' || !subscriptionStatus?.current_period_end) return null;
    const end = new Date(subscriptionStatus.current_period_end);
    const now = new Date(subscriptionStatus?.now || Date.now());
    if (Number.isNaN(end.getTime()) || Number.isNaN(now.getTime())) return null;
    const nowDay = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const endDay = new Date(end.getFullYear(), end.getMonth(), end.getDate());
    return Math.round((endDay.getTime() - nowDay.getTime()) / (24 * 60 * 60 * 1000));
  }, [subscriptionStatus]);
  const accountExpiryNotice =
    subscriptionDaysRemaining == null || subscriptionDaysRemaining < 0 || subscriptionDaysRemaining > 5
      ? ''
      : subscriptionDaysRemaining === 0
        ? t('Ends today')
        : subscriptionDaysRemaining === 1
          ? t('1 day left')
          : t('{count} days left', { count: subscriptionDaysRemaining });
  const subscriptionExpired = Boolean(user && subscriptionStatus && subscriptionStatus.status !== 'active');
  const nonManagingFamilyMember = isFamilyMember && !canManageSubscription;
  const subscriptionExpiryModalVisible =
    subscriptionExpired && !(activeTab === 'subscription' && canManageSubscription);
  const adminInitialsLabel = normalizedAdminInitials.length ? normalizedAdminInitials.join(', ') : t('Admin');
  const subscriptionExpiryTitle = nonManagingFamilyMember
    ? t('Family Premium Expired')
    : t('Premium Access Expired');
  const subscriptionExpiryBody = nonManagingFamilyMember
    ? t('This family account needs an active premium plan to continue. Admins who can renew: {initials}.', {
        initials: adminInitialsLabel
      })
    : t('Your premium access has ended. Renew now to continue using premium features and editing tools.');
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

  useEffect(() => {
    if (sessionRestoring || user || authIntroSeen) return;
    setAuthIntroSeen(true);
    SecureStore.setItemAsync(AUTH_INTRO_SEEN_KEY, '1').catch(() => {});
  }, [authIntroSeen, sessionRestoring, user]);

  const clearAuthError = React.useCallback(() => {
    setAuthError('');
  }, []);

  const authLayoutVariant = authInitialExposureActive
    ? 'fresh'
    : biometricEnrolled || Boolean(lastKnownUserMobile)
      ? 'returning'
      : 'light-new';
  const authPreviewVariant = __DEV__ && !user ? 'returning' : authLayoutVariant;
  const authHeroOffset = Math.max(92, Math.min(136, Math.round(screenHeight * 0.11)));

  const mainContent = sessionRestoring ? (
    <SafeAreaView style={[styles.root, { backgroundColor: BRAND.colors.bgBase }]}>
      <StatusBar barStyle={isDarkTheme ? 'light-content' : 'dark-content'} />
      <WorthioShellBackground />
      <View style={styles.authRestoreState}>
        <ActivityIndicator size="small" color={BRAND.colors.accentCyan} />
        <Text style={[styles.restoreTitle, { color: BRAND.colors.textPrimary }]}>{t('Restoring your secure session...')}</Text>
      </View>
    </SafeAreaView>
  ) : !user ? (
    <SafeAreaView style={[styles.root, { backgroundColor: theme.background }]}>
      <StatusBar barStyle={isDarkTheme ? 'light-content' : 'dark-content'} />
      <ImageBackground source={AUTH_LOGON_BACKGROUND} style={styles.authPageBackdrop} imageStyle={styles.authPageBackdropImage}>
        <View style={styles.authPageBackdropOverlay} />
      </ImageBackground>
      <KeyboardAvoidingView
        style={styles.body}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        keyboardVerticalOffset={Platform.OS === 'ios' ? 8 : 0}
      >
        <ScrollView
          style={styles.body}
          contentContainerStyle={[styles.authPageContent, { paddingTop: authHeroOffset }]}
          keyboardShouldPersistTaps="handled"
          keyboardDismissMode={Platform.OS === 'ios' ? 'interactive' : 'on-drag'}
          contentInsetAdjustmentBehavior="automatic"
          showsVerticalScrollIndicator
          alwaysBounceVertical
        >
            <View
              style={[
                styles.authFormSection,
                styles.authFormSectionRaised,
                authLayoutVariant === 'fresh' ? styles.authFormSectionFresh : null
              ]}
            >
              <AuthScreen
                onRegister={handleRegister}
                onLoginWithBiometric={handleBiometricLogin}
                onRequestOtp={handleOtpSend}
                onVerifyOtp={handleOtpVerify}
                biometricReady={biometricEnrolled || (__DEV__ && authPreviewVariant === 'returning')}
                loading={authLoading}
                externalMessage={authError}
                onClearExternalMessage={clearAuthError}
                variant={authPreviewVariant}
                initialMobile={lastKnownUserMobile}
              />
            </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  ) : (
    <SafeAreaView style={[styles.root, { backgroundColor: theme.background }]}>
      <StatusBar barStyle={isDarkTheme ? 'light-content' : 'dark-content'} />
      {isDarkTheme ? <WorthioShellBackground /> : null}
      {activeTab === 'dashboard' ? (
        <View style={styles.header}>
          <View
            style={[
              styles.headerUtilityCard,
              {
                backgroundColor: isDarkTheme ? 'rgba(19,40,68,0.86)' : theme.card,
                borderColor: isDarkTheme ? 'rgba(255,255,255,0.08)' : theme.border
              }
            ]}
          >
            <View style={styles.headerMainRow}>
              <AnimatedPressable
                ref={(node) => setOnboardingTargetRef('account_chip', node)}
                collapsable={false}
                onLayout={() => measureOnboardingTarget('account_chip')}
                style={[
                  styles.accountCapsule,
                  { backgroundColor: theme.inputBg, borderColor: theme.border },
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
                    {accountShortName}
                  </Text>
                  <Text style={[styles.accountRoleText, { color: theme.info }]}>{roleLabel}</Text>
                  {accountExpiryNotice ? (
                    <Text style={[styles.accountExpiryNotice, { color: theme.warn }]} numberOfLines={1}>
                      {accountExpiryNotice}
                    </Text>
                  ) : null}
                </View>
                <Text style={[styles.accountChevron, { color: theme.info }]}>{'\u203A'}</Text>
              </AnimatedPressable>
              <View style={styles.headerBrandActions}>
                <View style={[styles.headerLogoBadge, { backgroundColor: theme.inputBg, borderColor: theme.border }]}>
                  <Image source={HEADER_BRAND_ICON} style={styles.headerLogoCompact} resizeMode="cover" />
                </View>
                <Pressable
                  style={[
                    styles.headerLogoutButton,
                    {
                      backgroundColor: isDarkTheme ? 'rgba(255,255,255,0.08)' : theme.inputBg,
                      borderColor: isDarkTheme ? 'rgba(255,255,255,0.14)' : theme.border
                    }
                  ]}
                  onPress={() => handleLogout().catch(() => {})}
                  accessibilityRole="button"
                  accessibilityLabel={t('Logout')}
                  hitSlop={8}
                >
                  <LogoutIcon stroke={isDarkTheme ? '#FFFFFF' : theme.accent} />
                </Pressable>
              </View>
            </View>
            <View style={styles.headerActions}>
              <Pressable
                ref={(node) => setOnboardingTargetRef('privacy_toggle', node)}
                collapsable={false}
                onLayout={() => measureOnboardingTarget('privacy_toggle')}
                style={[
                  styles.eyeToggleButton,
                  {
                    borderColor: isDarkTheme ? 'rgba(255,255,255,0.14)' : theme.border,
                    backgroundColor: isDarkTheme ? 'rgba(255,255,255,0.08)' : theme.inputBg
                  }
                ]}
                onPress={togglePrivacy}
                accessibilityRole="button"
                accessibilityLabel={hideSensitive ? 'Show values' : 'Hide values'}
              >
                <Text style={[styles.eyeToggleLabel, { color: isDarkTheme ? '#FFFFFF' : theme.accent }]}>{t('Privacy')}</Text>
                <EyeToggleIcon stroke={isDarkTheme ? '#FFFFFF' : theme.accent} closed={hideSensitive} />
              </Pressable>
              <AnimatedPressable
                ref={(node) => setOnboardingTargetRef('ai_button', node)}
                collapsable={false}
                onLayout={() => measureOnboardingTarget('ai_button')}
                style={[
                  styles.aiBtn,
                  {
                    backgroundColor: isDarkTheme ? 'rgba(255,255,255,0.08)' : theme.inputBg,
                    borderColor: isDarkTheme ? 'rgba(255,255,255,0.14)' : theme.border
                  },
                  getOnboardingZoomStyle('ai_button')
                ]}
                onPress={() => openAiInsights().catch(() => {})}
                hitSlop={8}
              >
                <View style={styles.aiBtnContent}>
                  <View style={styles.aiBtnIconWrap}>
                    <AiBrainIcon stroke={isDarkTheme ? '#FFFFFF' : theme.accent} badgeFill={isDarkTheme ? '#FFFFFF' : theme.accent} badgeText={isDarkTheme ? theme.background : theme.card} />
                    {!premiumActive ? <PremiumBadgeIcon /> : null}
                  </View>
                  <Text style={[styles.aiBtnText, { color: isDarkTheme ? '#FFFFFF' : theme.accent }]}>{t('AI Insights')}</Text>
                </View>
              </AnimatedPressable>
            </View>
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
              const mappedKey = normalizeThemeKey(nextKey);
              setThemeKey(mappedKey);
              api.upsertSettings({ ui_theme: mappedKey }).catch(() => {});
            }}
            themeKey={normalizedThemeKey}
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
              <View
                style={[
                  styles.pageIntroCard,
                  {
                    backgroundColor: isDarkTheme ? 'rgba(19,40,68,0.84)' : theme.card,
                    borderColor: isDarkTheme ? 'rgba(255,255,255,0.08)' : theme.border
                  }
                ]}
              >
                <View style={styles.pageIntroAccent} pointerEvents="none">
                  <Svg width="100%" height="100%" viewBox="0 0 100 8" preserveAspectRatio="none">
                    <Defs>
                      <LinearGradient id="worthioPageIntroAccent" x1="0%" y1="0%" x2="100%" y2="0%">
                        <Stop offset="0%" stopColor={BRAND.colors.accentBlue} />
                        <Stop offset="50%" stopColor={BRAND.colors.accentCyan} />
                        <Stop offset="100%" stopColor={BRAND.colors.accentGreen} />
                      </LinearGradient>
                    </Defs>
                    <Rect x="0" y="0" width="100" height="8" rx="4" fill="url(#worthioPageIntroAccent)" opacity="0.96" />
                  </Svg>
                </View>
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
                  const mappedKey = normalizeThemeKey(nextKey);
                  setThemeKey(mappedKey);
                  api.upsertSettings({ ui_theme: mappedKey }).catch(() => {});
                }}
                themeKey={normalizedThemeKey}
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
        <View
          style={[
            styles.bottomNav,
            {
              backgroundColor: isDarkTheme ? 'rgba(11,31,58,0.94)' : theme.card,
              borderTopColor: isDarkTheme ? 'rgba(255,255,255,0.12)' : theme.border
            }
          ]}
        >
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
                  active && {
                    backgroundColor: isDarkTheme ? 'rgba(255,255,255,0.10)' : theme.accentSoft,
                    borderColor: isDarkTheme ? 'rgba(255,255,255,0.16)' : 'rgba(11,31,58,0.08)'
                  },
                  getOnboardingZoomStyle(onboardingKey)
                ]}
                onPress={() => handleTabSelect(key)}
              >
                <View style={styles.navTextWrap}>
                  <View style={styles.navIconWrap}>
                    <Text
                      style={[
                        styles.navIcon,
                        {
                          color: active
                            ? (isDarkTheme ? '#FFFFFF' : theme.accent)
                            : (isDarkTheme ? theme.textMuted || '#C9D4E5' : theme.muted)
                        }
                      ]}
                    >
                      {TAB_ICONS[key] || '•'}
                    </Text>
                    {locked ? <PremiumBadgeIcon /> : null}
                  </View>
                  <Text style={[
                    styles.navText,
                    { color: isDarkTheme ? (theme.textSecondary || '#C9D4E5') : theme.muted },
                    active && { color: isDarkTheme ? '#FFFFFF' : theme.accent },
                    locked && !active && { color: isDarkTheme ? '#D9E3F2' : theme.muted }
                  ]}
                    numberOfLines={1}
                    adjustsFontSizeToFit
                    minimumFontScale={0.82}
                  >
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
        <ThemeContext.Provider value={{ theme, themeKey: normalizedThemeKey, setThemeKey }}>
          <View style={{ flex: 1 }}>
            {mainContent}
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
                              <Text style={[styles.aiSectionTitle, { color: theme.text }]}>{t('What You May Want To Review')}</Text>
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
                                {t('News & Market Context In Simple Terms')}
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
                    {t('Updated: {date}', { date: String(aiPayload.as_of).replace('T', ' ').slice(0, 19) })}
                  </Text>
                ) : null}

                <View style={styles.rowTight}>
                  {user && premiumActive ? (
                    <PillButton label={t('Refresh')} kind="ghost" onPress={() => openAiInsights().catch(() => {})} disabled={aiLoading} />
                  ) : null}
                  <PillButton label={t('Close')} kind="ghost" onPress={() => setAiVisible(false)} />
                </View>
              </ScrollView>
            </View>
          </View>
        </Modal>
          <Modal visible={!!premiumPrompt && !subscriptionExpiryModalVisible} transparent animationType="fade" onRequestClose={() => setPremiumPrompt(null)}>
            <View style={styles.modalBackdrop}>
              <Pressable style={StyleSheet.absoluteFillObject} onPress={() => setPremiumPrompt(null)} />
              <View style={[styles.modalCard, { backgroundColor: theme.card, borderColor: theme.border }]}>
                <Text style={[styles.modalTitle, { color: theme.text }]}>{premiumPrompt?.title || t('Premium Feature')}</Text>
                <Text style={[styles.modalSub, { color: theme.muted }]}>
                  {premiumPrompt?.body || t('This feature is available with Premium.')}
                </Text>
                <View style={styles.modalActions}>
                  <PillButton label={t('Close')} kind="ghost" onPress={() => setPremiumPrompt(null)} />
                  <PillButton label={t('Go Premium')} onPress={openSubscription} />
                </View>
              </View>
            </View>
          </Modal>
          {subscriptionExpiryModalVisible ? (
            <Modal visible transparent animationType="fade">
              <View style={styles.modalBackdrop}>
                <View style={[styles.modalCard, { backgroundColor: theme.card, borderColor: theme.border }]}>
                  <Text style={[styles.modalTitle, { color: theme.text }]}>{subscriptionExpiryTitle}</Text>
                  <Text style={[styles.modalSub, { color: theme.muted }]}>{subscriptionExpiryBody}</Text>
                  {nonManagingFamilyMember ? (
                    <Text style={[styles.modalInfoText, { color: theme.info }]}>
                      {t('Subscription can be renewed by admins: {initials}', { initials: adminInitialsLabel })}
                    </Text>
                  ) : null}
                  <View style={styles.modalActions}>
                    {nonManagingFamilyMember ? (
                      <>
                        <PillButton
                          label={t('Ask Admins to Renew')}
                          kind="ghost"
                          onPress={() =>
                            Alert.alert(
                              t('Admins Can Renew'),
                              t('Subscription can be renewed by admins: {initials}', { initials: adminInitialsLabel })
                            )
                          }
                        />
                        <PillButton
                          label={leaveFamilyLoading ? t('Please wait...') : t('Leave Family & Continue')}
                          onPress={() => handleLeaveFamilyAccess().catch(() => {})}
                          disabled={leaveFamilyLoading}
                        />
                      </>
                    ) : (
                      <PillButton label={t('Go to Subscription')} onPress={openSubscription} />
                    )}
                  </View>
                </View>
              </View>
            </Modal>
          ) : null}
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
          </View>
        </ThemeContext.Provider>
      </LanguageContext.Provider>
    </SafeAreaProvider>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: BRAND.colors.bgBase
  },
  supportOverlay: {
    ...StyleSheet.absoluteFillObject,
    zIndex: 1200,
    elevation: 1200
  },
  rootDark: {
    backgroundColor: BRAND.colors.bgDeep
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
  brandLogoHalo: {
    backgroundColor: 'rgba(255,255,255,0.06)',
    shadowColor: BRAND.colors.accentBlue,
    shadowOpacity: 0.14,
    shadowRadius: 18,
    shadowOffset: { width: 0, height: 10 },
    elevation: 4
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
    width: 88,
    height: 88,
    alignSelf: 'center'
  },
  authLockupWrap: {
    width: 312,
    height: 124,
    alignSelf: 'center',
    marginBottom: 2
  },
  authLockupWrapCompact: {
    width: 252,
    height: 100,
    marginBottom: 8
  },
  authLockupImage: {
    width: '100%',
    height: '100%'
  },
  authLockupRestore: {
    width: 228,
    height: 92,
    alignSelf: 'center',
    marginBottom: 14
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
    paddingTop: 8
  },
  authPageBackdrop: {
    ...StyleSheet.absoluteFillObject
  },
  authPageBackdropImage: {
    resizeMode: 'cover'
  },
  authPageBackdropOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(11,31,58,0.14)'
  },
  authHeroPanel: {
    minHeight: 188,
    borderRadius: 24,
    overflow: 'hidden',
    position: 'relative',
    justifyContent: 'center'
  },
  authReturningPanel: {
    borderWidth: 1
  },
  authHeroContent: {
    paddingHorizontal: 22,
    paddingVertical: 18,
    alignItems: 'center'
  },
  authHeroPanelLight: {
    minHeight: 176,
    borderRadius: 22
  },
  authHeroPanelCompact: {
    minHeight: 180,
    borderRadius: 22
  },
  authHeroContentLight: {
    paddingVertical: 16
  },
  authHeroContentCompact: {
    paddingVertical: 16
  },
  authHeroTitle: {
    marginTop: 2,
    color: BRAND.colors.textPrimary,
    textAlign: 'center',
    fontSize: 31,
    lineHeight: 35,
    fontWeight: '800',
    letterSpacing: -0.9
  },
  authHeroTitleCompact: {
    fontSize: 27,
    lineHeight: 31
  },
  authHeroTitleLight: {
    fontSize: 28,
    lineHeight: 32
  },
  authHeroLead: {
    marginTop: 12,
    color: BRAND.colors.textSecondary,
    textAlign: 'center',
    fontSize: 16,
    lineHeight: 23,
    fontWeight: '600',
    maxWidth: 304
  },
  authHeroLeadLight: {
    marginTop: 10,
    fontSize: 15,
    lineHeight: 21,
    maxWidth: 290
  },
  authUspSection: {
    paddingHorizontal: 22,
    marginTop: -18
  },
  authUspStrip: {
    borderWidth: 1,
    borderRadius: 22,
    paddingHorizontal: 16,
    paddingVertical: 15,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    shadowColor: BRAND.colors.bgDeep,
    shadowOpacity: 0.08,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 6 },
    elevation: 2
  },
  authUspIconChip: {
    width: 52,
    height: 52,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0
  },
  authUspCopy: {
    flex: 1
  },
  authUspTitle: {
    color: BRAND.colors.textPrimary,
    fontSize: 15,
    lineHeight: 20,
    fontWeight: '900'
  },
  authUspBody: {
    marginTop: 4,
    color: '#E6EEF8',
    fontSize: 13,
    lineHeight: 18,
    fontWeight: '600'
  },
  authAssuranceSection: {
    paddingHorizontal: 22,
    paddingTop: 22,
    paddingBottom: 18,
    gap: 28
  },
  authFormSection: {
    marginTop: 18
  },
  authFormSectionRaised: {
    marginTop: 150
  },
  authFormSectionFresh: {
    marginTop: 150
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
    shadowColor: BRAND.colors.bgDeep,
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
    shadowColor: BRAND.colors.bgDeep,
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
    shadowColor: BRAND.colors.bgDeep,
    shadowOpacity: 0.05,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 5 },
    elevation: 2
  },
  pageIntroCard: {
    borderWidth: 1,
    borderRadius: 22,
    paddingHorizontal: 16,
    paddingVertical: 15,
    marginHorizontal: 0,
    marginTop: 6,
    marginBottom: 12,
    shadowColor: BRAND.colors.bgDeep,
    shadowOpacity: 0.05,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 5 },
    elevation: 2,
    overflow: 'hidden'
  },
  pageIntroAccent: {
    width: 54,
    height: 8,
    borderRadius: 999,
    marginBottom: 10
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
  headerBrandActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    flexShrink: 0
  },
  headerLogoBadge: {
    width: 52,
    height: 52,
    borderRadius: 14,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
    overflow: 'hidden'
  },
  headerLogoCompact: {
    width: 46,
    height: 46
  },
  headerLogoutButton: {
    width: 44,
    height: 44,
    borderRadius: 14,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: BRAND.colors.bgDeep,
    shadowOpacity: 0.06,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 4 },
    elevation: 2
  },
  aiBtn: {
    borderWidth: 1,
    borderRadius: 16,
    minHeight: 48,
    paddingHorizontal: 16,
    paddingVertical: 12,
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
  aiBtnIconWrap: {
    position: 'relative',
    width: 24,
    height: 24,
    alignItems: 'center',
    justifyContent: 'center'
  },
  aiBtnText: {
    fontWeight: '900',
    letterSpacing: 0.3,
    fontSize: 15,
    lineHeight: 20
  },
  accountCapsule: {
    minHeight: 50,
    flex: 1,
    borderRadius: 18,
    borderWidth: 1,
    paddingHorizontal: 10,
    paddingVertical: 8,
    justifyContent: 'center',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    shadowColor: BRAND.colors.bgDeep,
    shadowOpacity: 0.06,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 4 },
    elevation: 2
  },
  accountCapsuleText: {
    fontWeight: '900',
    fontSize: 12,
    letterSpacing: 0.3
  },
  accountMeta: {
    flex: 1,
    minWidth: 0
  },
  accountRoleText: {
    marginTop: 1,
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 0.3,
    textTransform: 'uppercase'
  },
  accountExpiryNotice: {
    marginTop: 2,
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 0.1
  },
  accountChevron: {
    fontSize: 20,
    fontWeight: '800',
    lineHeight: 20,
    marginLeft: 2
  },
  accountAvatar: {
    width: 36,
    height: 36,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1
  },
  accountAvatarText: {
    color: BRAND.colors.textPrimary,
    fontWeight: '900',
    fontSize: 14,
    letterSpacing: 0.4
  },
  title: {
    fontSize: 24,
    fontWeight: '800',
    color: BRAND.colors.textPrimary
  },
  authTitle: {
    color: BRAND.colors.accentCyan
  },
  titleDark: {
    color: BRAND.colors.textPrimary
  },
  subtitle: {
    fontSize: 13,
    marginTop: 2,
    color: BRAND.colors.textSecondary,
    fontWeight: '600'
  },
  subtitleDark: {
    color: BRAND.colors.textMuted
  },
  eyeToggleButton: {
    borderWidth: 1,
    borderRadius: 16,
    flex: 1,
    minHeight: 48,
    paddingHorizontal: 16,
    paddingVertical: 12,
    alignItems: 'center',
    justifyContent: 'center',
    flexDirection: 'row',
    gap: 8,
    shadowColor: BRAND.colors.bgDeep,
    shadowOpacity: 0.05,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 4 },
    elevation: 2
  },
  eyeToggleLabel: {
    fontSize: 15,
    lineHeight: 20,
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
    flexGrow: 1,
    paddingBottom: 84
  },
  authRestoreState: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 24
  },
  restoreTitle: {
    marginTop: 8,
    textAlign: 'center',
    fontSize: 18,
    lineHeight: 24,
    fontWeight: '700',
    letterSpacing: -0.2
  },
  authError: {
    color: BRAND.colors.negative,
    marginTop: 8
  },
  modalBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.35)',
    justifyContent: 'center',
    paddingHorizontal: 20
  },
  modalCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    padding: 14,
    borderWidth: 1,
    borderColor: '#D9E2EF'
  },
  modalCardDark: {
    backgroundColor: BRAND.colors.surface,
    borderColor: BRAND.colors.surfaceBorder
  },
  aiModalCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    padding: 14,
    borderWidth: 1,
    borderColor: '#D9E2EF',
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
    borderRadius: 16,
    minHeight: 48,
    paddingHorizontal: 16,
    paddingVertical: 12,
    alignItems: 'center',
    justifyContent: 'center'
  },
  supportPageBackText: {
    fontSize: 15,
    lineHeight: 20,
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
    color: BRAND.colors.bgBase
  },
  modalSub: {
    color: '#64748B',
    marginTop: 4,
    marginBottom: 8
  },
  modalInfoText: {
    fontSize: 13,
    fontWeight: '700',
    lineHeight: 18,
    marginBottom: 8
  },
  modalInput: {
    borderWidth: 1,
    borderColor: '#D9E2EF',
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 8,
    backgroundColor: '#FFFFFF'
  },
  modalInputDark: {
    borderColor: BRAND.colors.surfaceBorder,
    backgroundColor: BRAND.colors.bgSecondary,
    color: BRAND.colors.textPrimary
  },
  pinError: {
    marginTop: 6,
    color: BRAND.colors.negative
  },
  modalActions: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    gap: 8,
    marginTop: 10
  },
  modalBtn: {
    borderRadius: 16,
    minHeight: 48,
    paddingVertical: 12,
    paddingHorizontal: 16,
    alignItems: 'center',
    justifyContent: 'center'
  },
  modalBtnGhost: {
    borderWidth: 1,
    borderColor: ACCENT,
    backgroundColor: '#FFFFFF'
  },
  modalBtnPrimary: {
    backgroundColor: ACCENT
  },
  modalBtnGhostText: {
    color: ACCENT,
    fontWeight: '700'
  },
  modalBtnPrimaryText: {
    color: BRAND.colors.textPrimary,
    fontWeight: '700'
  },
  bottomNav: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderTopWidth: 1,
    borderTopColor: '#D9E2EF',
    backgroundColor: '#FFFFFF',
    paddingHorizontal: 6,
    paddingTop: 8,
    paddingBottom: 10
  },
  bottomNavDark: {
    backgroundColor: BRAND.colors.surface,
    borderTopColor: BRAND.colors.surfaceBorder
  },
  navItem: {
    flex: 1,
    alignItems: 'center',
    minWidth: 0,
    paddingHorizontal: 2,
    paddingVertical: 9,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: 'transparent'
  },
  navTextWrap: {
    alignItems: 'center',
    justifyContent: 'center',
    gap: 2,
    width: '100%',
    minWidth: 0
  },
  navIconWrap: {
    position: 'relative',
    minWidth: 20,
    alignItems: 'center',
    justifyContent: 'center'
  },
  navIcon: {
    fontSize: 15,
    lineHeight: 18
  },
  navPremiumBadge: {
    position: 'absolute',
    top: -6,
    right: -9,
    minWidth: 20,
    height: 20,
    borderRadius: 999,
    backgroundColor: '#D4A72C',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 3,
    borderWidth: 1,
    borderColor: 'rgba(11,31,58,0.28)'
  },
  navPremiumBadgeText: {
    color: '#0B1F3A',
    fontSize: 11,
    lineHeight: 12,
    fontWeight: '900'
  },
  navItemActive: {
    backgroundColor: 'rgba(0,200,150,0.14)'
  },
  navText: {
    color: '#334155',
    fontWeight: '800',
    fontSize: 11,
    lineHeight: 13,
    textAlign: 'center',
    width: '100%',
    flexShrink: 1
  },
  hamburgerText: {
    fontSize: 18,
    lineHeight: 18
  },
  navTextActive: {
    color: ACCENT
  },
  navTextLocked: {
    color: '#B7791F'
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
    borderColor: '#D9E2EF',
    borderRadius: 16,
    minHeight: 44,
    paddingVertical: 12,
    paddingHorizontal: 18,
    backgroundColor: '#FFFFFF'
  },
  moreChipActive: {
    borderColor: ACCENT,
    backgroundColor: 'rgba(0,200,150,0.14)'
  },
  moreChipText: {
    color: '#334155',
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
    color: '#B7791F'
  }
});
