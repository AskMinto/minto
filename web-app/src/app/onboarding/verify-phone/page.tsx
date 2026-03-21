"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/providers/auth-provider";
import { apiPost } from "@/lib/api";
import { createClient } from "@/lib/supabase/client";
import { Smartphone, ArrowRight, RefreshCw } from "lucide-react";
import Image from "next/image";

type Step = "phone" | "otp";

export default function VerifyPhonePage() {
  const router = useRouter();
  const { recheckOnboarding } = useAuth();
  const supabase = createClient();

  const [step, setStep] = useState<Step>("phone");
  const [phone, setPhone] = useState("+91");
  const [otp, setOtp] = useState("");
  const [loading, setLoading] = useState(false);
  const [resendCooldown, setResendCooldown] = useState(0);
  const [error, setError] = useState<string | null>(null);

  const validatePhone = (value: string) =>
    /^\+[1-9]\d{6,14}$/.test(value.trim());

  const handleSendOtp = async () => {
    setError(null);
    if (!validatePhone(phone)) {
      setError("Enter a valid number with country code (e.g. +919876543210)");
      return;
    }
    setLoading(true);
    try {
      const { error: supaErr } = await supabase.auth.updateUser({
        phone: phone.trim(),
      });
      if (supaErr) throw supaErr;
      setStep("otp");
      startResendCooldown();
    } catch (err: unknown) {
      setError(
        err instanceof Error
          ? err.message
          : "Could not send OTP. Please check the number and try again."
      );
    } finally {
      setLoading(false);
    }
  };

  const handleVerifyOtp = async () => {
    setError(null);
    if (otp.trim().length < 4) {
      setError("Enter the 6-digit code sent to your phone.");
      return;
    }
    setLoading(true);
    try {
      const { error: supaErr } = await supabase.auth.verifyOtp({
        phone: phone.trim(),
        token: otp.trim(),
        type: "phone_change",
      });
      if (supaErr) throw supaErr;

      // Mark phone as verified in the users table
      await apiPost("/user/verify-phone-complete", {});

      await recheckOnboarding();
      router.replace("/tax-saver");
    } catch (err: unknown) {
      setError(
        err instanceof Error
          ? err.message
          : "Incorrect code. Please try again."
      );
    } finally {
      setLoading(false);
    }
  };

  const startResendCooldown = () => {
    setResendCooldown(30);
    const interval = setInterval(() => {
      setResendCooldown((prev) => {
        if (prev <= 1) {
          clearInterval(interval);
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
  };

  const handleResend = async () => {
    if (resendCooldown > 0) return;
    setError(null);
    setLoading(true);
    try {
      const { error: supaErr } = await supabase.auth.updateUser({
        phone: phone.trim(),
      });
      if (supaErr) throw supaErr;
      startResendCooldown();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Could not resend OTP.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div>
      {/* Logo */}
      <div className="flex items-center gap-2 mb-8">
        <Image src="/minto.png" alt="Minto" width={36} height={36} />
        <span className="text-white font-bold text-xl">Minto</span>
      </div>

      <div className="mb-6">
        <div className="w-12 h-12 rounded-full bg-[#a2b082] flex items-center justify-center mb-4">
          <Smartphone size={22} className="text-minto-dark" />
        </div>
        <h1 className="text-3xl font-bold text-white mb-2">
          Verify your phone
        </h1>
        <p className="text-[#a2b082] text-sm leading-relaxed">
          {step === "phone"
            ? "We'll send a one-time code to confirm your number, then you can access the Tax Saver."
            : `Enter the 6-digit code sent to ${phone}`}
        </p>
      </div>

      {step === "phone" ? (
        <>
          <div className="mb-4">
            <label className="text-[#a2b082] text-xs font-medium block mb-2">
              Phone number (with country code)
            </label>
            <input
              type="tel"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              placeholder="+919876543210"
              disabled={loading}
              className="w-full bg-white/10 border border-white/20 rounded-2xl px-4 py-3.5 text-white placeholder:text-gray-500 text-base focus:outline-none focus:border-[#a2b082]/60 disabled:opacity-60"
            />
          </div>

          {error && <p className="text-red-400 text-sm mb-4">{error}</p>}

          <button
            onClick={handleSendOtp}
            disabled={loading}
            className="w-full bg-white text-minto-dark font-semibold py-4 rounded-full hover:opacity-90 transition-opacity disabled:opacity-60 flex items-center justify-center gap-2"
          >
            {loading ? (
              <span className="w-5 h-5 border-2 border-minto-dark border-t-transparent rounded-full animate-spin" />
            ) : (
              <>
                Send OTP <ArrowRight size={18} />
              </>
            )}
          </button>
        </>
      ) : (
        <>
          <div className="mb-4">
            <label className="text-[#a2b082] text-xs font-medium block mb-2">
              6-digit verification code
            </label>
            <input
              type="text"
              inputMode="numeric"
              pattern="[0-9]*"
              maxLength={6}
              value={otp}
              onChange={(e) => setOtp(e.target.value.replace(/\D/g, ""))}
              placeholder="• • • • • •"
              disabled={loading}
              className="w-full bg-white/10 border border-white/20 rounded-2xl px-4 py-3.5 text-white placeholder:text-gray-400 text-2xl tracking-[0.5em] text-center focus:outline-none focus:border-[#a2b082]/60 disabled:opacity-60"
            />
          </div>

          {error && <p className="text-red-400 text-sm mb-4">{error}</p>}

          <button
            onClick={handleVerifyOtp}
            disabled={loading || otp.length < 4}
            className="w-full bg-white text-minto-dark font-semibold py-4 rounded-full hover:opacity-90 transition-opacity disabled:opacity-60 flex items-center justify-center gap-2 mb-3"
          >
            {loading ? (
              <span className="w-5 h-5 border-2 border-minto-dark border-t-transparent rounded-full animate-spin" />
            ) : (
              "Verify"
            )}
          </button>

          <button
            onClick={handleResend}
            disabled={resendCooldown > 0 || loading}
            className="w-full text-[#a2b082] text-sm py-2 flex items-center justify-center gap-1.5 hover:text-white transition-colors disabled:opacity-50"
          >
            <RefreshCw size={14} />
            {resendCooldown > 0 ? `Resend in ${resendCooldown}s` : "Resend code"}
          </button>

          <button
            onClick={() => { setStep("phone"); setOtp(""); setError(null); }}
            className="w-full text-gray-500 text-xs py-2 hover:text-gray-400 transition-colors mt-1"
          >
            Change phone number
          </button>
        </>
      )}

      <p className="text-gray-600 text-xs text-center mt-8">
        Already have a Minto account with full access?{" "}
        <button
          onClick={async () => {
            const sb = createClient();
            await sb.auth.signOut();
            router.replace("/login");
          }}
          className="text-[#a2b082] hover:underline"
        >
          Sign in again
        </button>
      </p>
    </div>
  );
}
