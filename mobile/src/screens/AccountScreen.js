import React, { useEffect, useState, useCallback, useRef } from 'react';
import { View, Text, StyleSheet, TextInput, Linking, Share, Pressable, Animated, Modal, ScrollView } from 'react-native';
import * as Print from 'expo-print';
import * as Sharing from 'expo-sharing';
import SectionCard from '../components/SectionCard';
import PillButton from '../components/PillButton';
import { api, buildApiUrl } from '../api/client';
import {
  canUseNativePhoneAuth,
  completeNativePhoneOtp,
  startNativePhoneOtp
} from '../firebase/nativePhoneAuth';
import { useTheme } from '../theme';
import { useI18n } from '../i18n';
import { FAQ_ITEMS } from '../constants/faqs';


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
  onOpenOnboarding,
  premiumActive = false,
  preferredCurrency = 'INR',
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
  const [openFaqs, setOpenFaqs] = useState({});
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
    const text = JSON.stringify(payload, null, 2);
    await Share.share({ message: text });
    setMessage(t('Data export prepared.'));
  };

  const deleteAccount = async () => {
    if (!confirmDelete) {
      setConfirmDelete(true);
      setMessage(t('Tap Delete Account again to confirm permanent deletion.'));
      return;
    }
    await api.deleteAccount('user_requested_from_mobile');
    setMessage(t('Account deleted.'));
    onLogout?.();
  };

  const toggleFaq = (question) => {
    setOpenFaqs((prev) => ({ ...prev, [question]: !prev[question] }));
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
        <Text style={[styles.label, { color: theme.muted }]}>{t('Name')}</Text>
        <Text style={[styles.value, { color: theme.text }]}>{toInitials(user?.full_name || '-')}</Text>
        <Text style={[styles.label, { color: theme.muted }]}>{t('Mobile')}</Text>
        <Text style={[styles.value, { color: theme.text }]}>{maskMobile(user?.mobile || '')}</Text>
      </SectionCard>

      <SectionCard title={t('Privacy & Security')}>
        <Text style={[styles.helper, { color: theme.muted }]}>
          {t('Security PIN is required to reveal full identifiers, contacts, and family notes. Amount privacy toggle does not require PIN.')}
        </Text>
        <Text style={[styles.label, { color: theme.muted }]}>{t('Security PIN (4 digits)')}</Text>
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
        <PillButton style={isDark ? styles.accountPrimaryButtonDark : null} label={t('Save Security PIN')} onPress={() => saveSecurityPin().catch((e) => setMessage(e.message))} />

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
        <View style={styles.row}>
          <PillButton
            label={biometricEnrolled ? t('Biometric Login Enrolled') : t('Enroll Biometric Login')}
            kind={biometricEnrolled ? 'primary' : 'ghost'}
            style={isDark ? (biometricEnrolled ? styles.accountPrimaryButtonDark : styles.accountGhostButtonDark) : null}
            onPress={() =>
              Promise.resolve(onEnrollBiometric?.())
                .then(() => setMessage(t('Biometric login enrolled for this device.')))
                .catch((e) => setMessage(e.message))
            }
          />
          {biometricEnrolled ? (
            <PillButton
              label={t('Disable Biometric Login')}
              kind="ghost"
              style={isDark ? styles.accountGhostButtonDark : null}
              onPress={() =>
                Promise.resolve(onDisableBiometric?.())
                  .then(() => setMessage(t('Biometric login disabled for this device.')))
                  .catch((e) => setMessage(e.message))
              }
            />
          ) : null}
        </View>
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
              kind={themeKey === opt.key ? 'primary' : 'ghost'}
              style={isDark ? (themeKey === opt.key ? styles.accountPrimaryButtonDark : styles.accountGhostButtonDark) : null}
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
            kind={language === 'en' ? 'primary' : 'ghost'}
            style={isDark ? (language === 'en' ? styles.accountPrimaryButtonDark : styles.accountGhostButtonDark) : null}
            onPress={() => saveLanguage('en').catch((e) => setMessage(e.message))}
          />
          <PillButton
            label={t('हिंदी')}
            kind={language === 'hi' ? 'primary' : 'ghost'}
            style={isDark ? (language === 'hi' ? styles.accountPrimaryButtonDark : styles.accountGhostButtonDark) : null}
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
              style={isDark ? (premiumActive ? styles.accountPrimaryButtonDark : styles.accountGhostButtonDark) : null}
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
        <PillButton label={t('Buy Subscription')} kind="ghost" style={isDark ? styles.accountGhostButtonDark : null} onPress={onOpenSubscription} />
      </SectionCard>

      <SectionCard title={t('NWM Support')}>
        <Text style={[styles.helper, { color: theme.muted }]}>
          {t('Open support for FAQs and AI-assisted help with login, subscription, family access, and setup.')}
        </Text>
        <PillButton label={t('Worthio Support')} kind="primary" style={isDark ? styles.accountPrimaryButtonDark : null} onPress={onOpenSupport} />
      </SectionCard>

      <SectionCard title={t('FAQs')}>
        {FAQ_ITEMS.map((item) => (
          <View key={item.q} style={styles.faqItem}>
            <Pressable style={styles.faqHeader} onPress={() => toggleFaq(item.q)}>
              <Text style={[styles.faqQuestion, { color: theme.text }]}>{t(item.q)}</Text>
              <Text style={[styles.faqChevron, { color: theme.muted }]}>
                {openFaqs[item.q] ? '−' : '+'}
              </Text>
            </Pressable>
            {openFaqs[item.q] ? (
              <Text style={[styles.faqAnswer, { color: theme.muted }]}>{t(item.a)}</Text>
            ) : null}
          </View>
        ))}
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
        <View style={styles.row}>
          <PillButton label={t('Export My Data')} kind="ghost" style={isDark ? styles.accountGhostButtonDark : null} onPress={() => exportData().catch((e) => setMessage(e.message))} />
          <PillButton
            label={confirmDelete ? t('Confirm Delete Account') : t('Delete Account')}
            kind="ghost"
            style={isDark ? styles.accountGhostButtonDark : null}
            onPress={() => deleteAccount().catch((e) => setMessage(e.message))}
          />
        </View>
      </SectionCard>

      <SectionCard title={t('Session')}>
        <PillButton label={t('Logout')} kind="ghost" style={isDark ? styles.accountGhostButtonDark : null} onPress={onLogout} />
      </SectionCard>
      {!!message && <Text style={[styles.message, { color: theme.text }]}>{message}</Text>}
    </View>
  );
}

const styles = StyleSheet.create({
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
  accountPrimaryButtonDark: {
    borderColor: 'rgba(255,255,255,0.08)'
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
  row: {
    flexDirection: 'row',
    gap: 8,
    flexWrap: 'wrap',
    marginBottom: 8
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
  faqItem: {
    marginBottom: 10
  },
  faqHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 10
  },
  faqQuestion: {
    flex: 1,
    fontWeight: '800',
    fontSize: 13,
    marginBottom: 4
  },
  faqChevron: {
    width: 18,
    textAlign: 'center',
    fontSize: 18,
    fontWeight: '700',
    marginTop: -2
  },
  faqAnswer: {
    fontSize: 12,
    lineHeight: 18
  },
  message: {
    color: '#0f3557',
    marginBottom: 20,
    marginTop: 2,
    fontWeight: '600'
  }
});
