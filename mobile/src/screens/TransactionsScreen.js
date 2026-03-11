import React, { useEffect, useState, useCallback } from 'react';
import { View, Text, TextInput, StyleSheet, Pressable } from 'react-native';
import { api } from '../api/client';
import SectionCard from '../components/SectionCard';
import PillButton from '../components/PillButton';
import DateField from '../components/DateField';
import { formatDate, formatINR } from '../utils/format';
import { useTheme } from '../theme';
import { useI18n } from '../i18n';

const TRANSACTION_CATEGORY_OPTIONS = [
  'Banking & Deposits',
  'Market Investments',
  'Precious Metals',
  'Real Estate',
  'Retirement Funds',
  'Insurance (Cash Value)',
  'Other Assets'
];

const TRANSACTION_TYPE_OPTIONS = [
  'Buy',
  'Sell',
  'SIP',
  'SWP',
  'Deposit',
  'Withdrawal',
  'Dividend',
  'Interest',
  'EMI',
  'Transfer'
];

const displayAmount = (value, hideSensitive) => (hideSensitive ? '••••••' : formatINR(value));

export default function TransactionsScreen({ hideSensitive = false, readOnly = false }) {
  const { theme } = useTheme();
  const { t } = useI18n();
  const [items, setItems] = useState([]);
  const [form, setForm] = useState({
    tx_date: '2026-02-16',
    category: TRANSACTION_CATEGORY_OPTIONS[1],
    tx_type: TRANSACTION_TYPE_OPTIONS[0],
    asset_name: '',
    amount: ''
  });
  const [message, setMessage] = useState('');
  const [showCategoryOptions, setShowCategoryOptions] = useState(false);
  const [showTypeOptions, setShowTypeOptions] = useState(false);

  const load = useCallback(async () => {
    const rows = await api.getTransactions();
    setItems(rows);
  }, []);

  useEffect(() => {
    load().catch((e) => setMessage(e.message));
  }, [load]);

  const submit = async () => {
    if (readOnly) {
      setMessage(t('Subscription expired. Renew to edit transactions.'));
      return;
    }
    if (!form.tx_date || !form.category || !form.tx_type || !form.amount) {
      setMessage(t('Date, category, type and amount are required.'));
      return;
    }
    await api.createTransaction({
      ...form,
      amount: Number(form.amount)
    });
    setForm((f) => ({ ...f, asset_name: '', amount: '' }));
    setShowCategoryOptions(false);
    setShowTypeOptions(false);
    setMessage(t('Transaction added.'));
    await load();
  };

  return (
    <View>
      <SectionCard title={t('Add Transaction')}>
        {readOnly ? <Text style={[styles.readOnlyText, { color: theme.warn }]}>{t('Subscription expired. View-only mode.')}</Text> : null}
        <Text style={[styles.label, { color: theme.muted }]}>{t('Date (YYYY-MM-DD)')}</Text>
        <DateField
          value={form.tx_date}
          onChange={(v) => setForm((f) => ({ ...f, tx_date: v }))}
          theme={theme}
          placeholder="YYYY-MM-DD"
          disabled={readOnly}
        />
        <Text style={[styles.label, { color: theme.muted }]}>{t('Category')}</Text>
        <Pressable
          style={[styles.dropdownTrigger, { borderColor: theme.border, backgroundColor: theme.inputBg }]}
          disabled={readOnly}
          onPress={() => setShowCategoryOptions((v) => !v)}
        >
          <Text style={[styles.dropdownText, { color: theme.inputText }]}>{t(form.category || 'Select category')}</Text>
          <Text style={[styles.dropdownArrow, { color: theme.muted }]}>{showCategoryOptions ? '▲' : '▼'}</Text>
        </Pressable>
        {showCategoryOptions ? (
          <View style={[styles.dropdownMenu, { borderColor: theme.border, backgroundColor: theme.card }]}>
            {TRANSACTION_CATEGORY_OPTIONS.map((category) => (
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
        <Text style={[styles.label, { color: theme.muted }]}>{t('Type (Buy/Sell/Deposit...)')}</Text>
        <Pressable
          style={[styles.dropdownTrigger, { borderColor: theme.border, backgroundColor: theme.inputBg }]}
          disabled={readOnly}
          onPress={() => setShowTypeOptions((v) => !v)}
        >
          <Text style={[styles.dropdownText, { color: theme.inputText }]}>{t(form.tx_type || 'Select transaction type')}</Text>
          <Text style={[styles.dropdownArrow, { color: theme.muted }]}>{showTypeOptions ? '▲' : '▼'}</Text>
        </Pressable>
        {showTypeOptions ? (
          <View style={[styles.dropdownMenu, { borderColor: theme.border, backgroundColor: theme.card }]}>
            {TRANSACTION_TYPE_OPTIONS.map((txType) => (
              <Pressable
                key={txType}
                style={[
                  styles.dropdownItem,
                  { borderBottomColor: theme.border },
                  form.tx_type === txType && { backgroundColor: theme.accentSoft }
                ]}
                onPress={() => {
                  setForm((f) => ({ ...f, tx_type: txType }));
                  setShowTypeOptions(false);
                }}
              >
                <Text
                  style={[
                    styles.dropdownItemText,
                    { color: theme.text },
                    form.tx_type === txType && { color: theme.accent, fontWeight: '700' }
                  ]}
                >
                  {t(txType)}
                </Text>
              </Pressable>
            ))}
          </View>
        ) : null}
        <Text style={[styles.label, { color: theme.muted }]}>{t('Asset Name')}</Text>
        <TextInput
          style={[
            styles.input,
            { backgroundColor: theme.inputBg, borderColor: theme.border, color: theme.inputText },
            readOnly && { backgroundColor: theme.background, color: theme.muted }
          ]}
          value={form.asset_name}
          onChangeText={(v) => setForm((f) => ({ ...f, asset_name: v }))}
          editable={!readOnly}
        />
        <Text style={[styles.label, { color: theme.muted }]}>{t('Amount (INR)')}</Text>
        <TextInput
          style={[
            styles.input,
            { backgroundColor: theme.inputBg, borderColor: theme.border, color: theme.inputText },
            readOnly && { backgroundColor: theme.background, color: theme.muted }
          ]}
          keyboardType="numeric"
          value={form.amount}
          onChangeText={(v) => setForm((f) => ({ ...f, amount: v }))}
          editable={!readOnly}
        />
        <PillButton label={t('Save Transaction')} onPress={() => submit().catch((e) => setMessage(e.message))} disabled={readOnly} />
      </SectionCard>

      <SectionCard title={t('Recent Transactions')}>
        {items.map((item) => (
          <View key={item.id} style={[styles.row, { borderColor: theme.border, backgroundColor: theme.card }]}>
            <View style={{ flex: 1 }}>
              <Text style={[styles.name, { color: theme.text }]}>{t('{category} · {type}', { category: t(item.category), type: t(item.tx_type) })}</Text>
              <Text style={[styles.sub, { color: theme.muted }]}>{t('{name} · {date}', { name: item.asset_name || '-', date: formatDate(item.tx_date) })}</Text>
            </View>
            <Text style={[styles.amount, { color: theme.text }]}>{displayAmount(item.amount, hideSensitive)}</Text>
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
  inputDisabled: {
    backgroundColor: '#f2f4f7',
    color: '#8aa0b6'
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
  name: { color: '#0f3557', fontWeight: '800' },
  sub: { color: '#607d99' },
  amount: { color: '#0f3557', fontWeight: '800' },
  message: { color: '#0f3557', marginBottom: 20, fontWeight: '600' },
  readOnlyText: { color: '#9a6b00', fontWeight: '700', marginBottom: 8 }
});
