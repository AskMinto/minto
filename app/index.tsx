import { View, Text, StyleSheet, Pressable, SafeAreaView } from 'react-native';
import { useRouter } from 'expo-router';
import { BrainCircuit, Edit2, ShieldAlert } from 'lucide-react-native';

export default function IntroScreen() {
  const router = useRouter();

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <View style={styles.logoContainer}>
          <BrainCircuit color="#a2b082" size={24} />
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
              <BrainCircuit color="#fff" size={20} />
            </View>
            <Text style={styles.featureText}>Chat with Minto to understand your holdings, risk, and market trends in plain language.</Text>
          </View>

          <View style={styles.featureCard}>
            <View style={styles.iconContainer}>
              <Edit2 color="#fff" size={20} />
            </View>
            <Text style={styles.featureText}>Track equities and mutual funds in one place. Add manually or upload your CAS statement.</Text>
          </View>

          <View style={styles.featureCard}>
            <View style={styles.iconContainer}>
              <ShieldAlert color="#fff" size={20} />
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
    backgroundColor: '#1C211E',
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
    color: '#fff',
    fontSize: 18,
    fontWeight: '600',
  },
  skipText: {
    color: '#a2b082',
    fontSize: 16,
  },
  content: {
    flex: 1,
    paddingHorizontal: 24,
    marginTop: 60,
  },
  title: {
    color: '#fff',
    fontSize: 48,
    fontWeight: '400',
    lineHeight: 56,
  },
  highlightTitle: {
    color: '#a2b082',
    fontSize: 48,
    fontWeight: '400',
    lineHeight: 56,
    marginTop: -40,
  },
  features: {
    marginTop: 40,
    gap: 16,
  },
  featureCard: {
    backgroundColor: 'rgba(255,255,255,0.05)',
    borderRadius: 20,
    padding: 16,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 16,
  },
  iconContainer: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: 'rgba(255,255,255,0.1)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  featureText: {
    color: '#ddd',
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
    backgroundColor: '#fff',
    paddingVertical: 16,
    borderRadius: 30,
    alignItems: 'center',
  },
  loginButtonText: {
    color: '#000',
    fontSize: 16,
    fontWeight: '600',
  },
  signupButton: {
    flex: 1,
    backgroundColor: 'transparent',
    paddingVertical: 16,
    borderRadius: 30,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#fff',
  },
  signupButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
});