"use client";

import { useAuth } from "@/providers/auth-provider";
import { useRouter } from "next/navigation";
import { useEffect } from "react";
import { Sidebar } from "@/components/layout/sidebar";
import { Spinner } from "@/components/ui/spinner";

export default function AppLayout({ children }: { children: React.ReactNode }) {
  const { session, loading, onboardingState } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (loading) return;
    if (!session) {
      router.replace("/login");
      return;
    }
    if (onboardingState === "needsAck") {
      router.replace("/onboarding/risk-ack");
    } else if (onboardingState === "needsQuiz") {
      router.replace("/onboarding/risk-quiz");
    } else if (onboardingState === "needsProfile") {
      router.replace("/onboarding/financial-profile");
    }
  }, [session, loading, onboardingState, router]);

  if (loading || !session || onboardingState !== "complete") {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Spinner size={32} />
      </div>
    );
  }

  return (
    <div className="flex min-h-screen">
      <Sidebar />
      <main className="flex-1 min-h-screen flex flex-col">{children}</main>
    </div>
  );
}
