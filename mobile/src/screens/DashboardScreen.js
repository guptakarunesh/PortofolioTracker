import React, { useEffect, useState, useCallback } from 'react';
import { View, Text, StyleSheet, Linking, Pressable } from 'react-native';
import Svg, { Defs, LinearGradient, Rect, Stop } from 'react-native-svg';
import SectionCard from '../components/SectionCard';
import StatTile from '../components/StatTile';
import PillButton from '../components/PillButton';
import DateField from '../components/DateField';
import { api, buildApiUrl, getAuthToken } from '../api/client';
import { formatDate, formatAmountFromInr, formatPct } from '../utils/format';
import { useTheme } from '../theme';
import { useI18n } from '../i18n';
import { BRAND } from '../brand';

const ASSET_TARGET_CATEGORIES = [
  'Cash & Bank Accounts',
  'Market Stocks & RSUs',
  'Retirement Funds',
  'Real Estate',
  'Vehicles',
  'Business Equity',
  'Precious Metals',
  'Jewelry & Watches',
  'Collectibles',
  'Insurance & Other'
];

const PIE_COLORS = [
  BRAND.colors.accentBlue,
  BRAND.colors.accentCyan,
  BRAND.colors.accentGreen,
  '#4E6FA8',
  '#5E93D1',
  '#2AA885',
  '#7FA7D9'
];
const ACCENT = BRAND.colors.accentBlue;
const PANEL_OPTIONS = [
  { key: 'allocation', label: 'Allocation', helper: 'View how assets are distributed' },
  { key: 'targets', label: 'Targets', helper: 'Track yearly target progress' },
  { key: 'performance', label: 'Trend', helper: 'See net worth over time' }
];

const targetSettingKey = (category) =>
  `yearly_target_${category.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '')}`;

const displayAmount = (value, hideSensitive, currency, fxRates) =>
  hideSensitive ? '••••••' : formatAmountFromInr(value, currency, fxRates);

const targetProgressColor = (pct) => {
  const clamped = Math.max(0, Math.min(100, Number(pct) || 0));
  const hue = (clamped / 100) * 120;
  return `hsl(${hue}, 72%, 42%)`;
};

function BrandSummaryIntro({ theme, isLight, t }) {
  return (
    <View
      style={[
        styles.summaryIntroCard,
        {
          backgroundColor: isLight ? theme.cardAlt : theme.backgroundElevated,
          borderColor: theme.border,
          shadowColor: BRAND.colors.bgDeep
        }
      ]}
    >
      <View style={styles.summaryIntroTopRow}>
        <View style={styles.summaryIntroAccent}>
          <Svg width="100%" height="100%" viewBox="0 0 100 12" preserveAspectRatio="none">
            <Defs>
              <LinearGradient id="worthioDashboardGradient" x1="0%" y1="0%" x2="100%" y2="0%">
                <Stop offset="0%" stopColor={BRAND.colors.accentBlue} />
                <Stop offset="45%" stopColor={BRAND.colors.accentCyan} />
                <Stop offset="100%" stopColor={BRAND.colors.accentGreen} />
              </LinearGradient>
            </Defs>
            <Rect x="0" y="0" width="100" height="12" rx="6" fill="url(#worthioDashboardGradient)" opacity="0.95" />
          </Svg>
        </View>
        <Text style={[styles.gradientBannerEyebrow, { color: theme.info }]}>{t('WORTHIO VIEW')}</Text>
      </View>
      <View style={styles.summaryIntroCopy}>
        <Text style={[styles.gradientBannerTitle, { color: theme.text }]}>{t('Track growth with a clear view of your full worth.')}</Text>
      </View>
    </View>
  );
}

export default function DashboardScreen({ hideSensitive = false, preferredCurrency = 'INR', fxRates = { INR: 1 } }) {
  const { theme } = useTheme();
  const { t } = useI18n();
  const isLight = theme.key === 'light';
  const [data, setData] = useState(null);
  const [settings, setSettings] = useState({});
  const [error, setError] = useState('');
  const [reportDate, setReportDate] = useState(new Date().toISOString().slice(0, 10));
  const [activePanel, setActivePanel] = useState('allocation');
  const [snapshotExpanded, setSnapshotExpanded] = useState(false);

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
      <SectionCard title={t('Net Worth Summary')} titleStyle={styles.sectionTitle}>
        <BrandSummaryIntro theme={theme} isLight={isLight} t={t} />
        <View style={styles.row}>
          <StatTile label={t('Total Assets')} value={displayAmount(data.totalAssets, hideSensitive, currency, fxRates)} positive />
          <StatTile label={t('Liabilities')} value={displayAmount(data.totalLiabilities, hideSensitive, currency, fxRates)} positive={false} />
        </View>
        <View style={styles.netWorthWrap}>
          <StatTile
            label={t('Net Worth')}
            value={displayAmount(data.netWorth, hideSensitive, currency, fxRates)}
            positive={data.netWorth >= 0}
          />
        </View>
        <Text style={[styles.muted, { color: theme.muted }]}>{t('Last updated: {date}', { date: formatDate(data.lastUpdated) })}</Text>

        <View
          style={[
            styles.snapshotBox,
            {
              borderColor: theme.border,
              backgroundColor: isLight ? theme.cardAlt : theme.backgroundElevated,
              shadowColor: BRAND.colors.bgDeep
            }
          ]}
        >
          <Pressable style={styles.snapshotHeader} onPress={() => setSnapshotExpanded((value) => !value)}>
            <View style={styles.snapshotHeaderTextWrap}>
              <Text style={[styles.snapshotTitle, { color: theme.text }]}>{t('Snapshot PDF Report')}</Text>
              <Text style={[styles.subtleInfo, { color: theme.muted }]}>{t('Download asset and liability snapshot for a selected date.')}</Text>
            </View>
            <Text style={[styles.snapshotChevron, { color: theme.accent }]}>{snapshotExpanded ? '▲' : '▼'}</Text>
          </Pressable>
          {snapshotExpanded ? (
            <View style={styles.snapshotContent}>
              <DateField value={reportDate} onChange={setReportDate} theme={theme} placeholder="YYYY-MM-DD" />
              <PillButton
                label={t('Download Snapshot PDF')}
                onPress={() => {
                  const token = getAuthToken();
                  if (!token) {
                    setError(t('Session expired. Please login again.'));
                    return;
                  }
                  const currency = String(preferredCurrency || 'INR').toUpperCase();
                  const fxRate = currency === 'INR' ? 1 : Number(fxRates?.[currency] || 0);
                  const url = buildApiUrl(
                    `/api/reports/snapshot/file?date=${encodeURIComponent(reportDate)}&token=${encodeURIComponent(token)}&currency=${encodeURIComponent(currency)}&fx_rate=${encodeURIComponent(fxRate || 1)}`
                  );
                  Linking.openURL(url).catch((e) => setError(e.message));
                }}
              />
            </View>
          ) : null}
        </View>
      </SectionCard>

      <SectionCard title={t('Portfolio Highlights')} titleStyle={styles.sectionTitle}>
        <View
          style={[
            styles.segmentedControl,
            {
              backgroundColor: isLight ? theme.cardAlt : theme.backgroundElevated,
              borderColor: theme.border
            }
          ]}
        >
          {PANEL_OPTIONS.map((panel) => {
            const active = activePanel === panel.key;
            return (
              <Pressable
                key={panel.key}
                style={[
                  styles.segment,
                  active ? styles.segmentActive : null
                ]}
                onPress={() => setActivePanel(panel.key)}
              >
                {active ? (
                  <View style={styles.segmentGradientFill} pointerEvents="none">
                    <Svg width="100%" height="100%" viewBox="0 0 100 44" preserveAspectRatio="none">
                      <Defs>
                        <LinearGradient id={`worthioSegmentGradient-${panel.key}`} x1="0%" y1="0%" x2="100%" y2="100%">
                          <Stop offset="0%" stopColor="#1B6FCC" />
                          <Stop offset="52%" stopColor="#24B2D6" />
                          <Stop offset="100%" stopColor="#16AA8A" />
                        </LinearGradient>
                      </Defs>
                      <Rect x="0" y="0" width="100" height="44" rx="14" fill={`url(#worthioSegmentGradient-${panel.key})`} />
                    </Svg>
                  </View>
                ) : null}
                <Text style={[styles.segmentText, { color: active ? '#FFFFFF' : theme.text }]} numberOfLines={1}>
                  {t(panel.label)}
                </Text>
              </Pressable>
            );
          })}
        </View>
        <Text style={[styles.segmentHelper, { color: theme.muted }]}>
          {t(PANEL_OPTIONS.find((panel) => panel.key === activePanel)?.helper || '')}
        </Text>

        {activePanel === 'allocation' ? (
          <View style={styles.chartWrap}>
            {sortedAllocation.map((item, idx) => (
              <View
                key={item.category}
                style={[
                  styles.chartRow,
                  {
                    borderColor: theme.border,
                    backgroundColor: isLight ? theme.card : theme.backgroundElevated,
                    shadowColor: BRAND.colors.bgDeep
                  }
                ]}
              >
                <View style={styles.chartLegendRow}>
                  <View style={[styles.legendDot, { backgroundColor: PIE_COLORS[idx % PIE_COLORS.length] }]} />
                  <Text style={[styles.allocLabel, { color: theme.text }]}>{t(item.category)}</Text>
                </View>
                <View style={styles.chartValueRow}>
                  <Text style={[styles.allocValue, { color: theme.text }]}>{displayAmount(item.currentValue, hideSensitive, currency, fxRates)}</Text>
                  <Text style={[styles.allocPct, { color: theme.text }]}>{formatPct(item.pctOfTotal)}</Text>
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
            <>
              <Text style={[styles.subtleInfo, { color: theme.muted }]}>
                {t('Created from month-end snapshots captured after each month closes.')}
              </Text>
              {performancePoints.map((point) => (
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
              ))}
            </>
          ) : (
            <Text style={[styles.subtleInfo, { color: theme.muted }]}>{t('No month-end snapshots available yet.')}</Text>
          )
        ) : null}

        {activePanel === 'targets' ? (
          targetProgressRows.length ? (
            targetProgressRows.map((row) => (
              <View key={row.category} style={[styles.targetRow, { borderBottomColor: theme.border }]}>
                <View style={styles.targetHeadRow}>
                  <Text style={[styles.targetLabel, { color: theme.text }]}>{t(row.category)}</Text>
                  <Text style={[styles.targetPct, { color: targetProgressColor(row.pctClamped) }]}>{formatPct(row.pct)}</Text>
                </View>
                <Text style={[styles.targetSub, { color: theme.muted }]}>
                  {displayAmount(row.current, hideSensitive, currency, fxRates)} of {displayAmount(row.target, hideSensitive, currency, fxRates)}
                </Text>
                <View style={[styles.progressTrack, { backgroundColor: theme.border }]}> 
                  <View
                    style={[
                      styles.progressFill,
                      {
                        width: `${row.pctClamped}%`,
                        backgroundColor: targetProgressColor(row.pctClamped)
                      }
                    ]}
                  />
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
  summaryIntroCard: {
    borderWidth: 1,
    borderRadius: 20,
    paddingHorizontal: 16,
    paddingVertical: 14,
    marginBottom: 8,
    shadowOpacity: 0.08,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 6 },
    elevation: 2
  },
  summaryIntroTopRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginBottom: 8
  },
  summaryIntroAccent: {
    width: 54,
    height: 8,
    borderRadius: 999,
    overflow: 'hidden'
  },
  summaryIntroCopy: {
    gap: 4
  },
  gradientBannerEyebrow: {
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 1.1,
  },
  gradientBannerTitle: {
    fontSize: 16,
    lineHeight: 22,
    fontWeight: '800'
  },
  summaryLead: {
    marginBottom: 16,
    fontSize: 14,
    lineHeight: 20,
    fontWeight: '600'
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: '900',
    letterSpacing: 0.2
  },
  row: {
    flexDirection: 'row',
    gap: 10
  },
  netWorthWrap: {
    marginTop: 10
  },
  segmentedControl: {
    flexDirection: 'row',
    gap: 8,
    marginBottom: 10,
    borderWidth: 1,
    borderRadius: 18,
    padding: 6
  },
  segment: {
    flex: 1,
    minHeight: 44,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
    paddingHorizontal: 8,
    position: 'relative'
  },
  segmentActive: {
    shadowOpacity: 0.12,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 4 },
    elevation: 2
  },
  segmentGradientFill: {
    ...StyleSheet.absoluteFillObject
  },
  segmentText: {
    fontWeight: '800',
    fontSize: 14,
    lineHeight: 18,
    letterSpacing: 0.1
  },
  segmentHelper: {
    marginBottom: 16,
    fontSize: 13,
    lineHeight: 18,
    fontWeight: '600'
  },
  chartWrap: {
    gap: 16
  },
  chartRow: {
    gap: 8,
    borderWidth: 1,
    borderRadius: 20,
    padding: 16,
    shadowOpacity: 0.08,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 6 },
    elevation: 2
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
    textAlign: 'right',
    fontWeight: '800'
  },
  allocPct: {
    width: 70,
    textAlign: 'right',
    fontWeight: '800'
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
    marginTop: 16,
    borderWidth: 1,
    borderRadius: 20,
    padding: 16,
    shadowOpacity: 0.08,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 6 },
    elevation: 2
  },
  snapshotHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 10
  },
  snapshotHeaderTextWrap: {
    flex: 1,
    gap: 4
  },
  snapshotContent: {
    marginTop: 10,
    gap: 8
  },
  snapshotTitle: {
    fontWeight: '800',
    fontSize: 15
  },
  snapshotChevron: {
    fontSize: 14,
    fontWeight: '900'
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
