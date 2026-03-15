import React, { useEffect, useMemo, useState } from 'react';
import { View, Text, TextInput, StyleSheet, Pressable, Linking } from 'react-native';
import Svg, { Path } from 'react-native-svg';
import SectionCard from '../components/SectionCard';
import PillButton from '../components/PillButton';
import { api, buildApiUrl } from '../api/client';
import { useTheme } from '../theme';
import { useI18n } from '../i18n';

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

export default function AuthScreen({
  onRegister,
  onLoginWithBiometric,
  onRequestOtp,
  onVerifyOtp,
  loading = false,
  externalMessage = '',
  biometricReady = false
}) {
  const { theme } = useTheme();
  const { t } = useI18n();
  const [mode, setMode] = useState('login');
  const [fullName, setFullName] = useState('');
  const [mobile, setMobile] = useState('');
  const [email, setEmail] = useState('');
  const [otp, setOtp] = useState('');
  const [otpRequested, setOtpRequested] = useState(false);
  const [otpCooldown, setOtpCooldown] = useState(0);
  const [consentPrivacy, setConsentPrivacy] = useState(false);
  const [consentTerms, setConsentTerms] = useState(false);
  const [privacyVersion, setPrivacyVersion] = useState('v1.1');
  const [termsVersion, setTermsVersion] = useState('v1.1');
  const [message, setMessage] = useState('');
  const [biometricMessage, setBiometricMessage] = useState('');

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
  }, [mode]);

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

  const validateRegisterFields = () => {
    if (!/^[A-Za-z]{2}$/.test(String(fullName || '').trim())) {
      return t('Enter exactly 2 initials for registration.');
    }
    if (!canRegister) {
      return t('Please accept Privacy Policy and Terms before creating an account.');
    }
    return '';
  };

  const requestOtp = async () => {
    if (!mobile.trim()) {
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
    setMessage(t('OTP sent to your mobile number.'));
  };

  const submit = async () => {
    if (!mobile.trim()) {
      setMessage(t('Mobile number is required.'));
      return;
    }
    if (!otpRequested) {
      await requestOtp();
      return;
    }
    if (!otp.trim()) {
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
        email: email.trim(),
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
  };

  const effectiveMessage = message || externalMessage;

  return (
    <View>
      <SectionCard title="" titleStyle={styles.sectionTitleCenter}>
        {typeof onLoginWithBiometric === 'function' && biometricReady ? (
          <>
            <PillButton
              label={t('Login with Biometrics')}
              kind="primary"
              leftIcon={<FingerprintIcon color={theme.card} />}
              disabled={loading}
              onPress={() =>
                onLoginWithBiometric()
                  .then(() => setBiometricMessage(''))
                  .catch((e) => setBiometricMessage(e.message))
              }
            />
            <View style={styles.orRow}>
              <View style={[styles.orLine, { backgroundColor: theme.border }]} />
              <Text style={[styles.orText, { color: theme.muted }]}>{t('OR')}</Text>
              <View style={[styles.orLine, { backgroundColor: theme.border }]} />
            </View>
          </>
        ) : null}

        <View style={styles.modeRow}>
          <PillButton label={t('Login')} kind={mode === 'login' ? 'primary' : 'ghost'} onPress={() => setMode('login')} />
          <PillButton
            label={t('Register')}
            kind={mode === 'register' ? 'primary' : 'ghost'}
            onPress={() => setMode('register')}
          />
        </View>

        {mode === 'register' ? (
          <>
            <Text style={[styles.label, { color: theme.muted }]}>{t('Initials (2 letters)')}</Text>
            <TextInput
              style={[styles.input, { backgroundColor: theme.inputBg, borderColor: theme.border, color: theme.inputText }]}
              value={fullName}
              onChangeText={handleInitialsInput}
              placeholder={t('AB')}
              placeholderTextColor={theme.muted}
              autoCapitalize="characters"
              maxLength={2}
            />

            <Text style={[styles.label, { color: theme.muted }]}>{t('Email (Optional)')}</Text>
            <TextInput
              style={[styles.input, { backgroundColor: theme.inputBg, borderColor: theme.border, color: theme.inputText }]}
              value={email}
              onChangeText={setEmail}
              placeholder={t('you@example.com')}
              placeholderTextColor={theme.muted}
              autoCapitalize="none"
            />

            <Text style={[styles.label, { color: theme.muted }]}>{t('Mobile Number')}</Text>
            <View style={[styles.phoneWrap, { backgroundColor: theme.inputBg, borderColor: theme.border }]}>
              <Text style={[styles.phonePrefix, { color: theme.text }]}>+91</Text>
              <TextInput
                style={[styles.phoneInput, { color: theme.inputText }]}
                value={mobile}
                onChangeText={handleMobileInput}
                placeholder={t('10-digit Indian mobile')}
                placeholderTextColor={theme.muted}
                keyboardType="number-pad"
                autoCapitalize="none"
                maxLength={10}
              />
            </View>

            <View style={[styles.consentWrap, { borderColor: theme.border, backgroundColor: theme.background }]}> 
              <Pressable style={styles.consentRow} onPress={() => setConsentPrivacy((v) => !v)}>
                <View style={[styles.checkbox, { borderColor: theme.border, backgroundColor: theme.card }, consentPrivacy && { backgroundColor: theme.accent, borderColor: theme.accent }]}> 
                  {consentPrivacy ? <Text style={styles.checkboxTick}>✓</Text> : null}
                </View>
                <Text style={[styles.consentText, { color: theme.muted }]}>{t('I agree to the ')}</Text>
                <Pressable onPress={() => Linking.openURL(buildApiUrl('/legal/privacy')).catch(() => {})}>
                  <Text style={[styles.linkText, { color: theme.accent }]}>{t('Privacy Policy')}</Text>
                </Pressable>
              </Pressable>
              <Pressable style={styles.consentRow} onPress={() => setConsentTerms((v) => !v)}>
                <View style={[styles.checkbox, { borderColor: theme.border, backgroundColor: theme.card }, consentTerms && { backgroundColor: theme.accent, borderColor: theme.accent }]}> 
                  {consentTerms ? <Text style={styles.checkboxTick}>✓</Text> : null}
                </View>
                <Text style={[styles.consentText, { color: theme.muted }]}>{t('I agree to the ')}</Text>
                <Pressable onPress={() => Linking.openURL(buildApiUrl('/legal/terms')).catch(() => {})}>
                  <Text style={[styles.linkText, { color: theme.accent }]}>{t('Terms of Service')}</Text>
                </Pressable>
              </Pressable>
            </View>
          </>
        ) : null}

        {mode !== 'register' ? (
          <>
            <Text style={[styles.label, { color: theme.muted }]}>{t('Mobile Number')}</Text>
            <View style={[styles.phoneWrap, { backgroundColor: theme.inputBg, borderColor: theme.border }]}>
              <Text style={[styles.phonePrefix, { color: theme.text }]}>+91</Text>
              <TextInput
                style={[styles.phoneInput, { color: theme.inputText }]}
                value={mobile}
                onChangeText={handleMobileInput}
                placeholder={t('10-digit Indian mobile')}
                placeholderTextColor={theme.muted}
                keyboardType="number-pad"
                autoCapitalize="none"
                maxLength={10}
              />
            </View>
          </>
        ) : null}

        {requiresOtp && otpRequested ? (
          <>
            <Text style={[styles.label, { color: theme.muted }]}>{t('OTP (6 digits)')}</Text>
            <TextInput
              style={[styles.input, { backgroundColor: theme.inputBg, borderColor: theme.border, color: theme.inputText }]}
              value={otp}
              onChangeText={(text) => setOtp(String(text || '').replace(/\D/g, '').slice(0, 6))}
              placeholder={t('Enter OTP')}
              placeholderTextColor={theme.muted}
              keyboardType="number-pad"
            />
          </>
        ) : null}

        <PillButton
          label={
            loading
              ? t('Please wait...')
              : otpRequested
                ? mode === 'register'
                  ? t('Create Account')
                  : t('Verify OTP')
                : t('Send OTP')
          }
          kind="primary"
          disabled={submitDisabled}
          onPress={() => submit().catch((e) => setMessage(e.message))}
        />

        {otpRequested ? (
          <PillButton
            label={otpCooldown > 0 ? t('Resend OTP ({seconds}s)', { seconds: otpCooldown }) : t('Resend OTP')}
            kind="ghost"
            disabled={loading || otpCooldown > 0}
            onPress={() => requestOtp().catch((e) => setMessage(e.message))}
          />
        ) : null}

        {!!effectiveMessage && <Text style={[styles.message, { color: theme.danger }]}>{effectiveMessage}</Text>}
        {!!biometricMessage && <Text style={[styles.message, { color: theme.danger }]}>{biometricMessage}</Text>}
      </SectionCard>

      <Text style={[styles.help, { color: theme.muted }]}>{t('Create account and login using OTP only. Enable biometric login after your first successful OTP session.')}</Text>
      <View style={styles.trustRow}>
        <View style={[styles.trustItem, { borderColor: theme.border, backgroundColor: theme.card }]}>
          <Text style={styles.trustIcon}>🔐</Text>
          <Text style={[styles.trustText, { color: theme.muted }]}>{t('Encrypted')}</Text>
        </View>
        <View style={[styles.trustItem, { borderColor: theme.border, backgroundColor: theme.card }]}>
          <Text style={styles.trustIcon}>🛡️</Text>
          <Text style={[styles.trustText, { color: theme.muted }]}>{t('Private')}</Text>
        </View>
        <View style={[styles.trustItem, { borderColor: theme.border, backgroundColor: theme.card }]}>
          <Text style={styles.trustIcon}>✅</Text>
          <Text style={[styles.trustText, { color: theme.muted }]}>{t('OTP Verified')}</Text>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  modeRow: {
    flexDirection: 'row',
    gap: 8,
    marginBottom: 14,
    justifyContent: 'center'
  },
  label: { color: '#35526e', fontWeight: '700', marginBottom: 5 },
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
    marginTop: 12,
    color: '#b3261e',
    fontWeight: '600'
  },
  consentWrap: {
    marginBottom: 12,
    gap: 10,
    padding: 10,
    borderWidth: 1,
    borderColor: '#e1eaf5',
    borderRadius: 12,
    backgroundColor: '#f8fbff'
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
    marginTop: 4
  },
  trustRow: {
    marginTop: 14,
    flexDirection: 'row',
    justifyContent: 'center',
    flexWrap: 'wrap',
    gap: 8
  },
  trustItem: {
    borderWidth: 1,
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 8,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6
  },
  trustIcon: {
    fontSize: 13
  },
  trustText: {
    fontSize: 12,
    fontWeight: '700'
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
  }
});
