"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
} from "react";
import { Session, User } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/client";

type OnboardingState =
  | "loading"
  | "needsAck"
  | "needsQuiz"
  | "needsProfile"
  | "needsPhone"
  | "complete";

interface AuthContextValue {
  session: Session | null;
  user: User | null;
  loading: boolean;
  onboardingState: OnboardingState;
  recheckOnboarding: () => Promise<void>;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue>({
  session: null,
  user: null,
  loading: true,
  onboardingState: "loading",
  recheckOnboarding: async () => {},
  signOut: async () => {},
});

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);
  const [onboardingState, setOnboardingState] =
    useState<OnboardingState>("loading");
  const supabase = createClient();

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session);
      setLoading(false);
    });

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      setSession(session);
      setLoading(false);
    });

    return () => subscription.unsubscribe();
  }, [supabase]);

  const recheckOnboarding = useCallback(async () => {
    if (!session) {
      setOnboardingState("loading");
      return;
    }
    try {
      const userId = session.user.id;
      const { data: ackData } = await supabase
        .from("risk_acknowledgments")
        .select("accepted_at")
        .eq("user_id", userId)
        .order("accepted_at", { ascending: false })
        .limit(1);

      if (!ackData || ackData.length === 0) {
        setOnboardingState("needsAck");
        return;
      }

      const { data: profileData } = await supabase
        .from("risk_profiles")
        .select("id")
        .eq("user_id", userId)
        .limit(1);

      if (!profileData || profileData.length === 0) {
        setOnboardingState("needsQuiz");
        return;
      }

      const { data: finData } = await supabase
        .from("financial_profiles")
        .select("id")
        .eq("user_id", userId)
        .limit(1);

      if (!finData || finData.length === 0) {
        setOnboardingState("needsProfile");
        return;
      }

      const { data: userData } = await supabase
        .from("users")
        .select("phone_number")
        .eq("id", userId)
        .limit(1);

      if (!userData || !userData[0]?.phone_number) {
        setOnboardingState("needsPhone");
        return;
      }

      setOnboardingState("complete");
    } catch {
      setOnboardingState("needsAck");
    }
  }, [session, supabase]);

  useEffect(() => {
    if (session) {
      recheckOnboarding();
    } else {
      setOnboardingState("loading");
    }
  }, [session, recheckOnboarding]);

  const signOut = useCallback(async () => {
    await supabase.auth.signOut();
    setSession(null);
  }, [supabase]);

  return (
    <AuthContext.Provider
      value={{
        session,
        user: session?.user ?? null,
        loading,
        onboardingState,
        recheckOnboarding,
        signOut,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  return useContext(AuthContext);
}
