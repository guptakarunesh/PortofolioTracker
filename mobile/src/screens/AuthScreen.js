import React, { useEffect, useMemo, useState } from 'react';
import { View, Text, TextInput, StyleSheet, Pressable, Modal, ScrollView } from 'react-native';
import Svg, { Circle, Defs, LinearGradient, Path, Rect, Stop } from 'react-native-svg';
import PillButton from '../components/PillButton';
import { api } from '../api/client';
import { useTheme } from '../theme';
import { useI18n } from '../i18n';
import { BRAND } from '../brand';

function FingerprintIcon({ color }) {
  return (
    <Svg width={16} height={16} viewBox="0 0 24 24" fill="none">
      <Path d="M12 3.5c-4.4 0-8 3.6-8 8 0 1.6.5 3.2 1.4 4.5" stroke={color} strokeWidth={1.8} strokeLinecap="round" />
      <Path d="M12 7c-2.5 0-4.5 2-4.5 4.5 0 1.2.4 2.4 1.1 3.3" stroke={color} strokeWidth={1.8} strokeLinecap="round" />
      <Path d="M12 10.5c-.6 0-1 .4-1 1 0 1.9-.7 3.7-2 5.1" stroke={color} strokeWidth={1.8} strokeLinecap="round" />
      <Path d="M12 5.2c3.5 0 6.3 2.8 6.3 6.3 0 3.7-1.2 7.1-3.5 9.8" stroke={color} strokeWidth={1.8} strokeLinecap="round" />
      <Path d="M12 8.8c1.5 0 2.7 1.2 2.7 2.7 0 2.9-.8 5.5-2.4 7.8" stroke={color} strokeWidth={1.8} strokeLinecap="round" />
    </Svg>
  );
}

function LockBadgeIcon({ color }) {
  return (
    <Svg width={20} height={20} viewBox="0 0 24 24" fill="none">
      <Path
        d="M8 10V7.9C8 5.8 9.8 4 12 4s4 1.8 4 3.9V10"
        stroke={color}
        strokeWidth={1.8}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <Path
        d="M7.2 10.2h9.6c1 0 1.8.8 1.8 1.8V18c0 1-.8 1.8-1.8 1.8H7.2c-1 0-1.8-.8-1.8-1.8V12c0-1 .8-1.8 1.8-1.8Z"
        stroke={color}
        strokeWidth={1.8}
        strokeLinejoin="round"
      />
    </Svg>
  );
}

function ShieldBadgeIcon({ color }) {
  return (
    <Svg width={20} height={20} viewBox="0 0 24 24" fill="none">
      <Path
        d="M12 3.8 18.5 6v5.2c0 4.1-2.6 7.8-6.5 9-3.9-1.2-6.5-4.9-6.5-9V6L12 3.8Z"
        stroke={color}
        strokeWidth={1.8}
        strokeLinejoin="round"
      />
      <Path d="m9.2 12.2 1.9 1.9 3.7-4.1" stroke={color} strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" />
    </Svg>
  );
}

function EyeOffBadgeIcon({ color }) {
  return (
    <Svg width={20} height={20} viewBox="0 0 24 24" fill="none">
      <Path
        d="M3 12s3.5-5.5 9-5.5c1.3 0 2.4.2 3.4.6M21 12s-3.5 5.5-9 5.5c-1.3 0-2.5-.2-3.5-.6"
        stroke={color}
        strokeWidth={1.8}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <Path d="M9.9 9.9A3 3 0 0 1 14.1 14.1" stroke={color} strokeWidth={1.8} strokeLinecap="round" />
      <Path d="M4 4 20 20" stroke={color} strokeWidth={1.8} strokeLinecap="round" />
    </Svg>
  );
}

function ClockBadgeIcon({ color }) {
  return (
    <Svg width={20} height={20} viewBox="0 0 24 24" fill="none">
      <Path
        d="M12 20a8 8 0 1 0 0-16 8 8 0 0 0 0 16Z"
        stroke={color}
        strokeWidth={1.8}
        strokeLinejoin="round"
      />
      <Path d="M12 8v4.2l2.8 1.8" stroke={color} strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" />
    </Svg>
  );
}

function PhoneBadgeIcon({ color }) {
  return (
    <Svg width={20} height={20} viewBox="0 0 24 24" fill="none">
      <Path
        d="M8.2 3.8h7.6c1 0 1.8.8 1.8 1.8v12.8c0 1-.8 1.8-1.8 1.8H8.2c-1 0-1.8-.8-1.8-1.8V5.6c0-1 .8-1.8 1.8-1.8Z"
        stroke={color}
        strokeWidth={1.8}
        strokeLinejoin="round"
      />
      <Path d="M10 6.6h4" stroke={color} strokeWidth={1.8} strokeLinecap="round" />
      <Circle cx="12" cy="17.1" r="1" fill={color} />
    </Svg>
  );
}

function NoLinkIcon({ stroke }) {
  return (
    <Svg width={20} height={20} viewBox="0 0 24 24" fill="none">
      <Path
        d="M9.2 14.8 6.7 17.3a3.1 3.1 0 1 1-4.4-4.4l2.5-2.5"
        stroke={stroke}
        strokeWidth={1.8}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <Path
        d="m14.8 9.2 2.5-2.5a3.1 3.1 0 0 1 4.4 4.4l-2.5 2.5"
        stroke={stroke}
        strokeWidth={1.8}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <Path d="m9 15 6-6" stroke={stroke} strokeWidth={1.8} strokeLinecap="round" />
      <Path d="M7.3 7.3 16.7 16.7" stroke={stroke} strokeWidth={1.8} strokeLinecap="round" />
    </Svg>
  );
}

function AuthGradientButton({ label, onPress, disabled = false, leftIcon = null, style = null }) {
  const { theme } = useTheme();
  const [buttonSize, setButtonSize] = useState({ width: 0, height: 44 });
  return (
    <Pressable
      disabled={disabled}
      onPress={onPress}
      onLayout={(event) => {
        const { width, height } = event.nativeEvent.layout || {};
        if (!width || !height) return;
        setButtonSize((current) => (
          current.width === width && current.height === height
            ? current
            : { width, height }
        ));
      }}
      style={({ pressed }) => [
        styles.modeButton,
        styles.authPrimaryButton,
        style,
        disabled && styles.authPrimaryDisabled,
        pressed && !disabled && styles.authPrimaryPressed
      ]}
    >
      <View style={styles.authPrimaryFill} pointerEvents="none">
        <Svg
          width="100%"
          height="100%"
          viewBox={`0 0 ${Math.max(buttonSize.width, 1)} ${Math.max(buttonSize.height, 1)}`}
        >
          <Defs>
            <LinearGradient id="worthioAuthRectGradient" x1="0%" y1="0%" x2="100%" y2="100%">
              <Stop offset="0%" stopColor="#1B6FCC" />
              <Stop offset="52%" stopColor="#24B2D6" />
              <Stop offset="100%" stopColor="#16AA8A" />
            </LinearGradient>
          </Defs>
          <Rect
            x="0"
            y="0"
            width={Math.max(buttonSize.width, 1)}
            height={Math.max(buttonSize.height, 1)}
            rx="16"
            fill="url(#worthioAuthRectGradient)"
          />
        </Svg>
      </View>
      <View style={styles.authPrimaryContent}>
        {leftIcon ? <View style={styles.authPrimaryIcon}>{leftIcon}</View> : null}
        <Text style={[styles.modeButtonText, styles.authPrimaryText, { textShadowColor: theme.key === 'light' ? 'rgba(11,31,58,0.10)' : 'rgba(11,31,58,0.22)' }]}>
          {label}
        </Text>
      </View>
    </Pressable>
  );
}

function formatAuthDisplayMessage(value, t) {
  const raw = String(value || '').trim();
  if (!raw) return '';
  if (raw.includes('Unable to send OTP right now')) {
    return t('Unable to send OTP right now. Please wait a few seconds and try again.');
  }
  if (raw.includes('Unable to verify OTP right now')) {
    return t('Unable to verify OTP right now. Please wait a few seconds and try again.');
  }
  if (raw.includes('Network request failed') || raw.includes('Failed to fetch')) {
    return t('Connection issue. Please try again in a few seconds.');
  }
  if (raw.includes('auth/invalid-phone-number')) {
    return t('Enter a valid 10-digit Indian mobile number.');
  }
  if (raw.includes('auth/too-many-requests')) {
    return t('Too many attempts. Please wait a little and try again.');
  }
  if (raw.includes('auth/invalid-verification-code')) {
    return t('The OTP you entered is incorrect. Please try again.');
  }
  if (raw.includes('auth/code-expired')) {
    return t('This OTP has expired. Please request a new one.');
  }
  return raw;
}

const NOOP = () => {};

export default function AuthScreen({
  onRegister,
  onLoginWithBiometric,
  onRequestOtp,
  onVerifyOtp,
  loading = false,
  externalMessage = '',
  onClearExternalMessage = NOOP,
  biometricReady = false,
  variant = 'light-new',
  initialMobile = ''
}) {
  const { theme } = useTheme();
  const { t } = useI18n();
  const [mode, setMode] = useState(variant === 'fresh' ? 'register' : 'login');
  const [fullName, setFullName] = useState('');
  const [mobile, setMobile] = useState('');
  const [otp, setOtp] = useState('');
  const [otpRequested, setOtpRequested] = useState(false);
  const [otpCooldown, setOtpCooldown] = useState(0);
  const [messageTone, setMessageTone] = useState('error');
  const [consentPrivacy, setConsentPrivacy] = useState(false);
  const [consentTerms, setConsentTerms] = useState(false);
  const [privacyVersion, setPrivacyVersion] = useState('v1.1');
  const [termsVersion, setTermsVersion] = useState('v1.1');
  const [message, setMessage] = useState('');
  const [biometricMessage, setBiometricMessage] = useState('');
  const [privacyInfoVisible, setPrivacyInfoVisible] = useState(false);
  const [legalDocVisible, setLegalDocVisible] = useState(null);
  const isLight = theme.key === 'light';
  const authTheme = useMemo(
    () => ({
      accent: '#1B6FCC',
      accentActive: '#155EAF',
      info: BRAND.colors.accentCyan,
      text: BRAND.colors.textPrimary,
      muted: BRAND.colors.textSecondary,
      subtle: BRAND.colors.textMuted,
      border: 'rgba(255,255,255,0.12)',
      panelFrame: 'rgba(11,31,58,0.72)',
      panelCard: 'rgba(19,40,68,0.88)',
      inputBg: 'rgba(8,23,42,0.78)',
      inputText: '#FFFFFF',
      consentBg: 'rgba(8,23,42,0.82)',
      successBg: 'rgba(0,200,150,0.12)',
      successBorder: 'rgba(0,200,150,0.22)',
      successText: '#78E0BF',
      errorBg: 'rgba(255,90,95,0.10)',
      errorBorder: 'rgba(255,90,95,0.22)',
      errorText: '#FF9A9D'
    }),
    []
  );

  useEffect(() => {
    api
      .getLegalVersions()
      .then((v) => {
        setPrivacyVersion(String(v?.privacyPolicyVersion || 'v1.1'));
        setTermsVersion(String(v?.termsVersion || 'v1.1'));
      })
      .catch(() => {
        setPrivacyVersion('v1.1');
        setTermsVersion('v1.1');
      });
  }, []);

  useEffect(() => {
    if (!otpCooldown) return undefined;
    const timer = setInterval(() => {
      setOtpCooldown((value) => Math.max(0, value - 1));
    }, 1000);
    return () => clearInterval(timer);
  }, [otpCooldown]);

  useEffect(() => {
    setOtp('');
    setOtpRequested(false);
    setOtpCooldown(0);
    setMessage('');
    setBiometricMessage('');
    onClearExternalMessage?.();
  }, [mode]);

  useEffect(() => {
    if (variant === 'returning') {
      setMode('login');
      setMobile(String(initialMobile || '').replace(/\D/g, '').slice(0, 10));
      return;
    }
    if (initialMobile) {
      setMobile((current) => current || String(initialMobile || '').replace(/\D/g, '').slice(0, 10));
    }
  }, [initialMobile, variant]);

  const canRegister = useMemo(() => consentPrivacy && consentTerms, [consentPrivacy, consentTerms]);
  const requiresOtp = mode === 'login' || mode === 'register';
  const submitDisabled = loading || (mode === 'register' && !canRegister);

  const handleMobileInput = (text) => {
    const digits = String(text || '').replace(/\D/g, '').slice(0, 10);
    setMobile(digits);
  };

  const handleInitialsInput = (text) => {
    const initials = String(text || '').replace(/[^a-zA-Z]/g, '').toUpperCase().slice(0, 2);
    setFullName(initials);
  };

  const clearAttemptMessages = () => {
    setMessage('');
    setBiometricMessage('');
    onClearExternalMessage?.();
  };

  const validateRegisterFields = () => {
    if (!/^[A-Za-z]{2}$/.test(String(fullName || '').trim())) {
      setMessageTone('error');
      return t('Enter exactly 2 initials for registration.');
    }
    if (!canRegister) {
      setMessageTone('error');
      return t('Please accept Privacy Policy and Terms before creating an account.');
    }
    return '';
  };

  const requestOtp = async () => {
    clearAttemptMessages();
    if (!mobile.trim()) {
      setMessageTone('error');
      setMessage(t('Mobile number is required.'));
      return;
    }
    if (mode === 'register') {
      const registerError = validateRegisterFields();
      if (registerError) {
        setMessage(registerError);
        return;
      }
    }
    if (typeof onRequestOtp !== 'function') return;

    const result = await onRequestOtp({ mobile: mobile.trim() });
    setOtpRequested(true);
    setOtpCooldown(Number(result?.retry_after_seconds || 30));
    setBiometricMessage('');
    setMessageTone('success');
    setMessage(t('OTP sent to your mobile number.'));
  };

  const submit = async () => {
    clearAttemptMessages();
    if (!mobile.trim()) {
      setMessageTone('error');
      setMessage(t('Mobile number is required.'));
      return;
    }
    if (!otpRequested) {
      await requestOtp();
      return;
    }
    if (!otp.trim()) {
      setMessageTone('error');
      setMessage(t('OTP (6 digits) is required.'));
      return;
    }

    if (mode === 'register') {
      const registerError = validateRegisterFields();
      if (registerError) {
        setMessage(registerError);
        return;
      }
      await onRegister({
        full_name: String(fullName || '').trim().toUpperCase(),
        mobile: mobile.trim(),
        country: 'India',
        otp: otp.trim(),
        consent_privacy: true,
        consent_terms: true,
        privacy_policy_version: privacyVersion,
        terms_version: termsVersion
      });
    } else {
      await onVerifyOtp({ mobile: mobile.trim(), otp: otp.trim() });
    }

    setMessage('');
    setMessageTone('error');
  };

  const effectiveMessage = formatAuthDisplayMessage(message || externalMessage, t);
  const isReturningVariant = variant === 'returning';
  const legalDocContent =
    legalDocVisible === 'privacy'
      ? {
          title: t('Privacy Policy'),
          version: privacyVersion,
          sections: [
            {
              heading: t('Scope'),
              body: t('Worthio handles your account, portfolio, security, reminder, and family-sharing data to operate the app securely and lawfully.')
            },
            {
              heading: t('Data We Collect'),
              body: t('We collect two-letter initials, your mobile number, consent records, portfolio data you enter, selected security telemetry, and notification data needed to run the service.')
            },
            {
              heading: t('What We Do Not Collect'),
              body: t('We do not collect bank passwords, internet banking credentials, card CVV, SMS inbox content, or fingerprint and Face ID templates.')
            },
            {
              heading: t('Why We Process Data'),
              body: t('We use data to create and secure your account, show your assets and liabilities, power reminders, protect sensitive fields, and support limited AI insights.')
            },
            {
              heading: t('Security and Storage'),
              body: t('Data is protected in transit, selected sensitive fields are encrypted at rest, and full reveal of sensitive details requires your Security PIN.')
            },
            {
              heading: t('Sharing'),
              body: t('We do not sell personal data. Data is shared only with authorized family members, required service providers, or authorities when legally required.')
            },
            {
              heading: t('Your Controls'),
              body: t('You can export your data, edit or delete records, reset PINs via OTP, manage device trust, and delete your account.')
            }
          ]
        }
      : legalDocVisible === 'terms'
        ? {
            title: t('Terms of Service'),
            version: termsVersion,
            sections: [
              {
                heading: t('Service Description'),
                body: t('Worthio is a personal finance record-keeping and planning app for assets, liabilities, reminders, family sharing, and AI-generated informational insights.')
              },
              {
                heading: t('What the Service Is Not'),
                body: t('The app does not provide investment, tax, legal, or insurance advice and does not guarantee returns, safety, or suitability of decisions.')
              },
              {
                heading: t('Account Responsibilities'),
                body: t('You must provide accurate registration details and remain responsible for activity under your account and linked family access.')
              },
              {
                heading: t('Security Obligations'),
                body: t('Login may require OTP or trusted-device checks, and sensitive fields remain masked until unlocked with your Security PIN.')
              },
              {
                heading: t('Family Sharing'),
                body: t('Family access is permission-based. You are responsible for inviting trusted people and keeping roles appropriate.')
              },
              {
                heading: t('Notifications and AI'),
                body: t('Reminder alerts are best-effort, and AI insights are informational only. You must independently verify important information before acting.')
              },
              {
                heading: t('Subscription and Liability'),
                body: t('Some features require an active subscription. To the extent permitted by law, we are not liable for indirect loss arising from user decisions, incorrect entries, or third-party outages.')
              }
            ]
          }
        : null;

  return (
    <View style={styles.authShell}>
      <View style={styles.panelWrap}>
        <View
          style={[
            styles.authPanelFrame,
            {
              backgroundColor: authTheme.panelFrame,
              borderColor: authTheme.border,
              shadowColor: BRAND.colors.bgDeep
            }
          ]}
        >
          <View
            style={[
            styles.authPanelCard,
            {
                backgroundColor: authTheme.panelCard,
                borderColor: authTheme.border,
                shadowColor: BRAND.colors.bgDeep
              }
            ]}
        >
          <View style={styles.formInner}>
        <View style={styles.modeRow}>
          <Pressable
            style={[
              styles.modeButton,
              {
                backgroundColor: mode === 'login' ? authTheme.accent : authTheme.inputBg,
                borderColor: mode === 'login' ? authTheme.accent : authTheme.border
              }
            ]}
            onPress={() => setMode('login')}
          >
            <Text
              style={[
                styles.modeButtonText,
                { color: mode === 'login' ? '#FFFFFF' : authTheme.muted }
              ]}
            >
              {t('Login')}
            </Text>
          </Pressable>
          <Pressable
            style={[
              styles.modeButton,
              {
                backgroundColor: mode === 'register' ? authTheme.accent : authTheme.inputBg,
                borderColor: mode === 'register' ? authTheme.accent : authTheme.border
              }
            ]}
            onPress={() => setMode('register')}
          >
            <Text
              style={[
                styles.modeButtonText,
                { color: mode === 'register' ? '#FFFFFF' : authTheme.muted }
              ]}
            >
              {t('Register')}
            </Text>
          </Pressable>
        </View>
        <Text style={[styles.cardTitle, { color: authTheme.text }]}>
          {isReturningVariant
            ? t('Welcome Back')
            : mode === 'register'
            ? t('Create Your Account')
            : otpRequested || mobile.trim().length === 10
              ? t('Welcome Back')
              : t('Sign In Securely')}
        </Text>
        <Pressable style={styles.privacyInfoLinkWrap} onPress={() => setPrivacyInfoVisible(true)}>
          <Text style={[styles.privacyInfoLink, { color: authTheme.info }]}>{t('Know how your privacy works?')}</Text>
        </Pressable>
        {mode === 'login' && typeof onLoginWithBiometric === 'function' && biometricReady ? (
          <>
            <AuthGradientButton
              label={t('Login with Biometrics')}
              leftIcon={<FingerprintIcon color={theme.card} />}
              style={styles.primaryActionButton}
              disabled={loading}
              onPress={() => {
                clearAttemptMessages();
                return (
                onLoginWithBiometric()
                  .then(() => setBiometricMessage(''))
                  .catch((e) => setBiometricMessage(e.message))
                );
              }}
            />
            <View style={styles.orRow}>
              <View style={[styles.orLine, { backgroundColor: authTheme.border }]} />
              <Text style={[styles.orText, { color: authTheme.muted }]}>{t('OR')}</Text>
              <View style={[styles.orLine, { backgroundColor: authTheme.border }]} />
            </View>
          </>
        ) : null}

        {mode === 'register' ? (
          <>
            <Text style={[styles.label, { color: authTheme.muted }]}>{t('Your Initials (2 letters)')}</Text>
            <TextInput
              style={[styles.input, { backgroundColor: authTheme.inputBg, borderColor: authTheme.border, color: authTheme.inputText }]}
              value={fullName}
              onChangeText={handleInitialsInput}
              placeholder={t('AB')}
              placeholderTextColor={authTheme.subtle}
              autoCapitalize="characters"
              maxLength={2}
            />

            <Text style={[styles.label, { color: authTheme.muted }]}>{t('Mobile Number')}</Text>
            <View style={[styles.phoneWrap, { backgroundColor: authTheme.inputBg, borderColor: authTheme.border }]}>
              <Text style={[styles.phonePrefix, { color: authTheme.text }]}>+91</Text>
              <TextInput
                style={[styles.phoneInput, { color: authTheme.inputText }]}
                value={mobile}
                onChangeText={handleMobileInput}
                placeholder={t('10-digit Indian mobile')}
                placeholderTextColor={authTheme.subtle}
                keyboardType="number-pad"
                autoCapitalize="none"
                maxLength={10}
              />
            </View>

            <View style={[styles.consentWrap, { borderColor: authTheme.border, backgroundColor: authTheme.consentBg }]}> 
              <Pressable style={styles.consentRow} onPress={() => setConsentPrivacy((v) => !v)}>
                <View style={[styles.checkbox, { borderColor: authTheme.border, backgroundColor: authTheme.panelCard }, consentPrivacy && { backgroundColor: authTheme.accent, borderColor: authTheme.accent }]}> 
                  {consentPrivacy ? <Text style={styles.checkboxTick}>✓</Text> : null}
                </View>
                <Text style={[styles.consentText, { color: authTheme.muted }]}>{t('I agree to the ')}</Text>
                <Pressable onPress={() => setLegalDocVisible('privacy')}>
                  <Text style={[styles.linkText, { color: authTheme.info }]}>{t('Privacy Policy')}</Text>
                </Pressable>
              </Pressable>
              <Pressable style={styles.consentRow} onPress={() => setConsentTerms((v) => !v)}>
                <View style={[styles.checkbox, { borderColor: authTheme.border, backgroundColor: authTheme.panelCard }, consentTerms && { backgroundColor: authTheme.accent, borderColor: authTheme.accent }]}> 
                  {consentTerms ? <Text style={styles.checkboxTick}>✓</Text> : null}
                </View>
                <Text style={[styles.consentText, { color: authTheme.muted }]}>{t('I agree to the ')}</Text>
                <Pressable onPress={() => setLegalDocVisible('terms')}>
                  <Text style={[styles.linkText, { color: authTheme.info }]}>{t('Terms of Service')}</Text>
                </Pressable>
              </Pressable>
            </View>
          </>
        ) : null}

        {mode !== 'register' ? (
          <>
            <Text style={[styles.label, { color: authTheme.muted }]}>{t('Mobile Number')}</Text>
            <View style={[styles.phoneWrap, { backgroundColor: authTheme.inputBg, borderColor: authTheme.border }]}>
              <Text style={[styles.phonePrefix, { color: authTheme.text }]}>+91</Text>
              <TextInput
                style={[styles.phoneInput, { color: authTheme.inputText }]}
                value={mobile}
                onChangeText={handleMobileInput}
                placeholder={t('10-digit Indian mobile')}
                placeholderTextColor={authTheme.subtle}
                keyboardType="number-pad"
                autoCapitalize="none"
                maxLength={10}
              />
            </View>
          </>
        ) : null}

        {requiresOtp && otpRequested ? (
          <>
            <Text style={[styles.label, { color: authTheme.muted }]}>{t('OTP (6 digits)')}</Text>
            <TextInput
              style={[styles.input, { backgroundColor: authTheme.inputBg, borderColor: authTheme.border, color: authTheme.inputText }]}
              value={otp}
              onChangeText={(text) => setOtp(String(text || '').replace(/\D/g, '').slice(0, 6))}
              placeholder={t('Enter OTP')}
              placeholderTextColor={authTheme.subtle}
              keyboardType="number-pad"
            />
          </>
        ) : null}

        <AuthGradientButton
          label={
            loading
              ? t('Please wait...')
              : otpRequested
                ? mode === 'register'
                  ? t('Create Account')
                  : t('Verify OTP')
                : t('Send OTP')
          }
          style={styles.primaryActionButton}
          disabled={submitDisabled}
          onPress={() => submit().catch((e) => setMessage(e.message))}
        />

        {otpRequested ? (
          <PillButton
            label={otpCooldown > 0 ? t('Resend OTP ({seconds}s)', { seconds: otpCooldown }) : t('Resend OTP')}
            kind="ghost"
            style={[styles.primaryActionButton, styles.secondaryActionButton]}
            disabled={loading || otpCooldown > 0}
            onPress={() => requestOtp().catch((e) => setMessage(e.message))}
          />
        ) : null}

        {!!effectiveMessage && (
          <View
            style={[
              styles.messageBanner,
              messageTone === 'success'
                ? { backgroundColor: authTheme.successBg, borderColor: authTheme.successBorder }
                : { backgroundColor: authTheme.errorBg, borderColor: authTheme.errorBorder }
            ]}
          >
            <Text style={[styles.message, { color: messageTone === 'success' ? authTheme.successText : authTheme.errorText }]}>{effectiveMessage}</Text>
          </View>
        )}
        {!!biometricMessage && (
          <View style={[styles.messageBanner, { backgroundColor: authTheme.errorBg, borderColor: authTheme.errorBorder }]}>
            <Text style={[styles.message, { color: authTheme.errorText }]}>{biometricMessage}</Text>
          </View>
        )}
          </View>
          </View>
        </View>
      </View>
      <View style={styles.legalRow}>
        <Pressable onPress={() => setLegalDocVisible('terms')}>
          <Text style={[styles.legalLink, { color: authTheme.subtle }]}>{t('Terms')}</Text>
        </Pressable>
        <Pressable onPress={() => setLegalDocVisible('privacy')}>
          <Text style={[styles.legalLink, { color: authTheme.subtle }]}>{t('Privacy Policy')}</Text>
        </Pressable>
      </View>
      <Modal visible={!!legalDocVisible} transparent animationType="slide" onRequestClose={() => setLegalDocVisible(null)}>
        <View style={styles.infoModalBackdrop}>
          <View style={[styles.infoModalCard, styles.legalModalCard, { backgroundColor: theme.card, borderColor: theme.border }]}>
            <View style={styles.legalModalHeader}>
              <View>
                <Text style={[styles.infoModalTitle, { color: BRAND.colors.accentCyan }]}>{legalDocContent?.title || ''}</Text>
                <Text style={[styles.legalModalMeta, { color: theme.muted }]}>
                  {t('Version {version}', { version: legalDocContent?.version || '' })}
                </Text>
              </View>
              <Pressable onPress={() => setLegalDocVisible(null)} style={[styles.legalModalClose, { borderColor: theme.border, backgroundColor: theme.inputBg }]}>
                <Text style={[styles.legalModalCloseText, { color: theme.text }]}>{t('Close')}</Text>
              </Pressable>
            </View>
            <ScrollView style={styles.infoModalBody} contentContainerStyle={styles.legalModalBodyContent} showsVerticalScrollIndicator={false}>
              {(legalDocContent?.sections || []).map((section) => (
                <View key={section.heading} style={[styles.legalSectionCard, { borderColor: theme.border, backgroundColor: theme.background }]}>
                  <Text style={[styles.legalSectionTitle, { color: theme.text }]}>{section.heading}</Text>
                  <Text style={[styles.legalSectionBody, { color: theme.muted }]}>{section.body}</Text>
                </View>
              ))}
            </ScrollView>
          </View>
        </View>
      </Modal>
      <Modal visible={privacyInfoVisible} transparent animationType="fade" onRequestClose={() => setPrivacyInfoVisible(false)}>
        <View style={styles.infoModalBackdrop}>
          <View style={[styles.infoModalCard, { backgroundColor: theme.card, borderColor: theme.border }]}>
            <Text style={[styles.infoModalTitle, { color: BRAND.colors.accentCyan }]}>{t('How Your Privacy Works')}</Text>
            <ScrollView style={styles.infoModalBody} contentContainerStyle={styles.infoModalBodyContent} showsVerticalScrollIndicator={false}>
              <View style={[styles.infoTrustCard, { backgroundColor: isLight ? '#F8FBFF' : BRAND.colors.surfaceAlt, borderColor: 'rgba(10,132,255,0.18)' }]}>
                <View style={[styles.infoTrustIconWrap, { backgroundColor: isLight ? '#E8F7F2' : 'rgba(10,132,255,0.18)' }]}>
                  <NoLinkIcon stroke={isLight ? '#0E8A72' : '#CFE7FF'} />
                </View>
                <View style={styles.infoTrustCopy}>
                  <Text style={[styles.infoTrustTitle, { color: theme.text }]}>{t('No Bank Linking Required')}</Text>
                  <Text style={[styles.infoTrustBody, { color: theme.muted }]}>
                    {t('Worthio does not require you to connect bank accounts or allow automatic data pulling. You decide what to track, what to reveal, and how your records are maintained.')}
                  </Text>
                </View>
              </View>
              <View style={[styles.infoTrustCard, { backgroundColor: isLight ? '#F8FBFF' : BRAND.colors.surfaceAlt, borderColor: isLight ? 'rgba(14,138,114,0.18)' : 'rgba(10,132,255,0.18)' }]}>
                <View style={[styles.infoTrustIconWrap, { backgroundColor: isLight ? '#E8F7F2' : 'rgba(10,132,255,0.18)' }]}>
                  <PhoneBadgeIcon color={isLight ? '#0E8A72' : '#CFE7FF'} />
                </View>
                <View style={styles.infoTrustCopy}>
                  <Text style={[styles.infoTrustTitle, { color: theme.text }]}>{t('Private by Design')}</Text>
                  <Text style={[styles.infoTrustBody, { color: theme.muted }]}>
                    {t('We collect only your mobile number as personal information, and nothing more, to keep your experience discreet and secure.')}
                  </Text>
                </View>
              </View>
              <View style={[styles.infoTrustCard, { backgroundColor: isLight ? '#F2FBF8' : BRAND.colors.surfaceAlt, borderColor: isLight ? 'rgba(14,138,114,0.18)' : 'rgba(46,211,247,0.18)' }]}>
                <View style={[styles.infoTrustIconWrap, { backgroundColor: isLight ? '#E2F7F0' : 'rgba(46,211,247,0.18)' }]}>
                  <LockBadgeIcon color={isLight ? '#1389B5' : '#D8F7FF'} />
                </View>
                <View style={styles.infoTrustCopy}>
                  <Text style={[styles.infoTrustTitle, { color: theme.text }]}>{t('Encrypted & Protected')}</Text>
                  <Text style={[styles.infoTrustBody, { color: theme.muted }]}>
                    {t('Your sensitive wealth data is encrypted before it is stored so it stays protected and unreadable to others.')}
                  </Text>
                </View>
              </View>
              <View style={[styles.infoTrustCard, { backgroundColor: isLight ? '#F4FEFA' : BRAND.colors.surfaceAlt, borderColor: 'rgba(0,200,150,0.18)' }]}>
                <View style={[styles.infoTrustIconWrap, { backgroundColor: isLight ? '#DDF8EF' : 'rgba(0,200,150,0.18)' }]}>
                  <FingerprintIcon color={isLight ? '#119B76' : '#DBFFF4'} />
                </View>
                <View style={styles.infoTrustCopy}>
                  <Text style={[styles.infoTrustTitle, { color: theme.text }]}>{t('Only You Can Unlock It')}</Text>
                  <Text style={[styles.infoTrustBody, { color: theme.muted }]}>
                    {t('Access is protected using OTP verification, device biometrics, and your Privacy PIN when sensitive information needs to be viewed.')}
                  </Text>
                </View>
              </View>
              <View style={[styles.infoTrustCard, { backgroundColor: isLight ? '#F8FAFF' : BRAND.colors.surfaceAlt, borderColor: 'rgba(143,162,191,0.20)' }]}>
                <View style={[styles.infoTrustIconWrap, { backgroundColor: isLight ? '#E2E8F0' : 'rgba(143,162,191,0.18)' }]}>
                  <ClockBadgeIcon color={isLight ? '#46607E' : '#E4EDF8'} />
                </View>
                <View style={styles.infoTrustCopy}>
                  <Text style={[styles.infoTrustTitle, { color: theme.text }]}>{t('Visible Only When You Choose')}</Text>
                  <Text style={[styles.infoTrustBody, { color: theme.muted }]}>
                    {t('Sensitive details are unlocked only temporarily when you choose to view them, and personal or financial information remains inaccessible to our developers, staff, and anyone without authorization.')}
                  </Text>
                </View>
              </View>
            </ScrollView>
            <PillButton label={t('Close')} kind="ghost" onPress={() => setPrivacyInfoVisible(false)} />
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  authShell: {
    alignItems: 'center'
  },
  panelWrap: {
    width: '100%',
    maxWidth: 360
  },
  authPanelFrame: {
    borderWidth: 1,
    borderRadius: 24,
    padding: 10,
    shadowOpacity: 0.06,
    shadowRadius: 16,
    shadowOffset: { width: 0, height: 8 },
    elevation: 3
  },
  authPanelCard: {
    borderWidth: 1,
    borderRadius: 20,
    paddingHorizontal: 16,
    paddingVertical: 18,
    shadowOpacity: 0.07,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 5 },
    elevation: 2
  },
  formInner: {
    width: '100%'
  },
  cardTitle: {
    textAlign: 'center',
    fontSize: 22,
    lineHeight: 28,
    fontWeight: '800',
    marginBottom: 8
  },
  cardSubtitle: {
    textAlign: 'center',
    fontSize: 15,
    lineHeight: 22,
    marginBottom: 10
  },
  privacyInfoLinkWrap: {
    alignItems: 'center',
    marginBottom: 18
  },
  privacyInfoLink: {
    fontSize: 14,
    lineHeight: 20,
    fontWeight: '800',
    textDecorationLine: 'underline'
  },
  modeRow: {
    flexDirection: 'row',
    gap: 8,
    marginBottom: 18,
    justifyContent: 'center'
  },
  modeButton: {
    flex: 1,
    minHeight: 44,
    borderRadius: 16,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 18,
    paddingVertical: 12
  },
  modeButtonText: {
    fontSize: 15,
    lineHeight: 20,
    fontWeight: '800',
    letterSpacing: 0.2
  },
  primaryActionButton: {
    alignSelf: 'center',
    minWidth: 180
  },
  authPrimaryButton: {
    borderColor: 'rgba(255,255,255,0.10)',
    backgroundColor: 'transparent',
    overflow: 'hidden'
  },
  authPrimaryFill: {
    ...StyleSheet.absoluteFillObject
  },
  authPrimaryContent: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center'
  },
  authPrimaryIcon: {
    marginRight: 8
  },
  authPrimaryText: {
    color: '#FFFFFF',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 2
  },
  authPrimaryPressed: {
    transform: [{ scale: 0.98 }],
    opacity: 0.94
  },
  authPrimaryDisabled: {
    opacity: 0.55
  },
  secondaryActionButton: {
    marginTop: 12
  },
  label: { fontWeight: '700', marginBottom: 5 },
  input: {
    borderWidth: 1,
    borderColor: '#c6d8eb',
    backgroundColor: '#fff',
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 10,
    marginBottom: 12
  },
  phoneWrap: {
    borderWidth: 1,
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 2,
    marginBottom: 12,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10
  },
  phonePrefix: {
    fontWeight: '800',
    fontSize: 15
  },
  phoneInput: {
    flex: 1,
    paddingVertical: 10
  },
  message: {
    color: '#B42318',
    fontWeight: '600',
    fontSize: 14,
    lineHeight: 20
  },
  messageBanner: {
    marginTop: 12,
    borderWidth: 1,
    borderRadius: 14,
    paddingHorizontal: 12,
    paddingVertical: 10
  },
  consentWrap: {
    marginBottom: 12,
    gap: 10,
    padding: 10,
    borderWidth: 1,
    borderColor: '#e1eaf5',
    borderRadius: 14
  },
  consentRow: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: 6
  },
  checkbox: {
    width: 18,
    height: 18,
    borderRadius: 4,
    borderWidth: 1,
    borderColor: '#9db0c4',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#fff'
  },
  checkboxTick: {
    color: '#fff',
    fontSize: 12,
    fontWeight: '800'
  },
  consentText: {
    color: '#35526e',
    fontWeight: '500'
  },
  linkText: {
    color: '#0f766e',
    fontWeight: '800'
  },
  help: {
    color: '#607d99',
    textAlign: 'center',
    marginTop: 4,
    maxWidth: 300,
    lineHeight: 20
  },
  legalRow: {
    marginTop: 16,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 18
  },
  legalLink: {
    fontSize: 12,
    fontWeight: '600'
  },
  orRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginBottom: 12
  },
  orLine: {
    flex: 1,
    height: 1
  },
  orText: {
    fontWeight: '700',
    fontSize: 12,
    letterSpacing: 1
  },
  infoModalBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(15, 23, 42, 0.45)',
    justifyContent: 'center',
    paddingHorizontal: 20
  },
  infoModalCard: {
    borderWidth: 1,
    borderRadius: 24,
    paddingHorizontal: 18,
    paddingTop: 20,
    paddingBottom: 18,
    maxHeight: '78%'
  },
  legalModalCard: {
    maxHeight: '82%'
  },
  legalModalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    gap: 12,
    marginBottom: 12
  },
  legalModalMeta: {
    marginTop: 4,
    fontSize: 12,
    fontWeight: '600'
  },
  legalModalClose: {
    borderWidth: 1,
    borderRadius: 16,
    minHeight: 48,
    paddingHorizontal: 16,
    paddingVertical: 12,
    alignItems: 'center',
    justifyContent: 'center'
  },
  legalModalCloseText: {
    fontSize: 15,
    lineHeight: 20,
    fontWeight: '800'
  },
  legalModalBodyContent: {
    paddingBottom: 8,
    gap: 12
  },
  legalSectionCard: {
    borderWidth: 1,
    borderRadius: 18,
    paddingHorizontal: 14,
    paddingVertical: 12
  },
  legalSectionTitle: {
    fontSize: 14,
    fontWeight: '800',
    marginBottom: 6
  },
  legalSectionBody: {
    fontSize: 13,
    lineHeight: 20,
    fontWeight: '500'
  },
  infoModalTitle: {
    textAlign: 'center',
    fontSize: 22,
    lineHeight: 28,
    fontWeight: '800'
  },
  infoModalBody: {
    marginTop: 14,
    marginBottom: 18
  },
  infoModalBodyContent: {
    gap: 14
  },
  infoTrustCard: {
    borderWidth: 1,
    borderRadius: 20,
    paddingHorizontal: 14,
    paddingVertical: 14,
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 12
  },
  infoTrustIconWrap: {
    width: 46,
    height: 46,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
    shadowOpacity: 0.1,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 3 },
    elevation: 1.5
  },
  infoTrustCopy: {
    flex: 1
  },
  infoTrustTitle: {
    fontSize: 16,
    lineHeight: 22,
    fontWeight: '800',
    marginBottom: 4
  },
  infoTrustBody: {
    fontSize: 14,
    lineHeight: 21,
    fontWeight: '500'
  }
});
