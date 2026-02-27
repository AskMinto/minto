import { useCallback, useEffect, useState } from 'react';
import { ScrollView, StyleSheet, Text, View, Pressable } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { Plus, Upload } from 'lucide-react-native';
import { apiGet } from '../../lib/api';
import { useFocusEffect } from '@react-navigation/native';

function formatCurrency(value: number) {
  return new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency: 'INR',
    maximumFractionDigits: 0,
  }).format(value || 0);
}

export default function HoldingsScreen() {
  const router = useRouter();
  const [holdings, setHoldings] = useState<any[]>([]);

  const loadHoldings = async () => {
    const data = await apiGet<{ holdings: any[] }>('/holdings');
    setHoldings(data.holdings || []);
  };

  useEffect(() => {
    loadHoldings();
  }, []);

  useFocusEffect(
    useCallback(() => {
      loadHoldings();
    }, [])
  );

  return (
    <SafeAreaView style={styles.container}>
      <ScrollView contentContainerStyle={styles.content}>
        <View style={styles.header}>
          <Text style={styles.title}>Holdings</Text>
          <View style={styles.headerActions}>
            <Pressable style={styles.iconButton} onPress={() => router.push('/portfolio/add-holding')}>
              <Plus color="#0a0d0b" size={16} />
            </Pressable>
            <Pressable style={styles.iconButton} onPress={() => router.push('/portfolio/connections')}>
              <Upload color="#0a0d0b" size={16} />
            </Pressable>
          </View>
        </View>

        {holdings.map((holding) => (
          <View key={holding.id || holding.isin} style={styles.card}>
            <View>
              <Text style={styles.symbol}>{holding.symbol || holding.isin || 'Holding'}</Text>
              <Text style={styles.meta}>{holding.exchange || holding.asset_type || 'Portfolio'}</Text>
            </View>
            <View style={{ alignItems: 'flex-end' }}>
              <Text style={styles.value}>{formatCurrency(holding.value || 0)}</Text>
              <Text style={styles.pnl}>{holding.pnl_pct?.toFixed(2) || '0.00'}%</Text>
            </View>
          </View>
        ))}
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
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 20,
  },
  title: {
    color: '#fff',
    fontSize: 24,
    fontWeight: '700',
  },
  headerActions: {
    flexDirection: 'row',
    gap: 8,
  },
  iconButton: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: '#a2b082',
    justifyContent: 'center',
    alignItems: 'center',
  },
  card: {
    backgroundColor: 'rgba(255,255,255,0.05)',
    borderRadius: 18,
    padding: 16,
    marginBottom: 12,
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  symbol: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '600',
  },
  meta: {
    color: '#a2b082',
    fontSize: 12,
    marginTop: 4,
  },
  value: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '600',
  },
  pnl: {
    color: '#a2b082',
    fontSize: 12,
    marginTop: 4,
  },
});
