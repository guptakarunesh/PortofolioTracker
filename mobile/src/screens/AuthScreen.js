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
      <Path
        d="M12 3.5c-4.4 0-8 3.6-8 8 0 1.6.5 3.2 1.4 4.5"
        stroke={color}
        strokeWidth={1.8}
        strokeLinecap="round"
      />
      <Path
        d="M12 7c-2.5 0-4.5 2-4.5 4.5 0 1.2.4 2.4 1.1 3.3"
        stroke={color}
        strokeWidth={1.8}
        strokeLinecap="round"
      />
      <Path
        d="M12 10.5c-.6 0-1 .4-1 1 0 1.9-.7 3.7-2 5.1"
        stroke={color}
        strokeWidth={1.8}
        strokeLinecap="round"
      />
      <Path
        d="M12 5.2c3.5 0 6.3 2.8 6.3 6.3 0 3.7-1.2 7.1-3.5 9.8"
        stroke={color}
        strokeWidth={1.8}
        strokeLinecap="round"
      />
      <Path
        d="M12 8.8c1.5 0 2.7 1.2 2.7 2.7 0 2.9-.8 5.5-2.4 7.8"
        stroke={color}
        strokeWidth={1.8}
        strokeLinecap="round"
      />
    </Svg>
  );
}

export default function AuthScreen({
  onLogin,
  onRegister,
  onLoginWithBiometric,
  onRequestOtp,
  onVerifyOtp,
  onRequestMpinResetOtp,
  onConfirmMpinReset,
  loading = false,
  externalMessage = ''
}) {
  const { theme } = useTheme();
  const { t } = useI18n();
  const [mode, setMode] = useState('login');
  const [fullName, setFullName] = useState('');
  const [mobile, setMobile] = useState('');
  const [email, setEmail] = useState('');
  const [country, setCountry] = useState('');
  const [mpin, setMpin] = useState('');
  const [otp, setOtp] = useState('');
  const [otpMode, setOtpMode] = useState(false);
  const [otpRequested, setOtpRequested] = useState(false);
  const [otpCooldown, setOtpCooldown] = useState(0);
  const [consentPrivacy, setConsentPrivacy] = useState(false);
  const [consentTerms, setConsentTerms] = useState(false);
  const [privacyVersion, setPrivacyVersion] = useState('v1.1');
  const [termsVersion, setTermsVersion] = useState('v1.1');
  const [message, setMessage] = useState('');
  const [biometricMessage, setBiometricMessage] = useState('');
  const [forgotMpinMode, setForgotMpinMode] = useState(false);
  const [resetOtpRequested, setResetOtpRequested] = useState(false);
  const [resetOtpCooldown, setResetOtpCooldown] = useState(0);
  const [resetOtp, setResetOtp] = useState('');
  const [newMpin, setNewMpin] = useState('');

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
    if (!resetOtpCooldown) return undefined;
    const timer = setInterval(() => {
      setResetOtpCooldown((value) => Math.max(0, value - 1));
    }, 1000);
    return () => clearInterval(timer);
  }, [resetOtpCooldown]);

  useEffect(() => {
    if (mode !== 'login') {
      setOtpMode(false);
      setOtp('');
      setOtpRequested(false);
      setOtpCooldown(0);
      setForgotMpinMode(false);
      setResetOtpRequested(false);
      setResetOtp('');
      setResetOtpCooldown(0);
      setNewMpin('');
    }
  }, [mode]);

  useEffect(() => {
    if (otpMode) {
      setForgotMpinMode(false);
      setResetOtpRequested(false);
      setResetOtp('');
      setResetOtpCooldown(0);
      setNewMpin('');
    }
  }, [otpMode]);

  const canRegister = useMemo(() => consentPrivacy && consentTerms, [consentPrivacy, consentTerms]);

  const handleMobileInput = (text) => {
    const digits = String(text || '').replace(/\D/g, '').slice(0, 10);
    setMobile(digits);
  };

  const handleInitialsInput = (text) => {
    const initials = String(text || '').replace(/[^a-zA-Z]/g, '').toUpperCase().slice(0, 2);
    setFullName(initials);
  };

  const submit = async () => {
    if (!mobile.trim() || !mpin.trim()) {
      setMessage(t('Mobile number and MPIN are required.'));
      return;
    }

    if (mode === 'register') {
      if (!/^[A-Za-z]{2}$/.test(String(fullName || '').trim())) {
        setMessage(t('Enter exactly 2 initials for registration.'));
        return;
      }
      if (!country.trim()) {
        setMessage(t('Country is required for registration.'));
        return;
      }
      if (!canRegister) {
        setMessage(t('Please accept Privacy Policy and Terms before creating an account.'));
        return;
      }
      await onRegister({
        full_name: String(fullName || '').trim().toUpperCase(),
        mobile: mobile.trim(),
        email: email.trim(),
        country: country.trim(),
        mpin: mpin.trim(),
        consent_privacy: true,
        consent_terms: true,
        privacy_policy_version: privacyVersion,
        terms_version: termsVersion
      });
    } else {
      await onLogin({ mobile: mobile.trim(), mpin: mpin.trim() });
    }

    setMessage('');
  };

  const requestOtp = async () => {
    if (!mobile.trim()) {
      setMessage(t('Mobile number is required.'));
      return;
    }
    if (typeof onRequestOtp !== 'function') return;

    const result = await onRequestOtp({ mobile: mobile.trim() });
    setOtpRequested(true);
    setOtpCooldown(Number(result?.retry_after_seconds || 30));
    setBiometricMessage(t('OTP sent to your mobile number.'));
    setMessage('');
  };

  const verifyOtpLogin = async () => {
    if (!mobile.trim() || !otp.trim()) {
      setMessage(t('Mobile number and OTP are required.'));
      return;
    }
    if (typeof onVerifyOtp !== 'function') return;
    await onVerifyOtp({ mobile: mobile.trim(), otp: otp.trim() });
    setMessage('');
  };

  const requestMpinResetOtp = async () => {
    if (!mobile.trim()) {
      setMessage(t('Mobile number is required.'));
      return;
    }
    if (typeof onRequestMpinResetOtp !== 'function') return;
    const result = await onRequestMpinResetOtp({ mobile: mobile.trim() });
    setResetOtpRequested(true);
    setResetOtpCooldown(Number(result?.retry_after_seconds || 30));
    setMessage(t('OTP sent to your mobile number.'));
  };

  const confirmMpinReset = async () => {
    if (!mobile.trim() || !resetOtp.trim() || !newMpin.trim()) {
      setMessage(t('Mobile number, OTP and new MPIN are required.'));
      return;
    }
    if (!/^\d{4,6}$/.test(String(newMpin || ''))) {
      setMessage(t('MPIN must be 4 to 6 digits.'));
      return;
    }
    if (typeof onConfirmMpinReset !== 'function') return;
    await onConfirmMpinReset({
      mobile: mobile.trim(),
      otp: resetOtp.trim(),
      new_mpin: newMpin.trim()
    });
    setForgotMpinMode(false);
    setResetOtpRequested(false);
    setResetOtp('');
    setResetOtpCooldown(0);
    setNewMpin('');
    setMessage(t('MPIN reset successful. Please login with your new MPIN.'));
  };

  const effectiveMessage = message || externalMessage;

  return (
    <View>
      <SectionCard title={t('Account Access')}>
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

            <Text style={[styles.label, { color: theme.muted }]}>{t('Country')}</Text>
            <TextInput
              style={[styles.input, { backgroundColor: theme.inputBg, borderColor: theme.border, color: theme.inputText }]}
              value={country}
              onChangeText={setCountry}
              placeholder={t('India')}
              placeholderTextColor={theme.muted}
              autoCapitalize="words"
            />

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

        <Text style={[styles.label, { color: theme.muted }]}>{t('Mobile Number')}</Text>
        <TextInput
          style={[styles.input, { backgroundColor: theme.inputBg, borderColor: theme.border, color: theme.inputText }]}
          value={mobile}
          onChangeText={handleMobileInput}
          placeholder={t('10-digit Indian mobile')}
          placeholderTextColor={theme.muted}
          keyboardType="number-pad"
          autoCapitalize="none"
          maxLength={10}
        />

        {mode === 'login' ? (
          <View style={styles.modeRow}>
            <PillButton label={t('PIN Login')} kind={!otpMode ? 'primary' : 'ghost'} onPress={() => setOtpMode(false)} />
            <PillButton label={t('OTP Login')} kind={otpMode ? 'primary' : 'ghost'} onPress={() => setOtpMode(true)} />
          </View>
        ) : null}

        {!otpMode ? (
          <>
            {mode === 'login' && forgotMpinMode ? (
              <>
                {resetOtpRequested ? (
                  <>
                    <Text style={[styles.label, { color: theme.muted }]}>{t('OTP (6 digits)')}</Text>
                    <TextInput
                      style={[
                        styles.input,
                        { backgroundColor: theme.inputBg, borderColor: theme.border, color: theme.inputText }
                      ]}
                      value={resetOtp}
                      onChangeText={(text) => setResetOtp(String(text || '').replace(/\D/g, '').slice(0, 6))}
                      placeholder={t('Enter OTP')}
                      placeholderTextColor={theme.muted}
                      keyboardType="number-pad"
                    />
                  </>
                ) : null}

                <Text style={[styles.label, { color: theme.muted }]}>{t('New MPIN (4-6 digits)')}</Text>
                <TextInput
                  style={[
                    styles.input,
                    { backgroundColor: theme.inputBg, borderColor: theme.border, color: theme.inputText }
                  ]}
                  value={newMpin}
                  onChangeText={(text) => setNewMpin(String(text || '').replace(/\D/g, '').slice(0, 6))}
                  placeholder={t('Enter MPIN')}
                  placeholderTextColor={theme.muted}
                  keyboardType="number-pad"
                  secureTextEntry
                />

                <PillButton
                  label={
                    loading
                      ? t('Please wait...')
                      : resetOtpRequested
                        ? resetOtpCooldown > 0
                          ? t('Resend OTP ({seconds}s)', { seconds: resetOtpCooldown })
                          : t('Resend OTP')
                        : t('Send OTP')
                  }
                  kind="ghost"
                  disabled={loading || (resetOtpRequested && resetOtpCooldown > 0)}
                  onPress={() => requestMpinResetOtp().catch((e) => setMessage(e.message))}
                />
                {resetOtpRequested ? (
                  <PillButton
                    label={loading ? t('Please wait...') : t('Reset MPIN')}
                    kind="primary"
                    disabled={loading}
                    onPress={() => confirmMpinReset().catch((e) => setMessage(e.message))}
                  />
                ) : null}
                <PillButton
                  label={t('Back to Login')}
                  kind="ghost"
                  onPress={() => {
                    setForgotMpinMode(false);
                    setResetOtpRequested(false);
                    setResetOtp('');
                    setResetOtpCooldown(0);
                    setNewMpin('');
                    setMessage('');
                  }}
                />
              </>
            ) : (
              <>
                <Text style={[styles.label, { color: theme.muted }]}>{t('MPIN (4-6 digits)')}</Text>
                <TextInput
                  style={[
                    styles.input,
                    { backgroundColor: theme.inputBg, borderColor: theme.border, color: theme.inputText }
                  ]}
                  value={mpin}
                  onChangeText={setMpin}
                  placeholder={t('Enter MPIN')}
                  placeholderTextColor={theme.muted}
                  keyboardType="number-pad"
                  secureTextEntry
                />

                <PillButton
                  label={loading ? t('Please wait...') : mode === 'register' ? t('Create Account') : t('Login')}
                  kind={mode === 'register' && !canRegister ? 'ghost' : 'primary'}
                  disabled={mode === 'register' && !canRegister}
                  onPress={() => submit().catch((e) => setMessage(e.message))}
                />
                {mode === 'login' ? (
                  <Pressable onPress={() => setForgotMpinMode(true)} style={styles.forgotLinkWrap}>
                    <Text style={[styles.forgotLink, { color: theme.accent }]}>{t('Forgot MPIN?')}</Text>
                  </Pressable>
                ) : null}
              </>
            )}
          </>
        ) : (
          <>
            {otpRequested ? (
              <>
                <Text style={[styles.label, { color: theme.muted }]}>{t('OTP (6 digits)')}</Text>
                <TextInput
                  style={[
                    styles.input,
                    { backgroundColor: theme.inputBg, borderColor: theme.border, color: theme.inputText }
                  ]}
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
                    ? otpCooldown > 0
                      ? t('Resend OTP ({seconds}s)', { seconds: otpCooldown })
                      : t('Resend OTP')
                    : t('Send OTP')
              }
              kind="ghost"
              disabled={loading || (otpRequested && otpCooldown > 0)}
              onPress={() => requestOtp().catch((e) => setMessage(e.message))}
            />

            {otpRequested ? (
              <PillButton
                label={loading ? t('Please wait...') : t('Verify OTP')}
                kind="primary"
                disabled={loading}
                onPress={() => verifyOtpLogin().catch((e) => setMessage(e.message))}
              />
            ) : null}
          </>
        )}

        {mode === 'login' && typeof onLoginWithBiometric === 'function' ? (
          <>
              <View style={styles.orRow}>
              <View style={[styles.orLine, { backgroundColor: theme.border }]} />
              <Text style={[styles.orText, { color: theme.muted }]}>{t('OR')}</Text>
              <View style={[styles.orLine, { backgroundColor: theme.border }]} />
            </View>
            <PillButton
              label={t('Login with Fingerprint')}
              kind="ghost"
              leftIcon={<FingerprintIcon color={theme.accent} />}
              disabled={loading}
              onPress={() =>
                onLoginWithBiometric()
                  .then(() => setBiometricMessage(''))
                  .catch((e) => setBiometricMessage(e.message))
              }
            />
          </>
        ) : null}

        {!!effectiveMessage && <Text style={[styles.message, { color: theme.danger }]}>{effectiveMessage}</Text>}
        {!!biometricMessage && <Text style={[styles.message, { color: theme.danger }]}>{biometricMessage}</Text>}
      </SectionCard>

      <Text style={[styles.help, { color: theme.muted }]}>{t('Create account once with mobile number, then log in with MPIN.')}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  modeRow: {
    flexDirection: 'row',
    gap: 8,
    marginBottom: 14
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
  checkboxChecked: {
    backgroundColor: '#0f766e',
    borderColor: '#0f766e'
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
  forgotLinkWrap: {
    marginTop: 8,
    marginBottom: 4
  },
  forgotLink: {
    fontWeight: '700',
    fontSize: 12
  },
  help: {
    color: '#607d99',
    textAlign: 'center',
    marginTop: 4
  },
  orRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginTop: 8,
    marginBottom: 8
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
