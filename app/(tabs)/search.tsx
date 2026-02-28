import { useEffect, useState, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TextInput,
  ScrollView,
  Pressable,
  ActivityIndicator,
  Modal,
  Dimensions,
  Linking,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Search as SearchIcon, TrendingUp, TrendingDown, Building2, X, Newspaper } from 'lucide-react-native';
import Svg, { Path, Line } from 'react-native-svg';
import { apiGet } from '../../lib/api';
import { Theme } from '../../constants/Theme';

const SCREEN_WIDTH = Dimensions.get('window').width;
const MODAL_CHART_WIDTH = SCREEN_WIDTH - 96;
const MODAL_CHART_HEIGHT = 120;

/* ── Mini SVG line chart (equity prices) ────────────────────────── */
function MiniPriceChart({ data }: { data: { date: string; close: number }[] }) {
  if (!data || data.length < 2) {
    return <Text style={styles.chartEmpty}>Not enough data</Text>;
  }
  const closes = data.map((d) => d.close);
  const min = Math.min(...closes);
  const max = Math.max(...closes);
  const range = max - min || 1;
  const points = data.map((d, i) => ({
    x: (i / (data.length - 1)) * MODAL_CHART_WIDTH,
    y: MODAL_CHART_HEIGHT - ((d.close - min) / range) * (MODAL_CHART_HEIGHT - 16) - 8,
  }));
  const pathD = points.map((p, i) => `${i === 0 ? 'M' : 'L'} ${p.x} ${p.y}`).join(' ');
  const isPositive = closes[closes.length - 1] >= closes[0];
  const strokeColor = isPositive ? Theme.colors.positive : Theme.colors.negative;

  return (
    <Svg width={MODAL_CHART_WIDTH} height={MODAL_CHART_HEIGHT}>
      <Line x1={0} y1={MODAL_CHART_HEIGHT} x2={MODAL_CHART_WIDTH} y2={MODAL_CHART_HEIGHT} stroke="rgba(0,0,0,0.06)" strokeWidth={1} />
      <Path d={pathD} stroke={strokeColor} strokeWidth={2} fill="none" />
    </Svg>
  );
}

/* ── Mini SVG line chart (MF NAV) ───────────────────────────────── */
function MiniNavChart({ data }: { data: { date: string; nav: number }[] }) {
  if (!data || data.length < 2) {
    return <Text style={styles.chartEmpty}>Not enough data</Text>;
  }
  const navs = data.map((d) => d.nav);
  const min = Math.min(...navs);
  const max = Math.max(...navs);
  const range = max - min || 1;
  const points = data.map((d, i) => ({
    x: (i / (data.length - 1)) * MODAL_CHART_WIDTH,
    y: MODAL_CHART_HEIGHT - ((d.nav - min) / range) * (MODAL_CHART_HEIGHT - 16) - 8,
  }));
  const pathD = points.map((p, i) => `${i === 0 ? 'M' : 'L'} ${p.x} ${p.y}`).join(' ');
  const isPositive = navs[navs.length - 1] >= navs[0];
  const strokeColor = isPositive ? Theme.colors.positive : Theme.colors.negative;

  return (
    <Svg width={MODAL_CHART_WIDTH} height={MODAL_CHART_HEIGHT}>
      <Line x1={0} y1={MODAL_CHART_HEIGHT} x2={MODAL_CHART_WIDTH} y2={MODAL_CHART_HEIGHT} stroke="rgba(0,0,0,0.06)" strokeWidth={1} />
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

/* ── Detail modal ───────────────────────────────────────────────── */
function InstrumentModal({
  visible,
  item,
  searchNews,
  onClose,
}: {
  visible: boolean;
  item: any;
  searchNews: any[];
  onClose: () => void;
}) {
  const [detail, setDetail] = useState<any>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!visible || !item) {
      setDetail(null);
      return;
    }
    const load = async () => {
      try {
        setLoading(true);
        const isMF = item.type === 'MUTUAL_FUND';
        const data = isMF
          ? await apiGet<any>(`/mf/${item.scheme_code}/detail`)
          : await apiGet<any>(`/instruments/${item.symbol}/detail${item.exchange ? `?exchange=${item.exchange}` : ''}`);
        setDetail(data);
      } catch {
        setDetail(null);
      } finally {
        setLoading(false);
      }
    };
    load();
  }, [visible, item]);

  const isMF = item?.type === 'MUTUAL_FUND';
  const changeColor = detail?.change != null && detail.change >= 0 ? Theme.colors.positive : Theme.colors.negative;
  const ChangeIcon = detail?.change != null && detail.change >= 0 ? TrendingUp : TrendingDown;

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <Pressable style={styles.modalOverlay} onPress={onClose}>
        <Pressable style={styles.modalSheet} onPress={() => {}}>
          {/* Handle bar */}
          <View style={styles.modalHandle} />

          {/* Close button */}
          <Pressable style={styles.modalClose} onPress={onClose}>
            <X color={Theme.colors.textMuted} size={20} />
          </Pressable>

          <ScrollView showsVerticalScrollIndicator={false} style={styles.modalScroll} contentContainerStyle={styles.modalScrollContent}>
            {loading && <ActivityIndicator color={Theme.colors.accent} style={{ marginTop: 24 }} />}

            {!loading && detail && !isMF && (
              <>
                {/* ── Equity detail ── */}
                <Text style={styles.modalName}>{detail.name || item.symbol}</Text>
                <Text style={styles.modalMeta}>{detail.exchange || ''}{detail.sector ? ` · ${detail.sector}` : ''}</Text>

                <View style={styles.modalPriceRow}>
                  <Text style={styles.modalPrice}>{formatCurrency(detail.price)}</Text>
                  {detail.change != null && (
                    <View style={[styles.modalChangeBadge, { backgroundColor: detail.change >= 0 ? 'rgba(61,139,79,0.12)' : 'rgba(196,72,62,0.12)' }]}>
                      <ChangeIcon color={changeColor} size={12} />
                      <Text style={[styles.modalChangeText, { color: changeColor }]}>
                        {detail.change >= 0 ? '+' : ''}{detail.change?.toFixed(2)} ({detail.change_pct?.toFixed(2)}%)
                      </Text>
                    </View>
                  )}
                </View>

                {/* Chart */}
                <View style={styles.modalChartCard}>
                  <Text style={styles.modalChartLabel}>30-day price</Text>
                  <MiniPriceChart data={detail.price_history || []} />
                </View>

                {/* Key stats */}
                <View style={styles.modalStatsRow}>
                  <View style={styles.modalStatItem}>
                    <Text style={styles.modalStatLabel}>Day low</Text>
                    <Text style={styles.modalStatValue}>{formatCurrency(detail.day_low)}</Text>
                  </View>
                  <View style={styles.modalStatItem}>
                    <Text style={styles.modalStatLabel}>Day high</Text>
                    <Text style={styles.modalStatValue}>{formatCurrency(detail.day_high)}</Text>
                  </View>
                  <View style={styles.modalStatItem}>
                    <Text style={styles.modalStatLabel}>Prev. close</Text>
                    <Text style={styles.modalStatValue}>{formatCurrency(detail.previous_close)}</Text>
                  </View>
                </View>

              </>
            )}

            {!loading && detail && isMF && (
              <>
                {/* ── MF detail ── */}
                <Text style={styles.modalName}>{detail.scheme_name || `Scheme ${item.scheme_code}`}</Text>
                <Text style={styles.modalMeta}>{detail.fund_house || ''}</Text>
                {detail.scheme_category && (
                  <View style={styles.modalCategoryBadge}>
                    <Text style={styles.modalCategoryText}>{detail.scheme_category}</Text>
                  </View>
                )}

                <View style={styles.modalPriceRow}>
                  <View>
                    <Text style={styles.modalNavLabel}>NAV</Text>
                    <Text style={styles.modalPrice}>₹{detail.nav?.toFixed(4) ?? '—'}</Text>
                  </View>
                  {detail.nav_date && <Text style={styles.modalNavDate}>as of {detail.nav_date}</Text>}
                </View>

                {/* Chart */}
                <View style={styles.modalChartCard}>
                  <Text style={styles.modalChartLabel}>30-day NAV trend</Text>
                  <MiniNavChart data={detail.nav_history || []} />
                </View>

                {/* Returns */}
                {detail.returns && Object.keys(detail.returns).length > 0 && (
                  <View style={styles.modalReturnsRow}>
                    {Object.entries(detail.returns).map(([period, value]: [string, any]) => {
                      const isPos = value >= 0;
                      return (
                        <View key={period} style={styles.modalReturnItem}>
                          <Text style={styles.modalReturnPeriod}>{period.toUpperCase()}</Text>
                          <Text style={[styles.modalReturnValue, { color: isPos ? Theme.colors.positive : Theme.colors.negative }]}>
                            {isPos ? '+' : ''}{value.toFixed(2)}%
                          </Text>
                        </View>
                      );
                    })}
                  </View>
                )}

              </>
            )}

            {/* Search-level news — shown for both equity and MF */}
            {!loading && detail && searchNews.length > 0 && (
              <View style={styles.modalNewsSection}>
                <Text style={styles.modalNewsSectionTitle}>Related news</Text>
                {searchNews.slice(0, 5).map((n: any, i: number) => (
                  <Pressable
                    key={`mnews-${i}`}
                    style={styles.modalNewsRow}
                    onPress={() => n.link && Linking.openURL(n.link)}
                  >
                    <View style={styles.modalNewsContent}>
                      <Newspaper color={Theme.colors.textMuted} size={14} style={{ marginTop: 2 }} />
                      <View style={{ flex: 1 }}>
                        <Text style={styles.modalNewsTitle} numberOfLines={2}>{n.title}</Text>
                        <Text style={styles.modalNewsMeta}>{n.publisher || ''}</Text>
                      </View>
                    </View>
                  </Pressable>
                ))}
              </View>
            )}

            {!loading && !detail && (
              <Text style={styles.modalErrorText}>Unable to load details.</Text>
            )}
          </ScrollView>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

/* ── Search screen ──────────────────────────────────────────────── */
export default function SearchScreen() {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<any[]>([]);
  const [news, setNews] = useState<any[]>([]);
  const [searching, setSearching] = useState(false);

  const [modalVisible, setModalVisible] = useState(false);
  const [selectedItem, setSelectedItem] = useState<any>(null);

  useEffect(() => {
    if (!query.trim()) {
      setResults([]);
      setNews([]);
      return;
    }
    const timeout = setTimeout(async () => {
      try {
        setSearching(true);
        const data = await apiGet<any>(`/instruments/search?query=${encodeURIComponent(query)}`);
        setResults(data.results || []);
        setNews(data.news || []);
      } catch {
        setResults([]);
        setNews([]);
      } finally {
        setSearching(false);
      }
    }, 400);

    return () => clearTimeout(timeout);
  }, [query]);

  const handlePress = useCallback((item: any) => {
    setSelectedItem(item);
    setModalVisible(true);
  }, []);

  const handleCloseModal = useCallback(() => {
    setModalVisible(false);
    setSelectedItem(null);
  }, []);

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <View style={styles.headerContainer}>
        <Text style={styles.title}>Search</Text>
        <Text style={styles.subtitle}>Find stocks and mutual funds</Text>
      </View>

      <View style={styles.searchBar}>
        <SearchIcon color={Theme.colors.textMuted} size={18} />
        <TextInput
          style={styles.searchInput}
          placeholder="Search stocks, MF schemes..."
          placeholderTextColor={Theme.colors.textMuted}
          value={query}
          onChangeText={setQuery}
          autoCorrect={false}
        />
      </View>

      <ScrollView contentContainerStyle={styles.scrollContent}>
        {searching && (
          <ActivityIndicator color={Theme.colors.accent} style={{ marginTop: 20 }} />
        )}

        {!searching && query.trim() && results.length === 0 && (
          <Text style={styles.emptyText}>No results found.</Text>
        )}

        {results.map((item, index) => {
          const isMF = item.type === 'MUTUAL_FUND';
          return (
            <Pressable
              key={`${item.symbol || item.scheme_code}-${index}`}
              style={styles.resultRow}
              onPress={() => handlePress(item)}
            >
              <View style={[styles.typeBadge, isMF ? styles.mfBadge : styles.eqBadge]}>
                {isMF ? <Building2 color={Theme.colors.goldAccent} size={14} /> : <TrendingUp color={Theme.colors.accent} size={14} />}
              </View>
              <View style={styles.resultInfo}>
                <Text style={styles.resultName} numberOfLines={1}>
                  {item.name || item.symbol || item.scheme_name || '—'}
                </Text>
                <Text style={styles.resultMeta}>
                  {isMF ? `MF · ${item.scheme_code || ''}` : `${item.exchange || ''} · ${item.symbol || ''}`}
                </Text>
              </View>
              <View style={[styles.typeTag, isMF ? styles.mfTag : styles.eqTag]}>
                <Text style={[styles.typeTagText, isMF ? styles.mfTagText : styles.eqTagText]}>
                  {isMF ? 'MF' : 'Equity'}
                </Text>
              </View>
            </Pressable>
          );
        })}

        {news.length > 0 && (
          <View style={styles.newsSection}>
            <Text style={styles.newsSectionTitle}>Related news</Text>
            {news.slice(0, 5).map((item, index) => (
              <Pressable
                key={`news-${index}`}
                style={styles.newsRow}
                onPress={() => item.link && Linking.openURL(item.link)}
              >
                <Text style={styles.newsTitle} numberOfLines={2}>{item.title}</Text>
                <Text style={styles.newsMeta}>{item.publisher || ''}</Text>
              </Pressable>
            ))}
          </View>
        )}
      </ScrollView>

      <InstrumentModal
        visible={modalVisible}
        item={selectedItem}
        searchNews={news}
        onClose={handleCloseModal}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  headerContainer: {
    paddingHorizontal: 24,
    paddingTop: 16,
    paddingBottom: 8,
  },
  title: {
    fontFamily: Theme.font.familyBold,
    color: Theme.colors.textPrimary,
    fontSize: 24,
  },
  subtitle: {
    fontFamily: Theme.font.family,
    color: Theme.colors.textMuted,
    fontSize: 14,
    marginTop: 4,
  },
  searchBar: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Theme.colors.inputBg,
    borderRadius: Theme.radius.input,
    marginHorizontal: 24,
    marginTop: 12,
    marginBottom: 8,
    paddingHorizontal: 16,
    gap: 10,
  },
  searchInput: {
    flex: 1,
    paddingVertical: 14,
    fontFamily: Theme.font.family,
    color: Theme.colors.textPrimary,
    fontSize: 15,
  },
  scrollContent: {
    paddingHorizontal: 24,
    paddingBottom: 40,
  },
  emptyText: {
    fontFamily: Theme.font.family,
    color: Theme.colors.textMuted,
    fontSize: 13,
    textAlign: 'center',
    marginTop: 40,
  },
  resultRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Theme.colors.cardBg,
    borderRadius: 16,
    padding: 14,
    marginBottom: 10,
    gap: 12,
  },
  typeBadge: {
    width: 36,
    height: 36,
    borderRadius: 12,
    justifyContent: 'center',
    alignItems: 'center',
  },
  eqBadge: {
    backgroundColor: 'rgba(61,90,62,0.1)',
  },
  mfBadge: {
    backgroundColor: 'rgba(184,148,62,0.1)',
  },
  resultInfo: {
    flex: 1,
  },
  resultName: {
    fontFamily: Theme.font.familyMedium,
    color: Theme.colors.textPrimary,
    fontSize: 14,
  },
  resultMeta: {
    fontFamily: Theme.font.family,
    color: Theme.colors.textMuted,
    fontSize: 12,
    marginTop: 3,
  },
  typeTag: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 10,
  },
  eqTag: {
    backgroundColor: 'rgba(61,90,62,0.12)',
  },
  mfTag: {
    backgroundColor: 'rgba(184,148,62,0.12)',
  },
  typeTagText: {
    fontFamily: Theme.font.familyMedium,
    fontSize: 11,
  },
  eqTagText: {
    color: Theme.colors.accent,
  },
  mfTagText: {
    color: Theme.colors.goldAccent,
  },
  newsSection: {
    marginTop: 16,
    backgroundColor: Theme.colors.cardBg,
    borderRadius: 18,
    padding: 16,
    marginBottom: 100,
  },
  newsSectionTitle: {
    fontFamily: Theme.font.familyBold,
    color: Theme.colors.textPrimary,
    fontSize: 14,
    marginBottom: 12,
  },
  newsRow: {
    marginBottom: 12,
  },
  newsTitle: {
    fontFamily: Theme.font.family,
    color: Theme.colors.textPrimary,
    fontSize: 13,
  },
  newsMeta: {
    fontFamily: Theme.font.family,
    color: Theme.colors.textMuted,
    fontSize: 11,
    marginTop: 4,
  },

  /* ── Modal styles ─────────────────────────────────────────────── */
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.35)',
    justifyContent: 'flex-end',
  },
  modalSheet: {
    backgroundColor: '#f2f5ef',
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    maxHeight: '85%',
    paddingBottom: 32,
  },
  modalHandle: {
    width: 40,
    height: 4,
    borderRadius: 2,
    backgroundColor: 'rgba(0,0,0,0.12)',
    alignSelf: 'center',
    marginTop: 10,
    marginBottom: 8,
  },
  modalClose: {
    position: 'absolute',
    top: 14,
    right: 18,
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: 'rgba(0,0,0,0.05)',
    justifyContent: 'center',
    alignItems: 'center',
    zIndex: 10,
  },
  modalScroll: {
    flexGrow: 0,
  },
  modalScrollContent: {
    paddingHorizontal: 24,
    paddingTop: 8,
    paddingBottom: 16,
  },
  modalName: {
    fontFamily: Theme.font.familyBold,
    color: Theme.colors.textPrimary,
    fontSize: 18,
    marginTop: 4,
    paddingRight: 36,
  },
  modalMeta: {
    fontFamily: Theme.font.family,
    color: Theme.colors.textMuted,
    fontSize: 12,
    marginTop: 4,
  },
  modalPriceRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginTop: 14,
    marginBottom: 16,
  },
  modalPrice: {
    fontFamily: Theme.font.familyBold,
    color: Theme.colors.textPrimary,
    fontSize: 24,
  },
  modalChangeBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 10,
  },
  modalChangeText: {
    fontFamily: Theme.font.familyMedium,
    fontSize: 12,
  },
  modalChartCard: {
    backgroundColor: Theme.colors.cardBg,
    borderRadius: 16,
    padding: 14,
    marginBottom: 14,
    alignItems: 'center',
  },
  modalChartLabel: {
    fontFamily: Theme.font.family,
    color: Theme.colors.textMuted,
    fontSize: 11,
    alignSelf: 'flex-start',
    marginBottom: 10,
  },
  chartEmpty: {
    fontFamily: Theme.font.family,
    color: Theme.colors.textMuted,
    fontSize: 11,
    paddingVertical: 16,
  },
  modalStatsRow: {
    flexDirection: 'row',
    gap: 8,
    marginBottom: 14,
  },
  modalStatItem: {
    flex: 1,
    backgroundColor: Theme.colors.cardBg,
    borderRadius: 12,
    padding: 10,
    alignItems: 'center',
  },
  modalStatLabel: {
    fontFamily: Theme.font.family,
    color: Theme.colors.textMuted,
    fontSize: 10,
    marginBottom: 4,
  },
  modalStatValue: {
    fontFamily: Theme.font.familyMedium,
    color: Theme.colors.textPrimary,
    fontSize: 12,
  },
  modalNewsSection: {
    marginTop: 2,
  },
  modalNewsSectionTitle: {
    fontFamily: Theme.font.familyMedium,
    color: Theme.colors.textPrimary,
    fontSize: 13,
    marginBottom: 8,
  },
  modalNewsRow: {
    backgroundColor: Theme.colors.cardBg,
    borderRadius: 12,
    padding: 10,
    marginBottom: 6,
  },
  modalNewsContent: {
    flexDirection: 'row',
    gap: 10,
    alignItems: 'flex-start',
  },
  modalNewsTitle: {
    fontFamily: Theme.font.family,
    color: Theme.colors.textPrimary,
    fontSize: 12,
  },
  modalNewsMeta: {
    fontFamily: Theme.font.family,
    color: Theme.colors.textMuted,
    fontSize: 10,
    marginTop: 3,
  },
  modalCategoryBadge: {
    alignSelf: 'flex-start',
    backgroundColor: 'rgba(184,148,62,0.12)',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 8,
    marginTop: 8,
  },
  modalCategoryText: {
    fontFamily: Theme.font.familyMedium,
    color: Theme.colors.goldAccent,
    fontSize: 11,
  },
  modalNavLabel: {
    fontFamily: Theme.font.familyMedium,
    color: Theme.colors.textMuted,
    fontSize: 11,
    marginBottom: 4,
  },
  modalNavDate: {
    fontFamily: Theme.font.family,
    color: Theme.colors.textMuted,
    fontSize: 10,
    alignSelf: 'flex-end',
  },
  modalReturnsRow: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    backgroundColor: Theme.colors.cardBg,
    borderRadius: 14,
    padding: 14,
    marginBottom: 14,
  },
  modalReturnItem: {
    alignItems: 'center',
  },
  modalReturnPeriod: {
    fontFamily: Theme.font.family,
    color: Theme.colors.textMuted,
    fontSize: 10,
    marginBottom: 4,
  },
  modalReturnValue: {
    fontFamily: Theme.font.familyBold,
    fontSize: 14,
  },
  modalErrorText: {
    fontFamily: Theme.font.family,
    color: Theme.colors.textMuted,
    fontSize: 13,
    textAlign: 'center',
    marginTop: 32,
  },
});
