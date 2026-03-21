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

// "existing" = has risk_acknowledgments → full portfolio app access
// "new"      = no risk_acknowledgments → tax-saver only (after phone verify)
export type UserTier = "loading" | "new" | "existing";

type OnboardingState =
  | "loading"
  | "needsAck"        // existing user: no risk ack
  | "needsQuiz"       // existing user: no risk quiz
  | "needsProfile"    // existing user: no financial profile
  | "needsPhone"      // existing user: no WhatsApp phone (alerts opt-in)
  | "needsPhoneVerify" // new user: must complete Supabase Phone OTP before accessing tax-saver
  | "complete";

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
      setPhoneVerified(false);
      return;
    }
    try {
      const userId = session.user.id;

      // Step 1: Check if this is an existing user (has risk_acknowledgments)
      const { data: ackData } = await supabase
        .from("risk_acknowledgments")
        .select("accepted_at")
        .eq("user_id", userId)
        .order("accepted_at", { ascending: false })
        .limit(1);

      const isExistingUser = !!(ackData && ackData.length > 0);

      if (!isExistingUser) {
        // New user — check if phone has been OTP-verified
        setUserTier("new");
        const { data: userData } = await supabase
          .from("users")
          .select("phone_verified")
          .eq("id", userId)
          .limit(1);

        const verified = !!(userData && userData[0]?.phone_verified);
        setPhoneVerified(verified);

        if (!verified) {
          setOnboardingState("needsPhoneVerify");
        } else {
          setOnboardingState("complete"); // can access /tax-saver
        }
        return;
      }

      // Existing user — run the existing onboarding state machine
      setUserTier("existing");
      setPhoneVerified(true); // existing users are considered verified

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
      setUserTier("loading");
      setPhoneVerified(false);
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
