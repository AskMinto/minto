"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/providers/auth-provider";
import { apiPost } from "@/lib/api";
import { Phone, MessageCircle } from "lucide-react";

export default function PhonePage() {
  const router = useRouter();
  const { recheckOnboarding } = useAuth();
  const [phone, setPhone] = useState("+91");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSave = async () => {
    setError(null);
    const e164 = /^\+[1-9]\d{6,14}$/.test(phone.trim());
    if (!e164) {
      setError("Enter a valid number with country code (e.g. +919876543210)");
      return;
    }
    try {
      setLoading(true);
      await apiPost("/user/phone", { phone_number: phone.trim() });
      await recheckOnboarding();
      router.push("/chat");
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Could not save phone number");
    } finally {
      setLoading(false);
    }
  };

  const handleSkip = async () => {
    await recheckOnboarding();
    router.push("/chat");
  };

  return (
    <div>
      <div className="mb-6">
        <div className="w-12 h-12 rounded-full bg-[#a2b082] flex items-center justify-center mb-4">
          <Phone size={22} className="text-minto-dark" />
        </div>
        <h1 className="text-3xl font-bold text-white mb-2">WhatsApp Alerts</h1>
        <p className="text-[#a2b082] text-sm">
          Get price alert notifications on WhatsApp the moment they trigger.
        </p>
      </div>

      <div className="bg-white/5 rounded-2xl p-5 mb-6">
        <div className="flex items-start gap-3 mb-4">
          <MessageCircle size={18} className="text-[#a2b082] mt-0.5 shrink-0" />
          <p className="text-gray-300 text-sm leading-relaxed">
            When a price alert triggers, Minto will send you a WhatsApp message instantly — no need to open the app.
          </p>
        </div>
        <div className="bg-white/5 rounded-xl p-3">
          <p className="text-[#a2b082] text-xs font-medium mb-1">One-time setup required</p>
          <p className="text-gray-400 text-xs leading-relaxed">
            To receive messages, send <span className="text-white font-mono">join &lt;sandbox-code&gt;</span> to{" "}
            <span className="text-white font-medium">+1 415 523 8886</span> on WhatsApp first.
          </p>
        </div>
      </div>

      <div className="mb-4">
        <label className="text-[#a2b082] text-xs font-medium block mb-2">
          Phone number (with country code)
        </label>
        <input
          type="tel"
          value={phone}
          onChange={(e) => setPhone(e.target.value)}
          placeholder="+919876543210"
          className="w-full bg-white/10 border border-white/20 rounded-2xl px-4 py-3.5 text-white placeholder:text-gray-500 text-base focus:outline-none focus:border-[#a2b082]/60"
        />
      </div>

      {error && <p className="text-red-400 text-sm mb-4">{error}</p>}

      <button
        onClick={handleSave}
        disabled={loading}
        className="w-full bg-white text-minto-dark font-semibold py-4 rounded-full hover:opacity-90 transition-opacity disabled:opacity-60 mb-3"
      >
        {loading ? (
          <span className="inline-block w-5 h-5 border-2 border-minto-dark border-t-transparent rounded-full animate-spin" />
        ) : (
          "Enable WhatsApp Alerts"
        )}
      </button>

      <button
        onClick={handleSkip}
        className="w-full text-gray-400 text-sm py-2 hover:text-gray-300 transition-colors"
      >
        Skip for now
      </button>
    </div>
  );
}
