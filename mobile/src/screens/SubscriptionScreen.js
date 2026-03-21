import React, { useEffect, useMemo, useRef, useState } from 'react';
import { View, Text, StyleSheet, Pressable, BackHandler, ScrollView, Platform, Linking, Modal } from 'react-native';
import { WebView } from 'react-native-webview';
import SectionCard from '../components/SectionCard';
import PillButton from '../components/PillButton';
import { api } from '../api/client';
import { formatDate } from '../utils/format';
import { startCheckout, verifyCheckout } from '../payments';
import { deriveGooglePlayOfferToken, initGooglePlayBilling } from '../payments/googlePlay';
import { useTheme } from '../theme';
import { useI18n } from '../i18n';

const PLANS = {
  basic_monthly: { label: 'Basic Monthly', price: '₹99 / month' },
  basic_yearly: { label: 'Basic Yearly', price: '₹999 / year' },
  premium_monthly: { label: 'Premium Monthly', price: '₹189 / month' },
  premium_yearly: { label: 'Premium Yearly', price: '₹1999 / year' }
};
const PLAN_META = {
  basic: { monthly: 99, yearly: 999 },
  premium: { monthly: 189, yearly: 1999 }
};

const COMPARISON = [
  { feature: 'Dashboard', basic: '✓', premium: '✓' },
  { feature: 'Assets', basic: 'Up to 10', premium: 'Unlimited' },
  { feature: 'Liabilities', basic: 'Up to 5', premium: 'Unlimited' },
  { feature: 'Account Management', basic: '✓', premium: '✓' },
  { feature: 'Family Share', basic: '✗', premium: '✓' },
  { feature: 'AI Insights', basic: '✗', premium: '✓' },
  { feature: 'Targets', basic: '✗', premium: '✓' },
  { feature: 'Net Worth Trend', basic: '✗', premium: '✓' },
  { feature: 'Reminders', basic: '✗', premium: '✓' }
];

function formatPlanLabel(plan) {
  if (!plan || plan === 'none') return 'None';
  return String(plan)
    .replace(/_/g, ' ')
    .toLowerCase()
    .replace(/\b\w/g, (match) => match.toUpperCase());
}

function formatStatusLabel(status) {
  if (!status) return 'Expired';
  return String(status)
    .replace(/_/g, ' ')
    .toLowerCase()
    .replace(/\b\w/g, (match) => match.toUpperCase());
}

function formatProviderLabel(provider) {
  const value = String(provider || '').trim().toLowerCase();
  if (!value || value === '-') return '-';
  if (value === 'google_play') return 'Google Play';
  if (value === 'cashfree') return 'Cashfree';
  if (value === 'razorpay') return 'Razorpay';
  if (value === 'trial') return 'Trial';
  if (value === 'manual') return 'Manual';
  return String(value)
    .replace(/_/g, ' ')
    .toLowerCase()
    .replace(/\b\w/g, (match) => match.toUpperCase());
}

function getDiscountPercent(monthly, yearly) {
  if (!monthly || !yearly) return 0;
  const annual = monthly * 12;
  const discount = Math.round((1 - yearly / annual) * 100);
  return Math.max(0, discount);
}

function isExactPlanActive(status, plan) {
  const activeStatuses = new Set(['active', 'trialing', 'trial']);
  if (!activeStatuses.has(String(status?.status || '').toLowerCase())) return false;
  return String(status?.plan || '') === String(plan || '');
}

function resolveTierVariant(status, tier) {
  const plan = String(status?.plan || '');
  if (!plan.startsWith(tier)) return null;
  if (plan.endsWith('_monthly')) return 'Monthly';
  if (plan.endsWith('_yearly')) return 'Yearly';
  return null;
}

export default function SubscriptionScreen({ onClose, onPurchased, user }) {
  const { theme } = useTheme();
  const { t } = useI18n();
  const [status, setStatus] = useState(null);
  const [message, setMessage] = useState('');
  const [pendingOrder, setPendingOrder] = useState(null);
  const [verifying, setVerifying] = useState(false);
  const [receipt, setReceipt] = useState(null);
  const [manualVerifyVisible, setManualVerifyVisible] = useState(false);
  const [checkoutVisible, setCheckoutVisible] = useState(false);
  const [checkoutUrl, setCheckoutUrl] = useState('');
  const [successModalVisible, setSuccessModalVisible] = useState(false);
  const [googlePlayConfig, setGooglePlayConfig] = useState(null);
  const [googlePlayReady, setGooglePlayReady] = useState(false);
  const [googlePlayProducts, setGooglePlayProducts] = useState([]);
  const [googlePlayBusy, setGooglePlayBusy] = useState(false);
  const [googlePlayMode, setGooglePlayMode] = useState('inactive');
  const billingSessionRef = useRef(null);
  const googlePlayProductMap = googlePlayConfig?.productMap || {};
  const googlePlayProductIds = useMemo(
    () => Array.from(new Set(Object.values(googlePlayProductMap || {}).map((value) => String(value || '').trim()).filter(Boolean))),
    [googlePlayProductMap]
  );
  const googlePlayProductsById = useMemo(
    () => Object.fromEntries((googlePlayProducts || []).map((product) => [String(product?.id || ''), product])),
    [googlePlayProducts]
  );

  const planDisplayPrice = (planKey) => {
    const productId = String(googlePlayProductMap?.[planKey] || '').trim();
    const product = productId ? googlePlayProductsById?.[productId] : null;
    return String(product?.displayPrice || '').trim() || PLANS[planKey]?.price || '';
  };

  const load = async () => {
    const payload = await api.getSubscriptionStatus();
    setStatus(payload);
  };

  const refreshGooglePlayServerState = async (purchaseToken = '') => {
    if (Platform.OS !== 'android' || !googlePlayConfig?.enabled) return null;
    try {
      return await api.syncGooglePlaySubscriptions(
        purchaseToken ? { purchase_token: purchaseToken } : {}
      );
    } catch (_e) {
      return null;
    }
  };

  const handleGooglePlayPurchase = async (purchase) => {
    const purchaseToken = String(purchase?.purchaseToken || '').trim();
    const productId = String(purchase?.productId || '').trim();
    if (!purchaseToken || !productId) {
      setMessage(t('Google Play purchase is missing required token details.'));
      return;
    }

    setGooglePlayBusy(true);
    setMessage(t('Verifying Google Play purchase...'));
    try {
      const verified = await api.verifyGooglePlaySubscription({
        product_id: productId,
        purchase_token: purchaseToken
      });
      await billingSessionRef.current?.finishPurchase?.(purchase);
      setReceipt({
        orderId: verified?.latest_order_id || purchaseToken,
        plan: verified?.plan || Object.entries(googlePlayProductMap || {}).find(([, mapped]) => String(mapped || '') === productId)?.[0] || '',
        status: verified?.status || 'success',
        currentPeriodEnd: verified?.current_period_end || null,
        provider: 'google_play'
      });
      setSuccessModalVisible(true);
      setMessage(t('Google Play purchase verified. Refreshing plan status...'));
      await refreshGooglePlayServerState(purchaseToken);
      await load();
      onPurchased?.();
    } catch (error) {
      setMessage(error?.message || t('Could not verify Google Play purchase. Try restoring purchases once.'));
    } finally {
      setGooglePlayBusy(false);
    }
  };

  const restoreGooglePlayPurchases = async () => {
    if (!billingSessionRef.current?.getAvailablePurchases) return;
    setGooglePlayBusy(true);
    setMessage(t('Checking Google Play purchases...'));
    try {
      const purchases = await billingSessionRef.current.getAvailablePurchases();
      const relevant = (purchases || []).filter((purchase) =>
        googlePlayProductIds.includes(String(purchase?.productId || '').trim())
      );
      if (!relevant.length) {
        await refreshGooglePlayServerState();
        await load();
        setMessage(t('No active Google Play purchases were found for this account.'));
        return;
      }
      for (const purchase of relevant) {
        await handleGooglePlayPurchase(purchase);
      }
      await refreshGooglePlayServerState();
      await load();
    } catch (error) {
      setMessage(error?.message || t('Could not restore Google Play purchases right now.'));
    } finally {
      setGooglePlayBusy(false);
    }
  };

  useEffect(() => {
    let mounted = true;

    const initialize = async () => {
      try {
        await load();
      } catch (e) {
        if (mounted) setMessage(e.message);
      }

      if (Platform.OS !== 'android') return;

      try {
        const config = await api.getGooglePlaySubscriptionConfig();
        if (!mounted) return;
        setGooglePlayConfig(config);
        if (!config?.enabled) {
          setGooglePlayMode(config?.allowWebFallback ? 'web_fallback' : 'unavailable');
          return;
        }

        const session = await initGooglePlayBilling({
          onPurchaseSuccess: handleGooglePlayPurchase,
          onPurchaseError: (error) => {
            if (!mounted) return;
            setGooglePlayBusy(false);
            setMessage(error?.message || t('Google Play purchase was not completed.'));
          }
        });
        if (!mounted) {
          await session?.end?.();
          return;
        }
        billingSessionRef.current = session;
        if (!session?.available) {
          setGooglePlayMode(config?.allowWebFallback ? 'web_fallback' : 'unavailable');
          return;
        }
        setGooglePlayReady(true);
        setGooglePlayMode('google_play');
        const products = await session.fetchSubscriptions(Object.values(config?.productMap || {}));
        if (mounted) setGooglePlayProducts(products || []);
        await refreshGooglePlayServerState();
        await load();
      } catch (error) {
        if (!mounted) return;
        setGooglePlayMode('unavailable');
        setMessage(error?.message || t('Google Play Billing could not be initialized on this device.'));
      }
    };

    initialize();

    return () => {
      mounted = false;
      const session = billingSessionRef.current;
      billingSessionRef.current = null;
      session?.end?.().catch?.(() => {});
    };
  }, []);

  useEffect(() => {
    const onBack = () => {
      onClose?.();
      return true;
    };
    const handler = BackHandler.addEventListener('hardwareBackPress', onBack);
    return () => handler.remove();
  }, [onClose]);

  const parseIncomingUrl = (url) => {
    const raw = String(url || '');
    if (!raw) return null;
    if (raw.includes('TransactionResponse#')) {
      try {
        const hashPayload = decodeURIComponent(String(raw.split('#')[1] || '').trim());
        const parsed = JSON.parse(hashPayload);
        const orderId = String(parsed?.orderId || '').trim();
        const txStatus = String(parsed?.txStatus || '').trim().toUpperCase();
        if (!orderId) return null;
        return {
          orderId,
          plan: '',
          orderStatus: txStatus === 'SUCCESS' ? 'PAID' : txStatus
        };
      } catch (_e) {
        return null;
      }
    }
    const maybeReturnUrl =
      raw.includes('subscription-return') ||
      raw.includes('/cashfree/return') ||
      raw.includes('order_id=') ||
      raw.includes('order_status=');
    if (!maybeReturnUrl) return null;
    const query = raw.includes('?') ? raw.split('?')[1] : '';
    const params = new URLSearchParams(query || '');
    const orderId = String(params.get('order_id') || '').trim();
    const plan = String(params.get('plan') || '').trim();
    const orderStatus = String(params.get('order_status') || '').trim();
    if (!orderId) return null;
    return { orderId, plan, orderStatus };
  };

  const finalizeFromReturn = (payload) => {
    if (!payload?.orderId) return;
    setCheckoutVisible(false);
    setCheckoutUrl('');
    const orderStatus = String(payload.orderStatus || '').toUpperCase();
    const verifyPlan = payload.plan || pendingOrder?.plan || 'premium_monthly';

    if (orderStatus && !['PAID', 'SUCCESS'].includes(orderStatus)) {
      setReceipt({
        orderId: payload.orderId,
        plan: verifyPlan,
        status: orderStatus,
        provider: 'cashfree'
      });
      setPendingOrder(null);
      setManualVerifyVisible(false);
      setMessage(t('Payment was not successful. You can try again.'));
      return;
    }

    setPendingOrder({ plan: verifyPlan, orderId: payload.orderId });
    setManualVerifyVisible(false);
    setMessage(t('Payment returned from Cashfree. Verifying status...'));
    verifyCheckout(verifyPlan, payload.orderId)
      .then((result) => {
        setPendingOrder(null);
        setReceipt({
          orderId: payload.orderId,
          plan: verifyPlan,
          status: 'success',
          currentPeriodEnd: result?.current_period_end || null,
          provider: result?.provider || 'cashfree'
        });
        setSuccessModalVisible(true);
        setMessage(t('Payment successful. Receipt updated below.'));
        return load().then(() => onPurchased?.());
      })
      .catch((e) => {
        setMessage(e?.message || t('Could not auto-verify payment. You can verify once manually.'));
        setManualVerifyVisible(true);
      });
  };

  useEffect(() => {
    const handleIncoming = (url) => {
      const payload = parseIncomingUrl(url);
      if (!payload?.orderId) return;
      finalizeFromReturn(payload);
    };

    Linking.getInitialURL()
      .then((url) => {
        if (url) handleIncoming(url);
      })
      .catch(() => {});

    const sub = Linking.addEventListener('url', (event) => handleIncoming(event?.url));
    return () => sub?.remove?.();
  }, []);

  useEffect(() => {
    if (!checkoutVisible || !pendingOrder?.orderId || verifying) return undefined;
    const interval = setInterval(() => {
      verifyCheckout(pendingOrder.plan, pendingOrder.orderId)
        .then((result) => {
          setCheckoutVisible(false);
          setCheckoutUrl('');
          setPendingOrder(null);
          setManualVerifyVisible(false);
          setReceipt({
            orderId: pendingOrder.orderId,
            plan: pendingOrder.plan,
            status: 'success',
            currentPeriodEnd: result?.current_period_end || null,
            provider: result?.provider || 'cashfree'
          });
          setSuccessModalVisible(true);
          setMessage(t('Payment successful. Receipt updated below.'));
          return load().then(() => onPurchased?.());
        })
        .catch((e) => {
          const orderStatus = String(e?.order_status || '').toUpperCase();
          if (['FAILED', 'CANCELLED', 'USER_DROPPED'].includes(orderStatus)) {
            setCheckoutVisible(false);
            setCheckoutUrl('');
            setPendingOrder(null);
            setManualVerifyVisible(false);
            setReceipt({
              orderId: pendingOrder.orderId,
              plan: pendingOrder.plan,
              status: orderStatus,
              provider: 'cashfree'
            });
            setMessage(t('Payment was not successful. You can try again.'));
          }
        });
    }, 3500);

    return () => clearInterval(interval);
  }, [checkoutVisible, pendingOrder?.orderId, pendingOrder?.plan, verifying]);

  const purchase = async (plan) => {
    setMessage('');
    setPendingOrder(null);
    setReceipt(null);
    setManualVerifyVisible(false);

    const playProductId = String(googlePlayProductMap?.[plan] || '').trim();
    if (Platform.OS === 'android' && playProductId) {
      if (googlePlayReady && billingSessionRef.current?.requestSubscription) {
        setGooglePlayBusy(true);
        try {
          const currentPurchaseToken =
            String(status?.provider_details?.product_id || '') === playProductId
              ? String(status?.provider_details?.purchase_token || '').trim()
              : '';
          const offerToken = deriveGooglePlayOfferToken(googlePlayProductsById?.[playProductId]);
          await billingSessionRef.current.requestSubscription({
            productId: playProductId,
            obfuscatedAccountId: user?.id ? `user_${user.id}` : undefined,
            currentPurchaseToken,
            offerToken
          });
          setMessage(t('Complete the Google Play purchase to continue.'));
          return;
        } catch (error) {
          setGooglePlayBusy(false);
          if (googlePlayConfig?.allowWebFallback !== true) {
            throw error;
          }
          setMessage(t('Google Play Billing is unavailable here. Falling back to test checkout.'));
        }
      } else if (googlePlayMode === 'unavailable' && googlePlayConfig?.allowWebFallback !== true) {
        throw new Error(t('Google Play Billing is required on Android for subscriptions in this build.'));
      }
    }

    const outcome = await startCheckout(plan, {
      user,
      fallback: async () => {
        await api.purchaseSubscription(plan);
      }
    });
    if (outcome?.mode === 'fallback') {
      setMessage(t('Payment provider unavailable. Applied fallback plan.'));
      await load();
      onPurchased?.();
      return;
    }

    if (outcome?.mode === 'cashfree' && outcome?.orderId) {
      setPendingOrder({ plan, orderId: outcome.orderId });
      setCheckoutUrl(String(outcome.checkoutUrl || ''));
      setCheckoutVisible(Boolean(outcome.checkoutUrl));
      setMessage(t('Complete payment and wait for auto return.'));
      return;
    }

    setMessage(t('Payment successful. Refreshing plan status...'));
    await load();
    onPurchased?.();
  };

  const verifyPendingPayment = async () => {
    if (!pendingOrder?.orderId || !pendingOrder?.plan || verifying) return;
    setVerifying(true);
    setMessage('');
    try {
      await verifyCheckout(pendingOrder.plan, pendingOrder.orderId);
      setReceipt({
        orderId: pendingOrder.orderId,
        plan: pendingOrder.plan,
        status: 'success',
        currentPeriodEnd: status?.current_period_end || null,
        provider: 'cashfree'
      });
      setSuccessModalVisible(true);
      setPendingOrder(null);
      setMessage(t('Payment successful. Refreshing plan status...'));
      await load();
      onPurchased?.();
    } catch (e) {
      setMessage(e?.message || t('Payment is not completed yet. Please try again.'));
      setManualVerifyVisible(true);
    } finally {
      setVerifying(false);
    }
  };

  const onCheckoutNav = (url) => {
    const payload = parseIncomingUrl(url);
    if (payload?.orderId) {
      finalizeFromReturn(payload);
      return false;
    }
    return true;
  };

  const onCheckoutMessage = (event) => {
    const raw = String(event?.nativeEvent?.data || '').trim();
    if (!raw) return;
    try {
      const parsed = JSON.parse(raw);
      const payload = {
        orderId: String(parsed?.order_id || parsed?.orderId || '').trim(),
        orderStatus: String(parsed?.order_status || parsed?.orderStatus || '').trim(),
        plan: String(parsed?.plan || '').trim()
      };
      if (payload.orderId) {
        finalizeFromReturn(payload);
      }
    } catch (_e) {
      const payload = parseIncomingUrl(raw);
      if (payload?.orderId) finalizeFromReturn(payload);
    }
  };

  const basicMonthlyActive = isExactPlanActive(status, 'basic_monthly');
  const basicYearlyActive = isExactPlanActive(status, 'basic_yearly');
  const premiumMonthlyActive = isExactPlanActive(status, 'premium_monthly');
  const premiumYearlyActive = isExactPlanActive(status, 'premium_yearly');

  return (
    <ScrollView
      contentContainerStyle={styles.container}
      keyboardShouldPersistTaps="handled"
      keyboardDismissMode={Platform.OS === 'ios' ? 'interactive' : 'on-drag'}
      contentInsetAdjustmentBehavior="automatic"
      showsVerticalScrollIndicator
      alwaysBounceVertical
    >
      <View style={styles.headerRow}>
        <Pressable style={styles.backRow} onPress={onClose}>
          <Text style={[styles.backText, { color: theme.accent }]}>{t('Back')}</Text>
        </Pressable>
        <View style={styles.headerCenter}>
          <Text style={[styles.headerTitle, { color: theme.text }]}>{t('Manage Plan')}</Text>
          <Text style={[styles.headerSub, { color: theme.muted }]}>{t('Upgrade or renew to unlock premium features.')}</Text>
        </View>
        <View style={styles.headerSpacer} />
      </View>

      <Modal visible={checkoutVisible} animationType="slide" onRequestClose={() => setCheckoutVisible(false)}>
        <View style={styles.checkoutHeader}>
          <Pressable onPress={() => setCheckoutVisible(false)}>
            <Text style={[styles.backText, { color: theme.accent }]}>{t('Back')}</Text>
          </Pressable>
          <Text style={[styles.headerTitle, { color: theme.text }]}>{t('Cashfree Checkout')}</Text>
          <View style={styles.headerSpacer} />
        </View>
        {checkoutUrl ? (
          <WebView
            source={{ uri: checkoutUrl }}
            onShouldStartLoadWithRequest={(req) => onCheckoutNav(req?.url)}
            onNavigationStateChange={(state) => onCheckoutNav(state?.url)}
            onMessage={onCheckoutMessage}
            startInLoadingState
          />
        ) : (
          <View style={styles.emptyCheckout}>
            <Text style={[styles.subtle, { color: theme.muted }]}>{t('Unable to open checkout page.')}</Text>
          </View>
        )}
      </Modal>

      <Modal visible={successModalVisible} transparent animationType="fade" onRequestClose={() => setSuccessModalVisible(false)}>
        <View style={styles.modalBackdrop}>
          <View style={[styles.successModalCard, { backgroundColor: theme.card, borderColor: theme.border }]}>
            <Text style={[styles.planTitle, { color: theme.text }]}>{t('Purchase Successful')}</Text>
            <Text style={[styles.subtle, { color: theme.muted }]}>
              {t('Plan: {value}', { value: t(formatPlanLabel(receipt?.plan || status?.plan)) })}
            </Text>
            <Text style={[styles.subtle, { color: theme.muted }]}>
              {t('Activated on: {date}', { date: formatDate(status?.started_at || new Date().toISOString()) })}
            </Text>
            <Text style={[styles.subtle, { color: theme.muted }]}>
              {t('Valid till: {date}', { date: formatDate(receipt?.currentPeriodEnd || status?.current_period_end) })}
            </Text>
            <View style={styles.pendingActions}>
              <PillButton label={t('Close')} onPress={() => setSuccessModalVisible(false)} />
            </View>
          </View>
        </View>
      </Modal>

      {pendingOrder ? (
        <SectionCard title={t('Complete Payment')}>
          <Text style={[styles.subtle, { color: theme.muted }]}>
            {t('Order ID: {value}', { value: pendingOrder.orderId })}
          </Text>
          <Text style={[styles.subtle, { color: theme.muted }]}>
            {t('Plan: {value}', { value: t(formatPlanLabel(pendingOrder.plan)) })}
          </Text>
          <View style={styles.pendingActions}>
            {manualVerifyVisible ? (
              <PillButton label={verifying ? t('Verifying...') : t('Verify Payment')} onPress={verifyPendingPayment} disabled={verifying} />
            ) : null}
            <PillButton label={t('Close')} kind="ghost" onPress={() => setPendingOrder(null)} />
          </View>
        </SectionCard>
      ) : null}

      {receipt ? (
        <SectionCard title={t('Payment Receipt')}>
          <Text style={[styles.subtle, { color: theme.muted }]}>
            {t('Order ID: {value}', { value: receipt.orderId })}
          </Text>
          <Text style={[styles.subtle, { color: theme.muted }]}>
            {t('Plan: {value}', { value: t(formatPlanLabel(receipt.plan)) })}
          </Text>
          <Text style={[styles.subtle, { color: theme.muted }]}>
            {t('Status: {value}', { value: t(formatStatusLabel(receipt.status)) })}
          </Text>
          {receipt.currentPeriodEnd ? (
            <Text style={[styles.subtle, { color: theme.muted }]}>
              {t('Valid till: {date}', { date: formatDate(receipt.currentPeriodEnd) })}
            </Text>
          ) : null}
          <Text style={[styles.subtle, { color: theme.muted }]}>
            {t('Provider: {value}', { value: t(formatProviderLabel(receipt.provider || 'cashfree')) })}
          </Text>
        </SectionCard>
      ) : null}

      <SectionCard title={t('Your Subscription')}>
        <View style={styles.statusRow}>
          <View>
            <Text style={[styles.subtle, { color: theme.muted }]}>{t('Current plan')}</Text>
            <Text style={[styles.emph, { color: theme.text }]}>{t(formatPlanLabel(status?.plan))}</Text>
          </View>
          <View>
            <Text style={[styles.subtle, { color: theme.muted }]}>{t('Status')}</Text>
            <Text style={[styles.emph, { color: theme.text }]}>{t(formatStatusLabel(status?.status))}</Text>
          </View>
        </View>
        {status?.current_period_end ? (
          <Text style={[styles.subtle, { color: theme.muted }]}>{t('Expires: {date}', { date: formatDate(status.current_period_end) })}</Text>
        ) : null}
        {status?.provider ? (
          <Text style={[styles.subtle, { color: theme.muted }]}>
            {t('Provider: {value}', { value: t(formatProviderLabel(status.provider)) })}
          </Text>
        ) : null}
        {status?.provider_details?.provider_state ? (
          <Text style={[styles.subtle, { color: theme.muted }]}>
            {t('Store status: {value}', { value: String(status.provider_details.provider_state).replace(/_/g, ' ') })}
          </Text>
        ) : null}
        {status?.provider === 'google_play' && status?.provider_details?.auto_renew_enabled === false ? (
          <Text style={[styles.subtle, { color: theme.muted }]}>
            {t('Auto-renew is off. Access continues until the current end date unless Google Play changes it earlier.')}
          </Text>
        ) : null}
        {status?.provider_details?.manage_url ? (
          <View style={styles.pendingActions}>
            <PillButton label={t('Manage in Play Store')} kind="ghost" onPress={() => Linking.openURL(status.provider_details.manage_url).catch(() => {})} />
            {Platform.OS === 'android' ? (
              <PillButton
                label={googlePlayBusy ? t('Refreshing...') : t('Refresh Play Status')}
                kind="ghost"
                disabled={googlePlayBusy}
                onPress={() => restoreGooglePlayPurchases()}
              />
            ) : null}
          </View>
        ) : null}
      </SectionCard>

      <SectionCard title={t('What You Get')}>
        <View style={styles.compareHeader}>
          <Text style={[styles.compareHeaderText, { color: theme.silver }]}>{t('Basic')}</Text>
          <Text style={[styles.compareHeaderText, { color: theme.gold }]}>{t('Premium')}</Text>
        </View>
        {COMPARISON.map((row) => (
          <View key={row.feature} style={[styles.compareRow, { borderBottomColor: theme.border }]}>
            <Text style={[styles.compareFeature, { color: theme.text }]}>{t(row.feature)}</Text>
            <Text style={[styles.compareBasic, { color: theme.silver }]}>{t(String(row.basic))}</Text>
            <Text style={[styles.comparePremium, { color: theme.gold }]}>{t(String(row.premium))}</Text>
          </View>
        ))}
      </SectionCard>

      <SectionCard title={t('Choose a Plan')}>
        <Text style={[styles.subtle, { color: theme.muted }]}>
          {t('Current active plan: {value}', { value: t(formatPlanLabel(status?.plan)) })}
        </Text>
        {Platform.OS === 'android' && googlePlayConfig?.enabled ? (
          <Text style={[styles.subtle, { color: theme.muted }]}>
            {googlePlayMode === 'google_play'
              ? t('Android subscriptions are handled through Google Play for trusted billing, renewal, cancellation, and refund status updates.')
              : googlePlayConfig?.allowWebFallback
                ? t('Google Play Billing is unavailable on this build. Internal fallback checkout is enabled for testing only.')
                : t('Google Play Billing is required on Android for this subscription flow.')}
          </Text>
        ) : null}
        <View style={styles.planGrid}>
          <View style={[styles.planCard, { borderColor: theme.border, backgroundColor: theme.card }]}>
            <Text style={[styles.planTitle, { color: theme.text }]}>{t('Basic')}</Text>
            {resolveTierVariant(status, 'basic') ? (
              <Text style={[styles.subtle, { color: theme.muted }]}>
                {t('Active variant: {value}', { value: t(resolveTierVariant(status, 'basic')) })}
              </Text>
            ) : null}
            <Text style={[styles.planPrice, { color: theme.accent }]}>{t(planDisplayPrice('basic_monthly'))}</Text>
            <Text style={[styles.planNote, { color: theme.muted }]}>{t('Best for tracking essentials.')}</Text>
            <PillButton
              kind={basicMonthlyActive ? 'status' : 'ghost'}
              disabled={basicMonthlyActive}
              label={basicMonthlyActive ? t('Active - Monthly') : t('Buy Monthly')}
              onPress={() => purchase('basic_monthly').catch((e) => setMessage(e.message))}
            />
            <Text style={[styles.planPriceSecondary, { color: theme.muted }]}>{t(planDisplayPrice('basic_yearly'))}</Text>
            <View style={styles.discountRow}>
              <Text style={[styles.discountBadge, { backgroundColor: theme.accentSoft, color: theme.accent }]}>
                {t('Save {percent}% on yearly', { percent: getDiscountPercent(PLAN_META.basic.monthly, PLAN_META.basic.yearly) })}
              </Text>
            </View>
            <PillButton
              kind={basicYearlyActive ? 'status' : 'ghost'}
              disabled={basicYearlyActive}
              label={basicYearlyActive ? t('Active - Yearly') : t('Buy Yearly')}
              onPress={() => purchase('basic_yearly').catch((e) => setMessage(e.message))}
            />
          </View>
          <View style={[styles.planCard, styles.planCardPremium, { borderColor: theme.gold, backgroundColor: theme.card }]}>
            <Text style={[styles.planTitle, { color: theme.text }]}>{t('Premium')}</Text>
            {resolveTierVariant(status, 'premium') ? (
              <Text style={[styles.subtle, { color: theme.muted }]}>
                {t('Active variant: {value}', { value: t(resolveTierVariant(status, 'premium')) })}
              </Text>
            ) : null}
            <Text style={[styles.planPrice, { color: theme.accent }]}>{t(planDisplayPrice('premium_monthly'))}</Text>
            <Text style={[styles.planNote, { color: theme.muted }]}>{t('Unlock targets, reminders, and net worth trend.')}</Text>
            <PillButton
              kind={premiumMonthlyActive ? 'status' : 'ghost'}
              disabled={premiumMonthlyActive}
              label={premiumMonthlyActive ? t('Active - Monthly') : t('Buy Monthly')}
              onPress={() => purchase('premium_monthly').catch((e) => setMessage(e.message))}
            />
            <Text style={[styles.planPriceSecondary, { color: theme.muted }]}>{t(planDisplayPrice('premium_yearly'))}</Text>
            <View style={styles.discountRow}>
              <Text style={[styles.discountBadge, { backgroundColor: theme.accentSoft, color: theme.accent }]}>
                {t('Save {percent}% on yearly', { percent: getDiscountPercent(PLAN_META.premium.monthly, PLAN_META.premium.yearly) })}
              </Text>
            </View>
            <PillButton
              kind={premiumYearlyActive ? 'status' : 'ghost'}
              disabled={premiumYearlyActive}
              label={premiumYearlyActive ? t('Active - Yearly') : t('Buy Yearly')}
              onPress={() => purchase('premium_yearly').catch((e) => setMessage(e.message))}
            />
          </View>
        </View>
      </SectionCard>

      {!!message && <Text style={[styles.message, { color: theme.danger }]}>{message}</Text>}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    paddingBottom: 20
  },
  modalBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(15, 23, 42, 0.35)',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 20
  },
  successModalCard: {
    width: '100%',
    borderWidth: 1,
    borderRadius: 16,
    padding: 16
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 6
  },
  checkoutHeader: {
    paddingHorizontal: 16,
    paddingVertical: 12,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between'
  },
  emptyCheckout: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24
  },
  headerCenter: {
    flex: 1,
    alignItems: 'center'
  },
  headerSpacer: {
    width: 48
  },
  backRow: {
    alignSelf: 'flex-start',
    paddingVertical: 6
  },
  backText: {
    color: '#0f766e',
    fontWeight: '700'
  },
  headerTitle: {
    color: '#0f3557',
    fontWeight: '800'
  },
  headerSub: {
    color: '#607d99',
    fontSize: 12,
    fontWeight: '600'
  },
  statusRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: 12,
    marginBottom: 6
  },
  subtle: {
    color: '#607d99',
    marginBottom: 6,
    fontWeight: '600'
  },
  emph: {
    color: '#0f3557',
    fontWeight: '700'
  },
  planGrid: {
    gap: 12
  },
  planCard: {
    borderWidth: 1,
    borderColor: '#d6e3f2',
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 12,
    gap: 8
  },
  ribbon: {
    position: 'absolute',
    top: 12,
    right: -40,
    transform: [{ rotate: '35deg' }],
    paddingVertical: 4,
    paddingHorizontal: 48,
    borderRadius: 999,
    zIndex: 2
  },
  ribbonActive: {},
  ribbonExpired: {},
  ribbonText: {
    color: '#fff',
    fontWeight: '800',
    fontSize: 11,
    letterSpacing: 0.6,
    textTransform: 'uppercase'
  },
  planCardPremium: {
    borderColor: '#f4d58d'
  },
  planTitle: {
    color: '#183750',
    fontWeight: '800',
    fontSize: 16
  },
  planPrice: {
    color: '#0f766e',
    fontWeight: '800'
  },
  planPriceSecondary: {
    color: '#35526e',
    marginTop: 6,
    fontWeight: '700'
  },
  discountRow: {
    alignItems: 'flex-start'
  },
  discountBadge: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 999,
    fontWeight: '800',
    fontSize: 11,
    letterSpacing: 0.2,
    overflow: 'hidden'
  },
  planNote: {
    color: '#607d99',
    marginBottom: 6,
    fontWeight: '600'
  },
  compareRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 6,
    borderBottomWidth: 1,
    borderBottomColor: '#eef2f8'
  },
  compareFeature: {
    flex: 1,
    color: '#183750',
    fontWeight: '700'
  },
  compareBasic: {
    width: 90,
    textAlign: 'right',
    color: '#98a2b3',
    fontWeight: '700'
  },
  comparePremium: {
    width: 90,
    textAlign: 'right',
    color: '#c28f2c',
    fontWeight: '800'
  },
  compareHeader: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    gap: 16,
    marginBottom: 6
  },
  compareHeaderText: {
    width: 90,
    textAlign: 'right',
    color: '#35526e',
    fontWeight: '800'
  },
  message: {
    color: '#b3261e',
    marginTop: 8,
    fontWeight: '600'
  },
  pendingActions: {
    marginTop: 8,
    gap: 8
  },
  closeWrap: {
    alignItems: 'center',
    marginTop: 10
  },
  closeText: {
    color: '#0f766e',
    fontWeight: '700'
  }
});
