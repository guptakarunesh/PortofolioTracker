import React, { useEffect, useState, useCallback } from 'react';
import { View, Text, TextInput, StyleSheet, Pressable } from 'react-native';
import { api } from '../api/client';
import SectionCard from '../components/SectionCard';
import PillButton from '../components/PillButton';
import DateField from '../components/DateField';
import { formatDate, formatAmountFromInr } from '../utils/format';
import { useTheme } from '../theme';
import { useI18n } from '../i18n';

const REMINDER_CATEGORY_OPTIONS = [
  'Insurance',
  'EMI',
  'Investment',
  'Bill Payment',
  'Tax',
  'Banking',
  'Other'
];

const ALERT_DAYS_OPTIONS = ['3', '7', '10', '15', '30'];

const displayAmount = (value, hideSensitive, currency, fxRates) =>
  hideSensitive ? '••••••' : formatAmountFromInr(value, currency, fxRates);

export default function RemindersScreen({
  hideSensitive = false,
  preferredCurrency = 'INR',
  fxRates = { INR: 1 },
  premiumActive = false,
  onOpenSubscription,
  onRemindersChanged = () => {}
}) {
  const { theme } = useTheme();
  const { t } = useI18n();
  const [items, setItems] = useState([]);
  const [form, setForm] = useState({
    due_date: '2026-04-01',
    category: REMINDER_CATEGORY_OPTIONS[0],
    description: '',
    amount: '',
    alert_days_before: ALERT_DAYS_OPTIONS[3]
  });
  const [message, setMessage] = useState('');
  const [showCategoryOptions, setShowCategoryOptions] = useState(false);
  const [showAlertOptions, setShowAlertOptions] = useState(false);

  const load = useCallback(async () => {
    const rows = await api.getReminders();
    setItems(rows);
  }, []);

  useEffect(() => {
    load().catch((e) => setMessage(e.message));
  }, [load]);

  const submit = async () => {
    if (!form.due_date || !form.category || !form.description) {
      setMessage(t('Due date, category and description are required.'));
      return;
    }
    await api.createReminder({
      ...form,
      amount: Number(form.amount || 0),
      alert_days_before: Number(form.alert_days_before || 7),
      status: 'Pending'
    });
    setForm((f) => ({ ...f, description: '', amount: '' }));
    setShowCategoryOptions(false);
    setShowAlertOptions(false);
    setMessage(t('Reminder added.'));
    onRemindersChanged();
    await load();
  };

  const markComplete = async (id) => {
    await api.updateReminderStatus(id, 'Completed');
    onRemindersChanged();
    await load();
  };

  const snoozeReminder = async (id) => {
    await api.snoozeReminder(id, 1);
    setMessage(t('Reminder snoozed by 1 day.'));
    onRemindersChanged();
    await load();
  };

  if (!premiumActive) {
    return (
      <View>
        <SectionCard title={t('Reminders (Premium)')}>
          <Text style={[styles.sub, { color: theme.warn }]}>{t('Reminders are available with Premium.')}</Text>
          <PillButton label={t('Upgrade to Premium')} onPress={onOpenSubscription} />
        </SectionCard>
      </View>
    );
  }

  return (
    <View>
      <SectionCard title={t('Add Reminder')}>
        <Text style={[styles.label, { color: theme.muted }]}>{t('Due Date (YYYY-MM-DD)')}</Text>
        <DateField
          value={form.due_date}
          onChange={(v) => setForm((f) => ({ ...f, due_date: v }))}
          theme={theme}
          placeholder="YYYY-MM-DD"
        />
        <Text style={[styles.label, { color: theme.muted }]}>{t('Category')}</Text>
        <Pressable
          style={[styles.dropdownTrigger, { borderColor: theme.border, backgroundColor: theme.inputBg }]}
          onPress={() => setShowCategoryOptions((v) => !v)}
        >
          <Text style={[styles.dropdownText, { color: theme.inputText }]}>{t(form.category || 'Select category')}</Text>
          <Text style={[styles.dropdownArrow, { color: theme.muted }]}>{showCategoryOptions ? '▲' : '▼'}</Text>
        </Pressable>
        {showCategoryOptions ? (
          <View style={[styles.dropdownMenu, { borderColor: theme.border, backgroundColor: theme.card }]}>
            {REMINDER_CATEGORY_OPTIONS.map((category) => (
              <Pressable
                key={category}
                style={[
                  styles.dropdownItem,
                  { borderBottomColor: theme.border },
                  form.category === category && { backgroundColor: theme.accentSoft }
                ]}
                onPress={() => {
                  setForm((f) => ({ ...f, category }));
                  setShowCategoryOptions(false);
                }}
              >
                <Text
                  style={[
                    styles.dropdownItemText,
                    { color: theme.text },
                    form.category === category && { color: theme.accent, fontWeight: '700' }
                  ]}
                >
                  {t(category)}
                </Text>
              </Pressable>
            ))}
          </View>
        ) : null}
        <Text style={[styles.label, { color: theme.muted }]}>{t('Description')}</Text>
        <TextInput
          style={[styles.input, { backgroundColor: theme.inputBg, borderColor: theme.border, color: theme.inputText }]}
          value={form.description}
          onChangeText={(v) => setForm((f) => ({ ...f, description: v }))}
        />
        <Text style={[styles.label, { color: theme.muted }]}>{t('Amount')}</Text>
        <TextInput
          style={[styles.input, { backgroundColor: theme.inputBg, borderColor: theme.border, color: theme.inputText }]}
          keyboardType="numeric"
          value={form.amount}
          onChangeText={(v) => setForm((f) => ({ ...f, amount: v }))}
        />
        <Text style={[styles.label, { color: theme.muted }]}>{t('Alert Days Before')}</Text>
        <Pressable
          style={[styles.dropdownTrigger, { borderColor: theme.border, backgroundColor: theme.inputBg }]}
          onPress={() => setShowAlertOptions((v) => !v)}
        >
          <Text style={[styles.dropdownText, { color: theme.inputText }]}>{t('{count} day(s)', { count: form.alert_days_before })}</Text>
          <Text style={[styles.dropdownArrow, { color: theme.muted }]}>{showAlertOptions ? '▲' : '▼'}</Text>
        </Pressable>
        {showAlertOptions ? (
          <View style={[styles.dropdownMenu, { borderColor: theme.border, backgroundColor: theme.card }]}>
            {ALERT_DAYS_OPTIONS.map((days) => (
              <Pressable
                key={days}
                style={[
                  styles.dropdownItem,
                  { borderBottomColor: theme.border },
                  form.alert_days_before === days && { backgroundColor: theme.accentSoft }
                ]}
                onPress={() => {
                  setForm((f) => ({ ...f, alert_days_before: days }));
                  setShowAlertOptions(false);
                }}
              >
                <Text
                  style={[
                    styles.dropdownItemText,
                    { color: theme.text },
                    form.alert_days_before === days && { color: theme.accent, fontWeight: '700' }
                  ]}
                >
                  {t('{count} day(s)', { count: days })}
                </Text>
              </Pressable>
            ))}
          </View>
        ) : null}
        <PillButton label={t('Save Reminder')} onPress={() => submit().catch((e) => setMessage(e.message))} />
      </SectionCard>

      <SectionCard title={t('Upcoming Reminders')}>
        {items.map((item) => (
          <View key={item.id} style={[styles.row, { borderColor: theme.border, backgroundColor: theme.card }]}>
            <View style={{ flex: 1 }}>
              <Text style={[styles.name, { color: theme.text }]}>{item.description}</Text>
              <Text style={[styles.sub, { color: theme.muted }]}>{t('{category} · {date}', { category: t(item.category), date: formatDate(item.due_date) })}</Text>
              <Text style={[styles.sub, { color: theme.muted }]}>{t('Status: {value}', { value: t(item.status) })}</Text>
            </View>
            <View style={styles.right}>
              <Text style={[styles.amount, { color: theme.text }]}>{displayAmount(item.amount, hideSensitive, preferredCurrency, fxRates)}</Text>
              {item.status !== 'Completed' ? (
                <>
                  <PillButton
                    label={t('Snooze +1d')}
                    kind="ghost"
                    onPress={() => snoozeReminder(item.id).catch((e) => setMessage(e.message))}
                  />
                  <PillButton label={t('Done')} kind="ghost" onPress={() => markComplete(item.id).catch((e) => setMessage(e.message))} />
                </>
              ) : null}
            </View>
          </View>
        ))}
      </SectionCard>
      {!!message && <Text style={[styles.message, { color: theme.text }]}>{message}</Text>}
    </View>
  );
}

const styles = StyleSheet.create({
  label: { color: '#35526e', fontWeight: '700', marginBottom: 5 },
  dropdownTrigger: {
    borderWidth: 1,
    borderColor: '#c6d8eb',
    backgroundColor: '#fff',
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 10,
    marginBottom: 10,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center'
  },
  dropdownText: {
    color: '#183750'
  },
  dropdownArrow: {
    color: '#607d99',
    fontSize: 12
  },
  dropdownMenu: {
    borderWidth: 1,
    borderColor: '#c6d8eb',
    backgroundColor: '#fff',
    borderRadius: 12,
    marginBottom: 12,
    overflow: 'hidden'
  },
  dropdownItem: {
    paddingHorizontal: 10,
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: '#eef2f8'
  },
  dropdownItemActive: {
    backgroundColor: '#e9f2ff'
  },
  dropdownItemText: {
    color: '#183750'
  },
  dropdownItemTextActive: {
    color: '#0f5fb8',
    fontWeight: '700'
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
  row: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    paddingVertical: 10,
    paddingHorizontal: 10,
    borderWidth: 1,
    borderColor: '#e4ebf5',
    borderRadius: 12,
    backgroundColor: '#fbfdff',
    marginBottom: 8
  },
  right: { gap: 8, alignItems: 'flex-end' },
  name: { color: '#0f3557', fontWeight: '800' },
  sub: { color: '#607d99' },
  amount: { color: '#0f3557', fontWeight: '800' },
  message: { color: '#0f3557', marginBottom: 20, fontWeight: '600' }
});
