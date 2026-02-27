import { useState } from 'react';
import { View, Text, StyleSheet, Pressable, ActivityIndicator } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { supabase } from '../lib/supabase';
import { useRouter } from 'expo-router';
import * as WebBrowser from 'expo-web-browser';
import * as Linking from 'expo-linking';
import { makeRedirectUri } from 'expo-auth-session';

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
            <ActivityIndicator color="#000" />
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
    backgroundColor: '#1C211E',
    justifyContent: 'center',
  },
  content: {
    paddingHorizontal: 24,
    alignItems: 'center',
  },
  title: {
    color: '#fff',
    fontSize: 32,
    fontWeight: 'bold',
    marginBottom: 8,
  },
  subtitle: {
    color: '#a2b082',
    fontSize: 16,
    marginBottom: 48,
  },
  googleButton: {
    backgroundColor: '#fff',
    width: '100%',
    paddingVertical: 16,
    borderRadius: 30,
    alignItems: 'center',
    marginBottom: 16,
  },
  googleButtonText: {
    color: '#000',
    fontSize: 16,
    fontWeight: '600',
  },
  cancelButton: {
    padding: 16,
  },
  cancelButtonText: {
    color: '#aaa',
    fontSize: 14,
  },
});