import React, { useEffect, useState, useCallback } from 'react';
import { View, Text, StyleSheet, Linking, Pressable } from 'react-native';
import SectionCard from '../components/SectionCard';
import StatTile from '../components/StatTile';
import PillButton from '../components/PillButton';
import DateField from '../components/DateField';
import { api, buildApiUrl, getAuthToken } from '../api/client';
import { formatDate, formatAmountFromInr, formatPct } from '../utils/format';
import { useTheme } from '../theme';
import { useI18n } from '../i18n';

const ASSET_TARGET_CATEGORIES = [
  'Banking & Deposits',
  'Market Investments',
  'Precious Metals',
  'Real Estate',
  'Retirement Funds',
  'Insurance (Cash Value)',
  'Other Assets'
];

const PIE_COLORS = ['#0f766e', '#f59e0b', '#ef4444', '#a855f7', '#22c55e', '#f97316', '#eab308'];
const ACCENT = '#0f766e';
const PANEL_OPTIONS = [
  { key: 'allocation', label: 'Asset Allocation' },
  { key: 'performance', label: 'Performance' },
  { key: 'targets', label: 'Yearly Target Progress' }
];

const targetSettingKey = (category) =>
  `yearly_target_${category.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '')}`;

const displayAmount = (value, hideSensitive, currency, fxRates) =>
  hideSensitive ? '••••••' : formatAmountFromInr(value, currency, fxRates);

export default function DashboardScreen({ hideSensitive = false, preferredCurrency = 'INR', fxRates = { INR: 1 } }) {
  const { theme } = useTheme();
  const { t } = useI18n();
  const [data, setData] = useState(null);
  const [settings, setSettings] = useState({});
  const [error, setError] = useState('');
  const [reportDate, setReportDate] = useState(new Date().toISOString().slice(0, 10));
  const [activePanel, setActivePanel] = useState('allocation');

  const loadSummary = useCallback(async () => {
    const response = await api.getSummary();
    setData(response);
  }, []);

  const loadAll = useCallback(async () => {
    setError('');
    await Promise.all([
      loadSummary(),
      api.getSettings().then((response) => setSettings(response || {}))
    ]).catch((e) => setError(e.message));
  }, [loadSummary]);

  useEffect(() => {
    loadAll();
  }, [loadAll]);

  if (!data) {
    return <Text style={[styles.muted, { color: theme.muted }]}>{error || t('Loading dashboard...')}</Text>;
  }

  const sortedAllocation = [...(data.allocation || [])]
    .sort((a, b) => Number(b.currentValue || 0) - Number(a.currentValue || 0))
    .filter((item) => Number(item.currentValue || 0) > 0);

  const targetProgressRows = ASSET_TARGET_CATEGORIES.map((category) => {
    const key = targetSettingKey(category);
    const target = Number(settings?.[key] || 0);
    const current = Number(data.allocation.find((item) => item.category === category)?.currentValue || 0);
    const pct = target > 0 ? (current / target) * 100 : 0;
    return {
      category,
      target,
      current,
      pct,
      pctClamped: Math.max(0, Math.min(100, pct))
    };
  })
    .filter((row) => row.target > 0)
    .sort((a, b) => a.pct - b.pct);

  const performancePoints = Array.isArray(data.performance) ? data.performance : [];
  const currency = preferredCurrency || settings?.preferred_currency || 'INR';

  return (
    <View>
      <SectionCard title={t('Net Worth Summary')}>
        <View style={styles.row}>
          <StatTile label={t('Total Assets')} value={displayAmount(data.totalAssets, hideSensitive, currency, fxRates)} />
          <StatTile label={t('Liabilities')} value={displayAmount(data.totalLiabilities, hideSensitive, currency, fxRates)} />
        </View>
        <View style={{ marginTop: 10 }}>
          <StatTile
            label={t('Net Worth')}
            value={displayAmount(data.netWorth, hideSensitive, currency, fxRates)}
            positive={data.netWorth >= 0}
          />
        </View>
        <Text style={[styles.muted, { color: theme.muted }]}>{t('Last updated: {date}', { date: formatDate(data.lastUpdated) })}</Text>

        <View style={[styles.snapshotBox, { borderColor: theme.border, backgroundColor: theme.card }]}> 
          <Text style={[styles.snapshotTitle, { color: theme.text }]}>{t('Snapshot PDF Report')}</Text>
          <Text style={[styles.subtleInfo, { color: theme.muted }]}>{t('Download asset and liability snapshot for a selected date.')}</Text>
          <DateField value={reportDate} onChange={setReportDate} theme={theme} placeholder="YYYY-MM-DD" />
          <PillButton
            label={t('Download Snapshot PDF')}
            onPress={() => {
              const token = getAuthToken();
              if (!token) {
                setError(t('Session expired. Please login again.'));
                return;
              }
              const url = buildApiUrl(`/api/reports/snapshot/file?date=${encodeURIComponent(reportDate)}&token=${encodeURIComponent(token)}`);
              Linking.openURL(url).catch((e) => setError(e.message));
            }}
          />
        </View>
      </SectionCard>

      <SectionCard title={t('Home Page Insights')}>
        <View style={styles.chipRow}>
          {PANEL_OPTIONS.map((panel) => {
            const active = activePanel === panel.key;
            return (
              <Pressable
                key={panel.key}
                style={[
                  styles.chip,
                  { borderColor: active ? theme.accent : theme.border, backgroundColor: active ? theme.accentSoft : theme.card }
                ]}
                onPress={() => setActivePanel(panel.key)}
              >
                <Text style={[styles.chipText, { color: active ? theme.accent : theme.text }]}>{t(panel.label)}</Text>
              </Pressable>
            );
          })}
        </View>

        {activePanel === 'allocation' ? (
          <View style={styles.chartWrap}>
            {sortedAllocation.map((item, idx) => (
              <View key={item.category} style={[styles.chartRow, { borderColor: theme.border, backgroundColor: theme.card }]}> 
                <View style={styles.chartLegendRow}>
                  <View style={[styles.legendDot, { backgroundColor: PIE_COLORS[idx % PIE_COLORS.length] }]} />
                  <Text style={[styles.allocLabel, { color: theme.text }]}>{t(item.category)}</Text>
                </View>
                <View style={styles.chartValueRow}>
                  <Text style={[styles.allocValue, { color: theme.text }]}>{displayAmount(item.currentValue, hideSensitive, currency, fxRates)}</Text>
                  <Text style={[styles.allocPct, { color: theme.muted }]}>{formatPct(item.pctOfTotal)}</Text>
                </View>
                <View style={[styles.progressTrack, { backgroundColor: theme.border }]}> 
                  <View
                    style={[
                      styles.progressFill,
                      { width: `${Math.max(0, Math.min(100, item.pctOfTotal))}%`, backgroundColor: PIE_COLORS[idx % PIE_COLORS.length] }
                    ]}
                  />
                </View>
              </View>
            ))}
          </View>
        ) : null}

        {activePanel === 'performance' ? (
          performancePoints.length ? (
            performancePoints.map((point) => (
              <View key={`${point.label}-${point.netWorth}`} style={[styles.targetRow, { borderBottomColor: theme.border }]}> 
                <View style={styles.targetHeadRow}>
                  <Text style={[styles.targetLabel, { color: theme.text }]}>{String(point.label || '-')}</Text>
                  <Text style={[styles.targetPct, { color: theme.accent }]}>{displayAmount(point.netWorth, hideSensitive, currency, fxRates)}</Text>
                </View>
                <Text style={[styles.targetSub, { color: theme.muted }]}>
                  {t('Assets: {assets} • Liabilities: {liabilities}', {
                    assets: displayAmount(point.assets, hideSensitive, currency, fxRates),
                    liabilities: displayAmount(point.liabilities, hideSensitive, currency, fxRates)
                  })}
                </Text>
              </View>
            ))
          ) : (
            <Text style={[styles.subtleInfo, { color: theme.muted }]}>{t('No performance snapshots available yet.')}</Text>
          )
        ) : null}

        {activePanel === 'targets' ? (
          targetProgressRows.length ? (
            targetProgressRows.map((row) => (
              <View key={row.category} style={[styles.targetRow, { borderBottomColor: theme.border }]}> 
                <View style={styles.targetHeadRow}>
                  <Text style={[styles.targetLabel, { color: theme.text }]}>{t(row.category)}</Text>
                  <Text style={[styles.targetPct, { color: theme.accent }]}>{formatPct(row.pct)}</Text>
                </View>
                <Text style={[styles.targetSub, { color: theme.muted }]}>
                  {displayAmount(row.current, hideSensitive, currency, fxRates)} of {displayAmount(row.target, hideSensitive, currency, fxRates)}
                </Text>
                <View style={[styles.progressTrack, { backgroundColor: theme.border }]}> 
                  <View style={[styles.progressFill, { width: `${row.pctClamped}%`, backgroundColor: theme.accent }]} />
                </View>
              </View>
            ))
          ) : (
            <Text style={[styles.subtleInfo, { color: theme.muted }]}>{t('No yearly targets set yet. Add them in Settings.')}</Text>
          )
        ) : null}
      </SectionCard>

      {error ? <Text style={[styles.muted, { color: theme.danger }]}>{error}</Text> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    gap: 10
  },
  chipRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginBottom: 14
  },
  chip: {
    borderWidth: 1,
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 8
  },
  chipText: {
    fontWeight: '800',
    fontSize: 12
  },
  chartWrap: {
    gap: 12
  },
  chartRow: {
    gap: 8,
    borderWidth: 1,
    borderRadius: 12,
    padding: 10
  },
  chartLegendRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8
  },
  chartValueRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center'
  },
  legendDot: {
    width: 10,
    height: 10,
    borderRadius: 999
  },
  allocLabel: {
    flex: 1,
    fontWeight: '700'
  },
  allocValue: {
    textAlign: 'right'
  },
  allocPct: {
    width: 70,
    textAlign: 'right'
  },
  targetRow: {
    paddingBottom: 12,
    marginBottom: 12,
    borderBottomWidth: 1
  },
  targetHeadRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center'
  },
  targetLabel: {
    fontWeight: '700'
  },
  targetPct: {
    fontWeight: '700'
  },
  targetSub: {
    marginTop: 4,
    fontWeight: '600'
  },
  progressTrack: {
    marginTop: 6,
    height: 8,
    borderRadius: 999,
    overflow: 'hidden'
  },
  progressFill: {
    height: 8,
    borderRadius: 999,
    backgroundColor: ACCENT
  },
  snapshotBox: {
    marginTop: 14,
    borderWidth: 1,
    borderRadius: 14,
    padding: 12,
    gap: 8
  },
  snapshotTitle: {
    fontWeight: '800',
    fontSize: 15
  },
  subtleInfo: {
    lineHeight: 18,
    fontWeight: '600'
  },
  muted: {
    marginTop: 8,
    fontWeight: '500'
  }
});
