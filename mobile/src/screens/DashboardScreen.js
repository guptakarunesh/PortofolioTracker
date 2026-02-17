import React, { useEffect, useState, useCallback } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import SectionCard from '../components/SectionCard';
import StatTile from '../components/StatTile';
import PillButton from '../components/PillButton';
import { api } from '../api/client';
import { formatDate, formatINR, formatPct } from '../utils/format';

export default function DashboardScreen() {
  const [data, setData] = useState(null);
  const [rates, setRates] = useState(null);
  const [ratesError, setRatesError] = useState('');
  const [error, setError] = useState('');

  const loadSummary = useCallback(async () => {
    const response = await api.getSummary();
    setData(response);
  }, []);

  const loadRates = useCallback(async () => {
    try {
      const response = await api.getLiveMarketRates();
      setRates(response);
      setRatesError('');
    } catch (e) {
      try {
        const settings = await api.getSettings();
        const gold = Number(settings?.gold_24k_per_gram || 6500);
        const silver = Number(settings?.silver_per_gram || 75);
        setRates({
          source: 'local-settings-fallback',
          lastUpdated: new Date().toISOString(),
          warning: 'Live feeds unavailable. Showing saved Settings rates.',
          gold: { perGramInr: gold },
          silver: { perGramInr: silver }
        });
        setRatesError(`Live rates error: ${e.message}`);
      } catch (settingsErr) {
        setRatesError(`Live rates error: ${e.message} | Settings error: ${settingsErr.message}`);
      }
    }
  }, []);

  const loadAll = useCallback(async () => {
    setError('');
    await loadSummary().catch((e) => setError(e.message));
    await loadRates();
  }, [loadSummary, loadRates]);

  useEffect(() => {
    loadAll();
  }, [loadAll]);

  useEffect(() => {
    const interval = setInterval(() => {
      loadRates();
    }, 10000);
    return () => clearInterval(interval);
  }, [loadRates]);

  if (!data) {
    return <Text style={styles.muted}>{error || 'Loading dashboard...'}</Text>;
  }

  const cacheAgeText =
    Number.isFinite(rates?.cacheAgeMs) ? `${Math.max(0, Math.floor(rates.cacheAgeMs / 1000))}s` : '--';

  return (
    <View>
      <SectionCard title="Live Metals Ticker (India)">
        <View style={styles.tickerRow}>
          <Text style={styles.tickerLabel}>Gold (24K)</Text>
          <Text style={styles.tickerValue}>
            {rates?.gold?.perGramInr ? `${formatINR(rates.gold.perGramInr)}/g` : '--'}
          </Text>
        </View>
        <View style={styles.tickerRow}>
          <Text style={styles.tickerLabel}>Silver</Text>
          <Text style={styles.tickerValue}>
            {rates?.silver?.perGramInr ? `${formatINR(rates.silver.perGramInr)}/g` : '--'}
          </Text>
        </View>
        <Text style={styles.muted}>Source: {rates?.source || 'unavailable'}</Text>
        <Text style={styles.muted}>Rates updated: {rates?.lastUpdated ? formatDate(rates.lastUpdated) : '--'}</Text>
        <Text style={styles.muted}>Cache age: {cacheAgeText}</Text>
        {rates?.warning ? <Text style={[styles.muted, styles.warn]}>{rates.warning}</Text> : null}
        {rates?.error ? <Text style={[styles.muted, styles.err]}>{rates.error}</Text> : null}
        {ratesError ? <Text style={[styles.muted, styles.err]}>{ratesError}</Text> : null}
      </SectionCard>

      <SectionCard title="Net Worth Summary">
        <View style={styles.row}>
          <StatTile label="Total Assets" value={formatINR(data.totalAssets)} />
          <StatTile label="Liabilities" value={formatINR(data.totalLiabilities)} />
        </View>
        <View style={{ marginTop: 10 }}>
          <StatTile
            label="Net Worth"
            value={formatINR(data.netWorth)}
            positive={data.netWorth >= 0}
          />
        </View>
        <Text style={styles.muted}>Last updated: {formatDate(data.lastUpdated)}</Text>
      </SectionCard>

      <SectionCard title="Asset Allocation">
        {data.allocation.map((item) => (
          <View key={item.category} style={styles.allocRow}>
            <Text style={styles.allocLabel}>{item.category}</Text>
            <Text style={styles.allocValue}>{formatINR(item.currentValue)}</Text>
            <Text style={styles.allocPct}>{formatPct(item.pctOfTotal)}</Text>
          </View>
        ))}
      </SectionCard>

      {error ? <Text style={[styles.muted, styles.err]}>{error}</Text> : null}
      <PillButton label="Refresh Dashboard" onPress={loadAll} />
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    gap: 10
  },
  tickerRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: '#edf2f8'
  },
  tickerLabel: {
    color: '#183750',
    fontWeight: '700'
  },
  tickerValue: {
    color: '#0f3557',
    fontWeight: '800'
  },
  allocRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 8,
    paddingBottom: 6,
    borderBottomWidth: 1,
    borderBottomColor: '#edf2f8'
  },
  allocLabel: {
    flex: 1,
    color: '#183750',
    fontWeight: '600'
  },
  allocValue: {
    width: 120,
    textAlign: 'right',
    color: '#0f3557'
  },
  allocPct: {
    width: 70,
    textAlign: 'right',
    color: '#335a7a'
  },
  muted: {
    marginTop: 8,
    color: '#607d99'
  },
  warn: {
    color: '#9a6700'
  },
  err: {
    color: '#b3261e'
  }
});
