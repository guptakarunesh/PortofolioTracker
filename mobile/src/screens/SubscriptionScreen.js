import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet, Pressable, BackHandler, ScrollView } from 'react-native';
import SectionCard from '../components/SectionCard';
import PillButton from '../components/PillButton';
import { api } from '../api/client';
import { formatDate } from '../utils/format';
import { startCheckout } from '../payments';
import { useTheme } from '../theme';

const PLANS = {
  basic_monthly: { label: 'Basic Monthly', price: '₹99 / month' },
  basic_yearly: { label: 'Basic Yearly', price: '₹999 / year' },
  premium_monthly: { label: 'Premium Monthly', price: '₹169 / month' },
  premium_yearly: { label: 'Premium Yearly', price: '₹1599 / year' }
};

const COMPARISON = [
  { feature: 'Dashboard', basic: '✓', premium: '✓' },
  { feature: 'Assets', basic: 'Up to 10', premium: 'Unlimited' },
  { feature: 'Liabilities', basic: 'Up to 5', premium: 'Unlimited' },
  { feature: 'Account Management', basic: '✓', premium: '✓' },
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

export default function SubscriptionScreen({ onClose, onPurchased, user }) {
  const { theme } = useTheme();
  const [status, setStatus] = useState(null);
  const [message, setMessage] = useState('');

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

  const purchase = async (plan) => {
    setMessage('');
    const outcome = await startCheckout(plan, {
      user,
      fallback: async () => {
        await api.purchaseSubscription(plan);
      }
    });
    if (outcome?.mode === 'fallback') {
      setMessage('Payment provider unavailable. Applied fallback plan.');
    } else {
      setMessage('Payment successful. Refreshing plan status...');
    }
    await load();
    onPurchased?.();
  };

  return (
    <ScrollView contentContainerStyle={styles.container}>
      <View style={styles.headerRow}>
        <Pressable style={styles.backRow} onPress={onClose}>
          <Text style={[styles.backText, { color: theme.accent }]}>Back</Text>
        </Pressable>
        <View style={styles.headerCenter}>
          <Text style={[styles.headerTitle, { color: theme.text }]}>Manage Plan</Text>
          <Text style={[styles.headerSub, { color: theme.muted }]}>Upgrade or renew to unlock premium features.</Text>
        </View>
        <View style={styles.headerSpacer} />
      </View>

      <SectionCard title="Your Subscription">
        <View style={styles.statusRow}>
          <View>
            <Text style={[styles.subtle, { color: theme.muted }]}>Current plan</Text>
            <Text style={[styles.emph, { color: theme.text }]}>{formatPlanLabel(status?.plan)}</Text>
          </View>
          <View>
            <Text style={[styles.subtle, { color: theme.muted }]}>Status</Text>
            <Text style={[styles.emph, { color: theme.text }]}>{formatStatusLabel(status?.status)}</Text>
          </View>
        </View>
        {status?.current_period_end ? (
          <Text style={[styles.subtle, { color: theme.muted }]}>Expires: {formatDate(status.current_period_end)}</Text>
        ) : null}
      </SectionCard>

      <SectionCard title="What You Get">
        <View style={styles.compareHeader}>
          <Text style={[styles.compareHeaderText, { color: theme.silver }]}>Basic</Text>
          <Text style={[styles.compareHeaderText, { color: theme.gold }]}>Premium</Text>
        </View>
        {COMPARISON.map((row) => (
          <View key={row.feature} style={[styles.compareRow, { borderBottomColor: theme.border }]}>
            <Text style={[styles.compareFeature, { color: theme.text }]}>{row.feature}</Text>
            <Text style={[styles.compareBasic, { color: theme.silver }]}>{row.basic}</Text>
            <Text style={[styles.comparePremium, { color: theme.gold }]}>{row.premium}</Text>
          </View>
        ))}
      </SectionCard>

      <SectionCard title="Choose a Plan">
        <View style={styles.planGrid}>
          <View style={[styles.planCard, { borderColor: theme.border, backgroundColor: theme.card }]}>
            <Text style={[styles.planTitle, { color: theme.text }]}>Basic</Text>
            <Text style={[styles.planPrice, { color: theme.accent }]}>{PLANS.basic_monthly.price}</Text>
            <Text style={[styles.planNote, { color: theme.muted }]}>Best for tracking essentials.</Text>
            <PillButton label="Buy Monthly" onPress={() => purchase('basic_monthly').catch((e) => setMessage(e.message))} />
            <Text style={[styles.planPriceSecondary, { color: theme.muted }]}>{PLANS.basic_yearly.price}</Text>
            <PillButton label="Buy Yearly" kind="ghost" onPress={() => purchase('basic_yearly').catch((e) => setMessage(e.message))} />
          </View>
          <View style={[styles.planCard, styles.planCardPremium, { borderColor: theme.gold, backgroundColor: theme.accentSoft }]}>
            <Text style={[styles.planTitle, { color: theme.text }]}>Premium</Text>
            <Text style={[styles.planPrice, { color: theme.accent }]}>{PLANS.premium_monthly.price}</Text>
            <Text style={[styles.planNote, { color: theme.muted }]}>Unlock targets, reminders, and performance.</Text>
            <PillButton label="Buy Monthly" onPress={() => purchase('premium_monthly').catch((e) => setMessage(e.message))} />
            <Text style={[styles.planPriceSecondary, { color: theme.muted }]}>{PLANS.premium_yearly.price}</Text>
            <PillButton label="Buy Yearly" kind="ghost" onPress={() => purchase('premium_yearly').catch((e) => setMessage(e.message))} />
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
    fontSize: 12
  },
  statusRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: 12,
    marginBottom: 6
  },
  subtle: {
    color: '#607d99',
    marginBottom: 6
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
  planCardPremium: {
    borderColor: '#f4d58d',
    backgroundColor: '#fff9e6'
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
  planNote: {
    color: '#607d99',
    marginBottom: 6
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
  closeWrap: {
    alignItems: 'center',
    marginTop: 10
  },
  closeText: {
    color: '#0f766e',
    fontWeight: '700'
  }
});
