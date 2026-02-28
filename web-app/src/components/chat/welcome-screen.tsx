"use client";

import { useEffect, useState } from "react";
import Image from "next/image";
import { apiGet } from "@/lib/api";
import { useAuth } from "@/providers/auth-provider";
import { SUGGESTION_CHIPS } from "@/lib/constants";
import { TrendingUp, TrendingDown } from "lucide-react";

interface Props {
  onSend: (message: string) => void;
}

export function WelcomeScreen({ onSend }: Props) {
  const { user } = useAuth();
  const [commentary, setCommentary] = useState("Markets are vibing. Are you?");
  const [badges, setBadges] = useState<{ label: string; value: string; change: number }[]>([]);

  const name =
    user?.user_metadata?.full_name?.split(" ")[0] ||
    user?.email?.split("@")[0] ||
    "";

  useEffect(() => {
    apiGet<{ commentary: string; market_badges: typeof badges }>("/chat/home-context")
      .then((ctx) => {
        if (ctx.commentary) setCommentary(ctx.commentary);
        if (ctx.market_badges) setBadges(ctx.market_badges);
      })
      .catch(() => {});
  }, []);

  return (
    <div className="flex-1 flex flex-col items-center justify-center px-6 max-w-2xl mx-auto text-center">
      <div className="glass-card p-3 mb-6">
        <Image src="/minto.png" alt="Minto" width={56} height={56} />
      </div>
      <h1 className="text-3xl md:text-4xl font-bold text-minto-text mb-3 tracking-tight">
        Hey{name ? ` ${name}` : ""}, what would you like to know?
      </h1>

      {/* Market badges */}
      {badges.length > 0 && (
        <div className="flex gap-3 mb-4 mt-2">
          {badges.map((b) => {
            const isUp = b.change >= 0;
            const Icon = isUp ? TrendingUp : TrendingDown;
            const color = isUp ? "text-minto-positive" : "text-minto-negative";
            return (
              <div key={b.label} className="glass-card flex items-center gap-2 px-4 py-2 text-xs">
                <span className="text-minto-text-muted">{b.label}</span>
                <span className="font-bold text-minto-text">{b.value}</span>
                <Icon size={10} className={color} />
                <span className={`${color} font-medium`}>
                  {isUp ? "+" : ""}{b.change.toFixed(1)}%
                </span>
              </div>
            );
          })}
        </div>
      )}

      <p className="text-minto-text-secondary text-base mb-8">{commentary}</p>

      {/* Suggestion chips */}
      <div className="flex flex-wrap justify-center gap-2">
        {SUGGESTION_CHIPS.map((chip) => (
          <button
            key={chip}
            onClick={() => onSend(chip)}
            className="glass-card px-4 py-2.5 text-sm text-minto-text-secondary hover:text-minto-text hover:bg-white/70 transition-all cursor-pointer"
          >
            {chip}
          </button>
        ))}
      </div>
    </div>
  );
}
