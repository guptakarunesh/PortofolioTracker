import React, { useEffect, useState, useCallback, useRef } from 'react';
import { View, Text, TextInput, StyleSheet, Pressable } from 'react-native';
import { api } from '../api/client';
import FeedbackBanner from '../components/FeedbackBanner';
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

const ALERT_DAYS_OPTIONS = ['1', '2', '3', '5', '7'];
const REPEAT_OPTIONS = [
  { key: 'one_time', label: 'One Time' },
  { key: 'daily', label: 'Daily' },
  { key: 'weekly', label: 'Weekly' },
  { key: 'every_x_days', label: 'Every X Days' },
  { key: 'monthly', label: 'Monthly' },
  { key: 'yearly', label: 'Yearly' }
];

const repeatLabel = (repeatType, repeatEveryDays, t) => {
  const type = String(repeatType || 'one_time');
  if (type === 'every_x_days') return t('Every {count} Days', { count: repeatEveryDays || 0 });
  return t(REPEAT_OPTIONS.find((option) => option.key === type)?.label || 'One Time');
};

const displayAmount = (value, hideSensitive, currency, fxRates) =>
  hideSensitive ? '••••••' : formatAmountFromInr(value, currency, fxRates);

const startOfToday = () => {
  const date = new Date();
  date.setHours(0, 0, 0, 0);
  return date;
};

const toIsoDate = (date) => {
  const value = date instanceof Date ? date : new Date(date);
  if (Number.isNaN(value.getTime())) return '';
  const year = value.getFullYear();
  const month = String(value.getMonth() + 1).padStart(2, '0');
  const day = String(value.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
};

const tomorrowIsoDate = () => {
  const date = startOfToday();
  date.setDate(date.getDate() + 1);
  return toIsoDate(date);
};

const createEmptyReminderForm = () => ({
  due_date: tomorrowIsoDate(),
  category: REMINDER_CATEGORY_OPTIONS[0],
  description: '',
  amount: '',
  alert_days_before: ALERT_DAYS_OPTIONS[3],
  repeat_type: 'one_time',
  repeat_every_days: '2'
});

export default function RemindersScreen({
  hideSensitive = false,
  preferredCurrency = 'INR',
  fxRates = { INR: 1 },
  premiumActive = false,
  onOpenSubscription,
  readOnly = false,
  accessRole = 'admin',
  subscriptionActive = true,
  onRemindersChanged = () => {},
  onRequestScrollTo = () => {}
}) {
  const { theme } = useTheme();
  const { t } = useI18n();
  const isLight = theme.key === 'light';
  const [items, setItems] = useState([]);
  const [form, setForm] = useState(createEmptyReminderForm);
  const [editingReminderId, setEditingReminderId] = useState(null);
  const [message, setMessage] = useState('');
  const [messageKind, setMessageKind] = useState('info');
  const [showCategoryOptions, setShowCategoryOptions] = useState(false);
  const [showAlertOptions, setShowAlertOptions] = useState(false);
  const [showRepeatOptions, setShowRepeatOptions] = useState(false);
  const descriptionInputRef = useRef(null);
  const amountInputRef = useRef(null);
  const repeatEveryDaysInputRef = useRef(null);
  const fieldOffsetsRef = useRef({});
  const minimumReminderDate = startOfToday();
  const readOnlyDueToFamilyRole = readOnly && String(accessRole || '').toLowerCase() === 'read' && subscriptionActive;
  const readOnlyBannerText = readOnlyDueToFamilyRole
    ? t('Read-only family access. Ask an admin to change your role to Write or Admin to edit.')
    : t('Subscription expired. View-only mode.');
  const readOnlyActionText = readOnlyDueToFamilyRole
    ? t('Read-only family access. Ask an admin to change your role to Write or Admin to edit reminders.')
    : t('Subscription expired. Renew to edit reminders.');

  const load = useCallback(async () => {
    const rows = await api.getReminders();
    setItems(rows);
  }, []);

  useEffect(() => {
    load().catch((e) => {
      setMessage(e.message);
      setMessageKind('error');
    });
  }, [load]);

  useEffect(() => {
    if (!message) return undefined;
    const timer = setTimeout(() => setMessage(''), 5000);
    return () => clearTimeout(timer);
  }, [message]);

  const setFieldOffset = useCallback((key, layoutY) => {
    const y = Number(layoutY);
    fieldOffsetsRef.current[key] = Number.isFinite(y) ? Math.max(0, y - 18) : 0;
  }, []);

  const scrollToField = useCallback(
    (key) => {
      if (typeof onRequestScrollTo !== 'function') return;
      if (!key) {
        onRequestScrollTo(0);
        return;
      }
      const targetY = fieldOffsetsRef.current[key];
      onRequestScrollTo(Number.isFinite(targetY) ? targetY : 0);
    },
    [onRequestScrollTo]
  );

  const submit = async () => {
    if (readOnly) {
      setMessage(readOnlyActionText);
      setMessageKind('error');
      return;
    }
    if (!form.due_date || !form.category || !form.description) {
      setMessage(t('Due date, category and description are required.'));
      setMessageKind('error');
      return;
    }
    if (String(form.due_date) < toIsoDate(minimumReminderDate)) {
      setMessage(t('Due date cannot be in the past.'));
      setMessageKind('error');
      return;
    }
    if (form.repeat_type === 'every_x_days') {
      const interval = Number(form.repeat_every_days || 0);
      if (!Number.isInteger(interval) || interval < 2 || interval > 365) {
        setMessage(t('Enter a valid repeat interval between 2 and 365 days.'));
        setMessageKind('error');
        return;
      }
    }
    const payload = {
      ...form,
      amount: Number(form.amount || 0),
      alert_days_before: Number(form.alert_days_before || 7),
      repeat_every_days: form.repeat_type === 'every_x_days' ? Number(form.repeat_every_days || 0) : null,
      status: 'Pending'
    };
    if (editingReminderId) {
      await api.updateReminder(editingReminderId, payload);
    } else {
      await api.createReminder(payload);
    }
    setForm(createEmptyReminderForm());
    setEditingReminderId(null);
    setShowCategoryOptions(false);
    setShowAlertOptions(false);
    setShowRepeatOptions(false);
    setMessage(editingReminderId ? t('Reminder updated.') : t('Reminder added.'));
    setMessageKind('success');
    onRemindersChanged();
    await load();
  };

  const startEdit = (item) => {
    if (readOnly) {
      setMessage(readOnlyActionText);
      setMessageKind('error');
      return;
    }
    setEditingReminderId(item.id);
    setForm({
      due_date: String(item.due_date || ''),
      category: String(item.category || REMINDER_CATEGORY_OPTIONS[0]),
      description: String(item.description || ''),
      amount: Number(item.amount || 0) ? String(item.amount) : '',
      alert_days_before: String(item.alert_days_before || ALERT_DAYS_OPTIONS[3]),
      repeat_type: String(item.repeat_type || 'one_time'),
      repeat_every_days: String(item.repeat_every_days || '2')
    });
    setShowCategoryOptions(false);
    setShowAlertOptions(false);
    setShowRepeatOptions(false);
    scrollToField();
  };

  const cancelEdit = () => {
    setEditingReminderId(null);
    setForm(createEmptyReminderForm());
    setShowCategoryOptions(false);
    setShowAlertOptions(false);
    setShowRepeatOptions(false);
  };

  const markComplete = async (id) => {
    if (readOnly) {
      setMessage(readOnlyActionText);
      setMessageKind('error');
      return;
    }
    const current = items.find((item) => item.id === id);
    await api.updateReminderStatus(id, 'Completed');
    setMessage(
      String(current?.repeat_type || 'one_time') === 'one_time'
        ? t('Reminder marked complete.')
        : t('Recurring reminder moved to the next occurrence.')
    );
    setMessageKind('success');
    onRemindersChanged();
    await load();
  };

  const snoozeReminder = async (id) => {
    if (readOnly) {
      setMessage(readOnlyActionText);
      setMessageKind('error');
      return;
    }
    await api.snoozeReminder(id, 1);
    setMessage(t('Reminder snoozed by 1 day.'));
    setMessageKind('success');
    onRemindersChanged();
    await load();
  };

  if (!premiumActive) {
    return (
      <View>
        <SectionCard title={t('Reminders (Premium)')}>
          <View style={styles.premiumLockedWrap}>
            <Text style={[styles.sub, styles.premiumLockedText, { color: theme.warn }]}>{t('Reminders are available with Premium.')}</Text>
            <PillButton label={t('Upgrade to Premium')} onPress={onOpenSubscription} />
          </View>
        </SectionCard>
      </View>
    );
  }

  const latestReminderUpdate = items.reduce((latest, item) => {
    const current = Date.parse(String(item?.updated_at || ''));
    if (!Number.isFinite(current)) return latest;
    const value = String(item.updated_at).replace('T', ' ').slice(0, 19);
    return !latest || current > latest.ts ? { ts: current, value } : latest;
  }, null);

  return (
    <View>
      {!readOnlyDueToFamilyRole ? (
      <SectionCard title={t(editingReminderId ? 'Edit Reminder' : 'Add Reminder')}>
        <Text style={[styles.label, { color: theme.muted }]}>{t('Due Date (YYYY-MM-DD)')}</Text>
        <DateField
          value={form.due_date}
          onChange={(v) => setForm((f) => ({ ...f, due_date: v }))}
          theme={theme}
          placeholder="YYYY-MM-DD"
          minimumDate={minimumReminderDate}
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
                  form.category === category && { backgroundColor: isLight ? theme.accentSoft : '#155EAF' }
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
                    form.category === category && { color: isLight ? theme.accent : '#FFFFFF', fontWeight: '700' }
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
          ref={descriptionInputRef}
          onLayout={(event) => setFieldOffset('description', event.nativeEvent.layout.y)}
          onFocus={() => scrollToField('description')}
          style={[styles.input, { backgroundColor: theme.inputBg, borderColor: theme.border, color: theme.inputText }]}
          value={form.description}
          onChangeText={(v) => setForm((f) => ({ ...f, description: v }))}
        />
        <Text style={[styles.label, { color: theme.muted }]}>{t('Amount')}</Text>
        <TextInput
          ref={amountInputRef}
          onLayout={(event) => setFieldOffset('amount', event.nativeEvent.layout.y)}
          onFocus={() => scrollToField('amount')}
          style={[styles.input, { backgroundColor: theme.inputBg, borderColor: theme.border, color: theme.inputText }]}
          keyboardType="numeric"
          value={form.amount}
          onChangeText={(v) => setForm((f) => ({ ...f, amount: v }))}
        />
        <Text style={[styles.label, { color: theme.muted }]}>{t('Repeats')}</Text>
        <Pressable
          style={[styles.dropdownTrigger, { borderColor: theme.border, backgroundColor: theme.inputBg }]}
          onPress={() => setShowRepeatOptions((v) => !v)}
        >
          <Text style={[styles.dropdownText, { color: theme.inputText }]}>
            {repeatLabel(form.repeat_type, form.repeat_every_days, t)}
          </Text>
          <Text style={[styles.dropdownArrow, { color: theme.muted }]}>{showRepeatOptions ? '▲' : '▼'}</Text>
        </Pressable>
        {showRepeatOptions ? (
          <View style={[styles.dropdownMenu, { borderColor: theme.border, backgroundColor: theme.card }]}>
            {REPEAT_OPTIONS.map((option) => (
              <Pressable
                key={option.key}
                style={[
                  styles.dropdownItem,
                  { borderBottomColor: theme.border },
                  form.repeat_type === option.key && { backgroundColor: isLight ? theme.accentSoft : '#155EAF' }
                ]}
                onPress={() => {
                  setForm((f) => ({
                    ...f,
                    repeat_type: option.key,
                    repeat_every_days: option.key === 'every_x_days' ? (f.repeat_every_days || '2') : f.repeat_every_days
                  }));
                  setShowRepeatOptions(false);
                }}
              >
                <Text
                  style={[
                    styles.dropdownItemText,
                    { color: theme.text },
                    form.repeat_type === option.key && { color: isLight ? theme.accent : '#FFFFFF', fontWeight: '700' }
                  ]}
                >
                  {t(option.label)}
                </Text>
              </Pressable>
            ))}
          </View>
        ) : null}
        {form.repeat_type === 'every_x_days' ? (
          <>
            <Text style={[styles.label, { color: theme.muted }]}>{t('Every X Days')}</Text>
            <TextInput
              ref={repeatEveryDaysInputRef}
              onLayout={(event) => setFieldOffset('repeat_every_days', event.nativeEvent.layout.y)}
              onFocus={() => scrollToField('repeat_every_days')}
              style={[styles.input, { backgroundColor: theme.inputBg, borderColor: theme.border, color: theme.inputText }]}
              keyboardType="number-pad"
              value={String(form.repeat_every_days || '')}
              onChangeText={(v) => setForm((f) => ({ ...f, repeat_every_days: String(v || '').replace(/\D/g, '') }))}
              placeholder={t('2')}
              placeholderTextColor={theme.muted}
            />
          </>
        ) : null}
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
                  form.alert_days_before === days && { backgroundColor: isLight ? theme.accentSoft : '#155EAF' }
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
                    form.alert_days_before === days && { color: isLight ? theme.accent : '#FFFFFF', fontWeight: '700' }
                  ]}
                >
                  {t('{count} day(s)', { count: days })}
                </Text>
              </Pressable>
            ))}
          </View>
        ) : null}
        <View style={styles.formActions}>
          <PillButton
            label={t(editingReminderId ? 'Update Reminder' : 'Save Reminder')}
            onPress={() =>
              submit().catch((e) => {
                setMessage(e.message);
                setMessageKind('error');
              })
            }
          />
          {editingReminderId ? <PillButton label={t('Cancel Edit')} kind="ghost" onPress={cancelEdit} /> : null}
        </View>
      </SectionCard>
      ) : null}

      <FeedbackBanner message={message} kind={messageKind} />

      <SectionCard title={t('Upcoming Reminders')}>
        {readOnlyDueToFamilyRole ? (
          <>
            <Text style={[styles.sub, styles.readOnlyText, { color: theme.warn }]}>{readOnlyBannerText}</Text>
            {latestReminderUpdate?.value ? (
              <Text style={[styles.sub, { color: theme.muted, marginBottom: 8 }]}>
                {t('Last updated: {value}', { value: latestReminderUpdate.value })}
              </Text>
            ) : null}
          </>
        ) : null}
        {items.length ? items.map((item) => (
          <View key={item.id} style={[styles.row, { borderColor: theme.border, backgroundColor: theme.card }]}>
            <View style={styles.rowHeader}>
              <View style={styles.rowHeaderText}>
                <Text style={[styles.name, { color: theme.text }]}>{item.description}</Text>
                <Text style={[styles.sub, { color: theme.muted }]}>
                  {t('{category} · {date}', { category: t(item.category), date: formatDate(item.due_date) })}
                </Text>
              </View>
              <View
                style={[
                  styles.statusBadge,
                  {
                    backgroundColor:
                      item.status === 'Completed'
                        ? (isLight ? '#E8F7F2' : 'rgba(22,170,138,0.18)')
                        : (isLight ? '#EEF5FF' : 'rgba(36,178,214,0.18)'),
                    borderColor:
                      item.status === 'Completed'
                        ? (isLight ? '#B7E7DA' : 'rgba(22,170,138,0.3)')
                        : (isLight ? '#CFE3FF' : 'rgba(36,178,214,0.3)')
                  }
                ]}
              >
                <Text
                  style={[
                    styles.statusBadgeText,
                    {
                      color:
                        item.status === 'Completed'
                          ? (isLight ? '#0E8A72' : '#7CE5C6')
                          : (isLight ? '#1B6FCC' : '#8FDEEF')
                    }
                  ]}
                >
                  {t(item.status)}
                </Text>
              </View>
            </View>
            <View style={styles.rowMeta}>
              <Text style={[styles.sub, { color: theme.muted }]}>
                {t('Repeats: {value}', { value: repeatLabel(item.repeat_type, item.repeat_every_days, t) })}
              </Text>
              <Text style={[styles.amount, { color: theme.text }]}>
                {displayAmount(item.amount, hideSensitive, preferredCurrency, fxRates)}
              </Text>
            </View>
            {item.status !== 'Completed' && !readOnlyDueToFamilyRole ? (
              <View style={styles.rowActions}>
                <PillButton
                  label={t('Edit')}
                  kind="ghost"
                  style={styles.rowActionButton}
                  textStyle={styles.rowActionText}
                  onPress={() => startEdit(item)}
                />
                <PillButton
                  label={t('Snooze +1d')}
                  kind="ghost"
                  style={styles.rowActionButton}
                  textStyle={styles.rowActionText}
                  onPress={() =>
                    snoozeReminder(item.id).catch((e) => {
                      setMessage(e.message);
                      setMessageKind('error');
                    })
                  }
                />
                <PillButton
                  label={t('Done')}
                  style={styles.rowActionButtonPrimary}
                  textStyle={styles.rowActionText}
                  onPress={() =>
                    markComplete(item.id).catch((e) => {
                      setMessage(e.message);
                      setMessageKind('error');
                    })
                  }
                />
              </View>
            ) : null}
          </View>
        )) : <Text style={[styles.sub, { color: theme.muted }]}>{t('No active reminders yet.')}</Text>}
      </SectionCard>
    </View>
  );
}

const styles = StyleSheet.create({
  premiumLockedWrap: {
    gap: 12
  },
  formActions: {
    gap: 10
  },
  premiumLockedText: {
    marginBottom: 2
  },
  readOnlyText: {
    marginBottom: 10,
    fontWeight: '700'
  },
  label: { fontWeight: '700', marginBottom: 5 },
  dropdownTrigger: {
    borderWidth: 1,
    borderColor: '#D9E2EF',
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 10,
    marginBottom: 10,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center'
  },
  dropdownText: {
    color: '#0B1F3A'
  },
  dropdownArrow: {
    color: '#64748B',
    fontSize: 12
  },
  dropdownMenu: {
    borderWidth: 1,
    borderColor: '#D9E2EF',
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    marginBottom: 12,
    overflow: 'hidden'
  },
  dropdownItem: {
    paddingHorizontal: 10,
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: '#D9E2EF'
  },
  dropdownItemActive: {
    backgroundColor: '#E8F7F2'
  },
  dropdownItemText: {
    color: '#0B1F3A'
  },
  dropdownItemTextActive: {
    color: '#0E8A72',
    fontWeight: '700'
  },
  input: {
    borderWidth: 1,
    borderColor: '#D9E2EF',
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 10,
    marginBottom: 12
  },
  row: {
    paddingVertical: 14,
    paddingHorizontal: 14,
    borderWidth: 1,
    borderColor: '#D9E2EF',
    borderRadius: 18,
    backgroundColor: '#FFFFFF',
    marginBottom: 10,
    gap: 10,
    shadowColor: '#0B1F3A',
    shadowOpacity: 0.05,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 6 },
    elevation: 2
  },
  rowHeader: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: 12
  },
  rowHeaderText: {
    flex: 1,
    gap: 4
  },
  rowMeta: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: 12,
    flexWrap: 'wrap'
  },
  rowActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    flexWrap: 'wrap'
  },
  rowActionButton: {
    minHeight: 38,
    paddingVertical: 9,
    paddingHorizontal: 14,
    borderRadius: 14
  },
  rowActionButtonPrimary: {
    minHeight: 38,
    paddingVertical: 9,
    paddingHorizontal: 18,
    borderRadius: 14
  },
  rowActionText: {
    fontSize: 13,
    lineHeight: 17
  },
  statusBadge: {
    borderWidth: 1,
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 6
  },
  statusBadgeText: {
    fontSize: 12,
    fontWeight: '800',
    letterSpacing: 0.2
  },
  name: { color: '#0B1F3A', fontWeight: '800', fontSize: 16, lineHeight: 21 },
  sub: { color: '#64748B' },
  amount: { color: '#0B1F3A', fontWeight: '800', fontSize: 15 },
  message: { color: '#0B1F3A', marginBottom: 20, fontWeight: '600' }
});
