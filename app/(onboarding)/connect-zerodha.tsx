import { useState } from 'react';
import { SafeAreaView, StyleSheet, Text, View, Pressable, ActivityIndicator } from 'react-native';
import * as WebBrowser from 'expo-web-browser';
import * as Linking from 'expo-linking';
import { useOnboarding } from '../../lib/onboarding';
import { apiGet, apiPost } from '../../lib/api';

export default function ConnectZerodhaScreen() {
  const { recheckOnboarding } = useOnboarding();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [importedCount, setImportedCount] = useState<number | null>(null);

  const handleConnect = async () => {
    try {
      setLoading(true);
      setError(null);

      const redirectUrl = Linking.createURL('zerodha-callback');
      const { url } = await apiGet<{ url: string }>(
        `/zerodha/login-url?app_redirect=${encodeURIComponent(redirectUrl)}`
      );

      const result = await WebBrowser.openAuthSessionAsync(url, redirectUrl);

      if (result.type === 'success' && result.url) {
        const parsed = Linking.parse(result.url);
        const requestToken = parsed.queryParams?.request_token as string;

        if (!requestToken) {
          setError('No token received from Zerodha.');
          return;
        }

        const data = await apiPost<{ count: number }>('/zerodha/callback', {
          request_token: requestToken,
        });

        setImportedCount(data.count);
      }
    } catch (err: any) {
      setError(err.message || 'Failed to connect with Zerodha.');
    } finally {
      setLoading(false);
    }
  };

  const handleContinue = async () => {
    await recheckOnboarding();
  };

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.content}>
        <View style={styles.topSection}>
          <View style={styles.iconContainer}>
            <Text style={styles.iconText}>Z</Text>
          </View>
          <Text style={styles.title}>Import your portfolio</Text>
          <Text style={styles.subtitle}>
            Connect your Zerodha account to automatically import your holdings. This is a one-time import.
          </Text>
        </View>

        {error && <Text style={styles.errorText}>{error}</Text>}

        {importedCount !== null && (
          <View style={styles.successCard}>
            <Text style={styles.successTitle}>Portfolio imported</Text>
            <Text style={styles.successCount}>{importedCount} holdings</Text>
            <Text style={styles.successSubtext}>imported from Zerodha</Text>
          </View>
        )}

        <View style={styles.bottomSection}>
          {importedCount === null ? (
            <>
              <Pressable
                style={[styles.primaryButton, loading && styles.disabledButton]}
                onPress={handleConnect}
                disabled={loading}
              >
                {loading ? (
                  <ActivityIndicator color="#0a0d0b" />
                ) : (
                  <Text style={styles.primaryText}>Connect Zerodha</Text>
                )}
              </Pressable>

              <Pressable style={styles.skipButton} onPress={handleContinue}>
                <Text style={styles.skipText}>Skip for now</Text>
              </Pressable>
            </>
          ) : (
            <Pressable style={styles.primaryButton} onPress={handleContinue}>
              <Text style={styles.primaryText}>Continue</Text>
            </Pressable>
          )}
        </View>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#1C211E',
  },
  content: {
    flex: 1,
    padding: 24,
    justifyContent: 'space-between',
  },
  topSection: {
    alignItems: 'center',
    paddingTop: 60,
  },
  iconContainer: {
    width: 72,
    height: 72,
    borderRadius: 20,
    backgroundColor: 'rgba(229, 57, 53, 0.15)',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 24,
  },
  iconText: {
    color: '#e53935',
    fontSize: 32,
    fontWeight: '800',
  },
  title: {
    color: '#fff',
    fontSize: 28,
    fontWeight: '700',
    marginBottom: 12,
    textAlign: 'center',
  },
  subtitle: {
    color: '#a2b082',
    fontSize: 15,
    textAlign: 'center',
    lineHeight: 22,
    paddingHorizontal: 12,
  },
  errorText: {
    color: '#ff6b6b',
    textAlign: 'center',
    marginTop: 16,
  },
  successCard: {
    backgroundColor: 'rgba(162,176,130,0.12)',
    borderRadius: 20,
    padding: 24,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: 'rgba(162,176,130,0.3)',
  },
  successTitle: {
    color: '#a2b082',
    fontSize: 14,
    fontWeight: '600',
    marginBottom: 8,
  },
  successCount: {
    color: '#fff',
    fontSize: 36,
    fontWeight: '700',
  },
  successSubtext: {
    color: '#888',
    fontSize: 13,
    marginTop: 4,
  },
  bottomSection: {
    paddingBottom: 20,
    gap: 12,
  },
  primaryButton: {
    backgroundColor: '#fff',
    paddingVertical: 16,
    borderRadius: 30,
    alignItems: 'center',
  },
  disabledButton: {
    opacity: 0.6,
  },
  primaryText: {
    color: '#0a0d0b',
    fontWeight: '600',
    fontSize: 16,
  },
  skipButton: {
    paddingVertical: 14,
    alignItems: 'center',
  },
  skipText: {
    color: '#888',
    fontSize: 14,
  },
});
