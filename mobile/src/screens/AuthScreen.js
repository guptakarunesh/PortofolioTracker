import React, { useEffect, useMemo, useState } from 'react';
import { View, Text, TextInput, StyleSheet, Pressable, Linking, Modal, ScrollView } from 'react-native';
import Svg, { Circle, Path } from 'react-native-svg';
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
  const [otp, setOtp] = useState('');
  const [otpRequested, setOtpRequested] = useState(false);
  const [otpCooldown, setOtpCooldown] = useState(0);
  const [consentPrivacy, setConsentPrivacy] = useState(false);
  const [consentTerms, setConsentTerms] = useState(false);
  const [privacyVersion, setPrivacyVersion] = useState('v1.1');
  const [termsVersion, setTermsVersion] = useState('v1.1');
  const [message, setMessage] = useState('');
  const [biometricMessage, setBiometricMessage] = useState('');
  const [privacyInfoVisible, setPrivacyInfoVisible] = useState(false);

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
    <View style={styles.authShell}>
      <View style={styles.panelWrap}>
        <View style={[styles.authPanelFrame, styles.authPanelFramePremiumBlue]}>
          <View style={[styles.authPanelCard, styles.authPanelCardPremiumBlue, { shadowColor: theme.text }]}>
          <View style={styles.formInner}>
        <View style={styles.modeRow}>
          <PillButton label={t('Login')} kind={mode === 'login' ? 'primary' : 'ghost'} onPress={() => setMode('login')} />
          <PillButton
            label={t('Register')}
            kind={mode === 'register' ? 'primary' : 'ghost'}
            onPress={() => setMode('register')}
          />
        </View>
        <Text style={[styles.cardTitle, { color: theme.text }]}>
          {mode === 'register'
            ? t('Create Your Account')
            : otpRequested || mobile.trim().length === 10
              ? t('Welcome Back')
              : t('Sign In Securely')}
        </Text>
        <Text style={[styles.cardSubtitle, { color: theme.muted }]}>
          {mode === 'register'
            ? t('Encrypted, protected, and visible only to you.')
            : otpRequested || mobile.trim().length === 10
              ? t('Continue with OTP or your enrolled biometrics.')
              : t('Use your mobile number to continue securely.')}
        </Text>
        {mode === 'register' ? (
          <Pressable style={styles.privacyInfoLinkWrap} onPress={() => setPrivacyInfoVisible(true)}>
            <Text style={[styles.privacyInfoLink, { color: theme.accent }]}>{t('Know how your privacy works?')}</Text>
          </Pressable>
        ) : null}
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
          </View>
          </View>
        </View>
      </View>
      <View style={styles.legalRow}>
        <Pressable onPress={() => Linking.openURL(buildApiUrl('/legal/terms')).catch(() => {})}>
          <Text style={[styles.legalLink, { color: theme.muted }]}>{t('Terms')}</Text>
        </Pressable>
        <Pressable onPress={() => Linking.openURL(buildApiUrl('/legal/privacy')).catch(() => {})}>
          <Text style={[styles.legalLink, { color: theme.muted }]}>{t('Privacy Policy')}</Text>
        </Pressable>
      </View>
      <Modal visible={privacyInfoVisible} transparent animationType="fade" onRequestClose={() => setPrivacyInfoVisible(false)}>
        <View style={styles.infoModalBackdrop}>
          <View style={[styles.infoModalCard, { backgroundColor: theme.card, borderColor: theme.border }]}>
            <Text style={[styles.infoModalTitle, { color: '#0f6b78' }]}>{t('How Your Privacy Works')}</Text>
            <ScrollView style={styles.infoModalBody} contentContainerStyle={styles.infoModalBodyContent} showsVerticalScrollIndicator={false}>
              <View style={styles.infoBulletRow}>
                <View style={[styles.infoBulletIcon, { backgroundColor: '#2563eb' }]}>
                  <PhoneBadgeIcon color="#ffffff" />
                </View>
                <View style={styles.infoBulletCopy}>
                  <Text style={[styles.infoBulletText, { color: theme.muted }]}>
                    {t('We collect only your mobile number as personal information, and nothing more, to keep your experience discreet and secure.')}
                  </Text>
                </View>
              </View>
              <View style={styles.infoBulletRow}>
                <View style={[styles.infoBulletIcon, { backgroundColor: '#0ea5e9' }]}>
                  <LockBadgeIcon color="#ffffff" />
                </View>
                <View style={styles.infoBulletCopy}>
                  <Text style={[styles.infoBulletText, { color: theme.muted }]}>
                    {t('Your sensitive information is encrypted before it is stored.')}
                  </Text>
                </View>
              </View>
              <View style={styles.infoBulletRow}>
                <View style={[styles.infoBulletIcon, { backgroundColor: '#059669' }]}>
                  <FingerprintIcon color="#ffffff" />
                </View>
                <View style={styles.infoBulletCopy}>
                  <Text style={[styles.infoBulletText, { color: theme.muted }]}>
                    {t('Access is protected using OTP verification and device biometrics.')}
                  </Text>
                </View>
              </View>
              <View style={styles.infoBulletRow}>
                <View style={[styles.infoBulletIcon, { backgroundColor: '#7c3aed' }]}>
                  <ClockBadgeIcon color="#ffffff" />
                </View>
                <View style={styles.infoBulletCopy}>
                  <Text style={[styles.infoBulletText, { color: theme.muted }]}>
                    {t('Sensitive details are unlocked only temporarily when you choose to view them.')}
                  </Text>
                </View>
              </View>
              <View style={styles.infoBulletRow}>
                <View style={[styles.infoBulletIcon, { backgroundColor: '#dc2626' }]}>
                  <EyeOffBadgeIcon color="#ffffff" />
                </View>
                <View style={styles.infoBulletCopy}>
                  <Text style={[styles.infoBulletText, { color: theme.muted }]}>
                    {t('Personal and financial information remains inaccessible to our developers, staff and anyone without authorization.')}
                  </Text>
                </View>
              </View>
            </ScrollView>
            <PillButton label={t('Close')} kind="primary" onPress={() => setPrivacyInfoVisible(false)} />
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
    borderRadius: 30,
    padding: 10,
    shadowColor: '#0f172a',
    shadowOpacity: 0.08,
    shadowRadius: 20,
    shadowOffset: { width: 0, height: 10 },
    elevation: 4
  },
  authPanelFramePremiumBlue: {
    backgroundColor: '#edf4ff',
    borderColor: '#183b72'
  },
  authPanelCard: {
    borderWidth: 1,
    borderRadius: 22,
    paddingHorizontal: 16,
    paddingVertical: 18,
    shadowOpacity: 0.1,
    shadowRadius: 14,
    shadowOffset: { width: 0, height: 7 },
    elevation: 3
  },
  authPanelCardPremiumBlue: {
    backgroundColor: '#fdfefe',
    borderColor: '#c7d8f8'
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
  infoBulletRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 12
  },
  infoBulletCopy: {
    flex: 1
  },
  infoBulletIcon: {
    width: 42,
    height: 42,
    borderRadius: 21,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 1,
    shadowColor: '#0f172a',
    shadowOpacity: 0.18,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 5 },
    elevation: 3
  },
  infoBulletText: {
    fontSize: 15,
    lineHeight: 22,
    fontWeight: '500'
  }
});
