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

    // New users who haven't verified their phone yet
    if (onboardingState === "needsPhoneVerify") {
      router.replace("/onboarding/verify-phone");
      return;
    }

    // New users (phone verified, no risk_acknowledgments) — only /tax-saver
    if (userTier === "new" && onboardingState === "complete") {
      if (!pathname.startsWith("/tax-saver")) {
        router.replace("/tax-saver");
      }
      return;
    }

    // Existing user onboarding gates (unchanged)
    if (onboardingState === "needsAck") {
      router.replace("/onboarding/risk-ack");
    } else if (onboardingState === "needsQuiz") {
      router.replace("/onboarding/risk-quiz");
    } else if (onboardingState === "needsProfile") {
      router.replace("/onboarding/financial-profile");
    } else if (onboardingState === "needsPhone") {
      router.replace("/onboarding/phone");
    }
  }, [session, loading, onboardingState, userTier, pathname, router]);

  if (loading || !session || onboardingState === "loading") {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Spinner size={32} />
      </div>
    );
  }

  // While redirecting, show spinner
  if (
    onboardingState !== "complete" ||
    (userTier === "new" && !pathname.startsWith("/tax-saver"))
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
