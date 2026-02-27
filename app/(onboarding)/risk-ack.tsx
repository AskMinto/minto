import { useState } from 'react';
import { ScrollView, StyleSheet, Text, View, Pressable, ActivityIndicator } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { ShieldAlert } from 'lucide-react-native';
import { useRouter } from 'expo-router';
import { supabase } from '../../lib/supabase';
import { useOnboarding } from '../../lib/onboarding';

export default function RiskAcknowledgeScreen() {
  const router = useRouter();
  const { recheckOnboarding } = useOnboarding();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleAcknowledge = async () => {
    try {
      setLoading(true);
      setError(null);
      const { data: sessionData } = await supabase.auth.getSession();
      const userId = sessionData.session?.user?.id;
      if (!userId) {
        throw new Error('No active session');
      }
      // Ensure the user row exists in public.users (covers users created before the trigger)
      const { error: upsertError } = await supabase.from('users').upsert(
        { id: userId, email: sessionData.session?.user?.email },
        { onConflict: 'id' }
      );
      if (upsertError) {
        throw new Error(upsertError.message);
      }

      const { error: insertError } = await supabase.from('risk_acknowledgments').insert({
        user_id: userId,
        accepted_at: new Date().toISOString(),
        version: 'v1',
      });
      if (insertError) {
        throw new Error(insertError.message);
      }
      await recheckOnboarding();
    } catch (err: any) {
      setError(err.message || 'Unable to save acknowledgment');
    } finally {
      setLoading(false);
    }
  };

  return (
    <SafeAreaView style={styles.container}>
      <ScrollView contentContainerStyle={styles.content}>
        <View style={styles.header}>
          <View style={styles.iconCircle}>
            <ShieldAlert color="#0a0d0b" size={22} />
          </View>
          <Text style={styles.title}>Risk Disclosure</Text>
          <Text style={styles.subtitle}>Please read and accept before continuing.</Text>
        </View>

        <View style={styles.card}>
          <Text style={styles.cardTitle}>Important</Text>
          <Text style={styles.cardBody}>
            Minto provides informational insights only. We do not provide buy or sell recommendations.
            Markets can be volatile and you may lose money. Past performance is not a guarantee of future results.
          </Text>
          <Text style={styles.cardBody}>
            By continuing, you acknowledge that you are responsible for your own investment decisions and will
            consult a SEBI-registered advisor if needed.
          </Text>
        </View>

        {error ? <Text style={styles.errorText}>{error}</Text> : null}

        <Pressable style={styles.primaryButton} onPress={handleAcknowledge} disabled={loading}>
          {loading ? <ActivityIndicator color="#0a0d0b" /> : <Text style={styles.primaryText}>I Acknowledge</Text>}
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
  header: {
    marginBottom: 24,
    alignItems: 'flex-start',
  },
  iconCircle: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: '#a2b082',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 16,
  },
  title: {
    color: '#fff',
    fontSize: 28,
    fontWeight: '700',
    marginBottom: 8,
  },
  subtitle: {
    color: '#a2b082',
    fontSize: 14,
  },
  card: {
    backgroundColor: 'rgba(255,255,255,0.05)',
    borderRadius: 20,
    padding: 20,
    marginBottom: 24,
  },
  cardTitle: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
    marginBottom: 12,
  },
  cardBody: {
    color: '#d5d5d5',
    fontSize: 14,
    lineHeight: 20,
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
    fontWeight: '600',
    fontSize: 16,
  },
  errorText: {
    color: '#ff6b6b',
    marginBottom: 16,
  },
});
