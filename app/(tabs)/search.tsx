import { useEffect, useState } from 'react';
import { View, Text, StyleSheet, SafeAreaView, TextInput, ScrollView, Pressable, ActivityIndicator } from 'react-native';
import { Search as SearchIcon, TrendingUp, Building2 } from 'lucide-react-native';
import { useRouter } from 'expo-router';
import { apiGet } from '../../lib/api';

export default function SearchScreen() {
  const router = useRouter();
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<any[]>([]);
  const [news, setNews] = useState<any[]>([]);
  const [searching, setSearching] = useState(false);

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

  const handlePress = (item: any) => {
    if (item.type === 'MUTUAL_FUND' && item.scheme_code) {
      router.push(`/instrument/mf/${item.scheme_code}`);
    } else if (item.symbol) {
      router.push(`/instrument/${item.symbol}?exchange=${item.exchange || ''}`);
    }
  };

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.headerContainer}>
        <Text style={styles.title}>Search</Text>
        <Text style={styles.subtitle}>Find stocks and mutual funds</Text>
      </View>

      <View style={styles.searchBar}>
        <SearchIcon color="#888" size={18} />
        <TextInput
          style={styles.searchInput}
          placeholder="Search stocks, MF schemes..."
          placeholderTextColor="#666"
          value={query}
          onChangeText={setQuery}
          autoCorrect={false}
        />
      </View>

      <ScrollView contentContainerStyle={styles.scrollContent}>
        {searching && (
          <ActivityIndicator color="#a2b082" style={{ marginTop: 20 }} />
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
                {isMF ? <Building2 color="#d1b07c" size={14} /> : <TrendingUp color="#a2b082" size={14} />}
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
              <View key={`news-${index}`} style={styles.newsRow}>
                <Text style={styles.newsTitle} numberOfLines={2}>{item.title}</Text>
                <Text style={styles.newsMeta}>{item.publisher || ''}</Text>
              </View>
            ))}
          </View>
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
  headerContainer: {
    paddingHorizontal: 24,
    paddingTop: 16,
    paddingBottom: 8,
  },
  title: {
    color: '#fff',
    fontSize: 24,
    fontWeight: '700',
  },
  subtitle: {
    color: '#a2b082',
    fontSize: 14,
    marginTop: 4,
  },
  searchBar: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(255,255,255,0.08)',
    borderRadius: 20,
    marginHorizontal: 24,
    marginTop: 12,
    marginBottom: 8,
    paddingHorizontal: 16,
    gap: 10,
  },
  searchInput: {
    flex: 1,
    paddingVertical: 14,
    color: '#fff',
    fontSize: 15,
  },
  scrollContent: {
    paddingHorizontal: 24,
    paddingBottom: 40,
  },
  emptyText: {
    color: '#888',
    fontSize: 13,
    textAlign: 'center',
    marginTop: 40,
  },
  resultRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(255,255,255,0.05)',
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
    backgroundColor: 'rgba(162,176,130,0.15)',
  },
  mfBadge: {
    backgroundColor: 'rgba(209,176,124,0.15)',
  },
  resultInfo: {
    flex: 1,
  },
  resultName: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '600',
  },
  resultMeta: {
    color: '#888',
    fontSize: 12,
    marginTop: 3,
  },
  typeTag: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 10,
  },
  eqTag: {
    backgroundColor: 'rgba(162,176,130,0.2)',
  },
  mfTag: {
    backgroundColor: 'rgba(209,176,124,0.2)',
  },
  typeTagText: {
    fontSize: 11,
    fontWeight: '600',
  },
  eqTagText: {
    color: '#a2b082',
  },
  mfTagText: {
    color: '#d1b07c',
  },
  newsSection: {
    marginTop: 16,
    backgroundColor: 'rgba(255,255,255,0.05)',
    borderRadius: 18,
    padding: 16,
  },
  newsSectionTitle: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '600',
    marginBottom: 12,
  },
  newsRow: {
    marginBottom: 12,
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
});
