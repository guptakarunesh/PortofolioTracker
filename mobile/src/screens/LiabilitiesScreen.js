import React, { useEffect, useState, useCallback, useRef } from 'react';
import { View, Text, TextInput, StyleSheet, Pressable, Modal, Alert } from 'react-native';
import { api } from '../api/client';
import FeedbackBanner from '../components/FeedbackBanner';
import SectionCard from '../components/SectionCard';
import PillButton from '../components/PillButton';
import { formatAmountFromInr } from '../utils/format';
import { useTheme } from '../theme';
import { useI18n } from '../i18n';

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

const HOLDER_OPTIONS = ['Self', 'Joint', 'Either or Survivor', 'Nominee Tagged'];
const REACH_OPTIONS = ['Branch', 'RM', 'Customer Care', 'Portal'];
const blankForm = {
  loan_type: LOAN_TYPE_OPTIONS[0],
  lender: '',
  holder_type: HOLDER_OPTIONS[0],
  reach_via: REACH_OPTIONS[0],
  account_ref: '',
  outstanding_amount: '',
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

export default function LiabilitiesScreen({
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
  const isLight = theme.key === 'light';
  const [items, setItems] = useState([]);
  const [form, setForm] = useState(blankForm);
  const [editingId, setEditingId] = useState(null);
  const [message, setMessage] = useState('');
  const [messageKind, setMessageKind] = useState('info');
  const [fieldErrors, setFieldErrors] = useState({});
  const [showLoanTypeOptions, setShowLoanTypeOptions] = useState(false);
  const [showHolderOptions, setShowHolderOptions] = useState(false);
  const [showReachOptions, setShowReachOptions] = useState(false);
  const [liabilitySortType, setLiabilitySortType] = useState('amount');
  const [liabilitySortDirection, setLiabilitySortDirection] = useState('desc');
  const [limitReached, setLimitReached] = useState(false);
  const [revealVisible, setRevealVisible] = useState(false);
  const [revealItem, setRevealItem] = useState(null);
  const [revealPin, setRevealPin] = useState('');
  const [revealData, setRevealData] = useState(null);
  const [revealError, setRevealError] = useState('');
  const [revealLoading, setRevealLoading] = useState(false);
  const [expandedLiabilityId, setExpandedLiabilityId] = useState(null);
  const lenderInputRef = useRef(null);
  const outstandingAmountInputRef = useRef(null);
  const fieldOffsetsRef = useRef({});

  const load = useCallback(async () => {
    const rows = await api.getLiabilities();
    setItems(rows);
  }, []);

  useEffect(() => {
    load().catch((e) => {
      setMessage(String(e?.message || e));
      setMessageKind('error');
    });
  }, [load]);

  useEffect(() => {
    if (!message) return undefined;
    const timer = setTimeout(() => setMessage(''), 5000);
    return () => clearTimeout(timer);
  }, [message]);

  const clearFieldError = useCallback((key) => {
    setFieldErrors((prev) => {
      if (!prev[key]) return prev;
      const next = { ...prev };
      delete next[key];
      return next;
    });
  }, []);

  const focusField = useCallback((key) => {
    if (key === 'lender' && lenderInputRef.current?.focus) lenderInputRef.current.focus();
    if (key === 'outstanding_amount' && outstandingAmountInputRef.current?.focus) outstandingAmountInputRef.current.focus();
  }, []);

  const resetForm = () => {
    setForm(blankForm);
    setEditingId(null);
    setFieldErrors({});
    setShowLoanTypeOptions(false);
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
      setMessage(t('Subscription expired. Renew to edit liabilities.'));
      setMessageKind('error');
      return;
    }
    setEditingId(item.id);
    setForm({
      loan_type: item.loan_type || 'Home Loan',
      lender: item.lender || '',
      holder_type: item.holder_type || HOLDER_OPTIONS[0],
      reach_via: item.reach_via || REACH_OPTIONS[0],
      account_ref: '',
      outstanding_amount: String(item.outstanding_amount ?? ''),
      notes_for_family: ''
    });
    setShowLoanTypeOptions(false);
    setShowHolderOptions(false);
    setShowReachOptions(false);
    setFieldErrors({});
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
      const details = await api.revealLiabilitySensitive(revealItem.id, revealPin);
      setRevealData(details || null);
    } catch (e) {
      setRevealError(String(e?.message || e));
    } finally {
      setRevealLoading(false);
    }
  };

  const submit = async () => {
    if (readOnly) {
      setMessage(t('Subscription expired. Renew to edit liabilities.'));
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

    if (!form.loan_type.trim()) {
      registerError('loan_type', t('Loan Type is required.'));
    }
    if (!form.lender.trim()) {
      registerError('lender', t('Institution Name is required.'));
    }

    const cleanedOutstanding = String(form.outstanding_amount || '').trim().replace(/,/g, '');
    if (cleanedOutstanding) {
      const n = Number(cleanedOutstanding);
      if (!Number.isFinite(n) || n < 0) {
        registerError('outstanding_amount', t('Outstanding Amount must be a valid non-negative number.'));
      }
    }

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
    const basicPlanActive =
      subscriptionStatus?.status === 'active' &&
      ['basic_monthly', 'basic_yearly'].includes(String(subscriptionStatus?.plan || ''));
    const maxLiabilities =
      Number(subscriptionStatus?.limits?.maxLiabilities || 0) > 0
        ? Number(subscriptionStatus?.limits?.maxLiabilities || 0)
        : basicPlanActive
          ? 5
          : 0;
    if (!editingId && maxLiabilities > 0 && items.length >= maxLiabilities) {
      setLimitReached(true);
      setMessage(t('Basic plan allows up to {count} liabilities. Upgrade to Premium for unlimited liabilities.', { count: maxLiabilities }));
      setMessageKind('error');
      return;
    }
    const basePayload = {
      loan_type: form.loan_type,
      lender: form.lender,
      holder_type: form.holder_type,
      reach_via: form.reach_via,
      outstanding_amount: Number(form.outstanding_amount || 0)
    };

    try {
      if (editingId) {
        const payload = { ...basePayload };
        if (normalizedAccountRef) payload.account_ref = normalizedAccountRef;
        if (normalizedNotes) payload.notes_for_family = normalizedNotes;
        await api.updateLiability(editingId, payload);
        setMessage(t('Liability updated.'));
        setMessageKind('success');
      } else {
        await api.createLiability({
          ...basePayload,
          account_ref: normalizedAccountRef,
          notes_for_family: normalizedNotes
        });
        setMessage(t('Liability added.'));
        setMessageKind('success');
      }
      setFieldErrors({});
      setLimitReached(false);
      resetForm();
      await load();
    } catch (e) {
      const raw = String(e?.message || e);
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
      setMessage(t('Subscription expired. Renew to edit liabilities.'));
      setMessageKind('error');
      return;
    }
    try {
      await api.deleteLiability(id);
      if (editingId === id) resetForm();
      setMessage(t('Liability deleted.'));
      setMessageKind('success');
      await load();
    } catch (e) {
      setMessage(String(e?.message || e));
      setMessageKind('error');
    }
  };

  const confirmRemove = (item) => {
    Alert.alert(
      t('Delete Liability'),
      t('Delete {name}? This action cannot be undone.', { name: item?.loan_type || t('this liability') }),
      [
        { text: t('Cancel'), style: 'cancel' },
        {
          text: t('Delete'),
          style: 'destructive',
          onPress: () => {
            remove(item.id).catch((e) => {
              setMessage(String(e?.message || e));
              setMessageKind('error');
            });
          }
        }
      ]
    );
  };

  const cancelEdit = () => {
    resetForm();
    setMessage('');
    setMessageKind('info');
  };

  const toggleExpanded = (id) => {
    setExpandedLiabilityId((current) => (current === id ? null : id));
  };

  const toggleTypeSort = () => {
    setLiabilitySortType('type');
    setLiabilitySortDirection((current) => (liabilitySortType === 'type' && current === 'asc' ? 'desc' : 'asc'));
  };

  const toggleAmountSort = () => {
    setLiabilitySortType('amount');
    setLiabilitySortDirection((current) => (liabilitySortType === 'amount' && current === 'asc' ? 'desc' : 'asc'));
  };

  const sortedItems = [...items].sort((a, b) => {
    if (liabilitySortType === 'type') {
      return liabilitySortDirection === 'asc'
        ? String(a.loan_type || '').localeCompare(String(b.loan_type || ''))
        : String(b.loan_type || '').localeCompare(String(a.loan_type || ''));
    }
    return liabilitySortDirection === 'asc'
      ? Number(a.outstanding_amount || 0) - Number(b.outstanding_amount || 0)
      : Number(b.outstanding_amount || 0) - Number(a.outstanding_amount || 0);
  });
  const totalLiabilityValue = sortedItems.reduce((sum, item) => sum + Number(item.outstanding_amount || 0), 0);
  const basicPlanActive =
    subscriptionStatus?.status === 'active' &&
    ['basic_monthly', 'basic_yearly'].includes(String(subscriptionStatus?.plan || ''));
  const maxLiabilities =
    Number(subscriptionStatus?.limits?.maxLiabilities || 0) > 0
      ? Number(subscriptionStatus?.limits?.maxLiabilities || 0)
      : basicPlanActive
        ? 5
        : 0;
  return (
    <View>
      <SectionCard title={editingId ? t('Edit Liability') : t('Add Liability')}>
        {readOnly ? <Text style={[styles.readOnlyText, { color: theme.warn }]}>{t('Subscription expired. View-only mode.')}</Text> : null}
        <Text style={[styles.label, { color: theme.muted }]}>{t('Type')}</Text>
        <Pressable
          onLayout={(event) => setFieldOffset('loan_type', event.nativeEvent.layout.y)}
          style={[styles.dropdownTrigger, { borderColor: theme.border, backgroundColor: theme.inputBg }]}
          disabled={readOnly}
          onPress={() => setShowLoanTypeOptions((v) => !v)}
        >
          <Text style={[styles.dropdownText, { color: theme.inputText }]}>{t(form.loan_type || 'Select type')}</Text>
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
                  form.loan_type === type && { backgroundColor: isLight ? theme.accentSoft : '#155EAF' }
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
                    form.loan_type === type && { color: isLight ? theme.accent : '#FFFFFF', fontWeight: '700' }
                  ]}
                >
                  {t(type)}
                </Text>
              </Pressable>
            ))}
          </View>
        ) : null}

        <Text style={[styles.label, { color: theme.muted }]}>{t('Institution Name')}</Text>
        <TextInput
          ref={lenderInputRef}
          onLayout={(event) => setFieldOffset('lender', event.nativeEvent.layout.y)}
          onFocus={() => scrollToField('lender')}
          style={[
            styles.input,
            { backgroundColor: theme.inputBg, borderColor: fieldErrors.lender ? theme.danger : theme.border, color: theme.inputText },
            readOnly && { backgroundColor: theme.background, color: theme.muted }
          ]}
          value={form.lender}
          onChangeText={(v) => {
            clearFieldError('lender');
            setForm((f) => ({ ...f, lender: v }));
          }}
          placeholder={t('HDFC Bank / SBI')}
          placeholderTextColor={theme.muted}
          editable={!readOnly}
        />
        {!!fieldErrors.lender ? <Text style={[styles.fieldError, { color: theme.danger }]}>{fieldErrors.lender}</Text> : null}

        <Text style={[styles.label, { color: theme.muted }]}>{t('Holder Type')}</Text>
        <Pressable
          style={[styles.dropdownTrigger, { borderColor: theme.border, backgroundColor: theme.inputBg }]}
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
                  form.holder_type === holderType && { backgroundColor: isLight ? theme.accentSoft : '#155EAF' }
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
                    form.holder_type === holderType && { color: isLight ? theme.accent : '#FFFFFF', fontWeight: '700' }
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
          style={[styles.dropdownTrigger, { borderColor: theme.border, backgroundColor: theme.inputBg }]}
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
                  form.reach_via === reachVia && { backgroundColor: isLight ? theme.accentSoft : '#155EAF' }
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
                    form.reach_via === reachVia && { color: isLight ? theme.accent : '#FFFFFF', fontWeight: '700' }
                  ]}
                >
                  {t(reachVia)}
                </Text>
              </Pressable>
            ))}
          </View>
        ) : null}

        <Text style={[styles.label, { color: theme.muted }]}>{t('Liability Account / Unique Number')}</Text>
        <HelpLine
          theme={theme}
          text={t('Sensitive field. Stored in non-human-readable form; full value can be seen only using your security PIN.')}
        />
        <TextInput
          onFocus={() => scrollToField('account_ref')}
          onLayout={(event) => setFieldOffset('account_ref', event.nativeEvent.layout.y)}
          style={[
            styles.input,
            { backgroundColor: theme.inputBg, borderColor: theme.border, color: theme.inputText },
            readOnly && { backgroundColor: theme.background, color: theme.muted }
          ]}
          value={form.account_ref}
          onChangeText={(v) => setForm((f) => ({ ...f, account_ref: v }))}
          placeholder={editingId ? t('Enter new identifier to replace existing') : t('Loan Account Number')}
          autoCapitalize="none"
          placeholderTextColor={theme.muted}
          editable={!readOnly}
        />

        <Text style={[styles.label, { color: theme.muted }]}>{t('Outstanding Amount')}</Text>
        <TextInput
          ref={outstandingAmountInputRef}
          onLayout={(event) => setFieldOffset('outstanding_amount', event.nativeEvent.layout.y)}
          onFocus={() => scrollToField('outstanding_amount')}
          style={[
            styles.input,
            {
              backgroundColor: theme.inputBg,
              borderColor: fieldErrors.outstanding_amount ? theme.danger : theme.border,
              color: theme.inputText
            },
            readOnly && { backgroundColor: theme.background, color: theme.muted }
          ]}
          keyboardType="numeric"
          value={form.outstanding_amount}
          onChangeText={(v) => {
            clearFieldError('outstanding_amount');
            setForm((f) => ({ ...f, outstanding_amount: v }));
          }}
          editable={!readOnly}
        />
        {!!fieldErrors.outstanding_amount ? (
          <Text style={[styles.fieldError, { color: theme.danger }]}>{fieldErrors.outstanding_amount}</Text>
        ) : null}

        <Text style={[styles.label, { color: theme.muted }]}>{t('Notes for Family')}</Text>
        <HelpLine
          theme={theme}
          text={t('Use this to guide family on what to do next. Stored encrypted and unlocked only with security PIN.')}
        />
        <TextInput
          onFocus={() => scrollToField('notes_for_family')}
          onLayout={(event) => setFieldOffset('notes_for_family', event.nativeEvent.layout.y)}
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
          label={editingId ? t('Update Liability') : t('Save Liability')}
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
        {limitReached ? (
          <View style={styles.limitCtaRow}>
            <PillButton label={t('Upgrade to Premium')} onPress={onOpenSubscription} />
          </View>
        ) : null}
      </SectionCard>

      <FeedbackBanner message={message} kind={messageKind} />

      <SectionCard>
        <View style={styles.sectionHeaderRow}>
          <View style={styles.sectionHeaderTitleWrap}>
            <Text style={[styles.sectionHeaderTitle, { color: theme.text }]}>{t('Current Liabilities')}</Text>
            <Text style={[styles.sectionHeaderTotal, { color: theme.danger }]}>
              {displayAmount(totalLiabilityValue, hideSensitive, preferredCurrency, fxRates)}
            </Text>
          </View>
          <View style={styles.sortActionsRow}>
            <Pressable
              onPress={toggleTypeSort}
              style={[
                styles.sortIconButton,
                { borderColor: theme.border, backgroundColor: theme.inputBg },
                liabilitySortType === 'type' && {
                  borderColor: isLight ? theme.accent : '#155EAF',
                  backgroundColor: isLight ? theme.accent : '#155EAF'
                }
              ]}
            >
              <Text style={[styles.sortIconGlyph, { color: liabilitySortType === 'type' ? '#FFFFFF' : theme.muted }]}>
                {liabilitySortDirection === 'asc' && liabilitySortType === 'type' ? 'A→Z' : 'Z→A'}
              </Text>
            </Pressable>
            <Pressable
              onPress={toggleAmountSort}
              style={[
                styles.sortIconButton,
                { borderColor: theme.border, backgroundColor: theme.inputBg },
                liabilitySortType === 'amount' && {
                  borderColor: isLight ? theme.accent : '#155EAF',
                  backgroundColor: isLight ? theme.accent : '#155EAF'
                }
              ]}
            >
              <Text style={[styles.sortIconGlyph, { color: liabilitySortType === 'amount' ? '#FFFFFF' : theme.muted }]}>
                {liabilitySortDirection === 'asc' && liabilitySortType === 'amount' ? '↑₹' : '↓₹'}
              </Text>
            </Pressable>
          </View>
        </View>
        {Number(maxLiabilities) > 0 ? (
          <View style={styles.planLimitRow}>
            <Text style={[styles.planLimitText, { color: theme.warn }]}>{usageText}</Text>
            <PillButton label={t('Upgrade')} kind="primary" onPress={onOpenSubscription} />
          </View>
        ) : null}
        {sortedItems.map((item) => (
          <View key={item.id} style={[styles.row, { borderColor: theme.border, backgroundColor: theme.card }]}>
            <Pressable style={styles.rowHeader} onPress={() => toggleExpanded(item.id)}>
              <View style={styles.rowTitleWrap}>
                <Text style={[styles.name, { color: theme.text }]}>{t(item.loan_type)}</Text>
                <Text style={[styles.sub, { color: theme.muted }]}>{item.lender}</Text>
              </View>
              <View style={styles.amountBlock}>
                <Text style={[styles.amount, { color: theme.danger }]}>
                  {displayAmount(item.outstanding_amount, hideSensitive, preferredCurrency, fxRates)}
                </Text>
                <Text style={[styles.amountLabel, { color: theme.muted }]}>{t('Outstanding')}</Text>
                <Text style={[styles.expandHint, { color: theme.muted }]}>{expandedLiabilityId === item.id ? '▲' : '▼'}</Text>
              </View>
            </Pressable>
            {expandedLiabilityId === item.id ? (
              <>
                <View style={styles.metaBlock}>
                  {hasInfo(item.holder_type) ? (
                    <Text style={[styles.sub, { color: theme.muted }]}>{t('Holder: {value}', { value: t(item.holder_type) })}</Text>
                  ) : null}
                  {hasInfo(item.reach_via) ? (
                    <Text style={[styles.sub, { color: theme.muted }]}>{t('Reach via: {value}', { value: t(item.reach_via) })}</Text>
                  ) : null}
                  {hasInfo(item.account_ref) ? (
                    <Text style={[styles.sub, { color: theme.muted }]}>{t('Account Ref: {value}', { value: item.account_ref })}</Text>
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
                    kind="danger"
                    onPress={() => confirmRemove(item)}
                    disabled={readOnly}
                  />
                </View>
              </>
            ) : null}
          </View>
        ))}
      </SectionCard>

      <Modal visible={revealVisible} transparent animationType="fade">
        <View style={styles.modalBackdrop}>
          <View style={[styles.modalCard, { backgroundColor: theme.card, borderColor: theme.border }]}> 
            <Text style={[styles.modalTitle, { color: theme.text }]}>{t('Sensitive Liability Details')}</Text>
            {revealData ? (
              <View style={styles.revealDetails}>
                <Text style={[styles.revealLine, { color: theme.text }]}>{t('Identifier: {value}', { value: revealData.account_ref || '-' })}</Text>
                <Text style={[styles.revealLine, { color: theme.text }]}>{t('Notes: {value}', { value: revealData.notes || '-' })}</Text>
              </View>
            ) : (
              <>
                <Text style={[styles.modalSub, { color: theme.muted }]}> 
                  {t('Enter your security PIN to view full identifier and notes.')}
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
              </>
            )}
            <View style={styles.modalActions}>
              <PillButton label={t('Close')} kind="ghost" onPress={closeReveal} />
              {!revealData ? (
                <PillButton
                  label={revealLoading ? t('Please wait...') : t('Unlock')}
                  onPress={() => submitReveal().catch((e) => setRevealError(String(e?.message || e)))}
                  disabled={revealLoading}
                />
              ) : null}
            </View>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  label: { fontWeight: '700', marginBottom: 5 },
  planUsageText: {
    marginBottom: 10,
    fontSize: 12,
    lineHeight: 16,
    fontWeight: '600'
  },
  limitCtaRow: {
    marginTop: 8
  },
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
    borderColor: '#D9E2EF',
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 10,
    marginBottom: 10,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center'
  },
  dropdownText: {
    color: '#0B1F3A'
  },
  dropdownArrow: {
    color: '#64748B',
    fontSize: 12
  },
  dropdownMenu: {
    borderWidth: 1,
    borderColor: '#D9E2EF',
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    marginBottom: 12,
    overflow: 'hidden'
  },
  dropdownItem: {
    paddingHorizontal: 10,
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: '#D9E2EF'
  },
  dropdownItemActive: {
    backgroundColor: '#E8F7F2'
  },
  dropdownItemText: {
    color: '#0B1F3A'
  },
  dropdownItemTextActive: {
    color: '#0E8A72',
    fontWeight: '700'
  },
  input: {
    borderWidth: 1,
    borderColor: '#D9E2EF',
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 10,
    marginBottom: 12
  },
  phoneWrap: {
    borderWidth: 1,
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 2,
    marginBottom: 12,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10
  },
  phonePrefix: {
    fontWeight: '800',
    fontSize: 15
  },
  phoneInput: {
    flex: 1,
    paddingVertical: 10
  },
  notesInput: {
    minHeight: 72,
    textAlignVertical: 'top'
  },
  inputDisabled: {
    backgroundColor: '#E2E8F0',
    color: '#64748B'
  },
  row: {
    flexDirection: 'column',
    alignItems: 'stretch',
    paddingVertical: 10,
    paddingHorizontal: 10,
    borderWidth: 1,
    borderColor: '#D9E2EF',
    borderRadius: 12,
    backgroundColor: '#FFFFFF',
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
  planLimitRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 10
  },
  sectionHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 8
  },
  sectionHeaderTitle: {
    fontSize: 17,
    fontWeight: '800',
    letterSpacing: 0.2
  },
  sectionHeaderTitleWrap: {
    flex: 1,
    paddingRight: 10
  },
  sectionHeaderTotal: {
    marginTop: 4,
    fontSize: 14,
    fontWeight: '800'
  },
  sortIconButton: {
    minWidth: 64,
    minHeight: 48,
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderRadius: 16,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center'
  },
  sortActionsRow: {
    flexDirection: 'row',
    gap: 8
  },
  sortIconGlyph: {
    fontSize: 15,
    lineHeight: 20,
    fontWeight: '900'
  },
  planLimitText: {
    color: '#B7791F',
    fontWeight: '700'
  },
  amountBlock: {
    alignItems: 'flex-end'
  },
  amountLabel: {
    fontSize: 11,
    fontWeight: '700',
    marginTop: 2
  },
  expandHint: {
    fontSize: 12,
    fontWeight: '800',
    marginTop: 6
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
  name: { color: '#0B1F3A', fontWeight: '700' },
  sub: { color: '#64748B' },
  amount: { color: '#FF5A5F', fontWeight: '800' },
  readOnlyText: { color: '#B7791F', fontWeight: '700', marginBottom: 8 },
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
  }
});
