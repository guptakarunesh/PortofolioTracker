import React, { useEffect, useState, useCallback } from 'react';
import { View, Text, TextInput, StyleSheet, Pressable } from 'react-native';
import { api } from '../api/client';
import SectionCard from '../components/SectionCard';
import PillButton from '../components/PillButton';
import { formatAmountFromInr } from '../utils/format';
import { useTheme } from '../theme';

const LOAN_TYPE_OPTIONS = [
  'Home Loan',
  'Car Loan',
  'Personal Loan',
  'Education Loan',
  'Credit Card',
  'Business Loan',
  'Gold Loan',
  'Other'
];

const blankForm = { loan_type: LOAN_TYPE_OPTIONS[0], lender: '', outstanding_amount: '' };

const displayAmount = (value, hideSensitive, currency, fxRates) =>
  hideSensitive ? '••••••' : formatAmountFromInr(value, currency, fxRates);

export default function LiabilitiesScreen({
  hideSensitive = false,
  preferredCurrency = 'INR',
  fxRates = { INR: 1 },
  readOnly = false
}) {
  const { theme } = useTheme();
  const [items, setItems] = useState([]);
  const [form, setForm] = useState(blankForm);
  const [editingId, setEditingId] = useState(null);
  const [message, setMessage] = useState('');
  const [showLoanTypeOptions, setShowLoanTypeOptions] = useState(false);

  const load = useCallback(async () => {
    const rows = await api.getLiabilities();
    setItems(rows);
  }, []);

  useEffect(() => {
    load().catch((e) => setMessage(e.message));
  }, [load]);

  const resetForm = () => {
    setForm(blankForm);
    setEditingId(null);
    setShowLoanTypeOptions(false);
  };

  const startEdit = (item) => {
    if (readOnly) {
      setMessage('Subscription expired. Renew to edit liabilities.');
      return;
    }
    setEditingId(item.id);
    setForm({
      loan_type: item.loan_type || 'Home Loan',
      lender: item.lender || '',
      outstanding_amount: String(item.outstanding_amount ?? '')
    });
    setShowLoanTypeOptions(false);
    setMessage(`Editing ${item.loan_type}`);
  };

  const submit = async () => {
    if (readOnly) {
      setMessage('Subscription expired. Renew to edit liabilities.');
      return;
    }
    if (!form.loan_type.trim() || !form.lender.trim()) {
      setMessage('Loan type and lender are required.');
      return;
    }

    const payload = {
      loan_type: form.loan_type,
      lender: form.lender,
      outstanding_amount: Number(form.outstanding_amount || 0)
    };

    if (editingId) {
      await api.updateLiability(editingId, payload);
      setMessage('Liability updated.');
    } else {
      await api.createLiability(payload);
      setMessage('Liability added.');
    }

    resetForm();
    await load();
  };

  const remove = async (id) => {
    if (readOnly) {
      setMessage('Subscription expired. Renew to edit liabilities.');
      return;
    }
    await api.deleteLiability(id);
    if (editingId === id) resetForm();
    setMessage('Liability deleted.');
    await load();
  };

  return (
    <View>
      <SectionCard title={editingId ? 'Edit Liability' : 'Add Liability'}>
        {readOnly ? <Text style={[styles.readOnlyText, { color: theme.warn }]}>Subscription expired. View-only mode.</Text> : null}
        <Text style={[styles.label, { color: theme.muted }]}>Loan Type</Text>
        <Pressable
          style={[styles.dropdownTrigger, { borderColor: theme.border, backgroundColor: theme.inputBg }]}
          disabled={readOnly}
          onPress={() => setShowLoanTypeOptions((v) => !v)}
        >
          <Text style={[styles.dropdownText, { color: theme.inputText }]}>{form.loan_type || 'Select loan type'}</Text>
          <Text style={[styles.dropdownArrow, { color: theme.muted }]}>{showLoanTypeOptions ? '▲' : '▼'}</Text>
        </Pressable>
        {showLoanTypeOptions ? (
          <View style={[styles.dropdownMenu, { borderColor: theme.border, backgroundColor: theme.card }]}>
            {LOAN_TYPE_OPTIONS.map((type) => (
              <Pressable
                key={type}
                style={[
                  styles.dropdownItem,
                  { borderBottomColor: theme.border },
                  form.loan_type === type && { backgroundColor: theme.accentSoft }
                ]}
                onPress={() => {
                  setForm((f) => ({ ...f, loan_type: type }));
                  setShowLoanTypeOptions(false);
                }}
              >
                <Text
                  style={[
                    styles.dropdownItemText,
                    { color: theme.text },
                    form.loan_type === type && { color: theme.accent, fontWeight: '700' }
                  ]}
                >
                  {type}
                </Text>
              </Pressable>
            ))}
          </View>
        ) : null}

        <Text style={[styles.label, { color: theme.muted }]}>Lender</Text>
        <TextInput
          style={[
            styles.input,
            { backgroundColor: theme.inputBg, borderColor: theme.border, color: theme.inputText },
            readOnly && { backgroundColor: theme.background, color: theme.muted }
          ]}
          value={form.lender}
          onChangeText={(v) => setForm((f) => ({ ...f, lender: v }))}
          editable={!readOnly}
        />

        <Text style={[styles.label, { color: theme.muted }]}>Outstanding Amount</Text>
        <TextInput
          style={[
            styles.input,
            { backgroundColor: theme.inputBg, borderColor: theme.border, color: theme.inputText },
            readOnly && { backgroundColor: theme.background, color: theme.muted }
          ]}
          keyboardType="numeric"
          value={form.outstanding_amount}
          onChangeText={(v) => setForm((f) => ({ ...f, outstanding_amount: v }))}
          editable={!readOnly}
        />

        <PillButton
          label={editingId ? 'Update Liability' : 'Save Liability'}
          onPress={() => submit().catch((e) => setMessage(e.message))}
          disabled={readOnly}
        />
        {editingId ? (
          <View style={{ marginTop: 8 }}>
            <PillButton label="Cancel Edit" kind="ghost" onPress={resetForm} disabled={readOnly} />
          </View>
        ) : null}
      </SectionCard>

      <SectionCard title="Current Liabilities">
        {items.map((item) => (
          <View key={item.id} style={[styles.row, { borderColor: theme.border, backgroundColor: theme.card }]}>
            <View style={{ flex: 1 }}>
              <Text style={[styles.name, { color: theme.text }]}>{item.loan_type}</Text>
              <Text style={[styles.sub, { color: theme.muted }]}>{item.lender}</Text>
            </View>
            <View style={styles.rightCol}>
              <Text style={[styles.amount, { color: theme.danger }]}>
                {displayAmount(item.outstanding_amount, hideSensitive, preferredCurrency, fxRates)}
              </Text>
              <View style={styles.actionsRow}>
                <PillButton label="Edit" kind="ghost" onPress={() => startEdit(item)} disabled={readOnly} />
                <PillButton
                  label="Delete"
                  kind="ghost"
                  onPress={() => remove(item.id).catch((e) => setMessage(e.message))}
                  disabled={readOnly}
                />
              </View>
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
    marginBottom: 8,
    gap: 10
  },
  rightCol: {
    alignItems: 'flex-end',
    gap: 8
  },
  actionsRow: {
    flexDirection: 'row',
    gap: 6
  },
  name: { color: '#0f3557', fontWeight: '700' },
  sub: { color: '#607d99' },
  amount: { color: '#b3261e', fontWeight: '800' },
  readOnlyText: { color: '#9a6b00', fontWeight: '700', marginBottom: 8 },
  message: { color: '#0f3557', marginBottom: 20, fontWeight: '600' }
});
