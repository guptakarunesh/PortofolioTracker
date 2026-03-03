import React, { useEffect, useState, useCallback } from 'react';
import { View, Text, TextInput, StyleSheet, Pressable } from 'react-native';
import { api } from '../api/client';
import SectionCard from '../components/SectionCard';
import PillButton from '../components/PillButton';
import { formatAmountFromInr } from '../utils/format';
import { useTheme } from '../theme';

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
  account_ref: '',
  tracking_url: '',
  current_value: '',
  invested_amount: ''
};

const displayAmount = (value, hideSensitive, currency, fxRates) =>
  hideSensitive ? '••••••' : formatAmountFromInr(value, currency, fxRates);

export default function AssetsScreen({
  hideSensitive = false,
  preferredCurrency = 'INR',
  fxRates = { INR: 1 },
  subscriptionStatus,
  onOpenSubscription = () => {},
  readOnly = false
}) {
  const { theme } = useTheme();
  const [items, setItems] = useState([]);
  const [form, setForm] = useState(blankForm);
  const [editingId, setEditingId] = useState(null);
  const [message, setMessage] = useState('');
  const [showCategoryOptions, setShowCategoryOptions] = useState(false);
  const [limitReached, setLimitReached] = useState(false);

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
    setShowCategoryOptions(false);
  };

  const startEdit = (item) => {
    if (readOnly) {
      setMessage('Subscription expired. Renew to edit assets.');
      return;
    }
    setEditingId(item.id);
    setForm({
      category: item.category || CATEGORY_OPTIONS[0],
      name: item.name || '',
      account_ref: item.account_ref || '',
      tracking_url: item.tracking_url || '',
      current_value: String(item.current_value ?? ''),
      invested_amount: String(item.invested_amount ?? '')
    });
    setShowCategoryOptions(false);
    setMessage(`Editing ${item.name}`);
  };

  const submit = async () => {
    if (readOnly) {
      setMessage('Subscription expired. Renew to edit assets.');
      return;
    }
    if (!form.name.trim()) {
      setMessage('Asset name is required.');
      return;
    }

    const payload = {
      category: form.category,
      name: form.name.trim(),
      account_ref: form.account_ref?.trim() || '',
      tracking_url: form.tracking_url?.trim() || '',
      current_value: Number(form.current_value || 0),
      invested_amount: Number(form.invested_amount || 0)
    };

    try {
      if (editingId) {
        await api.updateAsset(editingId, payload);
        setMessage('Asset updated.');
      } else {
        await api.createAsset(payload);
        setMessage('Asset added.');
      }
      setLimitReached(false);
      resetForm();
      await load();
    } catch (e) {
      const raw = String(e?.message || '');
      let parsed = null;
      try {
        parsed = JSON.parse(raw);
      } catch (_err) {
        parsed = null;
      }
      if (parsed?.error === 'basic_limit_reached') {
        setLimitReached(true);
        setMessage(parsed.message);
        return;
      }
      setMessage(raw);
    }
  };

  const remove = async (id) => {
    if (readOnly) {
      setMessage('Subscription expired. Renew to edit assets.');
      return;
    }
    await api.deleteAsset(id);
    if (editingId === id) resetForm();
    setMessage('Asset deleted.');
    await load();
  };

  const visibleItems = items.filter((item) => Number(item.current_value || 0) > 0);
  const maxAssets = subscriptionStatus?.limits?.maxAssets;

  return (
    <View>
      <SectionCard title={editingId ? 'Edit Asset' : 'Add Asset'}>
        {readOnly ? <Text style={[styles.readOnlyText, { color: theme.warn }]}>Subscription expired. View-only mode.</Text> : null}
        <Text style={[styles.label, { color: theme.muted }]}>Category</Text>
        <Pressable
          style={[
            styles.dropdownTrigger,
            { borderColor: theme.border, backgroundColor: theme.inputBg }
          ]}
          disabled={readOnly}
          onPress={() => setShowCategoryOptions((v) => !v)}
        >
          <Text style={[styles.dropdownText, { color: theme.inputText }]}>{form.category || 'Select category'}</Text>
          <Text style={[styles.dropdownArrow, { color: theme.muted }]}>{showCategoryOptions ? '▲' : '▼'}</Text>
        </Pressable>
        {showCategoryOptions ? (
          <View style={[styles.dropdownMenu, { borderColor: theme.border, backgroundColor: theme.card }]}>
            {CATEGORY_OPTIONS.map((category) => (
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
                  {category}
                </Text>
              </Pressable>
            ))}
          </View>
        ) : null}

        <Text style={[styles.label, { color: theme.muted }]}>Name</Text>
        <TextInput
          style={[
            styles.input,
            { backgroundColor: theme.inputBg, borderColor: theme.border, color: theme.inputText },
            readOnly && { backgroundColor: theme.background, color: theme.muted }
          ]}
          value={form.name}
          onChangeText={(v) => setForm((f) => ({ ...f, name: v }))}
          placeholder="HDFC Flexi Cap / SBI FD"
          placeholderTextColor={theme.muted}
          editable={!readOnly}
        />

        <Text style={[styles.label, { color: theme.muted }]}>Asset Account / Unique Number</Text>
        <TextInput
          style={[
            styles.input,
            { backgroundColor: theme.inputBg, borderColor: theme.border, color: theme.inputText },
            readOnly && { backgroundColor: theme.background, color: theme.muted }
          ]}
          value={form.account_ref}
          onChangeText={(v) => setForm((f) => ({ ...f, account_ref: v }))}
          placeholder="Folio / Account No / Demat ID"
          autoCapitalize="none"
          placeholderTextColor={theme.muted}
          editable={!readOnly}
        />

        <Text style={[styles.label, { color: theme.muted }]}>Tracking Website URL</Text>
        <TextInput
          style={[
            styles.input,
            { backgroundColor: theme.inputBg, borderColor: theme.border, color: theme.inputText },
            readOnly && { backgroundColor: theme.background, color: theme.muted }
          ]}
          value={form.tracking_url}
          onChangeText={(v) => setForm((f) => ({ ...f, tracking_url: v }))}
          placeholder="https://..."
          autoCapitalize="none"
          placeholderTextColor={theme.muted}
          editable={!readOnly}
        />

        <Text style={[styles.label, { color: theme.muted }]}>Current Value</Text>
        <TextInput
          style={[
            styles.input,
            { backgroundColor: theme.inputBg, borderColor: theme.border, color: theme.inputText },
            readOnly && { backgroundColor: theme.background, color: theme.muted }
          ]}
          keyboardType="numeric"
          value={form.current_value}
          onChangeText={(v) => setForm((f) => ({ ...f, current_value: v }))}
          placeholderTextColor={theme.muted}
          editable={!readOnly}
        />

        <Text style={[styles.label, { color: theme.muted }]}>Invested Amount</Text>
        <TextInput
          style={[
            styles.input,
            { backgroundColor: theme.inputBg, borderColor: theme.border, color: theme.inputText },
            readOnly && { backgroundColor: theme.background, color: theme.muted }
          ]}
          keyboardType="numeric"
          value={form.invested_amount}
          onChangeText={(v) => setForm((f) => ({ ...f, invested_amount: v }))}
          placeholderTextColor={theme.muted}
          editable={!readOnly}
        />

        <PillButton
          label={editingId ? 'Update Asset' : 'Save Asset'}
          onPress={() => submit().catch((e) => setMessage(e.message))}
          disabled={readOnly}
        />
        {editingId ? (
          <View style={{ marginTop: 8 }}>
            <PillButton label="Cancel Edit" kind="ghost" onPress={resetForm} disabled={readOnly} />
          </View>
        ) : null}
      </SectionCard>

      <SectionCard title="Current Assets">
        {Number(maxAssets) > 0 ? (
          <View style={styles.planLimitRow}>
            <Text style={[styles.planLimitText, { color: theme.warn }]}>
              Basic plan: {items.length}/{maxAssets} assets used
            </Text>
            <PillButton label="Upgrade" kind="ghost" onPress={onOpenSubscription} />
          </View>
        ) : null}
        {visibleItems.map((item) => (
          <View key={item.id} style={[styles.row, { borderColor: theme.border, backgroundColor: theme.card }]}>
            <View style={{ flex: 1 }}>
              <Text style={[styles.name, { color: theme.text }]}>{item.name}</Text>
              <Text style={[styles.sub, { color: theme.muted }]}>{item.category}</Text>
              <Text style={[styles.sub, { color: theme.muted }]}>Account Ref: {item.account_ref || '-'}</Text>
              <Text style={[styles.sub, { color: theme.muted }]}>Website: {item.tracking_url || '-'}</Text>
              <Text style={[styles.sub, { color: theme.muted }]}>Invested: {displayAmount(item.invested_amount, hideSensitive, preferredCurrency, fxRates)}</Text>
            </View>
            <View style={styles.rightCol}>
              <Text style={[styles.amount, { color: theme.success }]}>{displayAmount(item.current_value, hideSensitive, preferredCurrency, fxRates)}</Text>
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
        {!visibleItems.length ? <Text style={[styles.sub, { color: theme.muted }]}>No non-zero assets yet.</Text> : null}
      </SectionCard>

      {!!message && <Text style={[styles.message, { color: theme.text }]}>{message}</Text>}
      {limitReached ? (
        <View style={styles.limitCtaRow}>
          <PillButton label="Upgrade to Premium" onPress={onOpenSubscription} />
        </View>
      ) : null}
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
  planLimitRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 10
  },
  planLimitText: {
    color: '#9a6b00',
    fontWeight: '700'
  },
  limitCtaRow: {
    marginTop: 10
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
  amount: { color: '#0a8f4b', fontWeight: '800' },
  readOnlyText: { color: '#9a6b00', fontWeight: '700', marginBottom: 8 },
  message: { color: '#0f3557', marginBottom: 20, fontWeight: '600' }
});
