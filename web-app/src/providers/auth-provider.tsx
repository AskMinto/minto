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
  | "needsPhoneVerify"  // New users who have not yet verified phone via OTP
  | "complete";

// "existing" = has risk_acknowledgments → full portfolio app access
// "new"      = no risk_acknowledgments → tax-saver only (after phone verify)
type UserTier = "loading" | "new" | "existing";

interface AuthContextValue {
  session: Session | null;
  user: User | null;
  loading: boolean;
  onboardingState: OnboardingState;
  userTier: UserTier;
  phoneVerified: boolean;
  recheckOnboarding: () => Promise<void>;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue>({
  session: null,
  user: null,
  loading: true,
  onboardingState: "loading",
  userTier: "loading",
  phoneVerified: false,
  recheckOnboarding: async () => {},
  signOut: async () => {},
});

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);
  const [onboardingState, setOnboardingState] =
    useState<OnboardingState>("loading");
  const [userTier, setUserTier] = useState<UserTier>("loading");
  const [phoneVerified, setPhoneVerified] = useState(false);
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
      setUserTier("loading");
      return;
    }
    try {
      const userId = session.user.id;

      // 1. Check for risk_acknowledgments — determines user tier
      const { data: ackData } = await supabase
        .from("risk_acknowledgments")
        .select("accepted_at")
        .eq("user_id", userId)
        .order("accepted_at", { ascending: false })
        .limit(1);

      const hasAck = ackData && ackData.length > 0;

      if (!hasAck) {
        // New user — check if phone is verified
        setUserTier("new");
        const { data: userData } = await supabase
          .from("users")
          .select("phone_verified")
          .eq("id", userId)
          .limit(1);

        const isPhoneVerified = userData?.[0]?.phone_verified === true;
        setPhoneVerified(isPhoneVerified);

        if (!isPhoneVerified) {
          setOnboardingState("needsPhoneVerify");
        } else {
          // Phone verified — allowed to access tax-saver but not full app
          setOnboardingState("complete");
        }
        return;
      }

      // Existing user — run full onboarding state check
      setUserTier("existing");

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

      setOnboardingState("complete");
      setPhoneVerified(true); // Existing users implicitly verified
    } catch {
      setOnboardingState("needsAck");
      setUserTier("existing");
    }
  }, [session, supabase]);

  useEffect(() => {
    if (session) {
      recheckOnboarding();
    } else {
      setOnboardingState("loading");
      setUserTier("loading");
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
        userTier,
        phoneVerified,
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
