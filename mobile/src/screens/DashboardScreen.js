import React, { useEffect, useState, useCallback } from 'react';
import { View, Text, StyleSheet, Pressable, Modal, Linking } from 'react-native';
import SectionCard from '../components/SectionCard';
import StatTile from '../components/StatTile';
import PillButton from '../components/PillButton';
import { api, buildApiUrl, getAuthToken } from '../api/client';
import { formatDate, formatAmountFromInr, formatPct } from '../utils/format';
import { useTheme } from '../theme';

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

const targetSettingKey = (category) =>
  `yearly_target_${category.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '')}`;

const displayAmount = (value, hideSensitive, currency, fxRates) =>
  hideSensitive ? '••••••' : formatAmountFromInr(value, currency, fxRates);

export default function DashboardScreen({ hideSensitive = false, preferredCurrency = 'INR', fxRates = { INR: 1 } }) {
  const { theme } = useTheme();
  const [data, setData] = useState(null);
  const [allocationInsight, setAllocationInsight] = useState(null);
  const [settings, setSettings] = useState({});
  const [error, setError] = useState('');
  const [reportDate, setReportDate] = useState(new Date().toISOString().slice(0, 10));
  const [calendarVisible, setCalendarVisible] = useState(false);

  const loadSummary = useCallback(async () => {
    const response = await api.getSummary();
    setData(response);
  }, []);

  const loadAllocationInsight = useCallback(async () => {
    const response = await api.getAllocationInsight();
    setAllocationInsight(response);
  }, []);

  const loadAll = useCallback(async () => {
    setError('');
    await Promise.all([
      loadSummary(),
      loadAllocationInsight(),
      api.getSettings().then((response) => setSettings(response || {}))
    ]).catch((e) => setError(e.message));
  }, [loadAllocationInsight, loadSummary]);

  useEffect(() => {
    loadAll();
  }, [loadAll]);

  if (!data) {
    return <Text style={[styles.muted, { color: theme.muted }]}>{error || 'Loading dashboard...'}</Text>;
  }

  const sortedAllocation = [...(data.allocation || [])].sort(
    (a, b) => Number(b.currentValue || 0) - Number(a.currentValue || 0)
  ).filter((item) => Number(item.currentValue || 0) > 0);

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
  const currency = preferredCurrency || settings?.preferred_currency || 'INR';

  return (
    <View>
      <SectionCard title="Net Worth Summary">
        <View style={styles.row}>
          <StatTile label="Total Assets" value={displayAmount(data.totalAssets, hideSensitive, currency, fxRates)} />
          <StatTile label="Liabilities" value={displayAmount(data.totalLiabilities, hideSensitive, currency, fxRates)} />
        </View>
        <View style={{ marginTop: 10 }}>
          <StatTile
            label="Net Worth"
            value={displayAmount(data.netWorth, hideSensitive, currency, fxRates)}
            positive={data.netWorth >= 0}
          />
        </View>
        <Text style={[styles.muted, { color: theme.muted }]}>Last updated: {formatDate(data.lastUpdated)}</Text>
      </SectionCard>

      <SectionCard title="Asset Allocation">
        <Text style={[styles.subtleInfo, { color: theme.muted }]}>Chart view (with value and %)</Text>
        <View style={styles.chartWrap}>
          {sortedAllocation.map((item, idx) => (
            <View key={item.category} style={[styles.chartRow, { borderColor: theme.border, backgroundColor: theme.card }]}>
              <View style={styles.chartLegendRow}>
                <View style={[styles.legendDot, { backgroundColor: PIE_COLORS[idx % PIE_COLORS.length] }]} />
                <Text style={[styles.allocLabel, { color: theme.text }]}>{item.category}</Text>
              </View>
              <View style={styles.chartValueRow}>
                <Text style={[styles.allocValue, { color: theme.text }]}>
                  {displayAmount(item.currentValue, hideSensitive, currency, fxRates)}
                </Text>
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
      </SectionCard>

      <SectionCard title="AI Allocation Insight (India)">
        {allocationInsight ? (
          <View style={styles.aiWrap}>
            <View style={styles.aiHead}>
              <Text style={[styles.aiProfile, { color: theme.text }]}>Profile: {allocationInsight.profile}</Text>
              <View style={[styles.aiScoreChip, { backgroundColor: theme.accentSoft, borderColor: theme.accent }]}>
                <Text style={[styles.aiScoreText, { color: theme.accent }]}>
                  Score {Number(allocationInsight.score || 0)}/100
                </Text>
              </View>
            </View>
            <Text style={[styles.subtleInfo, { color: theme.muted }]}>{allocationInsight.summary}</Text>

            {(allocationInsight.suggestions || []).map((line) => (
              <Text key={line} style={[styles.aiLine, { color: theme.muted }]}>
                - {line}
              </Text>
            ))}

            {(allocationInsight.gaps || [])
              .filter((gap) => gap.status !== 'within')
              .sort((a, b) => Number(b.gapPct || 0) - Number(a.gapPct || 0))
              .slice(0, 4)
              .map((gap) => (
                <Text key={gap.category} style={[styles.aiGap, { color: theme.muted }]}>
                  {gap.category}: {formatPct(gap.currentPct)} vs {gap.targetMin}-{gap.targetMax}%
                </Text>
              ))}

            <Text style={[styles.aiDisclaimer, { color: theme.muted }]}>{allocationInsight.disclaimer}</Text>
          </View>
        ) : (
          <Text style={[styles.subtleInfo, { color: theme.muted }]}>Loading AI insight...</Text>
        )}
      </SectionCard>

      <SectionCard title="Yearly Target Progress">
        {targetProgressRows.length ? (
          targetProgressRows.map((row) => (
            <View key={row.category} style={[styles.targetRow, { borderBottomColor: theme.border }]}>
              <View style={styles.targetHeadRow}>
                <Text style={[styles.targetLabel, { color: theme.text }]}>{row.category}</Text>
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
          <Text style={[styles.subtleInfo, { color: theme.muted }]}>No yearly targets set yet. Add them in Settings.</Text>
        )}
      </SectionCard>

      <SectionCard title="Snapshot PDF Report">
        <Text style={[styles.subtleInfo, { color: theme.muted }]}>Download asset and liability snapshot for a selected date.</Text>
        <Pressable style={[styles.reportInput, { borderColor: theme.border, backgroundColor: theme.inputBg }]} onPress={() => setCalendarVisible(true)}>
          <Text style={[styles.dateValue, { color: theme.text }]}>{reportDate}</Text>
        </Pressable>
        <PillButton
          label="Download Snapshot PDF"
          onPress={() => {
            const token = getAuthToken();
            if (!token) {
              setError('Session expired. Please login again.');
              return;
            }
            const url = buildApiUrl(
              `/api/reports/snapshot/file?date=${encodeURIComponent(reportDate)}&token=${encodeURIComponent(token)}`
            );
            Linking.openURL(url).catch((e) => setError(e.message));
          }}
        />
      </SectionCard>

      <Modal visible={calendarVisible} transparent animationType="fade">
        <View style={styles.modalBackdrop}>
          <View style={[styles.modalCard, { backgroundColor: theme.card }]}>
            <Text style={[styles.modalTitle, { color: theme.text }]}>Pick Snapshot Day</Text>
            <View style={styles.dayGrid}>
              {Array.from({ length: 31 }, (_, i) => i + 1).map((day) => {
                const [y, m] = reportDate.split('-');
                const d = String(day).padStart(2, '0');
                const date = `${y}-${m}-${d}`;
                const selected = date === reportDate;
                return (
                  <Pressable
                    key={date}
                    style={[
                      styles.dayCell,
                      { borderColor: theme.border },
                      selected && { backgroundColor: theme.accent, borderColor: theme.accent }
                    ]}
                    onPress={() => {
                      setReportDate(date);
                      setCalendarVisible(false);
                    }}
                  >
                    <Text style={[styles.dayText, { color: theme.text }, selected && styles.dayTextActive]}>{day}</Text>
                  </Pressable>
                );
              })}
            </View>
            <Pressable style={styles.closeBtn} onPress={() => setCalendarVisible(false)}>
              <Text style={[styles.closeBtnText, { color: theme.accent }]}>Close</Text>
            </Pressable>
          </View>
        </View>
      </Modal>

      {error ? <Text style={[styles.muted, { color: theme.danger }]}>{error}</Text> : null}
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
    fontWeight: '700'
  },
  allocValue: {
    textAlign: 'right',
    color: '#0f3557'
  },
  allocPct: {
    width: 70,
    textAlign: 'right',
    color: '#3d6f6a'
  },
  chartWrap: {
    gap: 12
  },
  aiWrap: {
    gap: 8
  },
  aiHead: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 10
  },
  aiProfile: {
    color: '#183750',
    fontWeight: '800',
    textTransform: 'capitalize'
  },
  aiScoreChip: {
    backgroundColor: '#eaf8f3',
    borderColor: '#9bdac2',
    borderWidth: 1,
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 4
  },
  aiScoreText: {
    color: '#0f766e',
    fontWeight: '800'
  },
  aiLine: {
    color: '#35526e',
    lineHeight: 19
  },
  aiGap: {
    color: '#35526e',
    fontSize: 12,
    fontWeight: '600'
  },
  aiDisclaimer: {
    marginTop: 2,
    color: '#607d99',
    fontSize: 12
  },
  chartRow: {
    gap: 8,
    borderWidth: 1,
    borderColor: '#e3ebf6',
    borderRadius: 12,
    backgroundColor: '#fbfdff',
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
  targetRow: {
    paddingBottom: 12,
    marginBottom: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#edf2f8'
  },
  targetHeadRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center'
  },
  targetLabel: {
    color: '#183750',
    fontWeight: '700'
  },
  targetPct: {
    color: ACCENT,
    fontWeight: '700'
  },
  targetSub: {
    marginTop: 4,
    color: '#607d99'
  },
  progressTrack: {
    marginTop: 6,
    height: 8,
    borderRadius: 999,
    backgroundColor: '#e8eff9',
    overflow: 'hidden'
  },
  progressFill: {
    height: 8,
    borderRadius: 999,
    backgroundColor: ACCENT
  },
  subtleInfo: {
    color: '#607d99',
    lineHeight: 18
  },
  reportInput: {
    borderWidth: 1,
    borderColor: '#c6d8eb',
    backgroundColor: '#fff',
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 10,
    marginBottom: 12,
    marginTop: 6
  },
  dateValue: {
    color: '#35526e',
    fontWeight: '700'
  },
  modalBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.35)',
    justifyContent: 'center',
    paddingHorizontal: 20
  },
  modalCard: {
    backgroundColor: '#fff',
    borderRadius: 16,
    padding: 16
  },
  modalTitle: {
    color: '#0f2f4d',
    fontWeight: '800',
    marginBottom: 8
  },
  dayGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6
  },
  dayCell: {
    width: 36,
    height: 36,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#d1d9e6',
    alignItems: 'center',
    justifyContent: 'center'
  },
  dayCellActive: {
    backgroundColor: '#0f766e',
    borderColor: '#0f766e'
  },
  dayText: {
    color: '#35526e'
  },
  dayTextActive: {
    color: '#fff',
    fontWeight: '700'
  },
  closeBtn: {
    marginTop: 10,
    alignSelf: 'flex-end'
  },
  closeBtnText: {
    color: '#0f766e',
    fontWeight: '700'
  },
  textDark: {
    color: '#e7edf5'
  },
  muted: {
    marginTop: 8,
    color: '#607d99',
    fontWeight: '500'
  },
  err: {
    color: '#b3261e'
  }
});
