"use client";

import { useState } from "react";
import { createClient } from "@/lib/supabase/client";
import Image from "next/image";
import Link from "next/link";

export default function LoginPage() {
  const [loading, setLoading] = useState(false);

  const handleGoogleLogin = async () => {
    setLoading(true);
    const supabase = createClient();
    const { error } = await supabase.auth.signInWithOAuth({
      provider: "google",
      options: {
        redirectTo: `${window.location.origin}/auth/callback`,
      },
    });
    if (error) {
      console.error(error.message);
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center px-6">
      <div className="glass-card p-10 w-full max-w-sm text-center">
        <Image
          src="/minto.png"
          alt="Minto"
          width={64}
          height={64}
          className="mx-auto mb-6"
        />
        <h1 className="text-2xl font-bold text-minto-text mb-2">
          Welcome to Minto
        </h1>
        <p className="text-minto-text-muted text-sm mb-8">
          Log in to continue
        </p>

        <button
          onClick={handleGoogleLogin}
          disabled={loading}
          className="w-full bg-white text-minto-text font-medium py-3.5 rounded-full shadow-sm hover:shadow-md transition-shadow disabled:opacity-60"
        >
          {loading ? (
            <span className="inline-block w-5 h-5 border-2 border-minto-accent border-t-transparent rounded-full animate-spin" />
          ) : (
            "Continue with Google"
          )}
        </button>

        <Link
          href="/"
          className="block mt-4 text-sm text-minto-text-muted hover:text-minto-text transition-colors"
        >
          Cancel
        </Link>
      </div>
    </div>
  );
}
