"use client";

import { useAuth } from "@/providers/auth-provider";
import { usePathname, useRouter } from "next/navigation";
import { useEffect } from "react";
import { Sidebar } from "@/components/layout/sidebar";
import { Spinner } from "@/components/ui/spinner";

export default function AppLayout({ children }: { children: React.ReactNode }) {
  const { session, loading, onboardingState, userTier } = useAuth();
  const router = useRouter();
  const pathname = usePathname();

  useEffect(() => {
    if (loading) return;

    if (!session) {
      router.replace("/login");
      return;
    }

    // New user that hasn't verified phone yet → verify-phone page
    if (onboardingState === "needsPhoneVerify") {
      router.replace("/onboarding/verify-phone");
      return;
    }

    // New user (no risk_ack) that has verified phone → allowed only in /tax-saver
    // Redirect away from any other (app)/* route
    if (userTier === "new" && onboardingState === "complete") {
      if (!pathname.startsWith("/tax-saver")) {
        router.replace("/tax-saver");
      }
      return;
    }

    // Existing user — standard onboarding gates
    if (onboardingState === "needsAck") {
      router.replace("/onboarding/risk-ack");
    } else if (onboardingState === "needsQuiz") {
      router.replace("/onboarding/risk-quiz");
    } else if (onboardingState === "needsProfile") {
      router.replace("/onboarding/financial-profile");
    }
  }, [session, loading, onboardingState, userTier, pathname, router]);

  // Show spinner while auth/onboarding state is loading or being redirected
  if (
    loading ||
    !session ||
    onboardingState === "loading" ||
    onboardingState === "needsPhoneVerify" ||
    (onboardingState !== "complete" && userTier !== "new")
  ) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Spinner size={32} />
      </div>
    );
  }

  return (
    <div className="flex h-screen overflow-hidden">
      <Sidebar />
      <main className="flex-1 h-screen flex flex-col overflow-hidden">{children}</main>
    </div>
  );
}
