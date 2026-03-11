import React, { useEffect, useState } from 'react';
import { View, Text, TextInput, StyleSheet } from 'react-native';
import { api } from '../api/client';
import SectionCard from '../components/SectionCard';
import PillButton from '../components/PillButton';
import DateField from '../components/DateField';
import { useTheme } from '../theme';
import { useI18n } from '../i18n';

const ASSET_TARGET_CATEGORIES = [
  'Banking & Deposits',
  'Market Investments',
  'Precious Metals',
  'Real Estate',
  'Retirement Funds',
  'Insurance (Cash Value)',
  'Other Assets'
];

const targetSettingKey = (category) =>
  `yearly_target_${category.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '')}`;

export default function SettingsScreen({ premiumActive = false, onOpenSubscription, readOnly = false }) {
  const { theme } = useTheme();
  const { t } = useI18n();
  const [form, setForm] = useState({});
  const [message, setMessage] = useState('');

  useEffect(() => {
    api.getSettings()
      .then((data) => setForm(data))
      .catch((e) => setMessage(e.message));
  }, []);

  const save = async () => {
    await api.upsertSettings(form);
    setMessage(t('Settings saved.'));
  };

  if (!premiumActive || readOnly) {
    return (
      <View>
      <SectionCard title={t('Targets (Premium)')}>
        <Text style={[styles.lockedText, { color: theme.warn }]}>
          {readOnly ? t('Subscription expired. Renew to edit targets.') : t('Targets are available with Premium.')}
        </Text>
        <PillButton label={t('Upgrade to Premium')} onPress={onOpenSubscription} />
      </SectionCard>
      </View>
    );
  }

  return (
    <View>
      <SectionCard title={t('Targets')}>
        <Text style={[styles.label, { color: theme.muted }]}>{t('Target Date (YYYY-MM-DD)')}</Text>
        <DateField
          value={String(form.target_date ?? '')}
          onChange={(v) => setForm((prev) => ({ ...prev, target_date: v }))}
          theme={theme}
          placeholder="2030-12-31"
        />

        {ASSET_TARGET_CATEGORIES.map((category) => {
          const key = targetSettingKey(category);
          return (
            <View key={key}>
              <Text style={[styles.label, { color: theme.muted }]}>{t(category)}</Text>
              <TextInput
                style={[styles.input, { backgroundColor: theme.inputBg, borderColor: theme.border, color: theme.inputText }]}
                keyboardType="numeric"
                placeholder={t('0')}
                value={String(form[key] ?? '')}
                onChangeText={(v) => setForm((prev) => ({ ...prev, [key]: v }))}
                placeholderTextColor={theme.muted}
              />
            </View>
          );
        })}
        <PillButton label={t('Save Settings & Targets')} onPress={() => save().catch((e) => setMessage(e.message))} />
      </SectionCard>

      {!!message && <Text style={[styles.message, { color: theme.text }]}>{message}</Text>}
    </View>
  );
}

const styles = StyleSheet.create({
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
  message: { color: '#0f3557', marginBottom: 20, fontWeight: '600' },
  lockedText: { color: '#607d99', marginBottom: 10 }
});
