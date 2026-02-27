import { View, Text, StyleSheet, Pressable } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { BrainCircuit, Edit2, ShieldAlert } from 'lucide-react-native';
import { Theme } from '../constants/Theme';

export default function IntroScreen() {
  const router = useRouter();

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <View style={styles.logoContainer}>
          <BrainCircuit color={Theme.colors.accent} size={24} />
          <Text style={styles.logoText}>Minto</Text>
        </View>
        <Pressable onPress={() => router.push('/login')}>
          <Text style={styles.skipText}>Skip</Text>
        </Pressable>
      </View>

      <View style={styles.content}>
        <Text style={styles.title}>Your portfolio,{'\n'}simplified.{'\n'}</Text>
        <Text style={styles.highlightTitle}>Insights that{'\n'}make sense.</Text>

        <View style={styles.features}>
          <View style={styles.featureCard}>
            <View style={styles.iconContainer}>
              <BrainCircuit color={Theme.colors.accent} size={20} />
            </View>
            <Text style={styles.featureText}>Chat with Minto to understand your holdings, risk, and market trends in plain language.</Text>
          </View>

          <View style={styles.featureCard}>
            <View style={styles.iconContainer}>
              <Edit2 color={Theme.colors.accent} size={20} />
            </View>
            <Text style={styles.featureText}>Track equities and mutual funds in one place. Add manually or upload your CAS statement.</Text>
          </View>

          <View style={styles.featureCard}>
            <View style={styles.iconContainer}>
              <ShieldAlert color={Theme.colors.accent} size={20} />
            </View>
            <Text style={styles.featureText}>Spot concentration risks, see sector splits, and keep your portfolio balanced.</Text>
          </View>
        </View>
      </View>

      <View style={styles.footer}>
        <Pressable style={styles.loginButton} onPress={() => router.push('/login')}>
          <Text style={styles.loginButtonText}>Login</Text>
        </Pressable>
        <Pressable style={styles.signupButton} onPress={() => router.push('/login')}>
          <Text style={styles.signupButtonText}>Sign up</Text>
        </Pressable>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 24,
    marginTop: 20,
  },
  logoContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  logoText: {
    fontFamily: Theme.font.familyBold,
    color: Theme.colors.textPrimary,
    fontSize: 18,
  },
  skipText: {
    fontFamily: Theme.font.familyMedium,
    color: Theme.colors.textMuted,
    fontSize: 16,
  },
  content: {
    flex: 1,
    paddingHorizontal: 24,
    marginTop: 60,
  },
  title: {
    fontFamily: Theme.font.family,
    color: Theme.colors.textPrimary,
    fontSize: 44,
    lineHeight: 52,
  },
  highlightTitle: {
    fontFamily: Theme.font.family,
    color: Theme.colors.accent,
    fontSize: 44,
    lineHeight: 52,
    marginTop: -36,
  },
  features: {
    marginTop: 40,
    gap: 14,
  },
  featureCard: {
    backgroundColor: Theme.colors.cardBg,
    borderRadius: Theme.radius.card,
    padding: 16,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 16,
  },
  iconContainer: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: 'rgba(61,90,62,0.1)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  featureText: {
    fontFamily: Theme.font.family,
    color: Theme.colors.textSecondary,
    fontSize: 14,
    flex: 1,
    lineHeight: 20,
  },
  footer: {
    flexDirection: 'row',
    paddingHorizontal: 24,
    paddingBottom: 40,
    gap: 16,
  },
  loginButton: {
    flex: 1,
    backgroundColor: Theme.colors.accent,
    paddingVertical: 16,
    borderRadius: Theme.radius.button,
    alignItems: 'center',
  },
  loginButtonText: {
    fontFamily: Theme.font.familyMedium,
    color: Theme.colors.white,
    fontSize: 16,
  },
  signupButton: {
    flex: 1,
    backgroundColor: 'transparent',
    paddingVertical: 16,
    borderRadius: Theme.radius.button,
    alignItems: 'center',
    borderWidth: 1.5,
    borderColor: Theme.colors.accent,
  },
  signupButtonText: {
    fontFamily: Theme.font.familyMedium,
    color: Theme.colors.accent,
    fontSize: 16,
  },
});