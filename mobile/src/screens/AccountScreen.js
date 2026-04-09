import React, { useEffect, useState, useCallback, useRef } from 'react';
import { View, Text, StyleSheet, TextInput, Linking, Share, Animated, Modal, ScrollView } from 'react-native';
import * as Print from 'expo-print';
import * as Sharing from 'expo-sharing';
import SectionCard from '../components/SectionCard';
import PillButton from '../components/PillButton';
import { api, buildApiUrl } from '../api/client';
import { formatAmountFromInr } from '../utils/format';
import {
  canUseNativePhoneAuth,
  completeNativePhoneOtp,
  startNativePhoneOtp
} from '../firebase/nativePhoneAuth';
import { useTheme } from '../theme';
import { useI18n } from '../i18n';


function toCamelCaseWords(value = '') {
  const raw = String(value || '').trim();
  if (/^[A-Za-z]{1,2}$/.test(raw)) return raw.toUpperCase();
  return String(value)
    .toLowerCase()
    .split(/\s+/)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ');
}

function toInitials(value = '') {
  const raw = String(value || '').trim();
  if (/^[A-Za-z]{1,2}$/.test(raw)) return raw.toUpperCase();
  const parts = raw
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part.charAt(0).toUpperCase());
  if (parts.length) return parts.join('');
  const letters = raw.replace(/[^A-Za-z]/g, '').toUpperCase();
  if (letters.length >= 2) return letters.slice(0, 2);
  return letters || 'NA';
}

function maskMobile(value = '') {
  const digits = String(value || '').replace(/\D/g, '');
  if (!digits) return '-';
  if (digits.length <= 4) return `${'*'.repeat(Math.max(0, digits.length - 1))}${digits.slice(-1)}`;
  return `${'*'.repeat(Math.max(0, digits.length - 4))}${digits.slice(-4)}`;
}

function formatPlanLabel(plan) {
  if (!plan || plan === 'none') return 'None';
  return toCamelCaseWords(String(plan).replace(/_/g, ' '));
}

function formatStatusLabel(status) {
  if (!status || status === 'expired') return 'Expired';
  return toCamelCaseWords(String(status).replace(/_/g, ' '));
}

function formatProviderLabel(provider) {
  const value = String(provider || '').trim().toLowerCase();
  if (!value || value === '-') return '-';
  if (value === 'cashfree') return 'Cashfree';
  if (value === 'razorpay') return 'Razorpay';
  if (value === 'trial') return 'Trial';
  if (value === 'manual') return 'Manual';
  return toCamelCaseWords(value.replace(/_/g, ' '));
}

function formatIsoDate(value) {
  const raw = String(value || '').trim();
  if (!raw) return '-';
  return raw.slice(0, 10);
}

function escapeHtml(value = '') {
  return String(value || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function toMoney(value) {
  return Number(value || 0).toFixed(2);
}

function formatExportDateTime(value = '') {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return String(value || '-');
  return date.toLocaleString('en-IN', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit'
  });
}

function formatExportMoney(value, currency = 'INR', fxRates = { INR: 1 }) {
  const num = Number(value || 0);
  if (!Number.isFinite(num)) return '-';
  const normalizedCurrency = String(currency || 'INR').trim().toUpperCase() || 'INR';
  const formatted = formatAmountFromInr(num, normalizedCurrency, fxRates);
  const numericOnly = String(formatted || '')
    .replace(/[^\d.,\-]/g, '')
    .trim();
  return `${normalizedCurrency} ${numericOnly || '0'}`;
}

const YEARLY_TARGET_KEY_LABELS = {
  yearly_target_cash_bank_accounts: 'Cash & Bank Accounts',
  yearly_target_market_stocks_rsus: 'Market Stocks & RSUs',
  yearly_target_retirement_funds: 'Retirement Funds',
  yearly_target_real_estate: 'Real Estate',
  yearly_target_vehicles: 'Vehicles',
  yearly_target_business_equity: 'Business Equity',
  yearly_target_precious_metals: 'Precious Metals',
  yearly_target_jewelry_watches: 'Jewelry & Watches',
  yearly_target_collectibles: 'Collectibles',
  yearly_target_insurance_other: 'Insurance & Other'
};

function formatSettingLabel(key = '', t) {
  const normalized = String(key || '').trim().toLowerCase();
  if (!normalized) return '-';
  if (normalized === 'language') return t('Language');
  if (normalized === 'preferred_currency') return t('Display Currency');
  if (normalized === 'country') return t('Country');
  if (normalized === 'privacy_pin') return t('Security PIN (4 digits)');
  if (normalized === 'privacy_pin_enabled') return t('PIN Enabled');
  if (normalized === 'target_date') return t('Target Date (YYYY-MM-DD)');
  if (normalized === 'target_net_worth') return t('Net Worth');
  if (normalized === 'ui_theme') return t('Theme');
  if (normalized === 'targets_last_updated_at') return t('Last updated: {value}', { value: '' }).replace(': ', '').trim();
  if (normalized.startsWith('yearly_target_')) {
    const category = YEARLY_TARGET_KEY_LABELS[normalized];
    if (category) {
      return `${t('Target')} - ${t(category)}`;
    }
    return `${t('Target')} - ${toCamelCaseWords(normalized.replace(/^yearly_target_/, '').replace(/_/g, ' '))}`;
  }
  return toCamelCaseWords(normalized.replace(/_/g, ' '));
}

function formatSettingValue(key = '', value = '', t) {
  const normalizedKey = String(key || '').trim().toLowerCase();
  const normalizedValue = String(value ?? '').trim();
  if (normalizedKey === 'privacy_pin_enabled') {
    return normalizedValue === '1' ? t('ON') : t('OFF');
  }
  if (normalizedKey === 'language') {
    return normalizedValue.toLowerCase() === 'hi' ? t('हिंदी') : t('English');
  }
  if (normalizedKey === 'preferred_currency') {
    return normalizedValue.toUpperCase() || '-';
  }
  return normalizedValue || '-';
}

function renderKeyValueRows(rows = []) {
  return rows
    .map(
      ([label, value]) =>
        `<tr><td class="kv-key">${escapeHtml(label)}</td><td class="kv-value">${escapeHtml(value == null || value === '' ? '-' : value)}</td></tr>`
    )
    .join('');
}

function renderDataTable(title, columns = [], rows = []) {
  if (!rows.length) {
    return `<section class="section"><h3>${escapeHtml(title)}</h3><div class="empty">No records available.</div></section>`;
  }
  const head = columns.map((column) => `<th>${escapeHtml(column.label)}</th>`).join('');
  const body = rows
    .map((row) => {
      const cells = columns
        .map((column) => `<td>${escapeHtml(row?.[column.key] == null || row?.[column.key] === '' ? '-' : row[column.key])}</td>`)
        .join('');
      return `<tr>${cells}</tr>`;
    })
    .join('');
  return `<section class="section"><h3>${escapeHtml(title)}</h3><table><thead><tr>${head}</tr></thead><tbody>${body}</tbody></table></section>`;
}

function buildExportPdfHtml(payload, { t, preferredCurrency = 'INR', fxRates = { INR: 1 } }) {
  const exportedAt = formatExportDateTime(payload?.exportedAt);
  const userRows = [
    [t('Full Name'), payload?.user?.full_name || '-'],
    [t('Mobile'), payload?.user?.mobile || '-'],
    [t('Email'), payload?.user?.email || '-'],
    [t('Created'), formatExportDateTime(payload?.user?.created_at)],
    [t('Last Login'), formatExportDateTime(payload?.user?.last_login_at)],
    [t('Display Currency'), String(preferredCurrency || 'INR').toUpperCase()]
  ];

  const assets = Array.isArray(payload?.assets)
    ? payload.assets.map((row) => ({
        category: row?.category || '-',
        name: row?.name || '-',
        institution: row?.institution || '-',
        current_value: formatExportMoney(row?.current_value, preferredCurrency, fxRates),
        invested_amount: formatExportMoney(row?.invested_amount, preferredCurrency, fxRates),
        account_ref: row?.account_ref || '-'
      }))
    : [];

  const liabilities = Array.isArray(payload?.liabilities)
    ? payload.liabilities.map((row) => ({
        loan_type: row?.loan_type || '-',
        lender: row?.lender || '-',
        outstanding_amount: formatExportMoney(row?.outstanding_amount, preferredCurrency, fxRates),
        account_ref: row?.account_ref || '-',
        interest_rate: row?.interest_rate ? `${row.interest_rate}%` : '-'
      }))
    : [];

  const reminders = Array.isArray(payload?.reminders)
    ? payload.reminders.map((row) => ({
        category: row?.category || '-',
        description: row?.description || '-',
        due_date: row?.due_date || '-',
        amount: formatExportMoney(row?.amount, preferredCurrency, fxRates),
        status: row?.status || '-'
      }))
    : [];

  const settings = Array.isArray(payload?.settings)
    ? payload.settings.map((row) => ({
        label: formatSettingLabel(row?.key, t),
        value: formatSettingValue(row?.key, row?.value, t),
        updated_at: formatExportDateTime(row?.updated_at)
      }))
    : [];

  const consents = Array.isArray(payload?.consents)
    ? payload.consents.map((row) => ({
        privacy_policy_version: row?.privacy_policy_version || '-',
        terms_version: row?.terms_version || '-',
        consented_at: formatExportDateTime(row?.consented_at),
        consent_source: row?.consent_source || '-'
      }))
    : [];

  return `<!doctype html>
  <html>
  <head>
    <meta charset="utf-8" />
    <style>
      body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Arial, sans-serif; padding: 24px; color: #0f172a; }
      h1 { margin: 0 0 6px; font-size: 24px; color: #0b1f3a; }
      .meta { margin: 0 0 4px; color: #475569; font-size: 12px; }
      .section { margin-top: 18px; }
      h3 { margin: 0 0 8px; color: #155eaf; font-size: 15px; }
      table { width: 100%; border-collapse: collapse; table-layout: fixed; }
      th, td { border: 1px solid #d9e2ef; padding: 7px 8px; vertical-align: top; font-size: 11px; word-break: break-word; }
      th { background: #edf5ff; color: #0b1f3a; text-align: left; font-weight: 700; }
      .kv-key { width: 32%; font-weight: 700; background: #f8fafc; }
      .kv-value { width: 68%; }
      .empty { padding: 10px 12px; border: 1px solid #d9e2ef; border-radius: 8px; color: #64748b; font-size: 12px; }
      .note { margin-top: 18px; color: #64748b; font-size: 11px; }
    </style>
  </head>
  <body>
    <h1>${escapeHtml(t('Worthio Data Export'))}</h1>
    <p class="meta">${escapeHtml(t('Generated: {date}', { date: exportedAt }))}</p>
    <p class="meta">${escapeHtml(t('Display Currency: {value}', { value: preferredCurrency }))}</p>

    <section class="section">
      <h3>${escapeHtml(t('Account Summary'))}</h3>
      <table><tbody>${renderKeyValueRows(userRows)}</tbody></table>
    </section>

    ${renderDataTable(t('Assets'), [
      { key: 'category', label: t('Category') },
      { key: 'name', label: t('Institution Name') },
      { key: 'institution', label: t('Institution') },
      { key: 'current_value', label: t('Current Value') },
      { key: 'invested_amount', label: t('Invested Amount') },
      { key: 'account_ref', label: t('Account Ref') }
    ], assets)}

    ${renderDataTable(t('Liabilities'), [
      { key: 'loan_type', label: t('Loan Type') },
      { key: 'lender', label: t('Lender') },
      { key: 'outstanding_amount', label: t('Outstanding Amount') },
      { key: 'account_ref', label: t('Account Ref') },
      { key: 'interest_rate', label: t('Interest Rate') }
    ], liabilities)}

    ${renderDataTable(t('Reminders'), [
      { key: 'category', label: t('Category') },
      { key: 'description', label: t('Description') },
      { key: 'due_date', label: t('Due Date') },
      { key: 'amount', label: t('Amount') },
      { key: 'status', label: t('Status') }
    ], reminders)}

    ${renderDataTable(t('Settings'), [
      { key: 'label', label: t('Field') },
      { key: 'value', label: t('Value') },
      { key: 'updated_at', label: t('Last updated: {value}', { value: '' }).replace(': ', '').trim() || 'Updated At' }
    ], settings)}

    ${renderDataTable(t('Consents'), [
      { key: 'privacy_policy_version', label: t('Privacy Policy') },
      { key: 'terms_version', label: t('Terms') },
      { key: 'consented_at', label: t('Consented At') },
      { key: 'consent_source', label: t('Source') }
    ], consents)}

    <p class="note">${escapeHtml(t('Prepared for secure offline review and sharing from Worthio.'))}</p>
  </body>
  </html>`;
}

function buildReceiptHtml(receipt, t) {
  const rows = [
    [t('Invoice Number'), receipt?.invoice_number],
    [t('Invoice Date'), receipt?.invoice_date],
    [t('Plan'), t(formatPlanLabel(receipt?.line_item?.plan))],
    [t('Period'), t(toCamelCaseWords(String(receipt?.line_item?.period || '')))],
    [t('SAC Code'), receipt?.line_item?.sac_code],
    [t('Taxable Value (INR)'), toMoney(receipt?.taxes?.taxable_value)],
    [t('CGST 9% (INR)'), toMoney(receipt?.taxes?.cgst_amount)],
    [t('SGST 9% (INR)'), toMoney(receipt?.taxes?.sgst_amount)],
    [t('Total GST (INR)'), toMoney(receipt?.taxes?.gst_total)],
    [t('Total Amount (INR)'), toMoney(receipt?.total_amount_inr)],
    [t('Payment Provider'), t(formatProviderLabel(receipt?.payment?.provider))],
    [t('Transaction ID'), receipt?.payment?.transaction_id || '-'],
    [t('Payment Status'), t(formatStatusLabel(receipt?.payment?.status))]
  ];
  const lineRows = rows
    .map(
      ([k, v]) =>
        `<tr><td style="padding:8px;border:1px solid #ddd;font-weight:600;">${escapeHtml(k)}</td><td style="padding:8px;border:1px solid #ddd;">${escapeHtml(v || '-')}</td></tr>`
    )
    .join('');
  return `<!doctype html><html><body style="font-family:-apple-system,Segoe UI,Arial;padding:18px;color:#111;">
    <h2 style="margin:0 0 8px;">${escapeHtml(t('Tax Invoice / GST Receipt'))}</h2>
    <p style="margin:0 0 12px;">${escapeHtml(receipt?.supplier?.legal_name || '')}</p>
    <p style="margin:0 0 4px;">${escapeHtml(t('GSTIN'))}: ${escapeHtml(receipt?.supplier?.gstin || 'NA')}</p>
    <p style="margin:0 0 12px;">${escapeHtml(t('Address'))}: ${escapeHtml(receipt?.supplier?.address || 'India')}</p>
    <p style="margin:0 0 12px;">${escapeHtml(t('Billed To'))}: ${escapeHtml(receipt?.customer?.initials || 'NA')}</p>
    <table cellspacing="0" cellpadding="0" style="border-collapse:collapse;width:100%;">${lineRows}</table>
    <p style="margin-top:16px;font-size:12px;color:#444;">${escapeHtml(
      t('This is a system-generated receipt for subscription payment.')
    )}</p>
  </body></html>`;
}

export default function AccountScreen({
  user,
  onLogout,
  onPrivacyConfigChanged,
  onCurrencyChanged,
  biometricEnrolled = false,
  onEnrollBiometric,
  onDisableBiometric,
  subscriptionStatus,
  onOpenSubscription,
  onOpenFamily,
  onOpenSupport,
  onOpenRecentActivity = () => {},
  onOpenOnboarding,
  premiumActive = false,
  preferredCurrency = 'INR',
  fxRates = { INR: 1 },
  appVersionLabel = '',
  onRegisterOnboardingTarget,
  onMeasureOnboardingTarget,
  onGetOnboardingZoomStyle,
  onThemeChange,
  themeKey = 'worthio',
  onRequestScrollTo = () => {}
}) {
  const { theme } = useTheme();
  const { language, setLanguage, t } = useI18n();
  const isDark = theme.key === 'worthio' || theme.key === 'dark';
  const [pin, setPin] = useState('');
  const [message, setMessage] = useState('');
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [subscription, setSubscription] = useState(subscriptionStatus || null);
  const [subscriptionHistory, setSubscriptionHistory] = useState([]);
  const [pinResetOtpRequested, setPinResetOtpRequested] = useState(false);
  const [pinResetOtpCooldown, setPinResetOtpCooldown] = useState(0);
  const [pinResetOtp, setPinResetOtp] = useState('');
  const [pinResetNewPin, setPinResetNewPin] = useState('');
  const [receiptLoading, setReceiptLoading] = useState(false);
  const [receiptError, setReceiptError] = useState('');
  const [receiptModalVisible, setReceiptModalVisible] = useState(false);
  const [receiptData, setReceiptData] = useState(null);
  const fieldOffsetsRef = useRef({});
  const hasSecurityPin = /^\d{4}$/.test(pin);

  useEffect(() => {
    api
      .getSettings()
      .then((settings) => {
        setPin(String(settings?.privacy_pin || ''));
        const storedLang = String(settings?.language || 'en').toLowerCase();
        setLanguage(storedLang === 'hi' ? 'hi' : 'en');
      })
      .catch((e) => setMessage(e.message));
  }, []);

  useEffect(() => {
    setSubscription(subscriptionStatus || null);
  }, [subscriptionStatus]);

  useEffect(() => {
    if (!pinResetOtpCooldown) return undefined;
    const timer = setInterval(() => {
      setPinResetOtpCooldown((value) => Math.max(0, value - 1));
    }, 1000);
    return () => clearInterval(timer);
  }, [pinResetOtpCooldown]);

  useEffect(() => {
    api
      .getSubscriptionStatus()
      .then((status) => setSubscription(status))
      .catch(() => {});
    api
      .getSubscriptionHistory()
      .then((rows) => setSubscriptionHistory(Array.isArray(rows) ? rows : []))
      .catch(() => {});
  }, []);

  const setFieldOffset = useCallback((key, layoutY) => {
    const y = Number(layoutY);
    fieldOffsetsRef.current[key] = Number.isFinite(y) ? Math.max(0, y - 18) : 0;
  }, []);

  const scrollToField = useCallback(
    (key) => {
      if (typeof onRequestScrollTo !== 'function') return;
      const targetY = fieldOffsetsRef.current[key];
      onRequestScrollTo(Number.isFinite(targetY) ? targetY : 0);
    },
    [onRequestScrollTo]
  );
  const selectorButtonStyle = useCallback(
    (selected) => [
      styles.selectorButton,
      {
        borderColor: selected ? theme.accent : theme.border,
        backgroundColor: selected
          ? (isDark ? 'rgba(36,178,214,0.18)' : theme.accentSoft)
          : (isDark ? 'rgba(255,255,255,0.06)' : (theme.cardAlt || '#F8FAFC'))
      }
    ],
    [isDark, theme.accent, theme.accentSoft, theme.border, theme.cardAlt]
  );
  const selectorTextStyle = useCallback(
    (selected) => [
      styles.selectorButtonText,
      { color: selected ? theme.accent : theme.text }
    ],
    [theme.accent, theme.text]
  );
  const saveSecurityPin = async () => {
    if (!/^\d{4}$/.test(pin)) {
      setMessage(t('Enter a valid 4-digit PIN.'));
      return;
    }

    await api.upsertSettings({
      privacy_pin_enabled: '1',
      privacy_pin: pin
    });

    setMessage(t('Security PIN saved.'));
    onPrivacyConfigChanged?.();
  };

  const saveLanguage = async (next) => {
    const normalized = next === 'hi' ? 'hi' : 'en';
    setLanguage(normalized);
    await api.upsertSettings({ language: normalized });
    setMessage(
      normalized === 'hi'
        ? t('Language updated to Hindi.')
        : t('Language updated to English.')
    );
  };

  const handleMaskedPinInput = (text) => {
    setPin(String(text || '').replace(/\D/g, '').slice(0, 4));
  };

  const requestSecurityPinResetOtp = async () => {
    const response = canUseNativePhoneAuth()
      ? await startNativePhoneOtp(user?.mobile)
      : await api.requestSecurityPinResetOtp({});
    setPinResetOtpRequested(true);
    setPinResetOtpCooldown(Number(response?.retry_after_seconds || 30));
    setMessage(t('OTP sent to your mobile number.'));
  };

  const confirmSecurityPinReset = async () => {
    if (!pinResetOtp.trim() || !/^\d{4}$/.test(pinResetNewPin)) {
      setMessage(t('OTP and new 4-digit PIN are required.'));
      return;
    }
    if (canUseNativePhoneAuth()) {
      const verified = await completeNativePhoneOtp(pinResetOtp.trim());
      await api.confirmSecurityPinReset({
        new_pin: pinResetNewPin,
        firebase_id_token: verified.firebase_id_token
      });
    } else {
      await api.confirmSecurityPinReset({
        otp: pinResetOtp.trim(),
        new_pin: pinResetNewPin
      });
    }
    setPin(pinResetNewPin);
    setPinResetOtpRequested(false);
    setPinResetOtpCooldown(0);
    setPinResetOtp('');
    setPinResetNewPin('');
    setMessage(t('Security PIN reset successful.'));
    onPrivacyConfigChanged?.();
  };

  const exportData = async () => {
    const payload = await api.exportUserData();
    const html = buildExportPdfHtml(payload, { t, preferredCurrency, fxRates });
    const { uri } = await Print.printToFileAsync({ html });
    if (await Sharing.isAvailableAsync()) {
      await Sharing.shareAsync(uri, {
        mimeType: 'application/pdf',
        dialogTitle: t('Export My Data'),
        UTI: 'com.adobe.pdf'
      });
    } else {
      await Share.share({ message: uri });
    }
    setMessage(t('Data export prepared.'));
  };

  const deleteAccount = async () => {
    if (!confirmDelete) {
      setConfirmDelete(true);
      setMessage(t('Tap Delete My Account again to confirm permanent deletion.'));
      return;
    }
    await api.deleteAccount('user_requested_from_mobile');
    setMessage(t('Account deleted.'));
    onLogout?.();
  };

  const viewReceipt = async (paymentId) => {
    setReceiptError('');
    setReceiptLoading(true);
    try {
      const receipt = await api.getSubscriptionReceipt(paymentId);
      setReceiptData(receipt);
      setReceiptModalVisible(true);
    } catch (e) {
      setReceiptError(e?.message || t('Could not load receipt.'));
    } finally {
      setReceiptLoading(false);
    }
  };

  const downloadReceiptPdf = async () => {
    if (!receiptData) return;
    try {
      const html = buildReceiptHtml(receiptData, t);
      const { uri } = await Print.printToFileAsync({
        html,
        base64: false
      });
      const canShare = await Sharing.isAvailableAsync();
      if (canShare) {
        await Sharing.shareAsync(uri, {
          mimeType: 'application/pdf',
          dialogTitle: t('Download GST Receipt'),
          UTI: 'com.adobe.pdf'
        });
      } else {
        setMessage(t('PDF created at: {value}', { value: uri }));
      }
    } catch (e) {
      setMessage(e?.message || t('Could not create PDF receipt.'));
    }
  };

  return (
    <View>
      <Modal visible={receiptModalVisible} animationType="slide" transparent onRequestClose={() => setReceiptModalVisible(false)}>
        <View style={styles.modalBackdrop}>
          <View style={[styles.modalCard, { backgroundColor: theme.card, borderColor: theme.border }]}>
            <Text style={[styles.planTitle, { color: theme.text }]}>{t('GST Receipt')}</Text>
            <ScrollView style={styles.modalScroll} contentContainerStyle={styles.modalScrollBody}>
              <Text style={[styles.subText, { color: theme.muted }]}>{t('Invoice: {value}', { value: String(receiptData?.invoice_number || '-') })}</Text>
              <Text style={[styles.subText, { color: theme.muted }]}>{t('Date: {value}', { value: String(receiptData?.invoice_date || '-') })}</Text>
              <Text style={[styles.subText, { color: theme.muted }]}>
                {t('Supplier GSTIN: {value}', { value: String(receiptData?.supplier?.gstin || 'NA') })}
              </Text>
              <Text style={[styles.subText, { color: theme.muted }]}>
                {t('Service: {value}', { value: String(receiptData?.line_item?.description || '-') })}
              </Text>
              <Text style={[styles.subText, { color: theme.muted }]}>
                {t('Taxable: INR {value}', { value: toMoney(receiptData?.taxes?.taxable_value) })}
              </Text>
              <Text style={[styles.subText, { color: theme.muted }]}>
                {t('CGST (9%): INR {value}', { value: toMoney(receiptData?.taxes?.cgst_amount) })}
              </Text>
              <Text style={[styles.subText, { color: theme.muted }]}>
                {t('SGST (9%): INR {value}', { value: toMoney(receiptData?.taxes?.sgst_amount) })}
              </Text>
              <Text style={[styles.subText, { color: theme.muted }]}>
                {t('Total GST: INR {value}', { value: toMoney(receiptData?.taxes?.gst_total) })}
              </Text>
              <Text style={[styles.subText, { color: theme.text, fontWeight: '800' }]}>
                {t('Total Paid: INR {value}', { value: toMoney(receiptData?.total_amount_inr) })}
              </Text>
              <Text style={[styles.subText, { color: theme.muted }]}>
                {t('Txn ID: {value}', { value: String(receiptData?.payment?.transaction_id || '-') })}
              </Text>
            </ScrollView>
            <View style={styles.modalActions}>
              <PillButton kind="ghost" style={isDark ? styles.accountGhostButtonDark : null} label={t('Close')} onPress={() => setReceiptModalVisible(false)} />
              <PillButton style={isDark ? styles.accountPrimaryButtonDark : null} label={t('Download PDF')} onPress={() => downloadReceiptPdf().catch((e) => setMessage(e.message))} />
            </View>
          </View>
        </View>
      </Modal>
      <SectionCard title={t('Profile')}>
        <View style={styles.profileInfoRow}>
          <View style={styles.profileInfoCol}>
            <Text style={[styles.label, { color: theme.muted }]}>{t('Name')}</Text>
            <Text style={[styles.value, { color: theme.text }]}>{toInitials(user?.full_name || '-')}</Text>
          </View>
          <View style={styles.profileInfoCol}>
            <Text style={[styles.label, { color: theme.muted }]}>{t('Mobile')}</Text>
            <Text style={[styles.value, { color: theme.text }]}>{maskMobile(user?.mobile || '')}</Text>
          </View>
        </View>
        <PillButton
          label={t('Accounts Recent Activity')}
          kind="ghost"
          style={[styles.profileRecentActivityButton, isDark ? styles.accountGhostButtonDark : styles.accountGhostButtonLight]}
          onPress={() => Promise.resolve(onOpenRecentActivity?.()).catch(() => {})}
        />
      </SectionCard>

      <SectionCard title={t('Privacy & Security')}>
        <Text style={[styles.helper, { color: theme.muted }]}>
          {t('Security PIN is required to reveal full identifiers, contacts, and family notes. Amount privacy toggle does not require PIN.')}
        </Text>
        <Text style={[styles.label, { color: theme.muted }]}>{t('Security PIN (4 digits)')}</Text>
        {hasSecurityPin ? (
          <Text style={[styles.valueInline, styles.pinEnabledValue, { color: theme.text }]}>{t('PIN Enabled')}</Text>
        ) : (
          <>
            <TextInput
              onLayout={(event) => setFieldOffset('pin', event.nativeEvent.layout.y)}
              onFocus={() => scrollToField('pin')}
              style={[styles.input, { backgroundColor: theme.inputBg, borderColor: theme.border, color: theme.inputText }]}
              value={pin}
              onChangeText={handleMaskedPinInput}
              keyboardType="number-pad"
              secureTextEntry
              maxLength={4}
            />
            <PillButton
              style={isDark ? styles.accountPrimaryButtonDark : null}
              label={t('Save Security PIN')}
              onPress={() => saveSecurityPin().catch((e) => setMessage(e.message))}
            />
          </>
        )}

        <View style={[styles.securityDivider, { backgroundColor: theme.border }]} />
        <Text style={[styles.label, { color: theme.muted }]}>{t('Forgot Security PIN')}</Text>
        <Text style={[styles.helper, { color: theme.muted }]}>
          {t('Reset requires OTP verification and sends security alerts to family/admin users.')}
        </Text>
        {pinResetOtpRequested ? (
          <>
            <Text style={[styles.label, { color: theme.muted }]}>{t('OTP (6 digits)')}</Text>
            <TextInput
              onLayout={(event) => setFieldOffset('pinResetOtp', event.nativeEvent.layout.y)}
              onFocus={() => scrollToField('pinResetOtp')}
              style={[styles.input, { backgroundColor: theme.inputBg, borderColor: theme.border, color: theme.inputText }]}
              value={pinResetOtp}
              onChangeText={(v) => setPinResetOtp(String(v || '').replace(/\D/g, '').slice(0, 6))}
              keyboardType="number-pad"
              maxLength={6}
            />
            <Text style={[styles.label, { color: theme.muted }]}>{t('New Security PIN (4 digits)')}</Text>
            <TextInput
              onLayout={(event) => setFieldOffset('pinResetNewPin', event.nativeEvent.layout.y)}
              onFocus={() => scrollToField('pinResetNewPin')}
              style={[styles.input, { backgroundColor: theme.inputBg, borderColor: theme.border, color: theme.inputText }]}
              value={pinResetNewPin}
              onChangeText={(v) => setPinResetNewPin(String(v || '').replace(/\D/g, '').slice(0, 4))}
              keyboardType="number-pad"
              secureTextEntry
              maxLength={4}
            />
            <View style={styles.row}>
                <PillButton
                  label={pinResetOtpCooldown > 0 ? t('Resend OTP ({seconds}s)', { seconds: pinResetOtpCooldown }) : t('Resend OTP')}
                  kind="ghost"
                  style={isDark ? styles.accountGhostButtonDark : null}
                  disabled={pinResetOtpCooldown > 0}
                  onPress={() => requestSecurityPinResetOtp().catch((e) => setMessage(e.message))}
                />
                <PillButton
                  style={isDark ? styles.accountPrimaryButtonDark : null}
                  label={t('Confirm Reset')}
                  onPress={() => confirmSecurityPinReset().catch((e) => setMessage(e.message))}
                />
            </View>
          </>
        ) : (
          <PillButton
            label={t('Reset Security PIN via OTP')}
            kind="ghost"
            style={isDark ? styles.accountGhostButtonDark : null}
            onPress={() => requestSecurityPinResetOtp().catch((e) => setMessage(e.message))}
          />
        )}

        <View style={[styles.securityDivider, { backgroundColor: theme.border }]} />
        <Text style={[styles.label, { color: theme.muted }]}>{t('Biometric Login')}</Text>
        <Text style={[styles.helper, { color: theme.muted }]}>
          {biometricEnrolled
            ? t('Biometric login is enabled for fast access on this device.')
            : t('Enroll Biometric Login to use fingerprint or face unlock on this device.')}
        </Text>
        {biometricEnrolled ? (
          <PillButton
            label={t('Disable Biometric Login')}
            kind="ghost"
            style={[styles.fullWidthButton, isDark ? styles.accountGhostButtonDark : styles.accountGhostButtonLight]}
            onPress={() =>
              Promise.resolve(onDisableBiometric?.())
                .then(() => setMessage(t('Biometric login disabled for this device.')))
                .catch((e) => setMessage(e.message))
            }
          />
        ) : (
          <PillButton
            label={t('Enroll Biometric Login')}
            kind="ghost"
            style={[styles.fullWidthButton, isDark ? styles.accountGhostButtonDark : styles.accountGhostButtonLight]}
            onPress={() =>
              Promise.resolve(onEnrollBiometric?.())
                .then(() => setMessage(t('Biometric login enrolled for this device.')))
                .catch((e) => setMessage(e.message))
            }
          />
        )}
      </SectionCard>

      <SectionCard title={t('Theme')}>
        <Text style={[styles.helper, { color: theme.muted }]}>{t('Choose between the standard Worthio theme and a clean light theme.')}</Text>
        <View style={styles.row}>
          {[
            { key: 'worthio', label: 'Worthio' },
            { key: 'light', label: 'Light' }
          ].map((opt) => (
            <PillButton
              key={opt.key}
              label={t(opt.label)}
              kind="ghost"
              style={selectorButtonStyle(themeKey === opt.key)}
              textStyle={selectorTextStyle(themeKey === opt.key)}
              onPress={() => onThemeChange?.(opt.key)}
            />
          ))}
        </View>
      </SectionCard>

      <SectionCard title={t('Language')}>
        <Text style={[styles.helper, { color: theme.muted }]}>
          {t('Choose your preferred language. Hindi labels will appear where available.')}
        </Text>
        <View style={styles.row}>
          <PillButton
            label={t('English')}
            kind="ghost"
            style={selectorButtonStyle(language === 'en')}
            textStyle={selectorTextStyle(language === 'en')}
            onPress={() => saveLanguage('en').catch((e) => setMessage(e.message))}
          />
          <PillButton
            label={t('हिंदी')}
            kind="ghost"
            style={selectorButtonStyle(language === 'hi')}
            textStyle={selectorTextStyle(language === 'hi')}
            onPress={() => saveLanguage('hi').catch((e) => setMessage(e.message))}
          />
        </View>
      </SectionCard>

      <Animated.View
        ref={(node) => onRegisterOnboardingTarget?.('account_manage_family', node)}
        collapsable={false}
        onLayout={() => onMeasureOnboardingTarget?.('account_manage_family')}
        style={onGetOnboardingZoomStyle?.('account_manage_family')}
      >
        <SectionCard title={t('Family Access')}>
          <Text style={[styles.helper, { color: theme.muted }]}>
            {t('Share access with family members and control read/write/admin permissions.')}
          </Text>
          {!premiumActive ? (
            <Text style={[styles.lockedText, { color: theme.warn }]}>{t('Premium required to manage family access.')}</Text>
          ) : null}
          <Animated.View style={styles.row}>
            <PillButton
              label={t('Manage Family')}
              kind={premiumActive ? 'primary' : 'ghost'}
              style={[
                styles.fullWidthButton,
                !premiumActive && !isDark ? styles.accountGhostButtonLight : null,
                isDark ? (premiumActive ? styles.accountPrimaryButtonDark : styles.accountGhostButtonDark) : null
              ]}
              onPress={premiumActive ? onOpenFamily : onOpenSubscription}
            />
          </Animated.View>
        </SectionCard>
      </Animated.View>

      <SectionCard title={t('Subscription')}>
        <Text style={[styles.subText, { color: theme.muted }]}>
          {t('Plan: {value}', { value: t(formatPlanLabel(subscription?.plan)) })}
        </Text>
        <Text style={[styles.subText, { color: theme.muted }]}>
          {t('Status: {value}', { value: t(formatStatusLabel(subscription?.status)) })}
        </Text>
        {subscription?.started_at ? (
          <Text style={[styles.subText, { color: theme.muted }]}>
            {t('Started: {date}', { date: formatIsoDate(subscription.started_at) })}
          </Text>
        ) : null}
        {subscription?.current_period_end ? (
          <Text style={[styles.subText, { color: theme.muted }]}>
            {subscription?.plan === 'trial_premium'
              ? t('Trial ends: {date}', { date: formatIsoDate(subscription.current_period_end) })
              : t('Current period ends: {date}', { date: formatIsoDate(subscription.current_period_end) })}
          </Text>
        ) : null}
        <Text style={[styles.label, { color: theme.muted }]}>{t('Purchase History')}</Text>
        {subscriptionHistory.length ? (
          <View style={styles.historyWrap}>
            {subscriptionHistory.slice(0, 8).map((row) => (
              <View key={row.id} style={[styles.historyRow, { borderBottomColor: theme.border }]}>
                <Text style={[styles.historyPrimary, { color: theme.text }]}>
                  {`${t(formatPlanLabel(row.plan))} • INR ${Number(row.amount_inr || 0)}`}
                </Text>
                <View style={styles.historyMetaRow}>
                  <Pressable
                    style={[styles.receiptIconBtn, { borderColor: theme.border, backgroundColor: theme.card }]}
                    onPress={() => viewReceipt(row.id).catch((e) => setReceiptError(e.message))}
                    disabled={receiptLoading}
                  >
                    <Text style={styles.receiptIcon}>🧾</Text>
                  </Pressable>
                  <Text style={[styles.historyMeta, { color: theme.muted }]}>
                    {`${t(formatStatusLabel(row.status))} • ${t(formatProviderLabel(row.provider))} • ${String(row.purchased_at || '').slice(0, 10)}`}
                  </Text>
                </View>
              </View>
            ))}
          </View>
        ) : (
          <Text style={[styles.subText, { color: theme.muted }]}>{t('No purchases yet.')}</Text>
        )}
        {!!receiptError ? <Text style={[styles.message, { color: theme.danger }]}>{receiptError}</Text> : null}
        <PillButton label={t('Buy Subscription')} kind="primary" style={isDark ? styles.accountPrimaryButtonDark : null} onPress={onOpenSubscription} />
      </SectionCard>

      <SectionCard title={t('Worthio Support')}>
        <Text style={[styles.helper, { color: theme.muted }]}>
          {t('Open support to browse FAQs by category and see how to reach the support team if you still need help.')}
        </Text>
        <PillButton label={t('Worthio Support')} kind="primary" style={isDark ? styles.accountPrimaryButtonDark : null} onPress={onOpenSupport} />
      </SectionCard>

      <SectionCard title={t('Quick Tour')}>
        <Text style={[styles.helper, { color: theme.muted }]}>
          {t('Take a quick walkthrough of main features and usage.')}
        </Text>
        <PillButton label={t('Start Tour')} kind="ghost" style={isDark ? styles.accountGhostButtonDark : null} onPress={onOpenOnboarding} />
      </SectionCard>

      <SectionCard title={t('Legal')}>
        <View style={styles.row}>
          <PillButton
            label={t('Privacy Policy')}
            kind="ghost"
            style={isDark ? styles.accountGhostButtonDark : null}
            onPress={() => Linking.openURL(buildApiUrl('/legal/privacy')).catch((e) => setMessage(e.message))}
          />
          <PillButton
            label={t('Terms')}
            kind="ghost"
            style={isDark ? styles.accountGhostButtonDark : null}
            onPress={() => Linking.openURL(buildApiUrl('/legal/terms')).catch((e) => setMessage(e.message))}
          />
          <PillButton
            label={t('Contact Grievance Officer')}
            kind="ghost"
            style={isDark ? styles.accountGhostButtonDark : null}
            onPress={() => Linking.openURL('mailto:grievance@[yourdomain].com').catch((e) => setMessage(e.message))}
          />
        </View>
      </SectionCard>

      <SectionCard title={t('Data Rights')}>
        <View style={styles.inlineActionRow}>
          <PillButton
            label={t('Export My Data')}
            kind="ghost"
            style={[styles.halfWidthButton, isDark ? styles.accountGhostButtonDark : styles.accountGhostButtonLight]}
            onPress={() => exportData().catch((e) => setMessage(e.message))}
          />
          <PillButton
            label={confirmDelete ? t('Confirm Delete My Account') : t('Delete My Account')}
            kind="danger"
            style={styles.halfWidthButton}
            onPress={() => deleteAccount().catch((e) => setMessage(e.message))}
          />
        </View>
      </SectionCard>

      <SectionCard title={t('Session')}>
        <PillButton label={t('Logout')} kind="ghost" style={isDark ? styles.accountGhostButtonDark : null} onPress={onLogout} />
      </SectionCard>
      {!!appVersionLabel ? (
        <Text style={[styles.versionText, { color: theme.muted }]}>{t('App Version: {value}', { value: appVersionLabel })}</Text>
      ) : null}
      {!!message && <Text style={[styles.message, { color: theme.text }]}>{message}</Text>}
    </View>
  );
}

const styles = StyleSheet.create({
  profileInfoRow: {
    flexDirection: 'row',
    gap: 16
  },
  profileInfoCol: {
    flex: 1
  },
  label: {
    color: '#4b647f',
    fontSize: 12,
    marginTop: 8,
    fontWeight: '700',
    letterSpacing: 0.2
  },
  securityDivider: {
    marginVertical: 10,
    height: 1,
    backgroundColor: '#e3ebf6'
  },
  value: {
    color: '#0f3557',
    fontWeight: '800',
    fontSize: 15
  },
  helper: {
    color: '#607d99',
    marginBottom: 10,
    lineHeight: 19
  },
  lockedText: {
    color: '#9a6b00',
    fontWeight: '700',
    marginBottom: 8
  },
  subText: {
    color: '#607d99',
    marginBottom: 6
  },
  historyWrap: {
    marginTop: 4,
    marginBottom: 8
  },
  historyRow: {
    paddingVertical: 6,
    borderBottomWidth: 1
  },
  historyPrimary: {
    fontWeight: '700'
  },
  accountGhostButtonDark: {
    backgroundColor: 'rgba(255,255,255,0.08)',
    borderColor: 'rgba(255,255,255,0.14)'
  },
  accountGhostButtonLight: {
    backgroundColor: '#f3f8ff',
    borderColor: '#b8cee7'
  },
  accountPrimaryButtonDark: {
    borderColor: 'rgba(255,255,255,0.08)'
  },
  fullWidthButton: {
    width: '100%'
  },
  profileRecentActivityButton: {
    alignSelf: 'stretch',
    marginTop: 10,
    marginHorizontal: 4
  },
  versionText: {
    marginTop: 4,
    marginBottom: 12,
    textAlign: 'center',
    fontSize: 11,
    lineHeight: 16,
    fontWeight: '600'
  },
  inlineActionRow: {
    flexDirection: 'row',
    gap: 8,
    flexWrap: 'nowrap',
    marginBottom: 8
  },
  halfWidthButton: {
    flex: 1,
    minWidth: 130
  },
  historyMetaRow: {
    marginTop: 4,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8
  },
  historyMeta: {
    fontSize: 12,
    flex: 1
  },
  receiptIconBtn: {
    width: 32,
    height: 32,
    borderRadius: 16,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center'
  },
  receiptIcon: {
    fontSize: 15
  },
  modalBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.45)',
    justifyContent: 'center',
    padding: 14
  },
  modalCard: {
    borderWidth: 1,
    borderRadius: 14,
    padding: 12,
    maxHeight: '80%'
  },
  modalScroll: {
    marginTop: 8
  },
  modalScrollBody: {
    paddingBottom: 8
  },
  modalActions: {
    flexDirection: 'row',
    gap: 8,
    marginTop: 10
  },
  planTitle: {
    fontSize: 17,
    fontWeight: '800'
  },
  valueInline: {
    color: '#0f3557',
    fontWeight: '700'
  },
  pinEnabledValue: {
    marginBottom: 2
  },
  row: {
    flexDirection: 'row',
    gap: 8,
    flexWrap: 'wrap',
    marginBottom: 8
  },
  selectorButton: {
    minWidth: 110
  },
  selectorButtonText: {
    fontWeight: '900'
  },
  biometricEnabledRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
    flexWrap: 'wrap'
  },
  biometricEnabledValue: {
    flex: 1
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
  message: {
    color: '#0f3557',
    marginBottom: 20,
    marginTop: 2,
    fontWeight: '600'
  }
});
