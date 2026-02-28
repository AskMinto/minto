"use client";

import { useState, useEffect } from "react";
import { Modal } from "@/components/ui/modal";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { apiGet } from "@/lib/api";
import { TrendingUp, Building2 } from "lucide-react";

interface Props {
  open: boolean;
  onClose: () => void;
  onSave: (payload: Record<string, unknown>) => Promise<void>;
}

export function AddHoldingModal({ open, onClose, onSave }: Props) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<Record<string, unknown>[]>([]);
  const [selected, setSelected] = useState<Record<string, unknown> | null>(null);
  const [qty, setQty] = useState("");
  const [avgCost, setAvgCost] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!query.trim()) {
      setResults([]);
      return;
    }
    const t = setTimeout(async () => {
      try {
        const data = await apiGet<{ results: Record<string, unknown>[] }>(
          `/instruments/search?query=${encodeURIComponent(query)}`
        );
        setResults(data.results || []);
      } catch {
        setResults([]);
      }
    }, 400);
    return () => clearTimeout(t);
  }, [query]);

  const handleSave = async () => {
    if (!selected || !qty) return;
    setSaving(true);
    try {
      const isMF = selected.type === "MUTUAL_FUND";
      if (isMF) {
        await onSave({
          scheme_code: selected.scheme_code,
          scheme_name: selected.name || selected.scheme_name,
          qty: parseFloat(qty),
          avg_cost: avgCost ? parseFloat(avgCost) : null,
          asset_type: "mutual_fund",
        });
      } else {
        const raw = (selected.yahoo_symbol || selected.symbol || "") as string;
        let exchange = selected.exchange as string;
        let symbol = (selected.symbol || raw) as string;
        if (raw.toUpperCase().endsWith(".NS")) { exchange = "NSE"; symbol = raw.slice(0, -3); }
        if (raw.toUpperCase().endsWith(".BO")) { exchange = "BSE"; symbol = raw.slice(0, -3); }
        await onSave({
          symbol,
          exchange,
          instrument_id: raw,
          qty: parseFloat(qty),
          avg_cost: avgCost ? parseFloat(avgCost) : null,
          asset_type: "equity",
        });
      }
      onClose();
      setQuery("");
      setSelected(null);
      setQty("");
      setAvgCost("");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal open={open} onClose={onClose} title="Add Holding">
      {!selected ? (
        <>
          <Input
            placeholder="Search stocks or MF schemes..."
            value={query}
            onChange={(e) => { setQuery(e.target.value); setSelected(null); }}
            className="mb-3"
          />
          <div className="max-h-60 overflow-y-auto space-y-1.5">
            {results.map((item, i) => {
              const isMF = item.type === "MUTUAL_FUND";
              return (
                <button
                  key={`${item.symbol || item.scheme_code}-${i}`}
                  onClick={() => setSelected(item)}
                  className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl hover:bg-black/5 transition-colors text-left"
                >
                  <div className={`w-8 h-8 rounded-lg flex items-center justify-center ${isMF ? "bg-minto-gold/10" : "bg-minto-accent/10"}`}>
                    {isMF ? <Building2 size={14} className="text-minto-gold" /> : <TrendingUp size={14} className="text-minto-accent" />}
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
        </>
      ) : (
        <>
          <div className="glass-card p-3 mb-4 flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg bg-minto-accent/10 flex items-center justify-center">
              <TrendingUp size={14} className="text-minto-accent" />
            </div>
            <div className="flex-1">
              <p className="text-sm font-medium text-minto-text">
                {(selected.name || selected.symbol || selected.scheme_name || "—") as string}
              </p>
            </div>
            <button onClick={() => setSelected(null)} className="text-xs text-minto-accent hover:underline">
              Change
            </button>
          </div>
          <Input label="Quantity" placeholder="e.g. 10" value={qty} onChange={(e) => setQty(e.target.value)} type="number" className="mb-3" />
          <Input label="Avg. Cost (optional)" placeholder="e.g. 1500" value={avgCost} onChange={(e) => setAvgCost(e.target.value)} type="number" className="mb-4" />
          <Button onClick={handleSave} disabled={!qty || saving} className="w-full">
            {saving ? "Saving..." : "Save Holding"}
          </Button>
        </>
      )}
    </Modal>
  );
}
