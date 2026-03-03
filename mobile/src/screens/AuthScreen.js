import React, { useEffect, useMemo, useState } from 'react';
import { View, Text, TextInput, StyleSheet, Pressable, Linking } from 'react-native';
import SectionCard from '../components/SectionCard';
import PillButton from '../components/PillButton';
import { api, buildApiUrl } from '../api/client';
import { useTheme } from '../theme';

export default function AuthScreen({
  onLogin,
  onRegister,
  onLoginWithBiometric,
  onRequestOtp,
  onVerifyOtp,
  loading = false
}) {
  const { theme } = useTheme();
  const [mode, setMode] = useState('login');
  const [fullName, setFullName] = useState('');
  const [mobile, setMobile] = useState('');
  const [email, setEmail] = useState('');
  const [mpin, setMpin] = useState('');
  const [otp, setOtp] = useState('');
  const [otpMode, setOtpMode] = useState(false);
  const [otpRequested, setOtpRequested] = useState(false);
  const [otpCooldown, setOtpCooldown] = useState(0);
  const [consentPrivacy, setConsentPrivacy] = useState(false);
  const [consentTerms, setConsentTerms] = useState(false);
  const [privacyVersion, setPrivacyVersion] = useState('v1.0');
  const [termsVersion, setTermsVersion] = useState('v1.0');
  const [message, setMessage] = useState('');
  const [biometricMessage, setBiometricMessage] = useState('');

  useEffect(() => {
    api
      .getLegalVersions()
      .then((v) => {
        setPrivacyVersion(String(v?.privacyPolicyVersion || 'v1.0'));
        setTermsVersion(String(v?.termsVersion || 'v1.0'));
      })
      .catch(() => {
        setPrivacyVersion('v1.0');
        setTermsVersion('v1.0');
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
    if (mode !== 'login') {
      setOtpMode(false);
      setOtp('');
      setOtpRequested(false);
      setOtpCooldown(0);
    }
  }, [mode]);

  const canRegister = useMemo(() => consentPrivacy && consentTerms, [consentPrivacy, consentTerms]);

  const handleMobileInput = (text) => {
    const digits = String(text || '').replace(/\D/g, '').slice(0, 10);
    setMobile(digits);
  };

  const submit = async () => {
    if (!mobile.trim() || !mpin.trim()) {
      setMessage('Mobile number and MPIN are required.');
      return;
    }

    if (mode === 'register') {
      if (!fullName.trim()) {
        setMessage('Full name is required for registration.');
        return;
      }
      if (!canRegister) {
        setMessage('Please accept Privacy Policy and Terms before creating an account.');
        return;
      }
      await onRegister({
        full_name: fullName.trim(),
        mobile: mobile.trim(),
        email: email.trim(),
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
      setMessage('Mobile number is required.');
      return;
    }
    if (typeof onRequestOtp !== 'function') return;

    const result = await onRequestOtp({ mobile: mobile.trim() });
    setOtpRequested(true);
    setOtpCooldown(Number(result?.retry_after_seconds || 30));
    setBiometricMessage('OTP sent to your mobile number.');
    setMessage('');
  };

  const verifyOtpLogin = async () => {
    if (!mobile.trim() || !otp.trim()) {
      setMessage('Mobile number and OTP are required.');
      return;
    }
    if (typeof onVerifyOtp !== 'function') return;
    await onVerifyOtp({ mobile: mobile.trim(), otp: otp.trim() });
    setMessage('');
  };

  return (
    <View>
      <SectionCard title="Account Access">
        <View style={styles.modeRow}>
          <PillButton label="Login" kind={mode === 'login' ? 'primary' : 'ghost'} onPress={() => setMode('login')} />
          <PillButton
            label="Register"
            kind={mode === 'register' ? 'primary' : 'ghost'}
            onPress={() => setMode('register')}
          />
        </View>

        {mode === 'register' ? (
          <>
            <Text style={[styles.label, { color: theme.muted }]}>Full Name</Text>
            <TextInput
              style={[styles.input, { backgroundColor: theme.inputBg, borderColor: theme.border, color: theme.inputText }]}
              value={fullName}
              onChangeText={setFullName}
              placeholder="Your name"
              placeholderTextColor={theme.muted}
            />

            <Text style={[styles.label, { color: theme.muted }]}>Email (Optional)</Text>
            <TextInput
              style={[styles.input, { backgroundColor: theme.inputBg, borderColor: theme.border, color: theme.inputText }]}
              value={email}
              onChangeText={setEmail}
              placeholder="you@example.com"
              placeholderTextColor={theme.muted}
              autoCapitalize="none"
            />

            <View style={[styles.consentWrap, { borderColor: theme.border, backgroundColor: theme.background }]}>
              <Pressable style={styles.consentRow} onPress={() => setConsentPrivacy((v) => !v)}>
                <View style={[styles.checkbox, { borderColor: theme.border, backgroundColor: theme.card }, consentPrivacy && { backgroundColor: theme.accent, borderColor: theme.accent }]}>
                  {consentPrivacy ? <Text style={styles.checkboxTick}>✓</Text> : null}
                </View>
                <Text style={[styles.consentText, { color: theme.muted }]}>I agree to the </Text>
                <Pressable onPress={() => Linking.openURL(buildApiUrl('/legal/privacy')).catch(() => {})}>
                  <Text style={[styles.linkText, { color: theme.accent }]}>Privacy Policy</Text>
                </Pressable>
              </Pressable>
              <Pressable style={styles.consentRow} onPress={() => setConsentTerms((v) => !v)}>
                <View style={[styles.checkbox, { borderColor: theme.border, backgroundColor: theme.card }, consentTerms && { backgroundColor: theme.accent, borderColor: theme.accent }]}>
                  {consentTerms ? <Text style={styles.checkboxTick}>✓</Text> : null}
                </View>
                <Text style={[styles.consentText, { color: theme.muted }]}>I agree to the </Text>
                <Pressable onPress={() => Linking.openURL(buildApiUrl('/legal/terms')).catch(() => {})}>
                  <Text style={[styles.linkText, { color: theme.accent }]}>Terms of Service</Text>
                </Pressable>
              </Pressable>
            </View>
          </>
        ) : null}

        <Text style={[styles.label, { color: theme.muted }]}>Mobile Number</Text>
        <TextInput
          style={[styles.input, { backgroundColor: theme.inputBg, borderColor: theme.border, color: theme.inputText }]}
          value={mobile}
          onChangeText={handleMobileInput}
          placeholder="10-digit Indian mobile"
          placeholderTextColor={theme.muted}
          keyboardType="number-pad"
          autoCapitalize="none"
          maxLength={10}
        />

        {mode === 'login' ? (
          <View style={styles.modeRow}>
            <PillButton label="PIN Login" kind={!otpMode ? 'primary' : 'ghost'} onPress={() => setOtpMode(false)} />
            <PillButton label="OTP Login" kind={otpMode ? 'primary' : 'ghost'} onPress={() => setOtpMode(true)} />
          </View>
        ) : null}

        {!otpMode ? (
          <>
            <Text style={[styles.label, { color: theme.muted }]}>MPIN (4-6 digits)</Text>
            <TextInput
              style={[
                styles.input,
                { backgroundColor: theme.inputBg, borderColor: theme.border, color: theme.inputText }
              ]}
              value={mpin}
              onChangeText={setMpin}
              placeholder="Enter MPIN"
              placeholderTextColor={theme.muted}
              keyboardType="number-pad"
              secureTextEntry
            />

            <PillButton
              label={loading ? 'Please wait...' : mode === 'register' ? 'Create Account' : 'Login'}
              kind={mode === 'register' && !canRegister ? 'ghost' : 'primary'}
              disabled={mode === 'register' && !canRegister}
              onPress={() => submit().catch((e) => setMessage(e.message))}
            />
          </>
        ) : (
          <>
            {otpRequested ? (
              <>
                <Text style={[styles.label, { color: theme.muted }]}>OTP (6 digits)</Text>
                <TextInput
                  style={[
                    styles.input,
                    { backgroundColor: theme.inputBg, borderColor: theme.border, color: theme.inputText }
                  ]}
                  value={otp}
                  onChangeText={(text) => setOtp(String(text || '').replace(/\D/g, '').slice(0, 6))}
                  placeholder="Enter OTP"
                  placeholderTextColor={theme.muted}
                  keyboardType="number-pad"
                />
              </>
            ) : null}

            <PillButton
              label={
                loading
                  ? 'Please wait...'
                  : otpRequested
                    ? otpCooldown > 0
                      ? `Resend OTP (${otpCooldown}s)`
                      : 'Resend OTP'
                    : 'Send OTP'
              }
              kind="ghost"
              disabled={loading || (otpRequested && otpCooldown > 0)}
              onPress={() => requestOtp().catch((e) => setMessage(e.message))}
            />

            {otpRequested ? (
              <PillButton
                label={loading ? 'Please wait...' : 'Verify OTP'}
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
              <Text style={[styles.orText, { color: theme.muted }]}>OR</Text>
              <View style={[styles.orLine, { backgroundColor: theme.border }]} />
            </View>
            <PillButton
              label="🫆 Login with Fingerprint"
              kind="ghost"
              disabled={loading}
              onPress={() =>
                onLoginWithBiometric()
                  .then(() => setBiometricMessage(''))
                  .catch((e) => setBiometricMessage(e.message))
              }
            />
          </>
        ) : null}

        {!!message && <Text style={[styles.message, { color: theme.danger }]}>{message}</Text>}
        {!!biometricMessage && <Text style={[styles.message, { color: theme.danger }]}>{biometricMessage}</Text>}
      </SectionCard>

      <Text style={[styles.help, { color: theme.muted }]}>Create account once with mobile number, then log in with MPIN.</Text>
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
