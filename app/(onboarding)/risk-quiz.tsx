import { useState } from 'react';
import { SafeAreaView, ScrollView, StyleSheet, Text, View, Pressable, ActivityIndicator } from 'react-native';
import { useRouter } from 'expo-router';
import { supabase } from '../../lib/supabase';
import { useOnboarding } from '../../lib/onboarding';

const QUESTIONS = [
  {
    id: 'horizon',
    title: 'What is your investment time horizon?',
    options: [
      { label: 'Less than 3 years', score: 1 },
      { label: '3-7 years', score: 2 },
      { label: 'More than 7 years', score: 3 },
    ],
  },
  {
    id: 'volatility',
    title: 'How comfortable are you with short-term volatility?',
    options: [
      { label: 'Low', score: 1 },
      { label: 'Medium', score: 2 },
      { label: 'High', score: 3 },
    ],
  },
  {
    id: 'income',
    title: 'How stable is your income?',
    options: [
      { label: 'Unstable', score: 1 },
      { label: 'Somewhat stable', score: 2 },
      { label: 'Very stable', score: 3 },
    ],
  },
];

export default function RiskQuizScreen() {
  const router = useRouter();
  const { recheckOnboarding } = useOnboarding();
  const [answers, setAnswers] = useState<Record<string, number>>({});
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSelect = (questionId: string, score: number) => {
    setAnswers((prev) => ({ ...prev, [questionId]: score }));
  };

  const handleSubmit = async () => {
    try {
      setLoading(true);
      setError(null);
      const score = Object.values(answers).reduce((acc, val) => acc + val, 0);
      const level = score <= 5 ? 'low' : score <= 7 ? 'medium' : 'high';
      const { data: sessionData } = await supabase.auth.getSession();
      const userId = sessionData.session?.user?.id;
      if (!userId) {
        throw new Error('No active session');
      }
      const { error: upsertError } = await supabase.from('risk_profiles').upsert(
        {
          user_id: userId,
          risk_level: level,
          risk_score: score,
          quiz_answers: answers,
          updated_at: new Date().toISOString(),
        },
        { onConflict: 'user_id' }
      );
      if (upsertError) {
        throw new Error(upsertError.message);
      }
      await recheckOnboarding();
    } catch (err: any) {
      setError(err.message || 'Unable to save risk profile');
    } finally {
      setLoading(false);
    }
  };

  const canSubmit = QUESTIONS.every((q) => answers[q.id] !== undefined);

  return (
    <SafeAreaView style={styles.container}>
      <ScrollView contentContainerStyle={styles.content}>
        <Text style={styles.title}>Risk Tolerance</Text>
        <Text style={styles.subtitle}>Answer 3 quick questions to personalize your experience.</Text>

        {QUESTIONS.map((question) => (
          <View key={question.id} style={styles.card}>
            <Text style={styles.cardTitle}>{question.title}</Text>
            {question.options.map((option) => {
              const selected = answers[question.id] === option.score;
              return (
                <Pressable
                  key={option.label}
                  style={[styles.option, selected && styles.optionSelected]}
                  onPress={() => handleSelect(question.id, option.score)}
                >
                  <Text style={[styles.optionText, selected && styles.optionTextSelected]}>{option.label}</Text>
                </Pressable>
              );
            })}
          </View>
        ))}

        {error ? <Text style={styles.errorText}>{error}</Text> : null}

        <Pressable
          style={[styles.primaryButton, !canSubmit && styles.disabledButton]}
          onPress={handleSubmit}
          disabled={!canSubmit || loading}
        >
          {loading ? <ActivityIndicator color="#0a0d0b" /> : <Text style={styles.primaryText}>Continue</Text>}
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
    fontSize: 28,
    fontWeight: '700',
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
    marginBottom: 16,
  },
  cardTitle: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
    marginBottom: 12,
  },
  option: {
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.1)',
    borderRadius: 16,
    paddingVertical: 12,
    paddingHorizontal: 16,
    marginBottom: 10,
  },
  optionSelected: {
    backgroundColor: '#a2b082',
    borderColor: '#a2b082',
  },
  optionText: {
    color: '#d5d5d5',
    fontSize: 14,
  },
  optionTextSelected: {
    color: '#0a0d0b',
    fontWeight: '600',
  },
  primaryButton: {
    backgroundColor: '#fff',
    paddingVertical: 16,
    borderRadius: 30,
    alignItems: 'center',
    marginTop: 8,
  },
  disabledButton: {
    opacity: 0.6,
  },
  primaryText: {
    color: '#0a0d0b',
    fontWeight: '600',
    fontSize: 16,
  },
  errorText: {
    color: '#ff6b6b',
    marginBottom: 12,
  },
});
