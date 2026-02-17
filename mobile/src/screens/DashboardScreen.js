import React, { useEffect, useState, useCallback } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import SectionCard from '../components/SectionCard';
import StatTile from '../components/StatTile';
import PillButton from '../components/PillButton';
import { api } from '../api/client';
import { formatDate, formatINR, formatPct } from '../utils/format';

export default function DashboardScreen() {
  const [data, setData] = useState(null);
  const [error, setError] = useState('');

  const loadSummary = useCallback(async () => {
    const response = await api.getSummary();
    setData(response);
  }, []);

  const loadAll = useCallback(async () => {
    setError('');
    await loadSummary().catch((e) => setError(e.message));
  }, [loadSummary]);

  useEffect(() => {
    loadAll();
  }, [loadAll]);

  if (!data) {
    return <Text style={styles.muted}>{error || 'Loading dashboard...'}</Text>;
  }

  return (
    <View>
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
  err: {
    color: '#b3261e'
  }
});
