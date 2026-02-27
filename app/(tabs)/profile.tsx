import { useEffect, useState } from 'react';
import { View, Text, StyleSheet, Pressable } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { Link2 } from 'lucide-react-native';
import { supabase } from '../../lib/supabase';

export default function ProfileScreen() {
  const router = useRouter();
  const [riskProfile, setRiskProfile] = useState<any | null>(null);

  const loadProfile = async () => {
    try {
      const { data: sessionData } = await supabase.auth.getSession();
      const userId = sessionData.session?.user?.id;
      if (!userId) {
        setRiskProfile(null);
        return;
      }
      const { data, error } = await supabase
        .from('risk_profiles')
        .select('risk_level,risk_score,quiz_answers,updated_at')
        .eq('user_id', userId)
        .limit(1);
      if (error || !data || data.length === 0) {
        setRiskProfile(null);
        return;
      }
      setRiskProfile(data[0]);
    } catch (error) {
      setRiskProfile(null);
    }
  };

  useEffect(() => {
    loadProfile();
  }, []);

  const handleLogout = async () => {
    await supabase.auth.signOut();
  };

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.content}>
        <Text style={styles.title}>Profile</Text>
        <Text style={styles.subtitle}>Your preferences and settings.</Text>

        <View style={styles.card}>
          <Text style={styles.cardLabel}>Risk tolerance</Text>
          <Text style={styles.cardValue}>{riskProfile?.risk_level?.toUpperCase() || 'Not set'}</Text>
          <Pressable style={styles.secondaryButton} onPress={() => router.push('/(onboarding)/risk-quiz')}>
            <Text style={styles.secondaryText}>Edit risk profile</Text>
          </Pressable>
        </View>

        <Pressable style={styles.card} onPress={() => router.push('/portfolio/connections')}>
          <View style={styles.cardRow}>
            <Link2 color="#a2b082" size={18} />
            <View style={{ flex: 1 }}>
              <Text style={styles.cardLabel}>Connections</Text>
              <Text style={styles.cardDescription}>Manage broker integrations</Text>
            </View>
            <Text style={styles.cardChevron}>›</Text>
          </View>
        </Pressable>

        <Pressable style={styles.logoutButton} onPress={handleLogout}>
          <Text style={styles.logoutButtonText}>Sign Out</Text>
        </Pressable>
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
    paddingHorizontal: 24,
    paddingTop: 40,
  },
  title: {
    color: '#fff',
    fontSize: 24,
    fontWeight: 'bold',
    marginBottom: 8,
  },
  subtitle: {
    color: '#a2b082',
    fontSize: 14,
    marginBottom: 24,
  },
  card: {
    backgroundColor: 'rgba(255,255,255,0.05)',
    borderRadius: 20,
    padding: 20,
    marginBottom: 24,
  },
  cardLabel: {
    color: '#a2b082',
    fontSize: 12,
  },
  cardValue: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
    marginTop: 6,
    marginBottom: 12,
  },
  secondaryButton: {
    alignSelf: 'flex-start',
    borderRadius: 16,
    paddingVertical: 8,
    paddingHorizontal: 14,
    backgroundColor: 'rgba(255,255,255,0.1)',
  },
  secondaryText: {
    color: '#fff',
    fontSize: 12,
  },
  cardRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
  },
  cardDescription: {
    color: '#888',
    fontSize: 12,
    marginTop: 2,
  },
  cardChevron: {
    color: '#888',
    fontSize: 22,
  },
  logoutButton: {
    backgroundColor: 'rgba(255, 68, 68, 0.1)',
    paddingHorizontal: 32,
    paddingVertical: 12,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: 'rgba(255, 68, 68, 0.3)',
    alignItems: 'center',
  },
  logoutButtonText: {
    color: '#ff4444',
    fontSize: 16,
    fontWeight: '600',
  },
});
