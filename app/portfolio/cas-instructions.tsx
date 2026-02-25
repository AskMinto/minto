import { View, Text, StyleSheet, SafeAreaView, ScrollView, Pressable, Linking } from 'react-native';
import { ArrowLeft, ExternalLink } from 'lucide-react-native';
import { useRouter } from 'expo-router';

const PROVIDERS = [
  {
    name: 'CAMS',
    url: 'https://www.camsonline.com/Investors/Statements/Consolidated-Account-Statement',
    steps: [
      'Visit the CAMS website or use the myCAMS app.',
      'Select "Consolidated Account Statement".',
      'Enter your email and PAN.',
      'Choose the statement period (select "All" for complete history).',
      'Select "Detailed" statement type.',
      'Submit — the CAS PDF will be emailed to your registered email.',
    ],
  },
  {
    name: 'KFintech (formerly Karvy)',
    url: 'https://mfs.kfintech.com/investor/General/ConsolidatedAccountStatement',
    steps: [
      'Visit the KFintech MF website.',
      'Go to "Consolidated Account Statement".',
      'Enter your PAN and email address.',
      'Select the statement period.',
      'Submit — PDF will be sent to your registered email.',
    ],
  },
  {
    name: 'NSDL (for Demat holdings)',
    url: 'https://eservices.nsdl.com/',
    steps: [
      'Log in to NSDL e-Services with your DP ID and Client ID.',
      'Navigate to "CAS" or "Consolidated Account Statement".',
      'Select the period and request the statement.',
      'Download the PDF from the portal or check your email.',
    ],
  },
  {
    name: 'CDSL (for Demat holdings)',
    url: 'https://www.cdslindia.com/',
    steps: [
      'Log in to CDSL\'s "Easi" or "Easiest" portal.',
      'Go to "Account Statement" section.',
      'Request a CAS for your desired period.',
      'Download the PDF or it will be emailed to you.',
    ],
  },
];

export default function CasInstructionsScreen() {
  const router = useRouter();

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <Pressable style={styles.backButton} onPress={() => router.back()}>
          <ArrowLeft color="#000" size={20} />
        </Pressable>
        <Text style={styles.headerTitle}>How to get your CAS</Text>
        <View style={{ width: 40 }} />
      </View>

      <ScrollView contentContainerStyle={styles.scrollContent}>
        <Text style={styles.intro}>
          A Consolidated Account Statement (CAS) is a single document that lists all your mutual fund
          and demat holdings across fund houses. You can request it from any of these providers:
        </Text>

        {PROVIDERS.map((provider) => (
          <View key={provider.name} style={styles.providerCard}>
            <View style={styles.providerHeader}>
              <Text style={styles.providerName}>{provider.name}</Text>
              <Pressable
                style={styles.linkButton}
                onPress={() => Linking.openURL(provider.url)}
              >
                <ExternalLink color="#a2b082" size={14} />
                <Text style={styles.linkText}>Open</Text>
              </Pressable>
            </View>
            {provider.steps.map((step, index) => (
              <View key={index} style={styles.stepRow}>
                <Text style={styles.stepNumber}>{index + 1}</Text>
                <Text style={styles.stepText}>{step}</Text>
              </View>
            ))}
          </View>
        ))}

        <View style={styles.tipCard}>
          <Text style={styles.tipTitle}>Tips</Text>
          <Text style={styles.tipText}>
            • Request a "Detailed" statement for accurate cost and unit data.{'\n'}
            • Use "All" or the longest available period to capture your full history.{'\n'}
            • The PDF password is usually your PAN (in uppercase) followed by your date of birth in DDMMYYYY format.{'\n'}
            • Once you have the PDF, go to Upload CAS in Minto and select the file.
          </Text>
        </View>

        <Pressable style={styles.uploadButton} onPress={() => router.push('/portfolio/cas-upload')}>
          <Text style={styles.uploadButtonText}>Go to Upload CAS</Text>
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
  intro: {
    color: '#ccc',
    fontSize: 14,
    lineHeight: 22,
    marginBottom: 20,
  },
  providerCard: {
    backgroundColor: 'rgba(255,255,255,0.05)',
    borderRadius: 20,
    padding: 18,
    marginBottom: 16,
  },
  providerHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 14,
  },
  providerName: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '700',
  },
  linkButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: 'rgba(162,176,130,0.15)',
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 10,
  },
  linkText: {
    color: '#a2b082',
    fontSize: 12,
    fontWeight: '600',
  },
  stepRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 10,
    marginBottom: 8,
  },
  stepNumber: {
    color: '#a2b082',
    fontSize: 13,
    fontWeight: '700',
    width: 18,
  },
  stepText: {
    color: '#ccc',
    fontSize: 13,
    lineHeight: 20,
    flex: 1,
  },
  tipCard: {
    backgroundColor: 'rgba(209,176,124,0.1)',
    borderRadius: 18,
    padding: 16,
    marginBottom: 20,
    borderWidth: 1,
    borderColor: 'rgba(209,176,124,0.25)',
  },
  tipTitle: {
    color: '#d1b07c',
    fontSize: 14,
    fontWeight: '600',
    marginBottom: 8,
  },
  tipText: {
    color: '#ccc',
    fontSize: 13,
    lineHeight: 22,
  },
  uploadButton: {
    backgroundColor: '#a2b082',
    borderRadius: 28,
    paddingVertical: 16,
    alignItems: 'center',
  },
  uploadButtonText: {
    color: '#0a0d0b',
    fontSize: 16,
    fontWeight: '600',
  },
});
