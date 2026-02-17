import React, { useEffect, useState } from 'react';
import { View, Text, TextInput, StyleSheet } from 'react-native';
import { api } from '../api/client';
import SectionCard from '../components/SectionCard';
import PillButton from '../components/PillButton';

const settingFields = [
  { key: 'gold_24k_per_gram', label: 'Gold (24K) per gram' },
  { key: 'gold_22k_per_gram', label: 'Gold (22K) per gram' },
  { key: 'silver_per_gram', label: 'Silver per gram' },
  { key: 'usd_inr', label: 'USD to INR' },
  { key: 'financial_year', label: 'Financial Year' },
  { key: 'risk_profile', label: 'Risk Profile' },
  { key: 'target_net_worth', label: 'Target Net Worth' },
  { key: 'target_date', label: 'Target Date (YYYY-MM-DD)' }
];

export default function SettingsScreen() {
  const [form, setForm] = useState({});
  const [message, setMessage] = useState('');

  useEffect(() => {
    api.getSettings()
      .then((data) => setForm(data))
      .catch((e) => setMessage(e.message));
  }, []);

  const save = async () => {
    await api.upsertSettings(form);
    setMessage('Settings saved.');
  };

  return (
    <View>
      <SectionCard title="Market Rates & Personal Settings">
        {settingFields.map((field) => (
          <View key={field.key}>
            <Text style={styles.label}>{field.label}</Text>
            <TextInput
              style={styles.input}
              value={String(form[field.key] ?? '')}
              onChangeText={(v) => setForm((prev) => ({ ...prev, [field.key]: v }))}
            />
          </View>
        ))}
        <PillButton label="Save Settings" onPress={() => save().catch((e) => setMessage(e.message))} />
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
  message: { color: '#0f3557', marginBottom: 20 }
});
