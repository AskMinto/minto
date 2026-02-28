"use client";

import { useAuth } from "@/providers/auth-provider";
import { useRouter } from "next/navigation";
import { useEffect } from "react";
import Image from "next/image";
import Link from "next/link";
import { ArrowRight, BarChart3, MessageCircle, Shield } from "lucide-react";

export default function LandingPage() {
  const { session, loading } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (!loading && session) {
      router.replace("/chat");
    }
  }, [session, loading, router]);

  if (loading || session) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="w-8 h-8 border-2 border-minto-accent border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="min-h-screen flex flex-col">
      {/* Header */}
      <header className="flex items-center justify-between px-6 py-4 max-w-6xl mx-auto w-full">
        <div className="flex items-center gap-3">
          <Image src="/minto.png" alt="Minto" width={40} height={40} />
          <span className="text-xl font-bold text-minto-text">Minto</span>
        </div>
        <Link
          href="/login"
          className="bg-minto-accent text-white px-6 py-2.5 rounded-full text-sm font-medium hover:opacity-90 transition-opacity"
        >
          Get Started
        </Link>
      </header>

      {/* Hero */}
      <main className="flex-1 flex flex-col items-center justify-center px-6 text-center max-w-3xl mx-auto -mt-16">
        <div className="glass-card p-3 mb-8">
          <Image src="/minto.png" alt="Minto" width={72} height={72} />
        </div>
        <h1 className="text-5xl md:text-6xl font-bold text-minto-text tracking-tight mb-6 leading-tight">
          Meet Minto
        </h1>
        <p className="text-xl md:text-2xl text-minto-text-secondary mb-4 leading-relaxed">
          Your AI Portfolio Assistant
        </p>
        <p className="text-base text-minto-text-muted mb-10 max-w-lg">
          Track your Indian market portfolio, get real-time insights, and chat
          with an AI that understands your holdings, risk profile, and market
          conditions.
        </p>
        <Link
          href="/login"
          className="bg-minto-accent text-white px-8 py-3.5 rounded-full text-base font-medium hover:opacity-90 transition-opacity flex items-center gap-2"
        >
          Get Started <ArrowRight size={18} />
        </Link>

        {/* Feature pills */}
        <div className="flex flex-wrap justify-center gap-4 mt-16">
          {[
            { icon: MessageCircle, label: "AI Chat Assistant" },
            { icon: BarChart3, label: "Portfolio Analytics" },
            { icon: Shield, label: "Risk Insights" },
          ].map(({ icon: Icon, label }) => (
            <div
              key={label}
              className="glass-card flex items-center gap-2 px-5 py-3"
            >
              <Icon size={18} className="text-minto-accent" />
              <span className="text-sm font-medium text-minto-text">
                {label}
              </span>
            </div>
          ))}
        </div>
      </main>

      {/* Footer */}
      <footer className="text-center py-6 text-sm text-minto-text-muted">
        Minto provides informational insights, not investment advice.
      </footer>
    </div>
  );
}
