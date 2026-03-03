import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet, TextInput, Pressable, Linking, Share } from 'react-native';
import SectionCard from '../components/SectionCard';
import PillButton from '../components/PillButton';
import { api, buildApiUrl } from '../api/client';
import { useTheme } from '../theme';

const CURRENCIES = ['INR', 'USD', 'EUR', 'GBP', 'AED', 'SGD'];

function toCamelCaseWords(value = '') {
  return String(value)
    .toLowerCase()
    .split(/\s+/)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ');
}

function formatPlanLabel(plan) {
  if (!plan || plan === 'none') return 'None';
  return toCamelCaseWords(String(plan).replace(/_/g, ' '));
}

function formatStatusLabel(status) {
  if (!status || status === 'expired') return 'Expired';
  return toCamelCaseWords(String(status).replace(/_/g, ' '));
}

export default function AccountScreen({
  user,
  onLogout,
  onPrivacyConfigChanged,
  onCurrencyChanged,
  biometricEnrolled = false,
  onEnrollBiometric,
  onDisableBiometric,
  subscriptionStatus,
  onOpenSubscription,
  onOpenFamily,
  premiumActive = false,
  preferredCurrency = 'INR',
  onThemeChange,
  themeKey = 'teal'
}) {
  const { theme } = useTheme();
  const [privacyPinEnabled, setPrivacyPinEnabled] = useState(false);
  const [pin, setPin] = useState('');
  const [currency, setCurrency] = useState(preferredCurrency);
  const [message, setMessage] = useState('');
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [subscription, setSubscription] = useState(subscriptionStatus || null);

  useEffect(() => {
    api
      .getSettings()
      .then((settings) => {
        const enabled = String(settings?.privacy_pin_enabled || '').toLowerCase();
        setPrivacyPinEnabled(enabled === '1' || enabled === 'true' || enabled === 'yes');
        setPin(String(settings?.privacy_pin || ''));
        setCurrency(String(settings?.preferred_currency || preferredCurrency || 'INR'));
      })
      .catch((e) => setMessage(e.message));
  }, []);

  useEffect(() => {
    setSubscription(subscriptionStatus || null);
  }, [subscriptionStatus]);

  useEffect(() => {
    api
      .getSubscriptionStatus()
      .then((status) => setSubscription(status))
      .catch(() => {});
  }, []);

  useEffect(() => {
    setCurrency(preferredCurrency || 'INR');
  }, [preferredCurrency]);

  const savePrivacySettings = async () => {
    if (privacyPinEnabled && !/^\d{4}$/.test(pin)) {
      setMessage('Enter a valid 4-digit PIN to enable PIN protection.');
      return;
    }

    await api.upsertSettings({
      privacy_pin_enabled: privacyPinEnabled ? '1' : '0',
      privacy_pin: pin
    });

    setMessage('Privacy settings saved.');
    onPrivacyConfigChanged?.();
  };

  const handleMaskedPinInput = (text) => {
    const digits = String(text || '').replace(/\D/g, '');
    if (!digits) {
      if (pin.length > 0 && String(text || '').length < pin.length) {
        setPin((prev) => prev.slice(0, -1));
      }
      return;
    }

    setPin((prev) => {
      if (String(text || '').length < prev.length) return prev.slice(0, -1);
      return `${prev}${digits}`.slice(0, 4);
    });
  };

  const changeCurrency = async (code) => {
    if (currency === code) return;
    setCurrency(code);
    setMessage(`Switching currency to ${code}...`);
    onCurrencyChanged?.(code);

    try {
      await api.upsertSettings({ preferred_currency: code });
      setMessage(`Currency updated to ${code}.`);
    } catch (e) {
      setMessage(e.message);
    }
  };

  const exportData = async () => {
    const payload = await api.exportUserData();
    const text = JSON.stringify(payload, null, 2);
    await Share.share({ message: text });
    setMessage('Data export prepared.');
  };

  const deleteAccount = async () => {
    if (!confirmDelete) {
      setConfirmDelete(true);
      setMessage('Tap Delete Account again to confirm permanent deletion.');
      return;
    }
    await api.deleteAccount('user_requested_from_mobile');
    setMessage('Account deleted.');
    onLogout?.();
  };

  return (
    <View>
      <SectionCard title="Profile">
        <Text style={[styles.label, { color: theme.muted }]}>Name</Text>
        <Text style={[styles.value, { color: theme.text }]}>{toCamelCaseWords(user?.full_name || '-')}</Text>
        <Text style={[styles.label, { color: theme.muted }]}>Mobile</Text>
        <Text style={[styles.value, { color: theme.text }]}>{user?.mobile || '-'}</Text>
        <Text style={[styles.label, { color: theme.muted }]}>Email</Text>
        <Text style={[styles.value, { color: theme.text }]}>{String(user?.email || '-').toLowerCase()}</Text>
      </SectionCard>

      <SectionCard title="Privacy & Security">
        <Text style={[styles.helper, { color: theme.muted }]}>
          Enable PIN protection if you want a 4-digit PIN prompt when Privacy mode is turned ON.
        </Text>
        <View style={styles.row}>
          <PillButton
            label={privacyPinEnabled ? 'PIN Enabled' : 'Enable PIN'}
            kind={privacyPinEnabled ? 'primary' : 'ghost'}
            onPress={() => setPrivacyPinEnabled(true)}
          />
          <PillButton
            label={!privacyPinEnabled ? 'PIN Disabled' : 'Disable PIN'}
            kind={!privacyPinEnabled ? 'primary' : 'ghost'}
            onPress={() => setPrivacyPinEnabled(false)}
          />
        </View>
        {privacyPinEnabled ? (
          <>
            <Text style={[styles.label, { color: theme.muted }]}>4-digit Privacy PIN</Text>
            <TextInput
              style={[styles.input, { backgroundColor: theme.inputBg, borderColor: theme.border, color: theme.inputText }]}
              value={'*'.repeat(pin.length)}
              onChangeText={handleMaskedPinInput}
              keyboardType="number-pad"
              secureTextEntry={false}
              maxLength={4}
            />
          </>
        ) : null}
        <PillButton label="Save Privacy Settings" onPress={() => savePrivacySettings().catch((e) => setMessage(e.message))} />

        <View style={[styles.securityDivider, { backgroundColor: theme.border }]} />
        <Text style={[styles.label, { color: theme.muted }]}>Biometric Login</Text>
        <Text style={[styles.helper, { color: theme.muted }]}>
          {biometricEnrolled
            ? 'Face ID is enabled for quick login on this device.'
            : 'Enroll Face ID to login faster without typing MPIN each time.'}
        </Text>
        <View style={styles.row}>
          <PillButton
            label={biometricEnrolled ? 'Face ID Enrolled' : 'Enroll Face ID'}
            kind={biometricEnrolled ? 'primary' : 'ghost'}
            onPress={() =>
              Promise.resolve(onEnrollBiometric?.())
                .then(() => setMessage('Biometric login enrolled for this device.'))
                .catch((e) => setMessage(e.message))
            }
          />
          {biometricEnrolled ? (
            <PillButton
              label="Disable Face ID"
              kind="ghost"
              onPress={() =>
                Promise.resolve(onDisableBiometric?.())
                  .then(() => setMessage('Biometric login disabled for this device.'))
                  .catch((e) => setMessage(e.message))
              }
            />
          ) : null}
        </View>
      </SectionCard>

      <SectionCard title="Display Currency">
        <View style={styles.row}>
          {CURRENCIES.map((code) => (
            <Pressable
              key={code}
              style={[
                styles.currencyChip,
                { borderColor: theme.border, backgroundColor: theme.card },
                currency === code && { borderColor: theme.accent, backgroundColor: theme.accentSoft }
              ]}
              onPress={() => changeCurrency(code).catch((e) => setMessage(e.message))}
            >
              <Text
                style={[
                  styles.currencyChipText,
                  { color: theme.text },
                  currency === code && { color: theme.accent }
                ]}
              >
                {code}
              </Text>
            </Pressable>
          ))}
        </View>
      </SectionCard>

      <SectionCard title="Theme">
        <Text style={[styles.helper, { color: theme.muted }]}>Choose the app color scheme.</Text>
        <View style={styles.row}>
          {[
            { key: 'teal', label: 'Teal' },
            { key: 'ocean', label: 'Ocean' },
            { key: 'slate', label: 'Slate' },
            { key: 'black', label: 'Black' }
          ].map((opt) => (
            <PillButton
              key={opt.key}
              label={opt.label}
              kind={themeKey === opt.key ? 'primary' : 'ghost'}
              onPress={() => onThemeChange?.(opt.key)}
            />
          ))}
        </View>
      </SectionCard>

      <SectionCard title="Family Access">
        <Text style={[styles.helper, { color: theme.muted }]}>
          Share access with family members and control read/write/admin permissions.
        </Text>
        {!premiumActive ? (
          <Text style={[styles.lockedText, { color: theme.warn }]}>Premium required to manage family access.</Text>
        ) : null}
        <View style={styles.row}>
          <PillButton
            label="Manage Family"
            kind={premiumActive ? 'primary' : 'ghost'}
            onPress={premiumActive ? onOpenFamily : onOpenSubscription}
          />
        </View>
      </SectionCard>

      <SectionCard title="Subscription">
        <Text style={[styles.subText, { color: theme.muted }]}>
          Plan: <Text style={[styles.valueInline, { color: theme.text }]}>{formatPlanLabel(subscription?.plan)}</Text>
        </Text>
        <Text style={[styles.subText, { color: theme.muted }]}>
          Status: <Text style={[styles.valueInline, { color: theme.text }]}>{formatStatusLabel(subscription?.status)}</Text>
        </Text>
        {subscription?.trial_start ? (
          <Text style={[styles.subText, { color: theme.muted }]}>
            Free premium started: <Text style={[styles.valueInline, { color: theme.text }]}>{subscription.trial_start.slice(0, 10)}</Text>
          </Text>
        ) : null}
        {subscription?.trial_end ? (
          <Text style={[styles.subText, { color: theme.muted }]}>
            Free premium ends: <Text style={[styles.valueInline, { color: theme.text }]}>{subscription.trial_end.slice(0, 10)}</Text>
          </Text>
        ) : null}
        <PillButton label="Buy Subscription" kind="ghost" onPress={onOpenSubscription} />
      </SectionCard>

      <SectionCard title="Legal">
        <View style={styles.row}>
          <PillButton
            label="Privacy Policy"
            kind="ghost"
            onPress={() => Linking.openURL(buildApiUrl('/legal/privacy')).catch((e) => setMessage(e.message))}
          />
          <PillButton
            label="Terms"
            kind="ghost"
            onPress={() => Linking.openURL(buildApiUrl('/legal/terms')).catch((e) => setMessage(e.message))}
          />
          <PillButton
            label="Contact Grievance Officer"
            kind="ghost"
            onPress={() => Linking.openURL('mailto:grievance@[yourdomain].com').catch((e) => setMessage(e.message))}
          />
        </View>
      </SectionCard>

      <SectionCard title="Data Rights">
        <View style={styles.row}>
          <PillButton label="Export My Data" kind="ghost" onPress={() => exportData().catch((e) => setMessage(e.message))} />
          <PillButton
            label={confirmDelete ? 'Confirm Delete Account' : 'Delete Account'}
            kind="ghost"
            onPress={() => deleteAccount().catch((e) => setMessage(e.message))}
          />
        </View>
      </SectionCard>

      <SectionCard title="Session">
        <PillButton label="Logout" kind="ghost" onPress={onLogout} />
      </SectionCard>
      {!!message && <Text style={[styles.message, { color: theme.text }]}>{message}</Text>}
    </View>
  );
}

const styles = StyleSheet.create({
  label: {
    color: '#4b647f',
    fontSize: 12,
    marginTop: 8,
    fontWeight: '700',
    letterSpacing: 0.2
  },
  securityDivider: {
    marginVertical: 10,
    height: 1,
    backgroundColor: '#e3ebf6'
  },
  value: {
    color: '#0f3557',
    fontWeight: '800',
    fontSize: 15
  },
  helper: {
    color: '#607d99',
    marginBottom: 10,
    lineHeight: 19
  },
  lockedText: {
    color: '#9a6b00',
    fontWeight: '700',
    marginBottom: 8
  },
  subText: {
    color: '#607d99',
    marginBottom: 6
  },
  valueInline: {
    color: '#0f3557',
    fontWeight: '700'
  },
  row: {
    flexDirection: 'row',
    gap: 8,
    flexWrap: 'wrap',
    marginBottom: 8
  },
  currencyChip: {
    borderWidth: 1,
    borderColor: '#c6d8eb',
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 7,
    backgroundColor: '#fff'
  },
  currencyChipActive: {
    borderColor: '#0f766e',
    backgroundColor: '#ebf8f6'
  },
  currencyChipText: {
    color: '#35526e',
    fontWeight: '800',
    fontSize: 12
  },
  currencyChipTextActive: {
    color: '#0f766e'
  },
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
    color: '#0f3557',
    marginBottom: 20,
    marginTop: 2,
    fontWeight: '600'
  }
});
