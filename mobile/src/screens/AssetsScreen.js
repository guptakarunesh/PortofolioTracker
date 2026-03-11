import React, { useEffect, useState, useCallback, useRef } from 'react';
import { View, Text, TextInput, StyleSheet, Pressable, Modal } from 'react-native';
import { api } from '../api/client';
import SectionCard from '../components/SectionCard';
import PillButton from '../components/PillButton';
import { formatAmountFromInr } from '../utils/format';
import { useTheme } from '../theme';
import { useI18n } from '../i18n';

const CATEGORY_OPTIONS = [
  'Banking & Deposits',
  'Market Investments',
  'Precious Metals',
  'Real Estate',
  'Retirement Funds',
  'Insurance (Cash Value)',
  'Other Assets'
];

const HOLDER_OPTIONS = ['Self', 'Joint', 'Either or Survivor', 'Nominee Tagged'];
const REACH_OPTIONS = ['Branch', 'RM', 'Customer Care', 'Portal'];

const blankForm = {
  category: CATEGORY_OPTIONS[0],
  holder_type: HOLDER_OPTIONS[0],
  reach_via: REACH_OPTIONS[0],
  name: '',
  relationship_mobile: '',
  account_ref: '',
  tracking_url: '',
  current_value: '',
  invested_amount: '',
  notes_for_family: ''
};

const displayAmount = (value, hideSensitive, currency, fxRates) =>
  hideSensitive ? '••••••' : formatAmountFromInr(value, currency, fxRates);

const hasInfo = (value) => {
  if (value == null) return false;
  if (typeof value === 'string') {
    const cleaned = value.trim();
    return cleaned !== '' && cleaned !== '-' && cleaned.toLowerCase() !== 'null' && cleaned.toLowerCase() !== 'na';
  }
  return true;
};

function HelpLine({ text, theme }) {
  return <Text style={[styles.helpText, { color: theme.muted }]}>ⓘ {text}</Text>;
}

export default function AssetsScreen({
  hideSensitive = false,
  preferredCurrency = 'INR',
  fxRates = { INR: 1 },
  subscriptionStatus,
  onOpenSubscription = () => {},
  readOnly = false,
  onRequestScrollTo = () => {}
}) {
  const { theme } = useTheme();
  const { t } = useI18n();
  const [items, setItems] = useState([]);
  const [form, setForm] = useState(blankForm);
  const [editingId, setEditingId] = useState(null);
  const [message, setMessage] = useState('');
  const [messageKind, setMessageKind] = useState('info');
  const [fieldErrors, setFieldErrors] = useState({});
  const [showCategoryOptions, setShowCategoryOptions] = useState(false);
  const [showHolderOptions, setShowHolderOptions] = useState(false);
  const [showReachOptions, setShowReachOptions] = useState(false);
  const [limitReached, setLimitReached] = useState(false);
  const [revealVisible, setRevealVisible] = useState(false);
  const [revealItem, setRevealItem] = useState(null);
  const [revealPin, setRevealPin] = useState('');
  const [revealData, setRevealData] = useState(null);
  const [revealError, setRevealError] = useState('');
  const [revealLoading, setRevealLoading] = useState(false);
  const nameInputRef = useRef(null);
  const relationshipMobileInputRef = useRef(null);
  const trackingUrlInputRef = useRef(null);
  const currentValueInputRef = useRef(null);
  const investedAmountInputRef = useRef(null);
  const fieldOffsetsRef = useRef({});

  const load = useCallback(async () => {
    const rows = await api.getAssets();
    setItems(rows);
  }, []);

  useEffect(() => {
    load().catch((e) => {
      setMessage(String(e?.message || e));
      setMessageKind('error');
    });
  }, [load]);

  const clearFieldError = useCallback((key) => {
    setFieldErrors((prev) => {
      if (!prev[key]) return prev;
      const next = { ...prev };
      delete next[key];
      return next;
    });
  }, []);

  const focusField = useCallback((key) => {
    if (key === 'name' && nameInputRef.current?.focus) nameInputRef.current.focus();
    if (key === 'relationship_mobile' && relationshipMobileInputRef.current?.focus) relationshipMobileInputRef.current.focus();
    if (key === 'tracking_url' && trackingUrlInputRef.current?.focus) trackingUrlInputRef.current.focus();
    if (key === 'current_value' && currentValueInputRef.current?.focus) currentValueInputRef.current.focus();
    if (key === 'invested_amount' && investedAmountInputRef.current?.focus) investedAmountInputRef.current.focus();
  }, []);

  const resetForm = () => {
    setForm(blankForm);
    setEditingId(null);
    setFieldErrors({});
    setShowCategoryOptions(false);
    setShowHolderOptions(false);
    setShowReachOptions(false);
  };

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

  const startEdit = (item) => {
    if (readOnly) {
      setMessage(t('Subscription expired. Renew to edit assets.'));
      return;
    }
    setEditingId(item.id);
    setForm({
      category: item.category || CATEGORY_OPTIONS[0],
      holder_type: item.holder_type || HOLDER_OPTIONS[0],
      reach_via: item.reach_via || REACH_OPTIONS[0],
      name: item.institution || item.name || '',
      relationship_mobile: '',
      account_ref: '',
      tracking_url: item.tracking_url || '',
      current_value: String(item.current_value ?? ''),
      invested_amount: String(item.invested_amount ?? ''),
      notes_for_family: ''
    });
    setShowCategoryOptions(false);
    setShowHolderOptions(false);
    setShowReachOptions(false);
    setFieldErrors({});
    setMessage(t('Editing {name}. Enter sensitive fields only if you want to replace them.', { name: item.name }));
    setMessageKind('info');
    scrollToField();
  };

  const openReveal = (item) => {
    setRevealItem(item);
    setRevealVisible(true);
    setRevealPin('');
    setRevealData(null);
    setRevealError('');
    setRevealLoading(false);
  };

  const closeReveal = () => {
    setRevealVisible(false);
    setRevealItem(null);
    setRevealPin('');
    setRevealData(null);
    setRevealError('');
    setRevealLoading(false);
  };

  const submitReveal = async () => {
    if (!revealItem?.id) return;
    if (!/^\d{4}$/.test(revealPin)) {
      setRevealError(t('Enter your 4-digit security PIN.'));
      return;
    }
    setRevealLoading(true);
    setRevealError('');
    try {
      const details = await api.revealAssetSensitive(revealItem.id, revealPin);
      setRevealData(details || null);
    } catch (e) {
      setRevealError(String(e?.message || e));
    } finally {
      setRevealLoading(false);
    }
  };

  const submit = async () => {
    if (readOnly) {
      setMessage(t('Subscription expired. Renew to edit assets.'));
      setMessageKind('error');
      return;
    }
    const errors = {};
    let firstInvalidField = null;
    const registerError = (key, text) => {
      if (errors[key]) return;
      errors[key] = text;
      if (!firstInvalidField) firstInvalidField = key;
    };

    if (!form.name.trim()) {
      registerError('name', t('Institution Name is required.'));
    }

    const normalizedRelationship = String(form.relationship_mobile || '').replace(/\D/g, '').slice(0, 10);
    if (form.relationship_mobile && normalizedRelationship.length !== 10) {
      registerError('relationship_mobile', t('Enter a valid 10-digit mobile number.'));
    }

    const trackingUrl = String(form.tracking_url || '').trim();
    if (trackingUrl) {
      const host = trackingUrl.replace(/^https?:\/\//i, '').split('/')[0].toLowerCase();
      if (!/^[a-z0-9.-]+\.[a-z]{2,}$/.test(host)) {
        registerError('tracking_url', t('Enter a valid website URL or domain.'));
      }
    }

    const parseAmount = (raw, key, label) => {
      const cleaned = String(raw || '').trim().replace(/,/g, '');
      if (!cleaned) return;
      const n = Number(cleaned);
      if (!Number.isFinite(n) || n < 0) {
        registerError(key, t('{field} must be a valid non-negative number.', { field: t(label) }));
      }
    };
    parseAmount(form.current_value, 'current_value', 'Current Value');
    parseAmount(form.invested_amount, 'invested_amount', 'Invested Amount');

    if (Object.keys(errors).length) {
      setFieldErrors(errors);
      setMessage(errors[firstInvalidField] || t('Please correct highlighted fields.'));
      setMessageKind('error');
      scrollToField(firstInvalidField);
      focusField(firstInvalidField);
      return;
    }

    const normalizedAccountRef = form.account_ref?.trim() || '';
    const normalizedNotes = form.notes_for_family?.trim() || '';
    const basePayload = {
      category: form.category,
      name: form.name.trim(),
      institution: form.name.trim(),
      holder_type: form.holder_type,
      reach_via: form.reach_via,
      tracking_url: form.tracking_url?.trim() || '',
      current_value: Number(form.current_value || 0),
      invested_amount: Number(form.invested_amount || 0)
    };

    try {
      if (editingId) {
        const payload = { ...basePayload };
        if (normalizedRelationship) payload.relationship_mobile = normalizedRelationship;
        if (normalizedAccountRef) payload.account_ref = normalizedAccountRef;
        if (normalizedNotes) payload.notes_for_family = normalizedNotes;
        await api.updateAsset(editingId, payload);
        setMessage(t('Asset updated.'));
        setMessageKind('success');
      } else {
        await api.createAsset({
          ...basePayload,
          relationship_mobile: normalizedRelationship,
          account_ref: normalizedAccountRef,
          notes_for_family: normalizedNotes
        });
        setMessage(t('Asset added.'));
        setMessageKind('success');
      }
      setFieldErrors({});
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
        setMessageKind('error');
        return;
      }
      setMessage(raw);
      setMessageKind('error');
    }
  };

  const remove = async (id) => {
    if (readOnly) {
      setMessage(t('Subscription expired. Renew to edit assets.'));
      setMessageKind('error');
      return;
    }
    await api.deleteAsset(id);
    if (editingId === id) resetForm();
    setMessage(t('Asset deleted.'));
    setMessageKind('success');
    await load();
  };

  const cancelEdit = () => {
    resetForm();
    setMessage('');
    setMessageKind('info');
  };

  const visibleItems = items
    .filter((item) => Number(item.current_value || 0) > 0)
    .sort((a, b) => Number(b.current_value || 0) - Number(a.current_value || 0));
  const maxAssets = subscriptionStatus?.limits?.maxAssets;

  return (
    <View>
      <SectionCard title={editingId ? t('Edit Asset') : t('Add Asset')}>
        {readOnly ? <Text style={[styles.readOnlyText, { color: theme.warn }]}>{t('Subscription expired. View-only mode.')}</Text> : null}
        <Text style={[styles.label, { color: theme.muted }]}>{t('Category')}</Text>
        <Pressable
          style={[
            styles.dropdownTrigger,
            { borderColor: theme.border, backgroundColor: theme.inputBg }
          ]}
          disabled={readOnly}
          onPress={() => setShowCategoryOptions((v) => !v)}
        >
          <Text style={[styles.dropdownText, { color: theme.inputText }]}>{t(form.category || 'Select category')}</Text>
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
                  {t(category)}
                </Text>
              </Pressable>
            ))}
          </View>
        ) : null}

        <Text style={[styles.label, { color: theme.muted }]}>{t('Institution Name')}</Text>
        <TextInput
          ref={nameInputRef}
          onLayout={(event) => setFieldOffset('name', event.nativeEvent.layout.y)}
          style={[
            styles.input,
            { backgroundColor: theme.inputBg, borderColor: fieldErrors.name ? theme.danger : theme.border, color: theme.inputText },
            readOnly && { backgroundColor: theme.background, color: theme.muted }
          ]}
          value={form.name}
          onChangeText={(v) => {
            clearFieldError('name');
            setForm((f) => ({ ...f, name: v }));
          }}
          placeholder={t('HDFC Bank / SBI')}
          placeholderTextColor={theme.muted}
          editable={!readOnly}
        />
        {!!fieldErrors.name ? <Text style={[styles.fieldError, { color: theme.danger }]}>{fieldErrors.name}</Text> : null}

        <Text style={[styles.label, { color: theme.muted }]}>{t('Holder Type')}</Text>
        <Pressable
          style={[
            styles.dropdownTrigger,
            { borderColor: theme.border, backgroundColor: theme.inputBg }
          ]}
          disabled={readOnly}
          onPress={() => setShowHolderOptions((v) => !v)}
        >
          <Text style={[styles.dropdownText, { color: theme.inputText }]}>{t(form.holder_type || 'Holder Type')}</Text>
          <Text style={[styles.dropdownArrow, { color: theme.muted }]}>{showHolderOptions ? '▲' : '▼'}</Text>
        </Pressable>
        {showHolderOptions ? (
          <View style={[styles.dropdownMenu, { borderColor: theme.border, backgroundColor: theme.card }]}>
            {HOLDER_OPTIONS.map((holderType) => (
              <Pressable
                key={holderType}
                style={[
                  styles.dropdownItem,
                  { borderBottomColor: theme.border },
                  form.holder_type === holderType && { backgroundColor: theme.accentSoft }
                ]}
                onPress={() => {
                  setForm((f) => ({ ...f, holder_type: holderType }));
                  setShowHolderOptions(false);
                }}
              >
                <Text
                  style={[
                    styles.dropdownItemText,
                    { color: theme.text },
                    form.holder_type === holderType && { color: theme.accent, fontWeight: '700' }
                  ]}
                >
                  {t(holderType)}
                </Text>
              </Pressable>
            ))}
          </View>
        ) : null}

        <Text style={[styles.label, { color: theme.muted }]}>{t('How to reach this institution')}</Text>
        <HelpLine
          theme={theme}
          text={t('This tells your family the fastest next step to reach the institution.')}
        />
        <Pressable
          style={[
            styles.dropdownTrigger,
            { borderColor: theme.border, backgroundColor: theme.inputBg }
          ]}
          disabled={readOnly}
          onPress={() => setShowReachOptions((v) => !v)}
        >
          <Text style={[styles.dropdownText, { color: theme.inputText }]}>{t(form.reach_via || 'Branch')}</Text>
          <Text style={[styles.dropdownArrow, { color: theme.muted }]}>{showReachOptions ? '▲' : '▼'}</Text>
        </Pressable>
        {showReachOptions ? (
          <View style={[styles.dropdownMenu, { borderColor: theme.border, backgroundColor: theme.card }]}>
            {REACH_OPTIONS.map((reachVia) => (
              <Pressable
                key={reachVia}
                style={[
                  styles.dropdownItem,
                  { borderBottomColor: theme.border },
                  form.reach_via === reachVia && { backgroundColor: theme.accentSoft }
                ]}
                onPress={() => {
                  setForm((f) => ({ ...f, reach_via: reachVia }));
                  setShowReachOptions(false);
                }}
              >
                <Text
                  style={[
                    styles.dropdownItemText,
                    { color: theme.text },
                    form.reach_via === reachVia && { color: theme.accent, fontWeight: '700' }
                  ]}
                >
                  {t(reachVia)}
                </Text>
              </Pressable>
            ))}
          </View>
        ) : null}

        <Text style={[styles.label, { color: theme.muted }]}>{t('Relationship / Branch Manager Mobile')}</Text>
        <HelpLine
          theme={theme}
          text={t('Sensitive field. Stored in non-human-readable form; full value can be seen only using your security PIN.')}
        />
        <TextInput
          ref={relationshipMobileInputRef}
          onLayout={(event) => setFieldOffset('relationship_mobile', event.nativeEvent.layout.y)}
          style={[
            styles.input,
            {
              backgroundColor: theme.inputBg,
              borderColor: fieldErrors.relationship_mobile ? theme.danger : theme.border,
              color: theme.inputText
            },
            readOnly && { backgroundColor: theme.background, color: theme.muted }
          ]}
          value={form.relationship_mobile}
          onChangeText={(v) => {
            clearFieldError('relationship_mobile');
            setForm((f) => ({ ...f, relationship_mobile: String(v || '').replace(/\D/g, '').slice(0, 10) }));
          }}
          placeholder={editingId ? t('Enter new mobile to replace existing') : t('10-digit mobile number')}
          keyboardType="number-pad"
          placeholderTextColor={theme.muted}
          editable={!readOnly}
        />
        {!!fieldErrors.relationship_mobile ? (
          <Text style={[styles.fieldError, { color: theme.danger }]}>{fieldErrors.relationship_mobile}</Text>
        ) : null}

        <Text style={[styles.label, { color: theme.muted }]}>{t('Asset Account / Unique Number')}</Text>
        <HelpLine
          theme={theme}
          text={t('Sensitive field. Stored in non-human-readable form; full value can be seen only using your security PIN.')}
        />
        <TextInput
          style={[
            styles.input,
            { backgroundColor: theme.inputBg, borderColor: theme.border, color: theme.inputText },
            readOnly && { backgroundColor: theme.background, color: theme.muted }
          ]}
          value={form.account_ref}
          onChangeText={(v) => setForm((f) => ({ ...f, account_ref: v }))}
          placeholder={editingId ? t('Enter new identifier to replace existing') : t('Folio / Account No / Demat ID')}
          autoCapitalize="none"
          placeholderTextColor={theme.muted}
          editable={!readOnly}
        />

        <Text style={[styles.label, { color: theme.muted }]}>{t('Tracking Website URL')}</Text>
        <HelpLine
          theme={theme}
          text={t('Only domain is stored (for example, bankname.com) to keep details minimal and discreet.')}
        />
        <TextInput
          ref={trackingUrlInputRef}
          onLayout={(event) => setFieldOffset('tracking_url', event.nativeEvent.layout.y)}
          style={[
            styles.input,
            { backgroundColor: theme.inputBg, borderColor: fieldErrors.tracking_url ? theme.danger : theme.border, color: theme.inputText },
            readOnly && { backgroundColor: theme.background, color: theme.muted }
          ]}
          value={form.tracking_url}
          onChangeText={(v) => {
            clearFieldError('tracking_url');
            setForm((f) => ({ ...f, tracking_url: v }));
          }}
          placeholder={t('https://...')}
          autoCapitalize="none"
          placeholderTextColor={theme.muted}
          editable={!readOnly}
        />
        {!!fieldErrors.tracking_url ? (
          <Text style={[styles.fieldError, { color: theme.danger }]}>{fieldErrors.tracking_url}</Text>
        ) : null}

        <Text style={[styles.label, { color: theme.muted }]}>{t('Current Value')}</Text>
        <TextInput
          ref={currentValueInputRef}
          onLayout={(event) => setFieldOffset('current_value', event.nativeEvent.layout.y)}
          style={[
            styles.input,
            {
              backgroundColor: theme.inputBg,
              borderColor: fieldErrors.current_value ? theme.danger : theme.border,
              color: theme.inputText
            },
            readOnly && { backgroundColor: theme.background, color: theme.muted }
          ]}
          keyboardType="numeric"
          value={form.current_value}
          onChangeText={(v) => {
            clearFieldError('current_value');
            setForm((f) => ({ ...f, current_value: v }));
          }}
          placeholderTextColor={theme.muted}
          editable={!readOnly}
        />
        {!!fieldErrors.current_value ? (
          <Text style={[styles.fieldError, { color: theme.danger }]}>{fieldErrors.current_value}</Text>
        ) : null}

        <Text style={[styles.label, { color: theme.muted }]}>{t('Invested Amount')}</Text>
        <TextInput
          ref={investedAmountInputRef}
          onLayout={(event) => setFieldOffset('invested_amount', event.nativeEvent.layout.y)}
          style={[
            styles.input,
            {
              backgroundColor: theme.inputBg,
              borderColor: fieldErrors.invested_amount ? theme.danger : theme.border,
              color: theme.inputText
            },
            readOnly && { backgroundColor: theme.background, color: theme.muted }
          ]}
          keyboardType="numeric"
          value={form.invested_amount}
          onChangeText={(v) => {
            clearFieldError('invested_amount');
            setForm((f) => ({ ...f, invested_amount: v }));
          }}
          placeholderTextColor={theme.muted}
          editable={!readOnly}
        />
        {!!fieldErrors.invested_amount ? (
          <Text style={[styles.fieldError, { color: theme.danger }]}>{fieldErrors.invested_amount}</Text>
        ) : null}

        <Text style={[styles.label, { color: theme.muted }]}>{t('Notes for Family')}</Text>
        <HelpLine
          theme={theme}
          text={t('Use this to guide family on what to do next. Stored encrypted and unlocked only with security PIN.')}
        />
        <TextInput
          style={[
            styles.input,
            styles.notesInput,
            { backgroundColor: theme.inputBg, borderColor: theme.border, color: theme.inputText },
            readOnly && { backgroundColor: theme.background, color: theme.muted }
          ]}
          value={form.notes_for_family}
          onChangeText={(v) => setForm((f) => ({ ...f, notes_for_family: v }))}
          placeholder={editingId ? t('Enter new notes to replace existing') : t('How family can trace this quickly')}
          placeholderTextColor={theme.muted}
          multiline
          editable={!readOnly}
        />

        <PillButton
          label={editingId ? t('Update Asset') : t('Save Asset')}
          onPress={() =>
            submit().catch((e) => {
              setMessage(String(e?.message || e));
              setMessageKind('error');
            })
          }
          disabled={readOnly}
        />
        {editingId ? (
          <View style={{ marginTop: 8 }}>
            <PillButton label={t('Cancel Edit')} kind="ghost" onPress={cancelEdit} disabled={readOnly} />
          </View>
        ) : null}
        {!!message ? (
          <Text
            style={[
              styles.formMessage,
              { color: messageKind === 'error' ? theme.danger : messageKind === 'success' ? theme.success : theme.text }
            ]}
          >
            {message}
          </Text>
        ) : null}
      </SectionCard>

      <SectionCard title={t('Current Assets')}>
        {Number(maxAssets) > 0 ? (
          <View style={styles.planLimitRow}>
            <Text style={[styles.planLimitText, { color: theme.warn }]}>
              {t('Basic plan: {used}/{total} assets used', { used: items.length, total: maxAssets })}
            </Text>
            <PillButton label={t('Upgrade')} kind="ghost" onPress={onOpenSubscription} />
          </View>
        ) : null}
        {visibleItems.map((item) => (
          <View key={item.id} style={[styles.row, { borderColor: theme.border, backgroundColor: theme.card }]}>
            <View style={styles.rowHeader}>
              <View style={styles.rowTitleWrap}>
                <Text style={[styles.name, { color: theme.text }]}>{item.institution || item.name}</Text>
                <Text style={[styles.sub, { color: theme.muted }]}>{t(item.category)}</Text>
              </View>
              <Text style={[styles.amount, { color: theme.success }]}>
                {displayAmount(item.current_value, hideSensitive, preferredCurrency, fxRates)}
              </Text>
            </View>
            <View style={styles.metaBlock}>
              {hasInfo(item.holder_type) ? (
                <Text style={[styles.sub, { color: theme.muted }]}>{t('Holder: {value}', { value: t(item.holder_type) })}</Text>
              ) : null}
              {hasInfo(item.reach_via) ? (
                <Text style={[styles.sub, { color: theme.muted }]}>{t('Reach via: {value}', { value: t(item.reach_via) })}</Text>
              ) : null}
              {hasInfo(item.relationship_mobile) ? (
                <Text style={[styles.sub, { color: theme.muted }]}>{t('Relationship / Branch Manager: {value}', { value: item.relationship_mobile })}</Text>
              ) : null}
              {hasInfo(item.account_ref) ? (
                <Text style={[styles.sub, { color: theme.muted }]}>{t('Account Ref: {value}', { value: item.account_ref })}</Text>
              ) : null}
              {hasInfo(item.tracking_url) ? (
                <Text style={[styles.sub, { color: theme.muted }]}>{t('Website: {value}', { value: item.tracking_url })}</Text>
              ) : null}
              {Number(item.invested_amount || 0) > 0 ? (
                <Text style={[styles.sub, { color: theme.muted }]}>{t('Invested: {value}', { value: displayAmount(item.invested_amount, hideSensitive, preferredCurrency, fxRates) })}</Text>
              ) : null}
              {hasInfo(item.notes) ? (
                <Text style={[styles.sub, { color: theme.muted }]}>{t('Notes for Family: {value}', { value: item.notes })}</Text>
              ) : null}
              {hasInfo(item.updated_at) ? (
                <Text style={[styles.sub, { color: theme.muted }]}>
                  {t('Last Updated: {value}', { value: String(item.updated_at).replace('T', ' ').slice(0, 19) })}
                </Text>
              ) : null}
              <Text style={[styles.sub, { color: theme.muted }]}>
                {t('Updated By: {value}', { value: hasInfo(item.updated_by_initials) ? item.updated_by_initials : 'NA' })}
              </Text>
            </View>
            <View style={styles.actionsRow}>
              <PillButton label={t('View Full')} kind="ghost" onPress={() => openReveal(item)} />
              <PillButton label={t('Edit')} kind="ghost" onPress={() => startEdit(item)} disabled={readOnly} />
              <PillButton
                label={t('Delete')}
                kind="ghost"
                onPress={() =>
                  remove(item.id).catch((e) => {
                    setMessage(String(e?.message || e));
                    setMessageKind('error');
                  })
                }
                disabled={readOnly}
              />
            </View>
          </View>
        ))}
        {!visibleItems.length ? <Text style={[styles.sub, { color: theme.muted }]}>{t('No non-zero assets yet.')}</Text> : null}
      </SectionCard>

      <Modal visible={revealVisible} transparent animationType="fade">
        <View style={styles.modalBackdrop}>
          <View style={[styles.modalCard, { backgroundColor: theme.card, borderColor: theme.border }]}> 
            <Text style={[styles.modalTitle, { color: theme.text }]}>{t('Sensitive Asset Details')}</Text>
            <Text style={[styles.modalSub, { color: theme.muted }]}> 
              {t('Enter your security PIN to view full identifier, contact, and notes.')}
            </Text>
            <TextInput
              style={[styles.modalInput, { borderColor: theme.border, backgroundColor: theme.inputBg, color: theme.inputText }]}
              value={revealPin}
              onChangeText={(v) => setRevealPin(String(v || '').replace(/\D/g, '').slice(0, 4))}
              keyboardType="number-pad"
              secureTextEntry
              maxLength={4}
              placeholder={t('4-digit PIN')}
              placeholderTextColor={theme.muted}
            />
            {!!revealError ? <Text style={[styles.modalError, { color: theme.danger }]}>{revealError}</Text> : null}
            {revealData ? (
              <View style={styles.revealDetails}>
                <Text style={[styles.revealLine, { color: theme.text }]}>{t('Identifier: {value}', { value: revealData.account_ref || '-' })}</Text>
                <Text style={[styles.revealLine, { color: theme.text }]}>{t('Contact: {value}', { value: revealData.relationship_mobile || '-' })}</Text>
                <Text style={[styles.revealLine, { color: theme.text }]}>{t('Tracking URL: {value}', { value: revealData.tracking_url || '-' })}</Text>
                <Text style={[styles.revealLine, { color: theme.text }]}>{t('Notes: {value}', { value: revealData.notes || '-' })}</Text>
              </View>
            ) : null}
            <View style={styles.modalActions}>
              <PillButton label={t('Close')} kind="ghost" onPress={closeReveal} />
              <PillButton
                label={revealLoading ? t('Please wait...') : t('Unlock')}
                onPress={() => submitReveal().catch((e) => setRevealError(String(e?.message || e)))}
                disabled={revealLoading}
              />
            </View>
          </View>
        </View>
      </Modal>

      {limitReached ? (
        <View style={styles.limitCtaRow}>
          <PillButton label={t('Upgrade to Premium')} onPress={onOpenSubscription} />
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  label: { color: '#35526e', fontWeight: '700', marginBottom: 5 },
  helpText: {
    fontSize: 11,
    lineHeight: 16,
    marginBottom: 8,
    marginTop: -2,
    fontWeight: '500'
  },
  fieldError: {
    marginTop: -8,
    marginBottom: 10,
    fontSize: 12,
    fontWeight: '700'
  },
  formMessage: {
    marginTop: 12,
    fontWeight: '700',
    fontSize: 13
  },
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
  notesInput: {
    minHeight: 72,
    textAlignVertical: 'top'
  },
  inputDisabled: {
    backgroundColor: '#f2f4f7',
    color: '#8aa0b6'
  },
  row: {
    flexDirection: 'column',
    alignItems: 'stretch',
    paddingVertical: 10,
    paddingHorizontal: 10,
    borderWidth: 1,
    borderColor: '#e4ebf5',
    borderRadius: 12,
    backgroundColor: '#fbfdff',
    marginBottom: 8,
    gap: 8
  },
  rowHeader: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: 10
  },
  rowTitleWrap: {
    flex: 1
  },
  metaBlock: {
    gap: 2
  },
  actionsRow: {
    marginTop: 4,
    flexDirection: 'row',
    gap: 6,
    flexWrap: 'wrap',
    justifyContent: 'flex-start'
  },
  name: { color: '#0f3557', fontWeight: '700' },
  sub: { color: '#607d99' },
  amount: { color: '#0a8f4b', fontWeight: '800' },
  readOnlyText: { color: '#9a6b00', fontWeight: '700', marginBottom: 8 },
  modalBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.35)',
    justifyContent: 'center',
    paddingHorizontal: 18
  },
  modalCard: {
    borderRadius: 12,
    borderWidth: 1,
    padding: 14
  },
  modalTitle: {
    fontWeight: '800',
    fontSize: 15
  },
  modalSub: {
    marginTop: 4,
    marginBottom: 10,
    fontSize: 12,
    lineHeight: 17
  },
  modalInput: {
    borderWidth: 1,
    borderRadius: 10,
    paddingHorizontal: 10,
    paddingVertical: 8
  },
  modalError: {
    marginTop: 8,
    fontWeight: '600'
  },
  modalActions: {
    marginTop: 12,
    flexDirection: 'row',
    gap: 8,
    justifyContent: 'flex-end'
  },
  revealDetails: {
    marginTop: 10,
    gap: 5
  },
  revealLine: {
    fontSize: 12,
    lineHeight: 17,
    fontWeight: '600'
  },
  message: { color: '#0f3557', marginBottom: 20, fontWeight: '600' }
});
