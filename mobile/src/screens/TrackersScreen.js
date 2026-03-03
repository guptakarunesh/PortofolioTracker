import React, { useEffect, useState, useCallback } from 'react';
import { View, Text, TextInput, StyleSheet } from 'react-native';
import { api } from '../api/client';
import SectionCard from '../components/SectionCard';
import PillButton from '../components/PillButton';
import { useTheme } from '../theme';

const blankForm = {
  asset_name: '',
  website_url: '',
  login_id: '',
  notes: ''
};

export default function TrackersScreen({ hideSensitive = false }) {
  const { theme } = useTheme();
  const [items, setItems] = useState([]);
  const [form, setForm] = useState(blankForm);
  const [editingId, setEditingId] = useState(null);
  const [message, setMessage] = useState('');

  const load = useCallback(async () => {
    const rows = await api.getTrackers();
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
      asset_name: item.asset_name || '',
      website_url: item.website_url || '',
      login_id: item.login_id || '',
      notes: item.notes || ''
    });
    setMessage(`Editing tracker for ${item.asset_name}`);
  };

  const submit = async () => {
    if (!form.asset_name.trim() || !form.website_url.trim() || !form.login_id.trim()) {
      setMessage('Asset name, website URL and login ID are required.');
      return;
    }

    const payload = {
      asset_name: form.asset_name.trim(),
      website_url: form.website_url.trim(),
      login_id: form.login_id.trim(),
      notes: form.notes.trim()
    };

    if (editingId) {
      await api.updateTracker(editingId, payload);
      setMessage('Tracker updated.');
    } else {
      await api.createTracker(payload);
      setMessage('Tracker added.');
    }

    resetForm();
    await load();
  };

  const remove = async (id) => {
    await api.deleteTracker(id);
    if (editingId === id) resetForm();
    setMessage('Tracker deleted.');
    await load();
  };

  return (
    <View>
      <SectionCard title={editingId ? 'Edit Tracker Credential' : 'Add Tracker Credential'}>
        <Text style={[styles.label, { color: theme.muted }]}>Asset Name</Text>
        <TextInput
          style={[styles.input, { backgroundColor: theme.inputBg, borderColor: theme.border, color: theme.inputText }]}
          value={form.asset_name}
          onChangeText={(v) => setForm((f) => ({ ...f, asset_name: v }))}
          placeholder="HDFC Flexi Cap"
          placeholderTextColor={theme.muted}
        />

        <Text style={[styles.label, { color: theme.muted }]}>Website URL</Text>
        <TextInput
          style={[styles.input, { backgroundColor: theme.inputBg, borderColor: theme.border, color: theme.inputText }]}
          value={form.website_url}
          onChangeText={(v) => setForm((f) => ({ ...f, website_url: v }))}
          placeholder="https://example.com/login"
          autoCapitalize="none"
          placeholderTextColor={theme.muted}
        />

        <Text style={[styles.label, { color: theme.muted }]}>User ID / Login</Text>
        <TextInput
          style={[styles.input, { backgroundColor: theme.inputBg, borderColor: theme.border, color: theme.inputText }]}
          value={form.login_id}
          onChangeText={(v) => setForm((f) => ({ ...f, login_id: v }))}
          autoCapitalize="none"
          placeholderTextColor={theme.muted}
        />

        <Text style={[styles.label, { color: theme.muted }]}>Notes (Optional)</Text>
        <TextInput
          style={[styles.input, { backgroundColor: theme.inputBg, borderColor: theme.border, color: theme.inputText }]}
          value={form.notes}
          onChangeText={(v) => setForm((f) => ({ ...f, notes: v }))}
          placeholder="Broker / app details"
          placeholderTextColor={theme.muted}
        />

        <PillButton label={editingId ? 'Update Tracker' : 'Save Tracker'} onPress={() => submit().catch((e) => setMessage(e.message))} />
        {editingId ? (
          <View style={{ marginTop: 8 }}>
            <PillButton label="Cancel Edit" kind="ghost" onPress={resetForm} />
          </View>
        ) : null}
      </SectionCard>

      <SectionCard title="Tracker Credentials">
        {items.map((item) => (
          <View key={item.id} style={[styles.row, { borderColor: theme.border, backgroundColor: theme.card }]}>
            <View style={{ flex: 1 }}>
              <Text style={[styles.name, { color: theme.text }]}>{item.asset_name}</Text>
              <Text style={[styles.sub, { color: theme.muted }]}>{item.website_url}</Text>
              <Text style={[styles.sub, { color: theme.muted }]}>Login: {hideSensitive ? '••••••' : item.login_id}</Text>
            </View>
            <View style={styles.actionsRow}>
              <PillButton label="Edit" kind="ghost" onPress={() => startEdit(item)} />
              <PillButton label="Delete" kind="ghost" onPress={() => remove(item.id).catch((e) => setMessage(e.message))} />
            </View>
          </View>
        ))}
        {!items.length ? <Text style={[styles.sub, { color: theme.muted }]}>No tracker credentials yet.</Text> : null}
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
  row: {
    paddingVertical: 10,
    paddingHorizontal: 10,
    borderWidth: 1,
    borderColor: '#e4ebf5',
    borderRadius: 12,
    backgroundColor: '#fbfdff',
    marginBottom: 8
  },
  actionsRow: {
    flexDirection: 'row',
    gap: 6,
    marginTop: 10
  },
  name: { color: '#0f3557', fontWeight: '800' },
  sub: { color: '#607d99' },
  message: { color: '#0f3557', marginBottom: 20, fontWeight: '600' }
});
