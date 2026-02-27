import { useCallback, useEffect, useMemo, useState } from 'react';
import { View, Text, StyleSheet, ScrollView, Pressable } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { ArrowRight, Briefcase, PieChart as PieIcon, AlertTriangle, Plus, Upload } from 'lucide-react-native';
import Svg, { G, Path, Circle } from 'react-native-svg';
import { useRouter } from 'expo-router';
import { apiGet } from '../../lib/api';
import { useFocusEffect } from '@react-navigation/native';
import { Theme } from '../../constants/Theme';

const COLORS = ['#3d5a3e', '#5c7c6f', '#b8943e', '#7b5c5c', '#6a8fa0', '#9a7daa'];

function polarToCartesian(cx: number, cy: number, r: number, angle: number) {
  const rad = (angle * Math.PI) / 180;
  return {
    x: cx + r * Math.cos(rad),
    y: cy + r * Math.sin(rad),
  };
}

function describeArc(cx: number, cy: number, r: number, startAngle: number, endAngle: number) {
  const start = polarToCartesian(cx, cy, r, endAngle);
  const end = polarToCartesian(cx, cy, r, startAngle);
  const largeArcFlag = endAngle - startAngle <= 180 ? '0' : '1';
  return `M ${start.x} ${start.y} A ${r} ${r} 0 ${largeArcFlag} 0 ${end.x} ${end.y}`;
}

function DonutChart({
  data,
  size = 140,
  strokeWidth = 22,
}: {
  data: { value: number; color: string }[];
  size?: number;
  strokeWidth?: number;
}) {
  const total = data.reduce((sum, item) => sum + (item.value || 0), 0);
  if (!total) {
    return <Text style={styles.chartEmpty}>No data</Text>;
  }

  const radius = (size - strokeWidth) / 2;
  let startAngle = -90;

  return (
    <Svg width={size} height={size}>
      <G>
        {data.map((slice, index) => {
          const angle = (slice.value / total) * 360;
          const endAngle = startAngle + angle;
          const path = describeArc(size / 2, size / 2, radius, startAngle, endAngle);
          startAngle = endAngle;
          return (
            <Path
              key={`${index}-${slice.value}`}
              d={path}
              stroke={slice.color}
              strokeWidth={strokeWidth}
              fill="none"
              strokeLinecap="round"
            />
          );
        })}
      </G>
      <Circle cx={size / 2} cy={size / 2} r={radius - strokeWidth / 2} fill="rgba(255,255,255,0.4)" />
    </Svg>
  );
}

function formatCurrency(value: number) {
  return new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency: 'INR',
    maximumFractionDigits: 0,
  }).format(value || 0);
}

function formatPct(value: number) {
  return `${value >= 0 ? '+' : ''}${value.toFixed(2)}%`;
}

export default function DashboardScreen() {
  const router = useRouter();
  const [dashboard, setDashboard] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const loadData = async () => {
    try {
      setLoading(true);
      const dash = await apiGet<any>('/dashboard');
      setDashboard(dash);
    } catch (err: any) {
      setError(err.message || 'Unable to load portfolio');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  useFocusEffect(
    useCallback(() => {
      loadData();
    }, [])
  );

  const totals = dashboard?.totals || {};
  const topHoldings = dashboard?.top_holdings || [];
  const mfHoldings = dashboard?.mf_holdings || [];
  const sectorSplit = dashboard?.sector_split || [];
  const mcapSplit = dashboard?.mcap_split || [];
  const assetSplit = dashboard?.asset_split || [];
  const riskFlags = dashboard?.concentration_flags || [];

  const pnlColor = (totals.pnl || 0) >= 0 ? Theme.colors.positive : Theme.colors.negative;
  const todayColor = (totals.today_pnl || 0) >= 0 ? Theme.colors.positive : Theme.colors.negative;

  const sectorData = useMemo(
    () =>
      sectorSplit.map((item: any, index: number) => ({
        value: item.value,
        color: COLORS[index % COLORS.length],
      })),
    [sectorSplit]
  );

  const mcapData = useMemo(
    () =>
      mcapSplit.map((item: any, index: number) => ({
        value: item.value,
        color: COLORS[(index + 2) % COLORS.length],
      })),
    [mcapSplit]
  );

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <ScrollView contentContainerStyle={styles.scrollContent}>
        <View style={styles.header}>
          <View>
            <Text style={styles.greetingText}>Portfolio</Text>
            <Text style={styles.nameText}>Overview</Text>
          </View>
          <Pressable style={styles.refreshButton} onPress={loadData}>
            <Text style={styles.refreshText}>Refresh</Text>
          </Pressable>
        </View>

        {error ? <Text style={styles.errorText}>{error}</Text> : null}

        {/* Total value prominent */}
        <View style={styles.totalCard}>
          <Text style={styles.totalLabel}>Total value</Text>
          <Text style={styles.totalValue}>{formatCurrency(totals.total_value || 0)}</Text>
        </View>

        <View style={styles.summaryRow}>
          <View style={styles.summaryCard}>
            <Text style={styles.summaryLabel}>Invested</Text>
            <Text style={styles.summaryValue}>{formatCurrency(totals.invested || 0)}</Text>
          </View>
          <View style={styles.summaryCard}>
            <Text style={styles.summaryLabel}>P&L</Text>
            <Text style={[styles.summaryValue, { color: pnlColor }]}>{formatCurrency(totals.pnl || 0)}</Text>
            <Text style={[styles.summarySub, { color: pnlColor }]}>{formatPct(totals.pnl_pct || 0)}</Text>
          </View>
          <View style={styles.summaryCard}>
            <Text style={styles.summaryLabel}>Today</Text>
            <Text style={[styles.summaryValue, { color: todayColor }]}>{formatCurrency(totals.today_pnl || 0)}</Text>
          </View>
        </View>

        {/* Quick actions */}
        <View style={styles.actionsRow}>
          <Pressable style={styles.actionButton} onPress={() => router.push('/portfolio/add-holding')}>
            <Plus color={Theme.colors.white} size={16} />
            <Text style={styles.actionText}>Add Holding</Text>
          </Pressable>
          <Pressable style={styles.actionButton} onPress={() => router.push('/portfolio/connections')}>
            <Upload color={Theme.colors.white} size={16} />
            <Text style={styles.actionText}>Import from Zerodha</Text>
          </Pressable>
        </View>

        {/* Top holdings */}
        <View style={styles.sectionHeader}>
          <Text style={styles.sectionTitle}>Top holdings</Text>
          <Pressable style={styles.arrowCircle} onPress={() => router.push('/portfolio/holdings')}>
            <ArrowRight color={Theme.colors.textPrimary} size={16} />
          </Pressable>
        </View>

        {topHoldings.map((holding: any) => {
          const holdingPnlColor = (holding.pnl_pct || 0) >= 0 ? Theme.colors.positive : Theme.colors.negative;
          return (
            <Pressable
              key={holding.id || holding.isin}
              style={styles.holdingRow}
              onPress={() => {
                if (holding.scheme_code) {
                  router.push(`/instrument/mf/${holding.scheme_code}`);
                } else if (holding.symbol) {
                  router.push(`/instrument/${holding.symbol}?exchange=${holding.exchange || ''}`);
                }
              }}
            >
              <View style={{ flex: 1 }}>
                <Text style={styles.holdingSymbol}>
                  {holding.symbol || holding.scheme_name || holding.isin || 'Holding'}
                </Text>
                <Text style={styles.holdingMeta}>
                  {holding.qty} {holding.scheme_code ? 'units' : 'shares'}
                </Text>
              </View>
              <View style={{ alignItems: 'flex-end' }}>
                <Text style={styles.holdingValue}>{formatCurrency(holding.value || 0)}</Text>
                <Text style={[styles.holdingPnl, { color: holdingPnlColor }]}>
                  {formatPct(holding.pnl_pct || 0)}
                </Text>
              </View>
            </Pressable>
          );
        })}

        {/* Mutual funds */}
        {mfHoldings.length > 0 && (
          <>
            <View style={styles.sectionHeader}>
              <Text style={styles.sectionTitle}>Mutual funds</Text>
              <Pressable style={styles.arrowCircle} onPress={() => router.push('/portfolio/holdings')}>
                <ArrowRight color={Theme.colors.textPrimary} size={16} />
              </Pressable>
            </View>

            {mfHoldings.map((mf: any) => {
              const mfPnlColor = (mf.pnl_pct || 0) >= 0 ? Theme.colors.positive : Theme.colors.negative;
              return (
                <Pressable
                  key={mf.id || mf.isin}
                  style={styles.holdingRow}
                  onPress={() => {
                    if (mf.scheme_code) {
                      router.push(`/instrument/mf/${mf.scheme_code}`);
                    }
                  }}
                >
                  <View style={{ flex: 1 }}>
                    <Text style={styles.holdingSymbol} numberOfLines={1}>
                      {mf.scheme_name || mf.isin || 'Mutual Fund'}
                    </Text>
                    <Text style={styles.holdingMeta}>
                      {mf.qty} units · ₹{mf.current_price?.toFixed(2) ?? '—'} NAV
                    </Text>
                  </View>
                  <View style={{ alignItems: 'flex-end' }}>
                    <Text style={styles.holdingValue}>{formatCurrency(mf.value || 0)}</Text>
                    <Text style={[styles.holdingPnl, { color: mfPnlColor }]}>
                      {formatPct(mf.pnl_pct || 0)}
                    </Text>
                  </View>
                </Pressable>
              );
            })}
          </>
        )}

        {/* Asset split bar */}
        {assetSplit.length > 0 && (
          <>
            <View style={styles.sectionHeader}>
              <Text style={styles.sectionTitle}>Asset allocation</Text>
              <View style={styles.arrowCircle}>
                <Briefcase color={Theme.colors.textPrimary} size={16} />
              </View>
            </View>
            <View style={styles.assetBarContainer}>
              {assetSplit.map((asset: any, index: number) => (
                <View
                  key={asset.label || index}
                  style={[
                    styles.assetBarSegment,
                    {
                      flex: asset.pct || 1,
                      backgroundColor: COLORS[index % COLORS.length],
                    },
                  ]}
                />
              ))}
            </View>
            <View style={styles.assetLegend}>
              {assetSplit.map((asset: any, index: number) => (
                <View key={asset.label || index} style={styles.legendItem}>
                  <View style={[styles.legendDot, { backgroundColor: COLORS[index % COLORS.length] }]} />
                  <Text style={styles.legendLabel}>
                    {asset.label} {asset.pct?.toFixed(0)}%
                  </Text>
                </View>
              ))}
            </View>
          </>
        )}

        {/* Breakdown: sector + mcap side by side */}
        <View style={styles.sectionHeader}>
          <Text style={styles.sectionTitle}>Breakdown</Text>
          <View style={styles.arrowCircle}>
            <PieIcon color={Theme.colors.textPrimary} size={16} />
          </View>
        </View>

        <View style={styles.breakdownRow}>
          <View style={styles.breakdownCard}>
            <Text style={styles.chartTitle}>Sector</Text>
            {sectorData.length ? (
              <View style={styles.chartCenter}>
                <DonutChart data={sectorData} />
              </View>
            ) : (
              <Text style={styles.chartEmpty}>No data</Text>
            )}
            {sectorSplit.slice(0, 4).map((item: any, index: number) => (
              <View key={item.label} style={styles.legendItemRow}>
                <View style={[styles.legendDot, { backgroundColor: COLORS[index % COLORS.length] }]} />
                <Text style={styles.legendLabel} numberOfLines={1}>{item.label}</Text>
                <Text style={styles.legendPct}>{item.pct?.toFixed(0)}%</Text>
              </View>
            ))}
          </View>
          <View style={styles.breakdownCard}>
            <Text style={styles.chartTitle}>Market cap</Text>
            {mcapData.length ? (
              <View style={styles.chartCenter}>
                <DonutChart data={mcapData} />
              </View>
            ) : (
              <Text style={styles.chartEmpty}>No data</Text>
            )}
            {mcapSplit.slice(0, 4).map((item: any, index: number) => (
              <View key={item.label} style={styles.legendItemRow}>
                <View style={[styles.legendDot, { backgroundColor: COLORS[(index + 2) % COLORS.length] }]} />
                <Text style={styles.legendLabel} numberOfLines={1}>{item.label}</Text>
                <Text style={styles.legendPct}>{item.pct?.toFixed(0)}%</Text>
              </View>
            ))}
          </View>
        </View>

        {/* Concentration risk */}
        {riskFlags.length > 0 && (
          <>
            <View style={styles.sectionHeader}>
              <Text style={styles.sectionTitle}>Concentration risk</Text>
              <View style={styles.arrowCircle}>
                <AlertTriangle color={Theme.colors.textPrimary} size={16} />
              </View>
            </View>
            {riskFlags.map((flag: any) => (
              <View
                key={`${flag.type}-${flag.label}`}
                style={[styles.riskCard, flag.severity === 'red' ? styles.riskRed : styles.riskYellow]}
              >
                <Text style={styles.riskTitle}>{flag.label}</Text>
                <Text style={styles.riskMeta}>{flag.pct?.toFixed(1)}% exposure</Text>
                <Text style={styles.riskWhy}>{flag.why}</Text>
              </View>
            ))}
          </>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  scrollContent: {
    paddingHorizontal: 24,
    paddingTop: 20,
    paddingBottom: 40,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 24,
  },
  greetingText: {
    fontFamily: Theme.font.familyMedium,
    color: Theme.colors.textSecondary,
    fontSize: 22,
  },
  nameText: {
    fontFamily: Theme.font.familyBold,
    color: Theme.colors.textPrimary,
    fontSize: 28,
  },
  refreshButton: {
    backgroundColor: Theme.colors.cardBg,
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 20,
  },
  refreshText: {
    fontFamily: Theme.font.familyMedium,
    color: Theme.colors.textPrimary,
    fontSize: 12,
  },
  errorText: {
    fontFamily: Theme.font.family,
    color: Theme.colors.negative,
    marginBottom: 16,
  },
  totalCard: {
    backgroundColor: Theme.colors.cardBg,
    borderRadius: 24,
    padding: 24,
    alignItems: 'center',
    marginBottom: 16,
  },
  totalLabel: {
    fontFamily: Theme.font.familyMedium,
    color: Theme.colors.textMuted,
    fontSize: 13,
    marginBottom: 8,
  },
  totalValue: {
    fontFamily: Theme.font.familyBold,
    color: Theme.colors.textPrimary,
    fontSize: 32,
  },
  summaryRow: {
    flexDirection: 'row',
    gap: 10,
    marginBottom: 16,
  },
  summaryCard: {
    flex: 1,
    backgroundColor: Theme.colors.cardBg,
    borderRadius: 18,
    padding: 14,
  },
  summaryLabel: {
    fontFamily: Theme.font.familyMedium,
    color: Theme.colors.textMuted,
    fontSize: 11,
    marginBottom: 6,
  },
  summaryValue: {
    fontFamily: Theme.font.familyBold,
    color: Theme.colors.textPrimary,
    fontSize: 15,
  },
  summarySub: {
    fontFamily: Theme.font.family,
    color: Theme.colors.textSecondary,
    fontSize: 11,
    marginTop: 3,
  },
  actionsRow: {
    flexDirection: 'row',
    gap: 12,
    marginBottom: 20,
  },
  actionButton: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: Theme.colors.accent,
    borderRadius: 20,
    paddingVertical: 12,
  },
  actionText: {
    fontFamily: Theme.font.familyMedium,
    color: Theme.colors.white,
    fontSize: 13,
  },
  sectionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
    marginTop: 8,
  },
  sectionTitle: {
    fontFamily: Theme.font.familyBold,
    color: Theme.colors.textPrimary,
    fontSize: 18,
  },
  arrowCircle: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: Theme.colors.cardBg,
    justifyContent: 'center',
    alignItems: 'center',
  },
  holdingRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: Theme.colors.cardBg,
    borderRadius: 16,
    padding: 14,
    marginBottom: 10,
  },
  holdingSymbol: {
    fontFamily: Theme.font.familyMedium,
    color: Theme.colors.textPrimary,
    fontSize: 14,
  },
  holdingMeta: {
    fontFamily: Theme.font.family,
    color: Theme.colors.textMuted,
    fontSize: 12,
    marginTop: 4,
  },
  holdingValue: {
    fontFamily: Theme.font.familyBold,
    color: Theme.colors.textPrimary,
    fontSize: 14,
  },
  holdingPnl: {
    fontFamily: Theme.font.familyMedium,
    fontSize: 12,
    marginTop: 4,
  },
  assetBarContainer: {
    flexDirection: 'row',
    height: 12,
    borderRadius: 6,
    overflow: 'hidden',
    marginBottom: 8,
  },
  assetBarSegment: {
    height: 12,
  },
  assetLegend: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
    marginBottom: 16,
  },
  legendItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  legendDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  legendLabel: {
    fontFamily: Theme.font.family,
    color: Theme.colors.textSecondary,
    fontSize: 12,
    flexShrink: 1,
  },
  legendPct: {
    fontFamily: Theme.font.family,
    color: Theme.colors.textMuted,
    fontSize: 11,
    marginLeft: 'auto',
  },
  breakdownRow: {
    flexDirection: 'row',
    gap: 12,
  },
  breakdownCard: {
    flex: 1,
    backgroundColor: Theme.colors.cardBg,
    borderRadius: Theme.radius.card,
    padding: 14,
    marginBottom: 12,
  },
  chartCenter: {
    alignItems: 'center',
    marginBottom: 10,
  },
  chartTitle: {
    fontFamily: Theme.font.familyMedium,
    color: Theme.colors.textPrimary,
    fontSize: 13,
    marginBottom: 10,
  },
  chartEmpty: {
    fontFamily: Theme.font.family,
    color: Theme.colors.textMuted,
    fontSize: 12,
    textAlign: 'center',
    paddingVertical: 16,
  },
  legendItemRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginBottom: 4,
  },
  riskCard: {
    borderRadius: 18,
    padding: 14,
    marginBottom: 10,
  },
  riskYellow: {
    backgroundColor: 'rgba(184,148,62,0.12)',
    borderWidth: 1,
    borderColor: 'rgba(184,148,62,0.3)',
  },
  riskRed: {
    backgroundColor: 'rgba(196,72,62,0.1)',
    borderWidth: 1,
    borderColor: 'rgba(196,72,62,0.3)',
  },
  riskTitle: {
    fontFamily: Theme.font.familyMedium,
    color: Theme.colors.textPrimary,
    fontSize: 14,
    marginBottom: 4,
  },
  riskMeta: {
    fontFamily: Theme.font.family,
    color: Theme.colors.textMuted,
    fontSize: 12,
    marginBottom: 6,
  },
  riskWhy: {
    fontFamily: Theme.font.family,
    color: Theme.colors.textSecondary,
    fontSize: 12,
    lineHeight: 18,
  },
});
