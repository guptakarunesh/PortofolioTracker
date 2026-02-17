import React, { useEffect, useState, useCallback } from 'react';
import { View, Text, TextInput, StyleSheet } from 'react-native';
import { api } from '../api/client';
import SectionCard from '../components/SectionCard';
import PillButton from '../components/PillButton';
import { formatINR } from '../utils/format';

const blankForm = { loan_type: 'Home Loan', lender: '', outstanding_amount: '' };

export default function LiabilitiesScreen() {
  const [items, setItems] = useState([]);
  const [form, setForm] = useState(blankForm);
  const [editingId, setEditingId] = useState(null);
  const [message, setMessage] = useState('');

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
  };

  const startEdit = (item) => {
    setEditingId(item.id);
    setForm({
      loan_type: item.loan_type || 'Home Loan',
      lender: item.lender || '',
      outstanding_amount: String(item.outstanding_amount ?? '')
    });
    setMessage(`Editing ${item.loan_type}`);
  };

  const submit = async () => {
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
    await api.deleteLiability(id);
    if (editingId === id) resetForm();
    setMessage('Liability deleted.');
    await load();
  };

  return (
    <View>
      <SectionCard title={editingId ? 'Edit Liability' : 'Add Liability'}>
        <Text style={styles.label}>Loan Type</Text>
        <TextInput style={styles.input} value={form.loan_type} onChangeText={(v) => setForm((f) => ({ ...f, loan_type: v }))} />

        <Text style={styles.label}>Lender</Text>
        <TextInput style={styles.input} value={form.lender} onChangeText={(v) => setForm((f) => ({ ...f, lender: v }))} />

        <Text style={styles.label}>Outstanding Amount (INR)</Text>
        <TextInput style={styles.input} keyboardType="numeric" value={form.outstanding_amount} onChangeText={(v) => setForm((f) => ({ ...f, outstanding_amount: v }))} />

        <PillButton label={editingId ? 'Update Liability' : 'Save Liability'} onPress={() => submit().catch((e) => setMessage(e.message))} />
        {editingId ? (
          <View style={{ marginTop: 8 }}>
            <PillButton label="Cancel Edit" kind="ghost" onPress={resetForm} />
          </View>
        ) : null}
      </SectionCard>

      <SectionCard title="Current Liabilities">
        {items.map((item) => (
          <View key={item.id} style={styles.row}>
            <View style={{ flex: 1 }}>
              <Text style={styles.name}>{item.loan_type}</Text>
              <Text style={styles.sub}>{item.lender}</Text>
            </View>
            <View style={styles.rightCol}>
              <Text style={styles.amount}>{formatINR(item.outstanding_amount)}</Text>
              <View style={styles.actionsRow}>
                <PillButton label="Edit" kind="ghost" onPress={() => startEdit(item)} />
                <PillButton label="Delete" kind="ghost" onPress={() => remove(item.id).catch((e) => setMessage(e.message))} />
              </View>
            </View>
          </View>
        ))}
      </SectionCard>

      {!!message && <Text style={styles.message}>{message}</Text>}
    </View>
  );
}

const styles = StyleSheet.create({
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
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: '#eef2f8',
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
  amount: { color: '#b3261e', fontWeight: '700' },
  message: { color: '#0f3557', marginBottom: 20 }
});
