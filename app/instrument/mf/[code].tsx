import { useEffect, useState } from 'react';
import { View, Text, StyleSheet, SafeAreaView, ScrollView, Pressable, Dimensions } from 'react-native';
import { ArrowLeft, Plus } from 'lucide-react-native';
import Svg, { Path, Line } from 'react-native-svg';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { apiGet } from '../../../lib/api';

const SCREEN_WIDTH = Dimensions.get('window').width;
const CHART_WIDTH = SCREEN_WIDTH - 80;
const CHART_HEIGHT = 160;

function NavLineChart({ data }: { data: { date: string; nav: number }[] }) {
  if (!data || data.length < 2) {
    return <Text style={styles.chartEmpty}>Not enough data for chart</Text>;
  }

  const navs = data.map((d) => d.nav);
  const min = Math.min(...navs);
  const max = Math.max(...navs);
  const range = max - min || 1;

  const points = data.map((d, i) => ({
    x: (i / (data.length - 1)) * CHART_WIDTH,
    y: CHART_HEIGHT - ((d.nav - min) / range) * (CHART_HEIGHT - 20) - 10,
  }));

  const pathD = points.map((p, i) => `${i === 0 ? 'M' : 'L'} ${p.x} ${p.y}`).join(' ');
  const isPositive = navs[navs.length - 1] >= navs[0];
  const strokeColor = isPositive ? '#a2b082' : '#ff6b6b';

  return (
    <Svg width={CHART_WIDTH} height={CHART_HEIGHT}>
      <Line x1={0} y1={CHART_HEIGHT} x2={CHART_WIDTH} y2={CHART_HEIGHT} stroke="rgba(255,255,255,0.1)" strokeWidth={1} />
      <Path d={pathD} stroke={strokeColor} strokeWidth={2} fill="none" />
    </Svg>
  );
}

export default function MFDetailScreen() {
  const router = useRouter();
  const { code } = useLocalSearchParams<{ code: string }>();
  const [detail, setDetail] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!code) return;
    const load = async () => {
      try {
        setLoading(true);
        const data = await apiGet<any>(`/mf/${code}/detail`);
        setDetail(data);
      } catch {
        setDetail(null);
      } finally {
        setLoading(false);
      }
    };
    load();
  }, [code]);

  const handleAddToPortfolio = () => {
    router.push('/portfolio/add-holding');
  };

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <Pressable style={styles.backButton} onPress={() => router.back()}>
          <ArrowLeft color="#000" size={20} />
        </Pressable>
        <Text style={styles.headerTitle}>Mutual Fund</Text>
        <View style={{ width: 40 }} />
      </View>

      <ScrollView contentContainerStyle={styles.scrollContent}>
        {loading && <Text style={styles.loadingText}>Loading...</Text>}

        {detail && (
          <>
            <Text style={styles.schemeName}>{detail.scheme_name || `Scheme ${code}`}</Text>
            <Text style={styles.fundHouse}>{detail.fund_house || ''}</Text>
            {detail.scheme_category && (
              <View style={styles.categoryBadge}>
                <Text style={styles.categoryText}>{detail.scheme_category}</Text>
              </View>
            )}

            {/* NAV */}
            <View style={styles.navCard}>
              <View>
                <Text style={styles.navLabel}>Current NAV</Text>
                <Text style={styles.navValue}>₹{detail.nav?.toFixed(4) ?? '—'}</Text>
              </View>
              {detail.nav_date && (
                <Text style={styles.navDate}>as of {detail.nav_date}</Text>
              )}
            </View>

            {/* NAV chart */}
            <View style={styles.chartCard}>
              <Text style={styles.chartLabel}>30-day NAV trend</Text>
              <NavLineChart data={detail.nav_history || []} />
            </View>

            {/* Returns */}
            {detail.returns && Object.keys(detail.returns).length > 0 && (
              <View style={styles.returnsCard}>
                <Text style={styles.returnsTitle}>Annualised returns</Text>
                <View style={styles.returnsRow}>
                  {Object.entries(detail.returns).map(([period, value]: [string, any]) => {
                    const isPositive = value >= 0;
                    return (
                      <View key={period} style={styles.returnItem}>
                        <Text style={styles.returnPeriod}>{period.toUpperCase()}</Text>
                        <Text style={[styles.returnValue, { color: isPositive ? '#a2b082' : '#ff6b6b' }]}>
                          {isPositive ? '+' : ''}{value.toFixed(2)}%
                        </Text>
                      </View>
                    );
                  })}
                </View>
              </View>
            )}

            {/* Fund info */}
            <View style={styles.infoGrid}>
              {detail.scheme_type && (
                <View style={styles.infoRow}>
                  <Text style={styles.infoLabel}>Scheme type</Text>
                  <Text style={styles.infoValue}>{detail.scheme_type}</Text>
                </View>
              )}
              {detail.fund_house && (
                <View style={styles.infoRow}>
                  <Text style={styles.infoLabel}>Fund house</Text>
                  <Text style={styles.infoValue}>{detail.fund_house}</Text>
                </View>
              )}
            </View>

            {/* Add to portfolio CTA */}
            <Pressable style={styles.ctaButton} onPress={handleAddToPortfolio}>
              <Plus color="#0a0d0b" size={18} />
              <Text style={styles.ctaText}>Add to portfolio</Text>
            </Pressable>
          </>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#1C211E',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingTop: 10,
    paddingBottom: 8,
  },
  backButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: '#fff',
    justifyContent: 'center',
    alignItems: 'center',
  },
  headerTitle: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
  scrollContent: {
    paddingHorizontal: 24,
    paddingBottom: 40,
  },
  loadingText: {
    color: '#a2b082',
    fontSize: 13,
    marginTop: 20,
  },
  schemeName: {
    color: '#fff',
    fontSize: 20,
    fontWeight: '700',
    marginTop: 8,
    lineHeight: 28,
  },
  fundHouse: {
    color: '#888',
    fontSize: 13,
    marginTop: 4,
  },
  categoryBadge: {
    alignSelf: 'flex-start',
    backgroundColor: 'rgba(209,176,124,0.2)',
    paddingHorizontal: 12,
    paddingVertical: 5,
    borderRadius: 10,
    marginTop: 10,
    marginBottom: 16,
  },
  categoryText: {
    color: '#d1b07c',
    fontSize: 12,
    fontWeight: '600',
  },
  navCard: {
    backgroundColor: 'rgba(255,255,255,0.08)',
    borderRadius: 20,
    padding: 20,
    marginBottom: 16,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-end',
  },
  navLabel: {
    color: '#a2b082',
    fontSize: 12,
    marginBottom: 6,
  },
  navValue: {
    color: '#fff',
    fontSize: 28,
    fontWeight: '700',
  },
  navDate: {
    color: '#888',
    fontSize: 11,
  },
  chartCard: {
    backgroundColor: 'rgba(255,255,255,0.05)',
    borderRadius: 20,
    padding: 16,
    marginBottom: 16,
    alignItems: 'center',
  },
  chartLabel: {
    color: '#888',
    fontSize: 12,
    alignSelf: 'flex-start',
    marginBottom: 12,
  },
  chartEmpty: {
    color: '#888',
    fontSize: 12,
    paddingVertical: 20,
  },
  returnsCard: {
    backgroundColor: 'rgba(255,255,255,0.05)',
    borderRadius: 20,
    padding: 16,
    marginBottom: 16,
  },
  returnsTitle: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '600',
    marginBottom: 12,
  },
  returnsRow: {
    flexDirection: 'row',
    justifyContent: 'space-around',
  },
  returnItem: {
    alignItems: 'center',
  },
  returnPeriod: {
    color: '#888',
    fontSize: 12,
    marginBottom: 4,
  },
  returnValue: {
    fontSize: 16,
    fontWeight: '700',
  },
  infoGrid: {
    gap: 10,
    marginBottom: 16,
  },
  infoRow: {
    backgroundColor: 'rgba(255,255,255,0.05)',
    borderRadius: 16,
    padding: 14,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  infoLabel: {
    color: '#888',
    fontSize: 13,
  },
  infoValue: {
    color: '#fff',
    fontSize: 13,
    fontWeight: '600',
    flexShrink: 1,
    textAlign: 'right',
    maxWidth: '60%',
  },
  ctaButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: '#a2b082',
    borderRadius: 28,
    paddingVertical: 16,
    marginTop: 8,
  },
  ctaText: {
    color: '#0a0d0b',
    fontSize: 16,
    fontWeight: '600',
  },
});
