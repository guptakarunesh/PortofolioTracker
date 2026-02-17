import React, { useState } from 'react';
import { View, Text, TextInput, StyleSheet } from 'react-native';
import SectionCard from '../components/SectionCard';
import PillButton from '../components/PillButton';

export default function AuthScreen({ onLogin, onRegister, loading = false }) {
  const [mode, setMode] = useState('login');
  const [fullName, setFullName] = useState('');
  const [mobile, setMobile] = useState('');
  const [email, setEmail] = useState('');
  const [mpin, setMpin] = useState('');
  const [message, setMessage] = useState('');

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
      await onRegister({
        full_name: fullName.trim(),
        mobile: mobile.trim(),
        email: email.trim(),
        mpin: mpin.trim()
      });
    } else {
      await onLogin({ mobile: mobile.trim(), mpin: mpin.trim() });
    }

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
            <Text style={styles.label}>Full Name</Text>
            <TextInput style={styles.input} value={fullName} onChangeText={setFullName} placeholder="Your name" />

            <Text style={styles.label}>Email (Optional)</Text>
            <TextInput style={styles.input} value={email} onChangeText={setEmail} placeholder="you@example.com" autoCapitalize="none" />
          </>
        ) : null}

        <Text style={styles.label}>Mobile Number</Text>
        <TextInput
          style={styles.input}
          value={mobile}
          onChangeText={setMobile}
          placeholder="10-digit Indian mobile"
          keyboardType="phone-pad"
          autoCapitalize="none"
        />

        <Text style={styles.label}>MPIN (4-6 digits)</Text>
        <TextInput
          style={styles.input}
          value={mpin}
          onChangeText={setMpin}
          placeholder="Enter MPIN"
          keyboardType="number-pad"
          secureTextEntry
        />

        <PillButton label={loading ? 'Please wait...' : mode === 'register' ? 'Create Account' : 'Login'} onPress={() => submit().catch((e) => setMessage(e.message))} />

        {!!message && <Text style={styles.message}>{message}</Text>}
      </SectionCard>

      <Text style={styles.help}>Create account once with mobile number, then log in with MPIN.</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  modeRow: {
    flexDirection: 'row',
    gap: 8,
    marginBottom: 12
  },
  label: { color: '#183750', fontWeight: '600', marginBottom: 4 },
  input: {
    borderWidth: 1,
    borderColor: '#c9d8ea',
    backgroundColor: '#fff',
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 8,
    marginBottom: 10
  },
  message: {
    marginTop: 10,
    color: '#b3261e'
  },
  help: {
    color: '#607d99'
  }
});
