import { useCallback, useEffect, useState } from 'react';
import { SafeAreaView, ScrollView, StyleSheet, Text, View, Pressable, ActivityIndicator } from 'react-native';
import { ArrowLeft, RefreshCw } from 'lucide-react-native';
import * as WebBrowser from 'expo-web-browser';
import * as Linking from 'expo-linking';
import { useRouter } from 'expo-router';
import { apiGet, apiPost } from '../../lib/api';
import { useFocusEffect } from '@react-navigation/native';

export default function ConnectionsScreen() {
  const router = useRouter();
  const [zerodhaStatus, setZerodhaStatus] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [connecting, setConnecting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadStatus = async () => {
    try {
      setLoading(true);
      const data = await apiGet<any>('/zerodha/status');
      setZerodhaStatus(data);
    } catch {
      setZerodhaStatus(null);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadStatus();
  }, []);

  useFocusEffect(
    useCallback(() => {
      loadStatus();
    }, [])
  );

  const handleConnect = async () => {
    try {
      setConnecting(true);
      setError(null);

      const { url } = await apiGet<{ url: string }>('/zerodha/login-url');
      const redirectUrl = Linking.createURL('zerodha-callback');

      const result = await WebBrowser.openAuthSessionAsync(url, redirectUrl);

      if (result.type === 'success' && result.url) {
        const parsed = Linking.parse(result.url);
        const requestToken = parsed.queryParams?.request_token as string;

        if (!requestToken) {
          setError('No token received from Zerodha.');
          return;
        }

        await apiPost('/zerodha/callback', { request_token: requestToken });
        await loadStatus();
      }
    } catch (err: any) {
      setError(err.message || 'Failed to connect with Zerodha.');
    } finally {
      setConnecting(false);
    }
  };

  const formatDate = (dateStr: string | null) => {
    if (!dateStr) return '—';
    return new Date(dateStr).toLocaleDateString('en-IN', {
      day: 'numeric',
      month: 'short',
      year: 'numeric',
    });
  };

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <Pressable style={styles.backButton} onPress={() => router.back()}>
          <ArrowLeft color="#000" size={20} />
        </Pressable>
        <Text style={styles.headerTitle}>Connections</Text>
        <View style={{ width: 40 }} />
      </View>

      <ScrollView contentContainerStyle={styles.scrollContent}>
        <Text style={styles.sectionTitle}>Brokers</Text>

        {loading && <ActivityIndicator color="#a2b082" style={{ marginTop: 24 }} />}

        {!loading && (
          <View style={styles.card}>
            <View style={styles.cardHeader}>
              <View style={styles.brokerIcon}>
                <Text style={styles.brokerIconText}>Z</Text>
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.brokerName}>Zerodha</Text>
                <Text style={styles.brokerMeta}>
                  {zerodhaStatus?.connected ? 'Connected' : 'Not connected'}
                </Text>
              </View>
              <View
                style={[
                  styles.statusDot,
                  { backgroundColor: zerodhaStatus?.connected ? '#a2b082' : '#555' },
                ]}
              />
            </View>

            {zerodhaStatus?.connected && (
              <View style={styles.statsRow}>
                <View style={styles.statItem}>
                  <Text style={styles.statLabel}>Holdings</Text>
                  <Text style={styles.statValue}>{zerodhaStatus.holdings_count}</Text>
                </View>
                <View style={styles.statItem}>
                  <Text style={styles.statLabel}>Imported</Text>
                  <Text style={styles.statValue}>{formatDate(zerodhaStatus.imported_at)}</Text>
                </View>
              </View>
            )}

            {error && <Text style={styles.errorText}>{error}</Text>}

            <Pressable
              style={[styles.actionButton, connecting && styles.disabledButton]}
              onPress={handleConnect}
              disabled={connecting}
            >
              {connecting ? (
                <ActivityIndicator color="#0a0d0b" size="small" />
              ) : (
                <>
                  {zerodhaStatus?.connected && <RefreshCw color="#0a0d0b" size={14} />}
                  <Text style={styles.actionText}>
                    {zerodhaStatus?.connected ? 'Re-import' : 'Connect Zerodha'}
                  </Text>
                </>
              )}
            </Pressable>
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
  sectionTitle: {
    color: '#fff',
    fontSize: 20,
    fontWeight: '700',
    marginBottom: 16,
    marginTop: 8,
  },
  card: {
    backgroundColor: 'rgba(255,255,255,0.05)',
    borderRadius: 20,
    padding: 20,
  },
  cardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    marginBottom: 16,
  },
  brokerIcon: {
    width: 44,
    height: 44,
    borderRadius: 14,
    backgroundColor: 'rgba(229, 57, 53, 0.15)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  brokerIconText: {
    color: '#e53935',
    fontSize: 20,
    fontWeight: '800',
  },
  brokerName: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
  brokerMeta: {
    color: '#888',
    fontSize: 12,
    marginTop: 2,
  },
  statusDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
  },
  statsRow: {
    flexDirection: 'row',
    gap: 12,
    marginBottom: 16,
  },
  statItem: {
    flex: 1,
    backgroundColor: 'rgba(255,255,255,0.05)',
    borderRadius: 12,
    padding: 12,
  },
  statLabel: {
    color: '#888',
    fontSize: 11,
    marginBottom: 4,
  },
  statValue: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '600',
  },
  errorText: {
    color: '#ff6b6b',
    fontSize: 12,
    marginBottom: 12,
  },
  actionButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: '#a2b082',
    paddingVertical: 12,
    borderRadius: 20,
  },
  disabledButton: {
    opacity: 0.6,
  },
  actionText: {
    color: '#0a0d0b',
    fontSize: 14,
    fontWeight: '600',
  },
});
