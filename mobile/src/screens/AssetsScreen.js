import React, { useEffect, useState, useCallback } from 'react';
import { View, Text, TextInput, StyleSheet } from 'react-native';
import { api } from '../api/client';
import SectionCard from '../components/SectionCard';
import PillButton from '../components/PillButton';
import { formatINR } from '../utils/format';

const CATEGORY_OPTIONS = [
  'Banking & Deposits',
  'Market Investments',
  'Precious Metals',
  'Real Estate',
  'Retirement Funds',
  'Insurance (Cash Value)',
  'Other Assets'
];

const blankForm = {
  category: CATEGORY_OPTIONS[0],
  name: '',
  current_value: '',
  invested_amount: ''
};

export default function AssetsScreen() {
  const [items, setItems] = useState([]);
  const [form, setForm] = useState(blankForm);
  const [editingId, setEditingId] = useState(null);
  const [message, setMessage] = useState('');

  const load = useCallback(async () => {
    const rows = await api.getAssets();
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
      category: item.category || CATEGORY_OPTIONS[0],
      name: item.name || '',
      current_value: String(item.current_value ?? ''),
      invested_amount: String(item.invested_amount ?? '')
    });
    setMessage(`Editing ${item.name}`);
  };

  const submit = async () => {
    if (!form.name.trim()) {
      setMessage('Asset name is required.');
      return;
    }

    const payload = {
      category: form.category,
      name: form.name.trim(),
      current_value: Number(form.current_value || 0),
      invested_amount: Number(form.invested_amount || 0)
    };

    if (editingId) {
      await api.updateAsset(editingId, payload);
      setMessage('Asset updated.');
    } else {
      await api.createAsset(payload);
      setMessage('Asset added.');
    }

    resetForm();
    await load();
  };

  const remove = async (id) => {
    await api.deleteAsset(id);
    if (editingId === id) resetForm();
    setMessage('Asset deleted.');
    await load();
  };

  return (
    <View>
      <SectionCard title={editingId ? 'Edit Asset' : 'Add Asset'}>
        <Text style={styles.label}>Category</Text>
        <TextInput
          style={styles.input}
          value={form.category}
          onChangeText={(v) => setForm((f) => ({ ...f, category: v }))}
          placeholder={`e.g. ${CATEGORY_OPTIONS[0]}`}
        />

        <Text style={styles.label}>Name</Text>
        <TextInput
          style={styles.input}
          value={form.name}
          onChangeText={(v) => setForm((f) => ({ ...f, name: v }))}
          placeholder="HDFC Flexi Cap / SBI FD"
        />

        <Text style={styles.label}>Current Value (INR)</Text>
        <TextInput
          style={styles.input}
          keyboardType="numeric"
          value={form.current_value}
          onChangeText={(v) => setForm((f) => ({ ...f, current_value: v }))}
        />

        <Text style={styles.label}>Invested Amount (INR)</Text>
        <TextInput
          style={styles.input}
          keyboardType="numeric"
          value={form.invested_amount}
          onChangeText={(v) => setForm((f) => ({ ...f, invested_amount: v }))}
        />

        <PillButton label={editingId ? 'Update Asset' : 'Save Asset'} onPress={() => submit().catch((e) => setMessage(e.message))} />
        {editingId ? (
          <View style={{ marginTop: 8 }}>
            <PillButton label="Cancel Edit" kind="ghost" onPress={resetForm} />
          </View>
        ) : null}
      </SectionCard>

      <SectionCard title="Current Assets">
        {items.map((item) => (
          <View key={item.id} style={styles.row}>
            <View style={{ flex: 1 }}>
              <Text style={styles.name}>{item.name}</Text>
              <Text style={styles.sub}>{item.category}</Text>
              <Text style={styles.sub}>Invested: {formatINR(item.invested_amount)}</Text>
            </View>
            <View style={styles.rightCol}>
              <Text style={styles.amount}>{formatINR(item.current_value)}</Text>
              <View style={styles.actionsRow}>
                <PillButton label="Edit" kind="ghost" onPress={() => startEdit(item)} />
                <PillButton label="Delete" kind="ghost" onPress={() => remove(item.id).catch((e) => setMessage(e.message))} />
              </View>
            </View>
          </View>
        ))}
        {!items.length ? <Text style={styles.sub}>No assets yet.</Text> : null}
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
  amount: { color: '#0a8f4b', fontWeight: '700' },
  message: { color: '#0f3557', marginBottom: 20 }
});
