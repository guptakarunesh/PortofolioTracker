import React, { useEffect, useState, useCallback } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import SectionCard from '../components/SectionCard';
import PillButton from '../components/PillButton';
import { api } from '../api/client';
import { formatAmountFromInr } from '../utils/format';
import { useTheme } from '../theme';
import { useI18n } from '../i18n';

const ASSETS_COLOR = '#0f766e';
const LIABILITIES_COLOR = '#f97316';
const NET_WORTH_COLOR = '#8b5cf6';

function barWidth(value, maxValue) {
  if (!maxValue || maxValue <= 0) return '0%';
  const pct = Math.max(0, Math.min(1, value / maxValue));
  return `${Math.max(6, Math.round(pct * 100))}%`;
}

export default function PerformanceScreen({
  hideSensitive = false,
  preferredCurrency = 'INR',
  fxRates = { INR: 1 },
  premiumActive = false,
  onOpenSubscription
}) {
  const { theme } = useTheme();
  const { t } = useI18n();
  const [rows, setRows] = useState([]);
  const [message, setMessage] = useState('');

  const load = useCallback(async () => {
    const response = await api.getPerformanceLastSix();
    setRows(response?.snapshots || []);
  }, []);

  useEffect(() => {
    load().catch((e) => setMessage(e.message));
  }, [load]);

  const maxY = rows.reduce(
    (max, r) => Math.max(max, Number(r.totalAssets || 0), Number(r.totalLiabilities || 0), Number(r.netWorth || 0)),
    0
  );

  const formatMonthLabel = (dateText) => {
    const date = new Date(dateText);
    if (Number.isNaN(date.getTime())) return dateText;
    return date.toLocaleDateString('en-US', { month: 'short', year: '2-digit' });
  };
  const rowsLatestFirst = [...rows].reverse();

  if (!premiumActive) {
    return (
      <View>
        <SectionCard title={t('Performance (Premium)')}>
          <Text style={[styles.sub, { color: theme.warn }]}>{t('Performance insights are available with Premium.')}</Text>
          <PillButton label={t('Upgrade to Premium')} onPress={onOpenSubscription} />
        </SectionCard>
      </View>
    );
  }

  return (
    <View>
      <SectionCard title={t('Performance (Last 6 Months)')}>
        <Text style={[styles.sub, { color: theme.muted }]}>{t('Monthly trend of assets, liabilities, and net worth.')}</Text>
        <View style={styles.legendRow}>
          <Text style={[styles.legendItem, styles.assetsLegend]}>{t('Assets')}</Text>
          <Text style={[styles.legendItem, styles.liabilitiesLegend]}>{t('Liabilities')}</Text>
          <Text style={[styles.legendItem, styles.netWorthLegend]}>{t('Net Worth')}</Text>
        </View>

        <View style={styles.chartCol}>
          {rowsLatestFirst.map((row) => {
            const assets = Number(row.totalAssets || 0);
            const liabilities = Number(row.totalLiabilities || 0);
            const netWorth = Number(row.netWorth || 0);
            return (
              <View
                key={row.quarterStart}
                style={[styles.group, { borderColor: theme.border, backgroundColor: theme.card, shadowColor: theme.text }]}
              >
                <Text style={[styles.axisLabel, { color: theme.text }]}>{formatMonthLabel(row.quarterStart)}</Text>

                <View style={styles.metricRow}>
                  <Text style={[styles.metricKey, styles.assetsLegend]}>{t('Assets')}</Text>
                  <View style={[styles.track, { backgroundColor: theme.border }]}>
                    <View style={[styles.fill, styles.assetsBar, { width: barWidth(assets, maxY) }]} />
                  </View>
                  <Text style={[styles.metricValue, { color: theme.muted }]}>
                    {hideSensitive ? '••••••' : formatAmountFromInr(assets, preferredCurrency, fxRates)}
                  </Text>
                </View>

                <View style={styles.metricRow}>
                  <Text style={[styles.metricKey, styles.liabilitiesLegend]}>{t('Liabilities')}</Text>
                  <View style={[styles.track, { backgroundColor: theme.border }]}>
                    <View style={[styles.fill, styles.liabilitiesBar, { width: barWidth(liabilities, maxY) }]} />
                  </View>
                  <Text style={[styles.metricValue, { color: theme.muted }]}>
                    {hideSensitive ? '••••••' : formatAmountFromInr(liabilities, preferredCurrency, fxRates)}
                  </Text>
                </View>

                <View style={styles.metricRow}>
                  <Text style={[styles.metricKey, styles.netWorthLegend]}>{t('Net Worth')}</Text>
                  <View style={[styles.track, { backgroundColor: theme.border }]}>
                    <View style={[styles.fill, styles.netWorthBar, { width: barWidth(netWorth, maxY) }]} />
                  </View>
                  <Text style={[styles.metricValue, { color: theme.muted }]}>
                    {hideSensitive ? '••••••' : formatAmountFromInr(netWorth, preferredCurrency, fxRates)}
                  </Text>
                </View>
              </View>
            );
          })}
        </View>

        {!rows.length ? <Text style={[styles.sub, { color: theme.muted }]}>{t('No performance snapshots available yet.')}</Text> : null}
      </SectionCard>
      {!!message && <Text style={[styles.message, { color: theme.text }]}>{message}</Text>}
    </View>
  );
}

const styles = StyleSheet.create({
  sub: { color: '#607d99', marginBottom: 10, lineHeight: 18 },
  legendRow: { flexDirection: 'row', gap: 10, marginBottom: 10 },
  legendItem: { color: '#35526e', fontWeight: '800', fontSize: 12 },
  chartCol: {
    gap: 14
  },
  group: {
    borderWidth: 1,
    borderColor: '#dbe6f2',
    borderRadius: 14,
    padding: 12,
    backgroundColor: '#f8fbff',
    shadowColor: '#0f172a',
    shadowOpacity: 0.04,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 3 },
    elevation: 1
  },
  metricRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginTop: 9
  },
  metricKey: {
    width: 78,
    fontSize: 11,
    fontWeight: '800'
  },
  track: {
    flex: 1,
    height: 14,
    borderRadius: 999,
    backgroundColor: '#e6eef7',
    overflow: 'hidden'
  },
  fill: {
    height: '100%',
    borderRadius: 999
  },
  metricValue: {
    width: 108,
    textAlign: 'right',
    color: '#35526e',
    fontSize: 11,
    fontWeight: '800'
  },
  assetsBar: {
    backgroundColor: ASSETS_COLOR
  },
  liabilitiesBar: {
    backgroundColor: LIABILITIES_COLOR
  },
  netWorthBar: {
    backgroundColor: NET_WORTH_COLOR
  },
  assetsLegend: {
    color: ASSETS_COLOR
  },
  liabilitiesLegend: {
    color: LIABILITIES_COLOR
  },
  netWorthLegend: {
    color: NET_WORTH_COLOR
  },
  axisLabel: {
    color: '#183750',
    fontSize: 13,
    fontWeight: '800'
  },
  axisSub: {
    color: '#35526e',
    fontSize: 11
  },
  message: { color: '#0f3557', marginBottom: 20, fontWeight: '600' }
});
