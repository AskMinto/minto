"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import Image from "next/image";
import { usePathname } from "next/navigation";
import { useAuth } from "@/providers/auth-provider";
import { apiGet } from "@/lib/api";
import {
  MessageCircle,
  LayoutDashboard,
  FolderOpen,
  Search,
  Bell,
  Settings,
  LogOut,
  TrendingUp,
  TrendingDown,
  Menu,
  X,
  Calculator,
} from "lucide-react";

interface MarketBadge {
  label: string;
  value: string;
  change: number;
}

const NAV_ITEMS = [
  { href: "/chat", icon: MessageCircle, label: "Chat" },
  { href: "/dashboard", icon: LayoutDashboard, label: "Dashboard" },
  { href: "/holdings", icon: FolderOpen, label: "Holdings" },
  { href: "/search", icon: Search, label: "Search" },
  { href: "/alerts", icon: Bell, label: "Alerts" },
  { href: "/tax-saver", icon: Calculator, label: "Tax Saver" },
];

export function Sidebar() {
  const pathname = usePathname();
  const { user, signOut } = useAuth();
  const [badges, setBadges] = useState<MarketBadge[]>([]);
  const [mobileOpen, setMobileOpen] = useState(false);

  useEffect(() => {
    apiGet<{ market_badges: MarketBadge[] }>("/chat/home-context")
      .then((ctx) => setBadges(ctx.market_badges || []))
      .catch(() => {});
  }, []);

  const userName =
    user?.user_metadata?.full_name?.split(" ")[0] ||
    user?.email?.split("@")[0] ||
    "User";

  const initial = userName.charAt(0).toUpperCase();

  const sidebar = (
    <aside className="w-[260px] h-full glass-elevated border-r border-white/30 flex flex-col">
      {/* Header */}
      <div className="p-4 flex items-center gap-3">
        <Image src="/minto.png" alt="Minto" width={32} height={32} />
        <span className="font-bold text-minto-text text-lg">Minto</span>
      </div>

      {/* Nav */}
      <nav className="flex-1 px-3 py-2 space-y-1">
        {NAV_ITEMS.map(({ href, icon: Icon, label }) => {
          const active = pathname === href;
          return (
            <Link
              key={href}
              href={href}
              onClick={() => setMobileOpen(false)}
              className={`flex items-center gap-3 px-4 py-2.5 rounded-xl text-sm font-medium transition-all ${
                active
                  ? "bg-minto-accent text-white"
                  : "text-minto-text-secondary hover:bg-black/5"
              }`}
            >
              <Icon size={18} />
              {label}
            </Link>
          );
        })}
      </nav>

      {/* Market Badges */}
      {badges.length > 0 && (
        <div className="px-4 py-3 border-t border-white/20">
          <p className="text-[10px] font-medium text-minto-text-muted uppercase tracking-wider mb-2">
            Markets
          </p>
          <div className="space-y-1.5">
            {badges.map((b) => {
              const isUp = b.change >= 0;
              const Icon = isUp ? TrendingUp : TrendingDown;
              const color = isUp ? "text-minto-positive" : "text-minto-negative";
              return (
                <div key={b.label} className="flex items-center justify-between text-xs">
                  <span className="text-minto-text-muted">{b.label}</span>
                  <span className="flex items-center gap-1">
                    <span className="text-minto-text font-medium">{b.value}</span>
                    <Icon size={10} className={color} />
                    <span className={`${color} font-medium`}>
                      {isUp ? "+" : ""}
                      {b.change.toFixed(1)}%
                    </span>
                  </span>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* User */}
      <div className="p-3 border-t border-white/20">
        <div className="flex items-center gap-3 px-2 py-2">
          <div className="w-8 h-8 rounded-full bg-minto-accent text-white flex items-center justify-center text-sm font-bold">
            {initial}
          </div>
          <span className="flex-1 text-sm font-medium text-minto-text truncate">
            {userName}
          </span>
          <Link href="/settings" onClick={() => setMobileOpen(false)}>
            <Settings size={16} className="text-minto-text-muted hover:text-minto-text transition-colors" />
          </Link>
          <button onClick={signOut}>
            <LogOut size={16} className="text-minto-text-muted hover:text-minto-negative transition-colors" />
          </button>
        </div>
      </div>
    </aside>
  );

  return (
    <>
      {/* Mobile hamburger */}
      <button
        className="md:hidden fixed top-4 left-4 z-50 w-10 h-10 rounded-full glass-card flex items-center justify-center"
        onClick={() => setMobileOpen(!mobileOpen)}
      >
        {mobileOpen ? <X size={20} /> : <Menu size={20} />}
      </button>

      {/* Desktop sidebar */}
      <div className="hidden md:block h-screen sticky top-0 shrink-0">{sidebar}</div>

      {/* Mobile drawer */}
      {mobileOpen && (
        <div className="md:hidden fixed inset-0 z-40">
          <div
            className="absolute inset-0 bg-black/30"
            onClick={() => setMobileOpen(false)}
          />
          <div className="relative h-full w-[260px]">{sidebar}</div>
        </div>
      )}
    </>
  );
}
