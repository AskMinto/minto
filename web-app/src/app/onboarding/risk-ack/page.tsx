"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/providers/auth-provider";
import { apiPost } from "@/lib/api";
import { ShieldAlert } from "lucide-react";

export default function RiskAckPage() {
  const router = useRouter();
  const { recheckOnboarding } = useAuth();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleAcknowledge = async () => {
    try {
      setLoading(true);
      setError(null);
      await apiPost("/risk/ack");
      await recheckOnboarding();
      router.push("/onboarding/risk-quiz");
    } catch (err: unknown) {
      setError(
        err instanceof Error ? err.message : "Unable to save acknowledgment"
      );
    } finally {
      setLoading(false);
    }
  };

  return (
    <div>
      <div className="mb-6">
        <div className="w-12 h-12 rounded-full bg-[#a2b082] flex items-center justify-center mb-4">
          <ShieldAlert size={22} className="text-minto-dark" />
        </div>
        <h1 className="text-3xl font-bold text-white mb-2">Risk Disclosure</h1>
        <p className="text-[#a2b082] text-sm">
          Please read and accept before continuing.
        </p>
      </div>

      <div className="bg-white/5 rounded-2xl p-5 mb-6">
        <h2 className="text-white font-semibold mb-3">Important</h2>
        <p className="text-gray-300 text-sm leading-relaxed mb-3">
          Minto provides informational insights only. We do not provide buy or
          sell recommendations. Markets can be volatile and you may lose money.
          Past performance is not a guarantee of future results.
        </p>
        <p className="text-gray-300 text-sm leading-relaxed">
          By continuing, you acknowledge that you are responsible for your own
          investment decisions and will consult a SEBI-registered advisor if
          needed.
        </p>
      </div>

      {error && <p className="text-red-400 text-sm mb-4">{error}</p>}

      <button
        onClick={handleAcknowledge}
        disabled={loading}
        className="w-full bg-white text-minto-dark font-semibold py-4 rounded-full hover:opacity-90 transition-opacity disabled:opacity-60"
      >
        {loading ? (
          <span className="inline-block w-5 h-5 border-2 border-minto-dark border-t-transparent rounded-full animate-spin" />
        ) : (
          "I Acknowledge"
        )}
      </button>
    </div>
  );
}
