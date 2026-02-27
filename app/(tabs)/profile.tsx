import { useEffect, useState } from 'react';
import { View, Text, StyleSheet, Pressable } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { Link2 } from 'lucide-react-native';
import { supabase } from '../../lib/supabase';
import { Theme } from '../../constants/Theme';

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
    <SafeAreaView style={styles.container} edges={['top']}>
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
            <Link2 color={Theme.colors.accent} size={18} />
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
  },
  content: {
    paddingHorizontal: 24,
    paddingTop: 40,
  },
  title: {
    fontFamily: Theme.font.familyBold,
    color: Theme.colors.textPrimary,
    fontSize: 24,
    marginBottom: 8,
  },
  subtitle: {
    fontFamily: Theme.font.family,
    color: Theme.colors.textMuted,
    fontSize: 14,
    marginBottom: 24,
  },
  card: {
    backgroundColor: Theme.colors.cardBg,
    borderRadius: Theme.radius.card,
    padding: 20,
    marginBottom: 24,
  },
  cardLabel: {
    fontFamily: Theme.font.familyMedium,
    color: Theme.colors.textMuted,
    fontSize: 12,
  },
  cardValue: {
    fontFamily: Theme.font.familyBold,
    color: Theme.colors.textPrimary,
    fontSize: 16,
    marginTop: 6,
    marginBottom: 12,
  },
  secondaryButton: {
    alignSelf: 'flex-start',
    borderRadius: 16,
    paddingVertical: 8,
    paddingHorizontal: 14,
    backgroundColor: 'rgba(61,90,62,0.1)',
  },
  secondaryText: {
    fontFamily: Theme.font.familyMedium,
    color: Theme.colors.accent,
    fontSize: 12,
  },
  cardRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
  },
  cardDescription: {
    fontFamily: Theme.font.family,
    color: Theme.colors.textMuted,
    fontSize: 12,
    marginTop: 2,
  },
  cardChevron: {
    color: Theme.colors.textMuted,
    fontSize: 22,
  },
  logoutButton: {
    backgroundColor: 'rgba(196,72,62,0.08)',
    paddingHorizontal: 32,
    paddingVertical: 12,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: 'rgba(196,72,62,0.2)',
    alignItems: 'center',
  },
  logoutButtonText: {
    fontFamily: Theme.font.familyMedium,
    color: Theme.colors.negative,
    fontSize: 16,
  },
});
