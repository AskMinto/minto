"use client";

import { useState } from "react";
import { useSearch } from "@/hooks/use-search";
import { InstrumentDetail } from "@/components/search/instrument-detail";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Spinner } from "@/components/ui/spinner";
import { Search as SearchIcon, TrendingUp, Building2, ExternalLink } from "lucide-react";

export default function SearchPage() {
  const { query, setQuery, results, news, searching } = useSearch();
  const [selected, setSelected] = useState<Record<string, unknown> | null>(null);

  return (
    <div className="flex-1 overflow-y-auto">
      <div className="max-w-5xl mx-auto px-6 py-8">
        {/* Header */}
        <h1 className="text-2xl font-bold text-minto-text mb-1">Search</h1>
        <p className="text-sm text-minto-text-muted mb-5">Find stocks and mutual funds</p>

        {/* Search bar */}
        <div className="relative mb-6">
          <SearchIcon size={16} className="absolute left-4 top-1/2 -translate-y-1/2 text-minto-text-muted" />
          <input
            type="text"
            placeholder="Search stocks, MF schemes..."
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            className="w-full bg-white/60 border border-white/30 rounded-2xl pl-11 pr-4 py-3 text-sm text-minto-text placeholder:text-minto-text-muted focus:outline-none focus:ring-2 focus:ring-minto-accent/30 transition-all"
          />
        </div>

        {searching && (
          <div className="flex justify-center py-8"><Spinner size={24} /></div>
        )}

        {!searching && query.trim() && results.length === 0 && (
          <p className="text-sm text-minto-text-muted text-center py-12">No results found.</p>
        )}

        {/* Results grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3 mb-6">
          {results.map((item, i) => {
            const isMF = item.type === "MUTUAL_FUND";
            return (
              <button
                key={`${item.symbol || item.scheme_code}-${i}`}
                onClick={() => setSelected(item)}
                className="glass-card flex items-center gap-3 !p-4 text-left hover:bg-white/70 transition-colors"
              >
                <div className={`w-9 h-9 rounded-xl flex items-center justify-center shrink-0 ${isMF ? "bg-minto-gold/10" : "bg-minto-accent/10"}`}>
                  {isMF ? <Building2 size={16} className="text-minto-gold" /> : <TrendingUp size={16} className="text-minto-accent" />}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-minto-text truncate">
                    {(item.name || item.symbol || item.scheme_name || "—") as string}
                  </p>
                  <p className="text-xs text-minto-text-muted">
                    {isMF ? `MF · ${item.scheme_code}` : `${item.exchange || ""} · ${item.symbol || ""}`}
                  </p>
                </div>
                <Badge variant={isMF ? "mf" : "equity"}>{isMF ? "MF" : "Equity"}</Badge>
              </button>
            );
          })}
        </div>

        {/* News */}
        {news.length > 0 && (
          <div className="glass-card !p-5">
            <h3 className="text-sm font-bold text-minto-text mb-3">Related News</h3>
            <div className="space-y-2">
              {news.slice(0, 5).map((n, i) => (
                <a
                  key={i}
                  href={(n.link as string) || "#"}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-start gap-2 py-2 border-b border-black/5 last:border-0 hover:opacity-80 transition-opacity"
                >
                  <div className="flex-1">
                    <p className="text-xs text-minto-text leading-relaxed">{n.title as string}</p>
                    <p className="text-[10px] text-minto-text-muted mt-1">{(n.publisher || "") as string}</p>
                  </div>
                  {n.link ? <ExternalLink size={10} className="text-minto-text-muted mt-1 shrink-0" /> : null}
                </a>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Detail slide-in */}
      {selected && (
        <>
          <div className="fixed inset-0 bg-black/20 z-30" onClick={() => setSelected(null)} />
          <InstrumentDetail item={selected} onClose={() => setSelected(null)} />
        </>
      )}
    </div>
  );
}
