import { useEffect, useState } from 'react';
import { ScrollView, StyleSheet, Text, TextInput, View, Pressable } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { apiGet, apiPost } from '../../lib/api';

export default function AddHoldingScreen() {
  const router = useRouter();
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<any[]>([]);
  const [selected, setSelected] = useState<any | null>(null);
  const [qty, setQty] = useState('');
  const [avgCost, setAvgCost] = useState('');
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!query) {
      setResults([]);
      return;
    }
    const timeout = setTimeout(async () => {
      try {
        const data = await apiGet<{ results: any[] }>(`/instruments/search?query=${encodeURIComponent(query)}`);
        setResults(data.results || []);
      } catch (err) {
        setResults([]);
      }
    }, 400);

    return () => clearTimeout(timeout);
  }, [query]);

  const handleSave = async () => {
    if (!selected || !qty) {
      setError('Please select a symbol and enter quantity.');
      return;
    }
    setError(null);
    const isMF = selected.type === 'MUTUAL_FUND';
    if (isMF) {
      await apiPost('/holdings', {
        scheme_code: selected.scheme_code,
        scheme_name: selected.name || selected.scheme_name,
        qty: parseFloat(qty),
        avg_cost: avgCost ? parseFloat(avgCost) : null,
        asset_type: 'mutual_fund',
      });
    } else {
      const rawSymbol = selected.yahoo_symbol || selected.symbol;
      let exchange = selected.exchange;
      let symbol = selected.symbol || rawSymbol;
      if (rawSymbol && rawSymbol.toUpperCase().endsWith('.NS')) {
        exchange = 'NSE';
        symbol = rawSymbol.slice(0, -3);
      }
      if (rawSymbol && rawSymbol.toUpperCase().endsWith('.BO')) {
        exchange = 'BSE';
        symbol = rawSymbol.slice(0, -3);
      }
      await apiPost('/holdings', {
        symbol,
        exchange,
        instrument_id: rawSymbol,
        qty: parseFloat(qty),
        avg_cost: avgCost ? parseFloat(avgCost) : null,
        asset_type: selected.type || selected.asset_type || selected.assetType || 'equity',
        sector: selected.sector,
        mcap_bucket: selected.mcap_bucket || selected.marketCap,
      });
    }
    router.back();
  };

  return (
    <SafeAreaView style={styles.container}>
      <ScrollView contentContainerStyle={styles.content}>
        <Text style={styles.title}>Add Holding</Text>
        <Text style={styles.subtitle}>Search NSE/BSE instruments.</Text>

        <TextInput
          style={styles.input}
          placeholder="Search ticker or MF scheme"
          placeholderTextColor="#777"
          value={query}
          onChangeText={(text) => {
            setQuery(text);
            setSelected(null);
          }}
        />

        {results.map((item, index) => {
          const isMF = item.type === 'MUTUAL_FUND';
          return (
            <Pressable key={`${item.yahoo_symbol || item.symbol || item.scheme_code || item.name}-${index}`} style={styles.resultRow} onPress={() => setSelected(item)}>
              <Text style={styles.resultTitle}>
                {isMF ? item.name : (item.symbol || item.yahoo_symbol || item.name)}
              </Text>
              <Text style={styles.resultMeta}>
                {isMF ? `MF · ${item.scheme_code || ''}` : (item.name || item.exchange || 'NSE/BSE')}
              </Text>
            </Pressable>
          );
        })}

        <View style={styles.card}>
          <Text style={styles.cardTitle}>Position details</Text>
          <TextInput
            style={styles.input}
            placeholder="Quantity"
            placeholderTextColor="#777"
            keyboardType="numeric"
            value={qty}
            onChangeText={setQty}
          />
          <TextInput
            style={styles.input}
            placeholder="Avg price (optional)"
            placeholderTextColor="#777"
            keyboardType="numeric"
            value={avgCost}
            onChangeText={setAvgCost}
          />
        </View>

        {error ? <Text style={styles.errorText}>{error}</Text> : null}

        <Pressable style={styles.primaryButton} onPress={handleSave}>
          <Text style={styles.primaryText}>Save holding</Text>
        </Pressable>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#1C211E',
  },
  content: {
    padding: 24,
    paddingBottom: 40,
  },
  title: {
    color: '#fff',
    fontSize: 24,
    fontWeight: '700',
  },
  subtitle: {
    color: '#a2b082',
    fontSize: 14,
    marginBottom: 20,
  },
  input: {
    backgroundColor: 'rgba(255,255,255,0.08)',
    borderRadius: 16,
    paddingHorizontal: 16,
    paddingVertical: 12,
    color: '#fff',
    marginBottom: 12,
  },
  resultRow: {
    backgroundColor: 'rgba(255,255,255,0.05)',
    borderRadius: 16,
    padding: 12,
    marginBottom: 8,
  },
  resultTitle: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '600',
  },
  resultMeta: {
    color: '#a2b082',
    fontSize: 12,
    marginTop: 4,
  },
  card: {
    backgroundColor: 'rgba(255,255,255,0.05)',
    borderRadius: 18,
    padding: 16,
    marginTop: 8,
    marginBottom: 16,
  },
  cardTitle: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '600',
    marginBottom: 12,
  },
  primaryButton: {
    backgroundColor: '#fff',
    paddingVertical: 16,
    borderRadius: 30,
    alignItems: 'center',
  },
  primaryText: {
    color: '#0a0d0b',
    fontSize: 16,
    fontWeight: '600',
  },
  errorText: {
    color: '#ff6b6b',
    marginBottom: 12,
  },
});
