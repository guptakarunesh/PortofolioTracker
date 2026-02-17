import React, { useEffect, useState, useCallback } from 'react';
import { View, Text, TextInput, StyleSheet } from 'react-native';
import { api } from '../api/client';
import SectionCard from '../components/SectionCard';
import PillButton from '../components/PillButton';
import { formatDate, formatINR } from '../utils/format';

export default function TransactionsScreen() {
  const [items, setItems] = useState([]);
  const [form, setForm] = useState({ tx_date: '2026-02-16', category: 'Mutual Funds', tx_type: 'Buy', asset_name: '', amount: '' });
  const [message, setMessage] = useState('');

  const load = useCallback(async () => {
    const rows = await api.getTransactions();
    setItems(rows);
  }, []);

  useEffect(() => {
    load().catch((e) => setMessage(e.message));
  }, [load]);

  const submit = async () => {
    if (!form.tx_date || !form.category || !form.tx_type || !form.amount) {
      setMessage('Date, category, type and amount are required.');
      return;
    }
    await api.createTransaction({
      ...form,
      amount: Number(form.amount)
    });
    setForm((f) => ({ ...f, asset_name: '', amount: '' }));
    setMessage('Transaction added.');
    await load();
  };

  return (
    <View>
      <SectionCard title="Add Transaction">
        <Text style={styles.label}>Date (YYYY-MM-DD)</Text>
        <TextInput style={styles.input} value={form.tx_date} onChangeText={(v) => setForm((f) => ({ ...f, tx_date: v }))} />
        <Text style={styles.label}>Category</Text>
        <TextInput style={styles.input} value={form.category} onChangeText={(v) => setForm((f) => ({ ...f, category: v }))} />
        <Text style={styles.label}>Type (Buy/Sell/Deposit...)</Text>
        <TextInput style={styles.input} value={form.tx_type} onChangeText={(v) => setForm((f) => ({ ...f, tx_type: v }))} />
        <Text style={styles.label}>Asset Name</Text>
        <TextInput style={styles.input} value={form.asset_name} onChangeText={(v) => setForm((f) => ({ ...f, asset_name: v }))} />
        <Text style={styles.label}>Amount (INR)</Text>
        <TextInput style={styles.input} keyboardType="numeric" value={form.amount} onChangeText={(v) => setForm((f) => ({ ...f, amount: v }))} />
        <PillButton label="Save Transaction" onPress={() => submit().catch((e) => setMessage(e.message))} />
      </SectionCard>

      <SectionCard title="Recent Transactions">
        {items.map((item) => (
          <View key={item.id} style={styles.row}>
            <View style={{ flex: 1 }}>
              <Text style={styles.name}>{item.category} · {item.tx_type}</Text>
              <Text style={styles.sub}>{item.asset_name || '-'} · {formatDate(item.tx_date)}</Text>
            </View>
            <Text style={styles.amount}>{formatINR(item.amount)}</Text>
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
    borderBottomColor: '#eef2f8'
  },
  name: { color: '#0f3557', fontWeight: '700' },
  sub: { color: '#607d99' },
  amount: { color: '#0f3557', fontWeight: '700' },
  message: { color: '#0f3557', marginBottom: 20 }
});
