import React, { useEffect, useState, useCallback, useRef } from 'react';
import { View, Text, TextInput, StyleSheet } from 'react-native';
import { api } from '../api/client';
import SectionCard from '../components/SectionCard';
import PillButton from '../components/PillButton';
import DateField from '../components/DateField';
import { getCategoryDisplayLabel } from '../utils/categoryLabels';
import { formatINR } from '../utils/format';
import { useTheme } from '../theme';
import { useI18n } from '../i18n';

const ASSET_TARGET_CATEGORIES = [
  'Cash & Bank Accounts',
  'Market Stocks & RSUs',
  'Retirement Funds',
  'Real Estate',
  'Vehicles',
  'Business Equity',
  'Precious Metals',
  'Jewelry & Watches',
  'Collectibles',
  'Insurance & Other'
];

const targetSettingKey = (category) =>
  `yearly_target_${category.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '')}`;

const sanitizeTargetDigits = (value = '') => String(value || '').replace(/\D/g, '');
const TARGETS_LAST_UPDATED_KEY = 'targets_last_updated_at';

const formatTargetDigits = (value = '', currency = 'INR') => {
  const digits = sanitizeTargetDigits(value);
  if (!digits) return '';
  return formatINR(Number(digits), currency);
};

const formatLastUpdated = (value = '') => {
  if (!value) return '';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return String(value);
  return date.toLocaleString('en-IN', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit'
  });
};

const stripSettingsMetadata = (data = {}) => {
  const next = { ...(data || {}) };
  delete next[TARGETS_LAST_UPDATED_KEY];
  return next;
};

const normalizeSettingsForm = (data = {}) => {
  const normalized = stripSettingsMetadata(data);
  ASSET_TARGET_CATEGORIES.forEach((category) => {
    const key = targetSettingKey(category);
    normalized[key] = sanitizeTargetDigits(normalized[key]);
  });
  return normalized;
};

export default function SettingsScreen({
  premiumActive = false,
  onOpenSubscription,
  preferredCurrency = 'INR',
  readOnly = false,
  accessRole = 'admin',
  subscriptionActive = true,
  onRequestScrollTo = () => {}
}) {
  const { theme } = useTheme();
  const { t } = useI18n();
  const readOnlyDueToFamilyRole = readOnly && String(accessRole || '').toLowerCase() === 'read' && subscriptionActive;
  const lockedText = readOnlyDueToFamilyRole
    ? t('Read-only family access. Ask an admin to change your role to Write or Admin to edit targets.')
    : readOnly
      ? t('Subscription expired. Renew to edit targets.')
      : t('Targets are available with Premium.');
  const [form, setForm] = useState({});
  const [message, setMessage] = useState('');
  const [focusedTargetKey, setFocusedTargetKey] = useState('');
  const [targetsLastUpdatedAt, setTargetsLastUpdatedAt] = useState('');
  const fieldOffsetsRef = useRef({});

  useEffect(() => {
    api.getSettings()
      .then((data) => {
        setTargetsLastUpdatedAt(String(data?.[TARGETS_LAST_UPDATED_KEY] || ''));
        setForm(normalizeSettingsForm(data));
      })
      .catch((e) => setMessage(e.message));
  }, []);

  const setFieldOffset = useCallback((key, layoutY) => {
    const y = Number(layoutY);
    fieldOffsetsRef.current[key] = Number.isFinite(y) ? Math.max(0, y - 18) : 0;
  }, []);

  const scrollToField = useCallback(
    (key) => {
      if (typeof onRequestScrollTo !== 'function') return;
      const targetY = fieldOffsetsRef.current[key];
      onRequestScrollTo(Number.isFinite(targetY) ? targetY : 0);
    },
    [onRequestScrollTo]
  );

  const save = async () => {
    const saved = await api.upsertSettings(stripSettingsMetadata(form));
    setTargetsLastUpdatedAt(String(saved?.[TARGETS_LAST_UPDATED_KEY] || ''));
    setForm(normalizeSettingsForm(saved));
    setMessage(t('Settings saved.'));
  };

  if (!premiumActive || (readOnly && !readOnlyDueToFamilyRole)) {
    return (
      <View>
      <SectionCard title={t('Targets (Premium)')}>
        <Text style={[styles.lockedText, { color: theme.warn }]}>
          {lockedText}
        </Text>
        {!readOnlyDueToFamilyRole ? <PillButton label={t('Upgrade to Premium')} onPress={onOpenSubscription} /> : null}
      </SectionCard>
      </View>
    );
  }

  return (
    <View>
      <SectionCard title={t('Targets')}>
        {!!targetsLastUpdatedAt && (
          <Text style={[styles.lastUpdated, { color: theme.muted }]}>
            {t('Last updated: {value}', { value: formatLastUpdated(targetsLastUpdatedAt) })}
          </Text>
        )}
        {readOnlyDueToFamilyRole ? (
          <>
            <Text style={[styles.lockedText, styles.readOnlyText, { color: theme.warn }]}>{lockedText}</Text>
            <Text style={[styles.label, { color: theme.muted }]}>{t('Target Date (YYYY-MM-DD)')}</Text>
            <Text style={[styles.readOnlyValue, { color: theme.text, borderColor: theme.border, backgroundColor: theme.card }]}>
              {String(form.target_date || '—')}
            </Text>

            {ASSET_TARGET_CATEGORIES.map((category) => {
              const key = targetSettingKey(category);
              return (
                <View key={key}>
                  <Text style={[styles.label, { color: theme.muted }]}>{getCategoryDisplayLabel(category, t)}</Text>
                  <Text style={[styles.readOnlyValue, { color: theme.text, borderColor: theme.border, backgroundColor: theme.card }]}>
                    {formatTargetDigits(form[key], preferredCurrency) || t('0')}
                  </Text>
                </View>
              );
            })}
          </>
        ) : (
          <>
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
                  <Text style={[styles.label, { color: theme.muted }]}>{getCategoryDisplayLabel(category, t)}</Text>
                  <TextInput
                    onLayout={(event) => setFieldOffset(key, event.nativeEvent.layout.y)}
                    onFocus={() => {
                      setFocusedTargetKey(key);
                      scrollToField(key);
                    }}
                    onBlur={() => {
                      setFocusedTargetKey((current) => (current === key ? '' : current));
                    }}
                    style={[styles.input, { backgroundColor: theme.inputBg, borderColor: theme.border, color: theme.inputText }]}
                    keyboardType="number-pad"
                    placeholder={t('0')}
                    value={
                      focusedTargetKey === key
                        ? sanitizeTargetDigits(form[key])
                        : formatTargetDigits(form[key], preferredCurrency)
                    }
                    onChangeText={(v) =>
                      setForm((prev) => ({
                        ...prev,
                        [key]: sanitizeTargetDigits(v)
                      }))
                    }
                    placeholderTextColor={theme.muted}
                  />
                </View>
              );
            })}
            <PillButton label={t('Set My Targets')} onPress={() => save().catch((e) => setMessage(e.message))} />
          </>
        )}
      </SectionCard>

      {!!message && <Text style={[styles.message, { color: theme.text }]}>{message}</Text>}
    </View>
  );
}

const styles = StyleSheet.create({
  lastUpdated: { marginBottom: 10, fontWeight: '600' },
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
  readOnlyText: {
    fontWeight: '700'
  },
  readOnlyValue: {
    borderWidth: 1,
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 12,
    marginBottom: 12
  },
  message: { color: '#0f3557', marginBottom: 20, fontWeight: '600' },
  lockedText: { color: '#607d99', marginBottom: 10 }
});
