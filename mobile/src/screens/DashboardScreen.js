import React, { useEffect, useState, useCallback } from 'react';
import { View, Text, StyleSheet, Linking, Pressable, Modal, ScrollView, Platform } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Svg, { Defs, LinearGradient, Rect, Stop } from 'react-native-svg';
import SectionCard from '../components/SectionCard';
import StatTile from '../components/StatTile';
import PillButton from '../components/PillButton';
import { api, buildApiUrl, getAuthToken, isGuestPreviewActive } from '../api/client';
import { formatDate, formatAmountFromInr, formatPct } from '../utils/format';
import { useTheme } from '../theme';
import { useI18n } from '../i18n';
import { BRAND } from '../brand';
import { bucketFromAssetCategory } from '../utils/categoryLabels';

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
const ASSETS_COLOR = BRAND.colors.positive;
const LIABILITIES_COLOR = BRAND.colors.negative;
const NET_WORTH_COLOR = BRAND.colors.accentCyan;
const PANEL_OPTIONS = [
  { key: 'allocation', label: 'Allocation', helper: 'View how assets are distributed' },
  { key: 'targets', label: 'Targets', helper: 'Track yearly target progress' },
  { key: 'performance', label: 'Trend', helper: 'See net worth over time' }
];

const targetSettingKey = (category) =>
  `yearly_target_${category.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '')}`;

const displayAmount = (value, hideSensitive, currency, fxRates) =>
  hideSensitive ? '••••••' : formatAmountFromInr(value, currency, fxRates);

const colorWithAlpha = (color = '#1B6FCC', alpha = '22') => {
  const hex = String(color || '').trim();
  if (/^#[0-9a-fA-F]{6}$/.test(hex)) return `${hex}${alpha}`;
  return hex;
};

const trendBarWidth = (value, maxValue) => {
  if (!maxValue || maxValue <= 0) return '0%';
  const pct = Math.max(0, Math.min(1, Number(value || 0) / maxValue));
  return `${Math.max(6, Math.round(pct * 100))}%`;
};

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
  const insets = useSafeAreaInsets();
  const isLight = theme.key === 'light';
  const bottomInset = Math.max(Number(insets?.bottom || 0), Platform.OS === 'android' ? 16 : 0);
  const [data, setData] = useState(null);
  const [settings, setSettings] = useState({});
  const [error, setError] = useState('');
  const [activePanel, setActivePanel] = useState('allocation');
  const [snapshotExpanded, setSnapshotExpanded] = useState(false);
  const [targetSortType, setTargetSortType] = useState('percent');
  const [targetSortDirection, setTargetSortDirection] = useState('desc');
  const [allocationDetail, setAllocationDetail] = useState(null);

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
    .sort((a, b) => {
      if (targetSortType === 'name') {
        return targetSortDirection === 'asc'
          ? String(a.category || '').localeCompare(String(b.category || ''))
          : String(b.category || '').localeCompare(String(a.category || ''));
      }
      return targetSortDirection === 'asc'
        ? Number(a.pct || 0) - Number(b.pct || 0)
        : Number(b.pct || 0) - Number(a.pct || 0);
    });

  const performancePoints = (Array.isArray(data.performance) ? data.performance : []).slice(-12).map((point) => ({
    label: point.label || point.snapshotMonth || point.quarterStart || '-',
    snapshotMonth: point.snapshotMonth || point.quarterStart || '',
    assets: Number(point.assets ?? point.totalAssets ?? 0),
    liabilities: Number(point.liabilities ?? point.totalLiabilities ?? 0),
    netWorth: Number(point.netWorth || 0)
  }));
  const performanceMaxY = performancePoints.reduce(
    (max, point) => Math.max(max, point.assets, point.liabilities, point.netWorth),
    0
  );
  const currency = preferredCurrency || settings?.preferred_currency || 'INR';
  const guestPreviewActive = isGuestPreviewActive();
  const snapshotReportDate = new Date().toISOString().slice(0, 10);
  const toggleTargetNameSort = () => {
    setTargetSortType('name');
    setTargetSortDirection((current) => (targetSortType === 'name' && current === 'asc' ? 'desc' : 'asc'));
  };
  const toggleTargetPercentSort = () => {
    setTargetSortType('percent');
    setTargetSortDirection((current) => (targetSortType === 'percent' && current === 'asc' ? 'desc' : 'asc'));
  };
  const closeAllocationDetail = () => setAllocationDetail(null);
  const openAllocationDetail = async (item, color) => {
    const bucket = String(item?.category || '');
    setError('');
    try {
      const rows = await api.getAssets();
      const assets = (Array.isArray(rows) ? rows : [])
        .filter((asset) => bucketFromAssetCategory(asset?.category || '') === bucket)
        .sort((a, b) => Number(b.current_value || 0) - Number(a.current_value || 0));
      setAllocationDetail({
        bucket,
        color,
        total: Number(item?.currentValue || 0),
        pct: Number(item?.pctOfTotal || 0),
        assets
      });
    } catch (e) {
      setError(e.message || String(e));
    }
  };

  return (
    <View>
      <SectionCard title={t('Net Worth Summary')} titleStyle={styles.sectionTitle}>
        <BrandSummaryIntro theme={theme} isLight={isLight} t={t} />
        <View style={styles.summaryMetricStack}>
          <StatTile
            label={t('Net Worth')}
            value={displayAmount(data.netWorth, hideSensitive, currency, fxRates)}
            positive={data.netWorth >= 0}
            valueStyle={styles.netWorthValue}
          />
          <View style={styles.row}>
            <StatTile label={t('Total Assets')} value={displayAmount(data.totalAssets, hideSensitive, currency, fxRates)} positive />
            <StatTile label={t('Liabilities')} value={displayAmount(data.totalLiabilities, hideSensitive, currency, fxRates)} positive={false} />
          </View>
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
              <Text style={[styles.subtleInfo, { color: theme.muted }]}>
                {t('This snapshot is as on {date}. Download your asset and liability summary PDF.', {
                  date: formatDate(snapshotReportDate)
                })}
              </Text>
            </View>
            <Text style={[styles.snapshotChevron, { color: theme.accent }]}>{snapshotExpanded ? '▲' : '▼'}</Text>
          </Pressable>
          {snapshotExpanded ? (
            <View style={styles.snapshotContent}>
              <PillButton
                label={t('Download Snapshot PDF')}
                onPress={() => {
                  if (guestPreviewActive) {
                    setError(t('Snapshot PDF download is available after signup.'));
                    return;
                  }
                  const token = getAuthToken();
                  if (!token) {
                    setError(t('Session expired. Please login again.'));
                    return;
                  }
                  const currency = String(preferredCurrency || 'INR').toUpperCase();
                  const fxRate = currency === 'INR' ? 1 : Number(fxRates?.[currency] || 0);
                  const url = buildApiUrl(
                    `/api/reports/snapshot/file?date=${encodeURIComponent(snapshotReportDate)}&token=${encodeURIComponent(token)}&currency=${encodeURIComponent(currency)}&fx_rate=${encodeURIComponent(fxRate || 1)}`
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
            {sortedAllocation.map((item, idx) => {
              const lineColor = PIE_COLORS[idx % PIE_COLORS.length];
              return (
                <Pressable
                  key={item.category}
                  style={[
                    styles.chartRow,
                    {
                      borderColor: theme.border,
                      backgroundColor: isLight ? theme.card : theme.backgroundElevated,
                      shadowColor: BRAND.colors.bgDeep
                    }
                  ]}
                  onPress={() => openAllocationDetail(item, lineColor)}
                >
                  <View style={styles.chartLegendRow}>
                    <View style={[styles.legendDot, { backgroundColor: lineColor }]} />
                    <Text style={[styles.allocLabel, { color: theme.text }]}>{t(item.category)}</Text>
                    <Text style={[styles.allocChevron, { color: theme.muted }]}>›</Text>
                  </View>
                  <View style={styles.chartValueRow}>
                    <Text style={[styles.allocValue, { color: theme.text }]}>{displayAmount(item.currentValue, hideSensitive, currency, fxRates)}</Text>
                    <Text style={[styles.allocPct, { color: theme.text }]}>{formatPct(item.pctOfTotal)}</Text>
                  </View>
                  <View style={[styles.progressTrack, { backgroundColor: theme.border }]}>
                    <View
                      style={[
                        styles.progressFill,
                        { width: `${Math.max(0, Math.min(100, item.pctOfTotal))}%`, backgroundColor: lineColor }
                      ]}
                    />
                  </View>
                </Pressable>
              );
            })}
          </View>
        ) : null}

        {activePanel === 'performance' ? (
          performancePoints.length ? (
            <>
              <Text style={[styles.subtleInfo, { color: theme.muted }]}>
                {t('Created from month-end snapshots captured after each month closes.')}
              </Text>
              <View style={styles.trendLegendRow}>
                <Text style={[styles.trendLegendItem, styles.trendAssetsText]}>{t('Assets')}</Text>
                <Text style={[styles.trendLegendItem, styles.trendLiabilitiesText]}>{t('Liabilities')}</Text>
                <Text style={[styles.trendLegendItem, styles.trendNetWorthText]}>{t('Net Worth')}</Text>
              </View>
              {performancePoints.map((point) => (
                <View
                  key={`${point.snapshotMonth || point.label}-${point.netWorth}`}
                  style={[
                    styles.trendSnapshotCard,
                    {
                      borderColor: theme.border,
                      backgroundColor: isLight ? theme.card : theme.backgroundElevated,
                      shadowColor: BRAND.colors.bgDeep
                    }
                  ]}
                >
                  <Text style={[styles.trendMonthLabel, { color: theme.text }]}>{String(point.label || '-')}</Text>
                  <View style={styles.trendMetricRow}>
                    <Text style={[styles.trendMetricLabel, styles.trendAssetsText]}>{t('Assets')}</Text>
                    <View style={[styles.trendTrack, { backgroundColor: theme.border }]}>
                      <View style={[styles.trendFill, styles.trendAssetsFill, { width: trendBarWidth(point.assets, performanceMaxY) }]} />
                    </View>
                    <Text style={[styles.trendMetricValue, { color: theme.muted }]}>
                      {displayAmount(point.assets, hideSensitive, currency, fxRates)}
                    </Text>
                  </View>
                  <View style={styles.trendMetricRow}>
                    <Text style={[styles.trendMetricLabel, styles.trendLiabilitiesText]}>{t('Liabilities')}</Text>
                    <View style={[styles.trendTrack, { backgroundColor: theme.border }]}>
                      <View style={[styles.trendFill, styles.trendLiabilitiesFill, { width: trendBarWidth(point.liabilities, performanceMaxY) }]} />
                    </View>
                    <Text style={[styles.trendMetricValue, { color: theme.muted }]}>
                      {displayAmount(point.liabilities, hideSensitive, currency, fxRates)}
                    </Text>
                  </View>
                  <View style={styles.trendMetricRow}>
                    <Text style={[styles.trendMetricLabel, styles.trendNetWorthText]}>{t('Net Worth')}</Text>
                    <View style={[styles.trendTrack, { backgroundColor: theme.border }]}>
                      <View style={[styles.trendFill, styles.trendNetWorthFill, { width: trendBarWidth(point.netWorth, performanceMaxY) }]} />
                    </View>
                    <Text style={[styles.trendMetricValue, { color: theme.muted }]}>
                      {displayAmount(point.netWorth, hideSensitive, currency, fxRates)}
                    </Text>
                  </View>
                </View>
              ))}
            </>
          ) : (
            <Text style={[styles.subtleInfo, { color: theme.muted }]}>{t('No month-end snapshots available yet.')}</Text>
          )
        ) : null}

        {activePanel === 'targets' ? (
          targetProgressRows.length ? (
            <>
              <View style={styles.sortActionsRow}>
                <Pressable
                  onPress={toggleTargetNameSort}
                  style={[
                    styles.sortIconButton,
                    { borderColor: theme.border, backgroundColor: theme.inputBg },
                    targetSortType === 'name' && {
                      borderColor: isLight ? theme.accent : '#155EAF',
                      backgroundColor: isLight ? theme.accent : '#155EAF'
                    }
                  ]}
                >
                  <Text style={[styles.sortIconGlyph, { color: targetSortType === 'name' ? '#FFFFFF' : theme.muted }]}>
                    {targetSortDirection === 'asc' && targetSortType === 'name' ? 'A→Z' : 'Z→A'}
                  </Text>
                </Pressable>
                <Pressable
                  onPress={toggleTargetPercentSort}
                  style={[
                    styles.sortIconButton,
                    { borderColor: theme.border, backgroundColor: theme.inputBg },
                    targetSortType === 'percent' && {
                      borderColor: isLight ? theme.accent : '#155EAF',
                      backgroundColor: isLight ? theme.accent : '#155EAF'
                    }
                  ]}
                >
                  <Text style={[styles.sortIconGlyph, { color: targetSortType === 'percent' ? '#FFFFFF' : theme.muted }]}>
                    {targetSortDirection === 'asc' && targetSortType === 'percent' ? '↑%' : '↓%'}
                  </Text>
                </Pressable>
              </View>
              {targetProgressRows.map((row) => (
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
              ))}
            </>
          ) : (
            <Text style={[styles.subtleInfo, { color: theme.muted }]}>{t('No yearly targets set yet. Add them in Settings.')}</Text>
          )
        ) : null}
      </SectionCard>

      {error ? <Text style={[styles.muted, { color: theme.danger }]}>{error}</Text> : null}
      <Modal visible={!!allocationDetail} transparent animationType="slide" onRequestClose={closeAllocationDetail}>
        <View style={styles.allocationModalRoot}>
          <Pressable style={styles.allocationModalBackdrop} onPress={closeAllocationDetail} />
          <View
            style={[
              styles.allocationSheet,
              {
                backgroundColor: theme.card,
                borderColor: theme.border,
                shadowColor: BRAND.colors.bgDeep,
                paddingBottom: 22 + bottomInset
              }
            ]}
          >
            <View style={styles.allocationSheetHandle} />
            <View style={styles.allocationSheetHeader}>
              <View style={styles.allocationSheetTitleWrap}>
                <View style={[styles.legendDot, { backgroundColor: allocationDetail?.color || ACCENT }]} />
                <Text style={[styles.allocationSheetTitle, { color: theme.text }]} numberOfLines={1}>
                  {t(allocationDetail?.bucket || '')}
                </Text>
              </View>
              <Pressable
                style={[
                  styles.allocationCloseButton,
                  { borderColor: theme.border, backgroundColor: isLight ? theme.cardAlt : theme.backgroundElevated }
                ]}
                onPress={closeAllocationDetail}
              >
                <Text style={[styles.allocationCloseText, { color: theme.text }]}>×</Text>
              </Pressable>
            </View>

            <View style={styles.allocationSummaryRow}>
              <View
                style={[
                  styles.allocationSummaryChip,
                  {
                    borderColor: allocationDetail?.color || ACCENT,
                    backgroundColor: colorWithAlpha(allocationDetail?.color, isLight ? '1A' : '2E')
                  }
                ]}
              >
                <Text style={[styles.allocationSummaryKey, { color: allocationDetail?.color || theme.accent }]}>{t('Total')}</Text>
                <Text style={[styles.allocationSummaryValue, { color: theme.text }]}>
                  {displayAmount(allocationDetail?.total || 0, hideSensitive, currency, fxRates)}
                </Text>
              </View>
              <View
                style={[
                  styles.allocationSummaryChip,
                  {
                    borderColor: allocationDetail?.color || ACCENT,
                    backgroundColor: colorWithAlpha(allocationDetail?.color, isLight ? '1A' : '2E')
                  }
                ]}
              >
                <Text style={[styles.allocationSummaryKey, { color: allocationDetail?.color || theme.accent }]}>{t('Allocation')}</Text>
                <Text style={[styles.allocationSummaryValue, { color: theme.text }]}>{formatPct(allocationDetail?.pct || 0)}</Text>
              </View>
            </View>

            <ScrollView
              style={styles.allocationAssetList}
              contentContainerStyle={[styles.allocationAssetListContent, { paddingBottom: 8 + bottomInset }]}
            >
              {(allocationDetail?.assets || []).length ? (
                allocationDetail.assets.map((asset) => (
                  <View
                    key={asset.id || `${asset.name}-${asset.account_ref}`}
                    style={[
                      styles.allocationAssetRow,
                      {
                        borderColor: theme.border,
                        backgroundColor: isLight ? theme.cardAlt : theme.backgroundElevated
                      }
                    ]}
                  >
                    <View style={styles.allocationAssetTop}>
                      <Text style={[styles.allocationAssetName, { color: theme.text }]} numberOfLines={1}>
                        {asset.institution || asset.name || t('Unnamed asset')}
                      </Text>
                      <Text style={[styles.allocationAssetValue, { color: theme.text }]}>
                        {displayAmount(asset.current_value || 0, hideSensitive, currency, fxRates)}
                      </Text>
                    </View>
                    <Text style={[styles.allocationAssetSub, { color: theme.muted }]} numberOfLines={1}>
                      {t(asset.category || allocationDetail.bucket)}
                    </Text>
                    <View style={styles.allocationAssetMeta}>
                      {asset.account_ref ? (
                        <Text style={[styles.allocationAssetMetaText, { color: theme.muted }]} numberOfLines={1}>
                          {t('Account Ref: {value}', { value: hideSensitive ? '••••' : asset.account_ref })}
                        </Text>
                      ) : null}
                      <Text style={[styles.allocationAssetMetaText, { color: theme.muted }]} numberOfLines={1}>
                        {t('Asset Type: {value}', { value: asset.sub_category ? t(asset.sub_category) : t('Not set') })}
                      </Text>
                    </View>
                  </View>
                ))
              ) : (
                <Text style={[styles.subtleInfo, { color: theme.muted }]}>{t('No assets in this bucket yet.')}</Text>
              )}
            </ScrollView>
          </View>
        </View>
      </Modal>
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
  summaryMetricStack: {
    gap: 10
  },
  netWorthValue: {
    fontSize: 22
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
  allocChevron: {
    fontSize: 26,
    lineHeight: 26,
    fontWeight: '600'
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
  trendLegendRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
    marginTop: 10,
    marginBottom: 12
  },
  trendLegendItem: {
    fontWeight: '900',
    fontSize: 12
  },
  trendSnapshotCard: {
    borderWidth: 1,
    borderRadius: 12,
    padding: 12,
    marginBottom: 12,
    shadowOpacity: 0.04,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 3 },
    elevation: 1
  },
  trendMonthLabel: {
    fontSize: 13,
    fontWeight: '900',
    marginBottom: 8
  },
  trendMetricRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginVertical: 5
  },
  trendMetricLabel: {
    width: 72,
    fontSize: 11,
    fontWeight: '900'
  },
  trendTrack: {
    flex: 1,
    height: 8,
    borderRadius: 999,
    overflow: 'hidden'
  },
  trendFill: {
    height: 8,
    borderRadius: 999
  },
  trendMetricValue: {
    width: 94,
    textAlign: 'right',
    fontSize: 11,
    fontWeight: '800'
  },
  trendAssetsText: {
    color: ASSETS_COLOR
  },
  trendLiabilitiesText: {
    color: LIABILITIES_COLOR
  },
  trendNetWorthText: {
    color: NET_WORTH_COLOR
  },
  trendAssetsFill: {
    backgroundColor: ASSETS_COLOR
  },
  trendLiabilitiesFill: {
    backgroundColor: LIABILITIES_COLOR
  },
  trendNetWorthFill: {
    backgroundColor: NET_WORTH_COLOR
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
  sortActionsRow: {
    flexDirection: 'row',
    gap: 8,
    marginBottom: 12
  },
  sortIconButton: {
    minWidth: 64,
    minHeight: 44,
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 16,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center'
  },
  sortIconGlyph: {
    fontSize: 15,
    lineHeight: 18,
    fontWeight: '900'
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
  allocationModalRoot: {
    flex: 1,
    justifyContent: 'flex-end'
  },
  allocationModalBackdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(3, 8, 18, 0.58)'
  },
  allocationSheet: {
    maxHeight: '82%',
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    borderWidth: 1,
    paddingHorizontal: 16,
    paddingTop: 10,
    paddingBottom: 22,
    shadowOpacity: 0.18,
    shadowRadius: 16,
    shadowOffset: { width: 0, height: -6 },
    elevation: 10
  },
  allocationSheetHandle: {
    alignSelf: 'center',
    width: 44,
    height: 4,
    borderRadius: 999,
    marginBottom: 14,
    backgroundColor: 'rgba(126, 142, 164, 0.5)'
  },
  allocationSheetHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
    marginBottom: 14
  },
  allocationSheetTitleWrap: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8
  },
  allocationSheetTitle: {
    flex: 1,
    fontSize: 18,
    lineHeight: 23,
    fontWeight: '900'
  },
  allocationCloseButton: {
    width: 36,
    height: 36,
    borderRadius: 18,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center'
  },
  allocationCloseText: {
    fontSize: 24,
    lineHeight: 26,
    fontWeight: '700'
  },
  allocationSummaryRow: {
    flexDirection: 'row',
    gap: 10,
    marginBottom: 14
  },
  allocationSummaryChip: {
    flex: 1,
    minHeight: 72,
    borderWidth: 1,
    borderRadius: 16,
    paddingHorizontal: 12,
    paddingVertical: 10,
    justifyContent: 'center'
  },
  allocationSummaryKey: {
    fontSize: 12,
    lineHeight: 16,
    fontWeight: '900',
    marginBottom: 4
  },
  allocationSummaryValue: {
    fontSize: 15,
    lineHeight: 20,
    fontWeight: '900'
  },
  allocationAssetList: {
    maxHeight: 390
  },
  allocationAssetListContent: {
    gap: 10,
    paddingBottom: 4
  },
  allocationAssetRow: {
    borderWidth: 1,
    borderRadius: 16,
    padding: 12,
    gap: 6
  },
  allocationAssetTop: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 10
  },
  allocationAssetName: {
    flex: 1,
    fontSize: 14,
    lineHeight: 19,
    fontWeight: '900'
  },
  allocationAssetValue: {
    fontSize: 13,
    lineHeight: 18,
    fontWeight: '900',
    textAlign: 'right'
  },
  allocationAssetSub: {
    fontSize: 12,
    lineHeight: 16,
    fontWeight: '700'
  },
  allocationAssetMeta: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    columnGap: 12,
    rowGap: 4
  },
  allocationAssetMetaText: {
    fontSize: 12,
    lineHeight: 16,
    fontWeight: '700'
  },
  muted: {
    marginTop: 8,
    fontWeight: '500'
  }
});
