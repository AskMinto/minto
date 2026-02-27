import { useState } from 'react';
import { View, Text, StyleSheet, Pressable, ActivityIndicator } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { supabase } from '../lib/supabase';
import { useRouter } from 'expo-router';
import * as WebBrowser from 'expo-web-browser';
import * as Linking from 'expo-linking';
import { makeRedirectUri } from 'expo-auth-session';
import { Theme } from '../constants/Theme';

WebBrowser.maybeCompleteAuthSession();

export default function LoginScreen() {
  const [loading, setLoading] = useState(false);
  const router = useRouter();

  const handleGoogleLogin = async () => {
    try {
      setLoading(true);
      // Use makeRedirectUri which handles Expo Go and standalone apps automatically
      const redirectUrl = makeRedirectUri();
      console.log("\n\n=== IMPORTANT FOR SUPABASE ===");
      console.log("Add this EXACT URL to your Supabase Redirect URLs:");
      console.log(redirectUrl);
      console.log("==============================\n\n");

      const { data, error } = await supabase.auth.signInWithOAuth({
        provider: 'google',
        options: {
          redirectTo: redirectUrl,
          skipBrowserRedirect: true, 
        },
      });

      if (error) throw error;

      if (data.url) {
        const result = await WebBrowser.openAuthSessionAsync(data.url, redirectUrl);
        
        if (result.type === 'success') {
          const url = result.url;
          
          const hashFragment = url.split('#')[1] || '';
          const hashParams = new URLSearchParams(hashFragment);
          
          const parsedUrl = Linking.parse(url);
          
          const access_token = hashParams.get('access_token') || parsedUrl.queryParams?.access_token as string;
          const refresh_token = hashParams.get('refresh_token') || parsedUrl.queryParams?.refresh_token as string;

          if (access_token && refresh_token) {
            await supabase.auth.setSession({
              access_token,
              refresh_token,
            });
            router.replace('/(tabs)/dashboard');
          }
        }
      }
    } catch (error: any) {
      console.error(error.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.content}>
        <Text style={styles.title}>Welcome to Minto</Text>
        <Text style={styles.subtitle}>Log in to continue</Text>

        <Pressable 
          style={styles.googleButton} 
          onPress={handleGoogleLogin}
          disabled={loading}
        >
          {loading ? (
            <ActivityIndicator color={Theme.colors.textPrimary} />
          ) : (
            <>
              <Text style={styles.googleButtonText}>Continue with Google</Text>
            </>
          )}
        </Pressable>

        <Pressable style={styles.cancelButton} onPress={() => router.back()}>
          <Text style={styles.cancelButtonText}>Cancel</Text>
        </Pressable>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: 'center',
  },
  content: {
    paddingHorizontal: 24,
    alignItems: 'center',
  },
  title: {
    fontFamily: Theme.font.familyBold,
    color: Theme.colors.textPrimary,
    fontSize: 32,
    marginBottom: 8,
  },
  subtitle: {
    fontFamily: Theme.font.family,
    color: Theme.colors.textMuted,
    fontSize: 16,
    marginBottom: 48,
  },
  googleButton: {
    backgroundColor: Theme.colors.white,
    width: '100%',
    paddingVertical: 16,
    borderRadius: Theme.radius.button,
    alignItems: 'center',
    marginBottom: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06,
    shadowRadius: 8,
    elevation: 3,
  },
  googleButtonText: {
    fontFamily: Theme.font.familyMedium,
    color: Theme.colors.textPrimary,
    fontSize: 16,
  },
  cancelButton: {
    padding: 16,
  },
  cancelButtonText: {
    fontFamily: Theme.font.family,
    color: Theme.colors.textMuted,
    fontSize: 14,
  },
});