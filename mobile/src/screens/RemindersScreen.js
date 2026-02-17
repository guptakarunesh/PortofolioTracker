import React, { useEffect, useState, useCallback } from 'react';
import { View, Text, TextInput, StyleSheet } from 'react-native';
import { api } from '../api/client';
import SectionCard from '../components/SectionCard';
import PillButton from '../components/PillButton';
import { formatDate, formatINR } from '../utils/format';

export default function RemindersScreen() {
  const [items, setItems] = useState([]);
  const [form, setForm] = useState({ due_date: '2026-04-01', category: 'Insurance', description: '', amount: '', alert_days_before: '15' });
  const [message, setMessage] = useState('');

  const load = useCallback(async () => {
    const rows = await api.getReminders();
    setItems(rows);
  }, []);

  useEffect(() => {
    load().catch((e) => setMessage(e.message));
  }, [load]);

  const submit = async () => {
    if (!form.due_date || !form.category || !form.description) {
      setMessage('Due date, category and description are required.');
      return;
    }
    await api.createReminder({
      ...form,
      amount: Number(form.amount || 0),
      alert_days_before: Number(form.alert_days_before || 7),
      status: 'Pending'
    });
    setForm((f) => ({ ...f, description: '', amount: '' }));
    setMessage('Reminder added.');
    await load();
  };

  const markComplete = async (id) => {
    await api.updateReminderStatus(id, 'Completed');
    await load();
  };

  return (
    <View>
      <SectionCard title="Add Reminder">
        <Text style={styles.label}>Due Date (YYYY-MM-DD)</Text>
        <TextInput style={styles.input} value={form.due_date} onChangeText={(v) => setForm((f) => ({ ...f, due_date: v }))} />
        <Text style={styles.label}>Category</Text>
        <TextInput style={styles.input} value={form.category} onChangeText={(v) => setForm((f) => ({ ...f, category: v }))} />
        <Text style={styles.label}>Description</Text>
        <TextInput style={styles.input} value={form.description} onChangeText={(v) => setForm((f) => ({ ...f, description: v }))} />
        <Text style={styles.label}>Amount (INR)</Text>
        <TextInput style={styles.input} keyboardType="numeric" value={form.amount} onChangeText={(v) => setForm((f) => ({ ...f, amount: v }))} />
        <PillButton label="Save Reminder" onPress={() => submit().catch((e) => setMessage(e.message))} />
      </SectionCard>

      <SectionCard title="Upcoming Reminders">
        {items.map((item) => (
          <View key={item.id} style={styles.row}>
            <View style={{ flex: 1 }}>
              <Text style={styles.name}>{item.description}</Text>
              <Text style={styles.sub}>{item.category} · {formatDate(item.due_date)}</Text>
              <Text style={styles.sub}>Status: {item.status}</Text>
            </View>
            <View style={styles.right}>
              <Text style={styles.amount}>{formatINR(item.amount)}</Text>
              {item.status !== 'Completed' ? (
                <PillButton label="Done" kind="ghost" onPress={() => markComplete(item.id).catch((e) => setMessage(e.message))} />
              ) : null}
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
    borderBottomColor: '#eef2f8'
  },
  right: { gap: 8, alignItems: 'flex-end' },
  name: { color: '#0f3557', fontWeight: '700' },
  sub: { color: '#607d99' },
  amount: { color: '#0f3557', fontWeight: '700' },
  message: { color: '#0f3557', marginBottom: 20 }
});
