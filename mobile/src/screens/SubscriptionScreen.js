import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet, Pressable, BackHandler, ScrollView, Platform, Linking, Modal } from 'react-native';
import { WebView } from 'react-native-webview';
import SectionCard from '../components/SectionCard';
import PillButton from '../components/PillButton';
import { api } from '../api/client';
import { formatDate } from '../utils/format';
import { startCheckout, verifyCheckout } from '../payments';
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
  { feature: 'Performance', basic: '✗', premium: '✓' },
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

  const load = async () => {
    const payload = await api.getSubscriptionStatus();
    setStatus(payload);
  };

  useEffect(() => {
    load().catch((e) => setMessage(e.message));
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
        status: 'success'
      });
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
        <View style={styles.planGrid}>
          <View style={[styles.planCard, { borderColor: theme.border, backgroundColor: theme.card }]}>
            <Text style={[styles.planTitle, { color: theme.text }]}>{t('Basic')}</Text>
            {resolveTierVariant(status, 'basic') ? (
              <Text style={[styles.subtle, { color: theme.muted }]}>
                {t('Active variant: {value}', { value: t(resolveTierVariant(status, 'basic')) })}
              </Text>
            ) : null}
            <Text style={[styles.planPrice, { color: theme.accent }]}>{t(PLANS.basic_monthly.price)}</Text>
            <Text style={[styles.planNote, { color: theme.muted }]}>{t('Best for tracking essentials.')}</Text>
            <PillButton
              kind={basicMonthlyActive ? 'status' : 'ghost'}
              disabled={basicMonthlyActive}
              label={basicMonthlyActive ? t('Active - Monthly') : t('Buy Monthly')}
              onPress={() => purchase('basic_monthly').catch((e) => setMessage(e.message))}
            />
            <Text style={[styles.planPriceSecondary, { color: theme.muted }]}>{t(PLANS.basic_yearly.price)}</Text>
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
            <Text style={[styles.planPrice, { color: theme.accent }]}>{t(PLANS.premium_monthly.price)}</Text>
            <Text style={[styles.planNote, { color: theme.muted }]}>{t('Unlock targets, reminders, and performance.')}</Text>
            <PillButton
              kind={premiumMonthlyActive ? 'status' : 'ghost'}
              disabled={premiumMonthlyActive}
              label={premiumMonthlyActive ? t('Active - Monthly') : t('Buy Monthly')}
              onPress={() => purchase('premium_monthly').catch((e) => setMessage(e.message))}
            />
            <Text style={[styles.planPriceSecondary, { color: theme.muted }]}>{t(PLANS.premium_yearly.price)}</Text>
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
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 6
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
