import { useEffect, useState } from 'react';
import { View, Text, StyleSheet, ScrollView, Pressable, Dimensions } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { ArrowLeft, TrendingUp, TrendingDown, Plus } from 'lucide-react-native';
import Svg, { Path, Line } from 'react-native-svg';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { apiGet, apiPost } from '../../lib/api';

const SCREEN_WIDTH = Dimensions.get('window').width;
const CHART_WIDTH = SCREEN_WIDTH - 80;
const CHART_HEIGHT = 160;

function MiniLineChart({ data }: { data: { date: string; close: number }[] }) {
  if (!data || data.length < 2) {
    return <Text style={styles.chartEmpty}>Not enough data for chart</Text>;
  }

  const closes = data.map((d) => d.close);
  const min = Math.min(...closes);
  const max = Math.max(...closes);
  const range = max - min || 1;

  const points = data.map((d, i) => ({
    x: (i / (data.length - 1)) * CHART_WIDTH,
    y: CHART_HEIGHT - ((d.close - min) / range) * (CHART_HEIGHT - 20) - 10,
  }));

  const pathD = points.map((p, i) => `${i === 0 ? 'M' : 'L'} ${p.x} ${p.y}`).join(' ');
  const isPositive = closes[closes.length - 1] >= closes[0];
  const strokeColor = isPositive ? '#a2b082' : '#ff6b6b';

  return (
    <Svg width={CHART_WIDTH} height={CHART_HEIGHT}>
      <Line x1={0} y1={CHART_HEIGHT} x2={CHART_WIDTH} y2={CHART_HEIGHT} stroke="rgba(255,255,255,0.1)" strokeWidth={1} />
      <Path d={pathD} stroke={strokeColor} strokeWidth={2} fill="none" />
    </Svg>
  );
}

function formatCurrency(value: number | null | undefined) {
  if (value == null) return '—';
  return new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency: 'INR',
    maximumFractionDigits: 2,
  }).format(value);
}

export default function EquityDetailScreen() {
  const router = useRouter();
  const { symbol, exchange } = useLocalSearchParams<{ symbol: string; exchange?: string }>();
  const [detail, setDetail] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!symbol) return;
    const load = async () => {
      try {
        setLoading(true);
        const params = exchange ? `?exchange=${exchange}` : '';
        const data = await apiGet<any>(`/instruments/${symbol}/detail${params}`);
        setDetail(data);
      } catch {
        setDetail(null);
      } finally {
        setLoading(false);
      }
    };
    load();
  }, [symbol, exchange]);

  const changeColor = detail?.change != null && detail.change >= 0 ? '#a2b082' : '#ff6b6b';
  const ChangeIcon = detail?.change != null && detail.change >= 0 ? TrendingUp : TrendingDown;

  const handleAddToPortfolio = () => {
    router.push('/portfolio/add-holding');
  };

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <Pressable style={styles.backButton} onPress={() => router.back()}>
          <ArrowLeft color="#000" size={20} />
        </Pressable>
        <Text style={styles.headerTitle}>{symbol || 'Equity'}</Text>
        <View style={{ width: 40 }} />
      </View>

      <ScrollView contentContainerStyle={styles.scrollContent}>
        {loading && <Text style={styles.loadingText}>Loading...</Text>}

        {detail && (
          <>
            {/* Name + Exchange */}
            <Text style={styles.name}>{detail.name || symbol}</Text>
            <Text style={styles.exchangeLabel}>{detail.exchange || ''} · {detail.sector || ''}</Text>

            {/* Price + Change */}
            <View style={styles.priceRow}>
              <Text style={styles.price}>{formatCurrency(detail.price)}</Text>
              {detail.change != null && (
                <View style={[styles.changeBadge, { backgroundColor: detail.change >= 0 ? 'rgba(162,176,130,0.2)' : 'rgba(255,107,107,0.2)' }]}>
                  <ChangeIcon color={changeColor} size={14} />
                  <Text style={[styles.changeText, { color: changeColor }]}>
                    {detail.change >= 0 ? '+' : ''}{detail.change?.toFixed(2)} ({detail.change_pct?.toFixed(2)}%)
                  </Text>
                </View>
              )}
            </View>

            {/* 30-day chart */}
            <View style={styles.chartCard}>
              <Text style={styles.chartLabel}>30-day price</Text>
              <MiniLineChart data={detail.price_history || []} />
            </View>

            {/* Key stats */}
            <View style={styles.statsGrid}>
              <View style={styles.statCard}>
                <Text style={styles.statLabel}>Prev. close</Text>
                <Text style={styles.statValue}>{formatCurrency(detail.previous_close)}</Text>
              </View>
              <View style={styles.statCard}>
                <Text style={styles.statLabel}>Day range</Text>
                <Text style={styles.statValue}>
                  {formatCurrency(detail.day_low)} – {formatCurrency(detail.day_high)}
                </Text>
              </View>
              <View style={styles.statCard}>
                <Text style={styles.statLabel}>52W range</Text>
                <Text style={styles.statValue}>
                  {formatCurrency(detail.fifty_two_week_low)} – {formatCurrency(detail.fifty_two_week_high)}
                </Text>
              </View>
              {detail.market_cap && (
                <View style={styles.statCard}>
                  <Text style={styles.statLabel}>Market cap</Text>
                  <Text style={styles.statValue}>{formatCurrency(detail.market_cap)}</Text>
                </View>
              )}
            </View>

            {/* News */}
            {detail.news && detail.news.length > 0 && (
              <View style={styles.newsSection}>
                <Text style={styles.sectionTitle}>Related news</Text>
                {detail.news.slice(0, 5).map((item: any, index: number) => (
                  <View key={`news-${index}`} style={styles.newsRow}>
                    <Text style={styles.newsTitle} numberOfLines={2}>{item.title}</Text>
                    <Text style={styles.newsMeta}>{item.publisher || ''}</Text>
                  </View>
                ))}
              </View>
            )}

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
  name: {
    color: '#fff',
    fontSize: 22,
    fontWeight: '700',
    marginTop: 8,
  },
  exchangeLabel: {
    color: '#888',
    fontSize: 13,
    marginTop: 4,
    marginBottom: 16,
  },
  priceRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    marginBottom: 20,
  },
  price: {
    color: '#fff',
    fontSize: 28,
    fontWeight: '700',
  },
  changeBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 12,
  },
  changeText: {
    fontSize: 13,
    fontWeight: '600',
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
  statsGrid: {
    gap: 10,
    marginBottom: 16,
  },
  statCard: {
    backgroundColor: 'rgba(255,255,255,0.05)',
    borderRadius: 16,
    padding: 14,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  statLabel: {
    color: '#888',
    fontSize: 13,
  },
  statValue: {
    color: '#fff',
    fontSize: 13,
    fontWeight: '600',
  },
  newsSection: {
    marginBottom: 16,
  },
  sectionTitle: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
    marginBottom: 12,
  },
  newsRow: {
    backgroundColor: 'rgba(255,255,255,0.05)',
    borderRadius: 14,
    padding: 12,
    marginBottom: 8,
  },
  newsTitle: {
    color: '#fff',
    fontSize: 13,
  },
  newsMeta: {
    color: '#888',
    fontSize: 11,
    marginTop: 4,
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
