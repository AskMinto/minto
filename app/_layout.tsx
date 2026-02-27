import { DefaultTheme, ThemeProvider } from '@react-navigation/native';
import { useFonts } from 'expo-font';
import {
  DMSans_400Regular,
  DMSans_500Medium,
  DMSans_700Bold,
} from '@expo-google-fonts/dm-sans';
import { Stack, useRouter, useSegments } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { useCallback, useEffect, useState } from 'react';
import 'react-native-reanimated';
import { supabase } from '../lib/supabase';
import { Session } from '@supabase/supabase-js';
import { OnboardingContext } from '../lib/onboarding';
import AnimatedGradient from '../components/AnimatedGradient';
import { Theme } from '../constants/Theme';

export {
  ErrorBoundary,
} from 'expo-router';

export const unstable_settings = {
  initialRouteName: 'index',
};

const MintoTheme = {
  ...DefaultTheme,
  colors: {
    ...DefaultTheme.colors,
    background: 'transparent',
    card: 'transparent',
    text: Theme.colors.textPrimary,
    border: 'transparent',
    primary: Theme.colors.accent,
  },
};

SplashScreen.preventAutoHideAsync();

export default function RootLayout() {
  const [loaded, error] = useFonts({
    SpaceMono: require('../assets/fonts/SpaceMono-Regular.ttf'),
    DMSans_400Regular,
    DMSans_500Medium,
    DMSans_700Bold,
  });

  useEffect(() => {
    if (error) throw error;
  }, [error]);

  useEffect(() => {
    if (loaded) {
      SplashScreen.hideAsync();
    }
  }, [loaded]);

  if (!loaded) {
    return null;
  }

  return <RootLayoutNav />;
}

function RootLayoutNav() {
  const [session, setSession] = useState<Session | null>(null);
  const [initialized, setInitialized] = useState(false);
  const [onboardingState, setOnboardingState] = useState<'loading' | 'needsAck' | 'needsQuiz' | 'complete'>('loading');
  const segments = useSegments();
  const router = useRouter();

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session);
      setInitialized(true);
    });

    supabase.auth.onAuthStateChange((_event, session) => {
      setSession(session);
    });
  }, []);

  const checkOnboarding = useCallback(async () => {
    if (!session) {
      setOnboardingState('loading');
      return;
    }
    try {
      const userId = session.user.id;
      const ackResult = await supabase
        .from('risk_acknowledgments')
        .select('accepted_at')
        .eq('user_id', userId)
        .order('accepted_at', { ascending: false })
        .limit(1);

      if (!ackResult.data || ackResult.data.length === 0) {
        setOnboardingState('needsAck');
        return;
      }

      const profileResult = await supabase
        .from('risk_profiles')
        .select('id')
        .eq('user_id', userId)
        .limit(1);

      if (!profileResult.data || profileResult.data.length === 0) {
        setOnboardingState('needsQuiz');
        return;
      }

      setOnboardingState('complete');
    } catch (error) {
      setOnboardingState('needsAck');
    }
  }, [session]);

  useEffect(() => {
    checkOnboarding();
  }, [checkOnboarding]);

  useEffect(() => {
    if (!initialized) return;

    const inTabsGroup = segments[0] === '(tabs)';
    const inOnboardingGroup = segments[0] === '(onboarding)';
    const inAppScreen = ['portfolio', 'chat', 'instrument'].includes(segments[0] as string);
    
    // Quick routing based on auth state
    if (!session && (inTabsGroup || inOnboardingGroup)) {
      router.replace('/');
      return;
    }

    if (!session) return;

    if (onboardingState === 'loading') return;

    if (onboardingState === 'needsAck' && segments[1] !== 'risk-ack') {
      router.replace('/(onboarding)/risk-ack');
      return;
    }

    if (onboardingState === 'needsQuiz' && segments[1] !== 'risk-quiz' && segments[1] !== 'connect-zerodha') {
      router.replace('/(onboarding)/risk-quiz');
      return;
    }

    if (onboardingState === 'complete' && !inTabsGroup && !inAppScreen) {
      router.replace('/(tabs)/dashboard');
    }
  }, [session, initialized, segments, onboardingState]);

  return (
    <OnboardingContext.Provider value={{ recheckOnboarding: checkOnboarding }}>
      <ThemeProvider value={MintoTheme}>
        <AnimatedGradient>
          <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: 'transparent' } }}>
            <Stack.Screen name="index" />
            <Stack.Screen name="login" options={{ presentation: 'modal' }} />
            <Stack.Screen name="(onboarding)" />
            <Stack.Screen name="(tabs)" />
          </Stack>
        </AnimatedGradient>
      </ThemeProvider>
    </OnboardingContext.Provider>
  );
}
