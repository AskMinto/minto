"use client";

import { useState, useEffect, useRef } from "react";
import { Bell, Search, Check, ChevronDown } from "lucide-react";
import { apiGet, apiPost } from "@/lib/api";
import { Spinner } from "@/components/ui/spinner";

interface SearchResult {
  symbol?: string;
  exchange?: string;
  scheme_code?: number;
  name?: string;
  type: "EQUITY" | "MUTUAL_FUND";
}

interface AlertSetupData {
  display_name?: string | null;
  symbol?: string | null;
  exchange?: string | null;
  scheme_code?: number | null;
  alert_type?: string | null;
  target_value?: number | null;
}

const ALERT_TYPES = [
  { value: "above",          label: "Price goes above",  suffix: "₹",  isPct: false },
  { value: "below",          label: "Price drops below",  suffix: "₹",  isPct: false },
  { value: "pct_change_up",  label: "Rises by",          suffix: "%",  isPct: true  },
  { value: "pct_change_down",label: "Falls by",          suffix: "%",  isPct: true  },
];

export function WidgetAlertSetup({ data }: { data: AlertSetupData }) {
  // Instrument state
  const [displayName, setDisplayName] = useState(data.display_name || "");
  const [symbol, setSymbol]           = useState(data.symbol || "");
  const [exchange, setExchange]       = useState(data.exchange || "NSE");
  const [schemeCode, setSchemeCode]   = useState<number | null>(data.scheme_code || null);
  const [isMF, setIsMF]               = useState(!!data.scheme_code);

  // Search state
  const [searchQuery, setSearchQuery] = useState(data.display_name || "");
  const [searchResults, setSearchResults] = useState<SearchResult[]>([]);
  const [searching, setSearching]     = useState(false);
  const [showDropdown, setShowDropdown] = useState(false);
  const searchRef = useRef<HTMLDivElement>(null);

  // Alert condition state
  const [alertType, setAlertType]     = useState(data.alert_type || "");
  const [targetValue, setTargetValue] = useState(data.target_value?.toString() || "");

  // Submission
  const [submitting, setSubmitting]   = useState(false);
  const [done, setDone]               = useState(false);
  const [error, setError]             = useState("");

  const instrumentSelected = !!(displayName && (symbol || schemeCode));

  // Debounced search
  useEffect(() => {
    if (!searchQuery.trim() || instrumentSelected) {
      setSearchResults([]);
      setShowDropdown(false);
      return;
    }
    const t = setTimeout(async () => {
      setSearching(true);
      try {
        const data = await apiGet<{ results: SearchResult[] }>(
          `/instruments/search?query=${encodeURIComponent(searchQuery)}`
        );
        setSearchResults(data.results || []);
        setShowDropdown(true);
      } catch {
        setSearchResults([]);
      } finally {
        setSearching(false);
      }
    }, 350);
    return () => clearTimeout(t);
  }, [searchQuery, instrumentSelected]);

  // Close dropdown on outside click
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (searchRef.current && !searchRef.current.contains(e.target as Node)) {
        setShowDropdown(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  const selectInstrument = (r: SearchResult) => {
    const name = r.name || r.symbol || "";
    setDisplayName(name);
    setSearchQuery(name);
    setShowDropdown(false);
    setSearchResults([]);
    if (r.type === "MUTUAL_FUND") {
      setIsMF(true);
      setSchemeCode(r.scheme_code || null);
      setSymbol("");
      setExchange("");
    } else {
      setIsMF(false);
      setSymbol(r.symbol || "");
      setExchange(r.exchange || "NSE");
      setSchemeCode(null);
    }
  };

  const clearInstrument = () => {
    setDisplayName("");
    setSearchQuery("");
    setSymbol("");
    setExchange("NSE");
    setSchemeCode(null);
    setIsMF(false);
  };

  const handleSubmit = async () => {
    setError("");
    if (!displayName) { setError("Select an instrument."); return; }
    if (!alertType)   { setError("Choose an alert condition."); return; }
    if (!targetValue || isNaN(Number(targetValue))) { setError("Enter a valid target value."); return; }
    if (!symbol && !schemeCode) { setError("Select an instrument from the list."); return; }

    setSubmitting(true);
    try {
      const payload: Record<string, unknown> = {
        display_name: displayName,
        alert_type: alertType,
        target_value: Number(targetValue),
      };
      if (isMF) {
        payload.scheme_code = schemeCode;
      } else {
        payload.symbol   = symbol;
        payload.exchange = exchange;
      }
      await apiPost("/alerts", payload);
      setDone(true);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to set alert.");
    } finally {
      setSubmitting(false);
    }
  };

  const selectedType = ALERT_TYPES.find(t => t.value === alertType);

  if (done) {
    return (
      <div className="glass-card flex items-center gap-3 px-4 py-3 mt-2 mb-2 max-w-sm">
        <div className="w-7 h-7 rounded-full bg-minto-positive/15 flex items-center justify-center shrink-0">
          <Check size={14} className="text-minto-positive" />
        </div>
        <div>
          <p className="text-sm font-semibold text-minto-text">Alert set</p>
          <p className="text-xs text-minto-text-muted">
            {displayName} · {selectedType?.label} {selectedType?.suffix}{targetValue}
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="glass-card mt-2 mb-2 p-4 max-w-sm space-y-3">
      {/* Header */}
      <div className="flex items-center gap-2">
        <div className="w-7 h-7 rounded-lg bg-minto-accent/10 flex items-center justify-center shrink-0">
          <Bell size={14} className="text-minto-accent" />
        </div>
        <p className="text-sm font-semibold text-minto-text">Set Price Alert</p>
      </div>

      {/* Instrument search / display */}
      <div ref={searchRef} className="relative">
        <label className="text-[11px] font-medium text-minto-text-muted uppercase tracking-wide block mb-1">
          Instrument
        </label>
        {instrumentSelected ? (
          <div className="flex items-center justify-between bg-white/60 border border-white/40 rounded-xl px-3 py-2">
            <div>
              <p className="text-sm font-semibold text-minto-text">{displayName}</p>
              <p className="text-[11px] text-minto-text-muted">
                {isMF ? `MF · scheme ${schemeCode}` : `${symbol} · ${exchange}`}
              </p>
            </div>
            <button
              onClick={clearInstrument}
              className="text-[11px] text-minto-accent hover:underline ml-2 shrink-0"
            >
              Change
            </button>
          </div>
        ) : (
          <div className="relative">
            <Search size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-minto-text-muted pointer-events-none" />
            <input
              type="text"
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              placeholder="Search stock or mutual fund…"
              className="w-full pl-8 pr-3 py-2 text-sm bg-white/60 border border-white/40 rounded-xl text-minto-text placeholder:text-minto-text-muted focus:outline-none focus:ring-1 focus:ring-minto-accent/40"
            />
            {searching && (
              <div className="absolute right-3 top-1/2 -translate-y-1/2">
                <Spinner size={12} />
              </div>
            )}
          </div>
        )}

        {/* Dropdown */}
        {showDropdown && searchResults.length > 0 && (
          <div className="absolute left-0 right-0 top-full mt-1 z-20 bg-white/95 backdrop-blur-sm border border-white/40 rounded-xl shadow-lg overflow-hidden">
            {searchResults.slice(0, 6).map((r, i) => (
              <button
                key={i}
                onClick={() => selectInstrument(r)}
                className="w-full flex items-center justify-between px-3 py-2.5 hover:bg-minto-accent/5 transition-colors text-left"
              >
                <div className="min-w-0">
                  <p className="text-sm font-medium text-minto-text truncate">{r.name || r.symbol}</p>
                  <p className="text-[11px] text-minto-text-muted">
                    {r.type === "MUTUAL_FUND" ? "Mutual Fund" : `${r.symbol} · ${r.exchange}`}
                  </p>
                </div>
                <span className={`text-[10px] font-medium px-1.5 py-0.5 rounded ml-2 shrink-0 ${
                  r.type === "MUTUAL_FUND" ? "bg-blue-50 text-blue-600" : "bg-minto-accent/10 text-minto-accent"
                }`}>
                  {r.type === "MUTUAL_FUND" ? "MF" : "EQ"}
                </span>
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Alert type */}
      <div>
        <label className="text-[11px] font-medium text-minto-text-muted uppercase tracking-wide block mb-1">
          Condition
        </label>
        <div className="grid grid-cols-2 gap-1.5">
          {ALERT_TYPES.map(t => (
            <button
              key={t.value}
              onClick={() => setAlertType(t.value)}
              className={`px-2.5 py-2 rounded-xl text-xs font-medium border transition-all text-left ${
                alertType === t.value
                  ? "bg-minto-accent text-white border-minto-accent"
                  : "bg-white/40 text-minto-text-secondary border-white/30 hover:bg-white/60"
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>
      </div>

      {/* Target value */}
      {alertType && (
        <div>
          <label className="text-[11px] font-medium text-minto-text-muted uppercase tracking-wide block mb-1">
            Target {selectedType?.isPct ? "Percentage" : "Price"}
          </label>
          <div className="relative">
            <span className="absolute left-3 top-1/2 -translate-y-1/2 text-minto-text-muted text-sm font-medium pointer-events-none">
              {selectedType?.suffix}
            </span>
            <input
              type="number"
              min="0"
              step="any"
              value={targetValue}
              onChange={e => setTargetValue(e.target.value)}
              placeholder={selectedType?.isPct ? "e.g. 5" : "e.g. 1800"}
              className="w-full pl-7 pr-3 py-2 text-sm bg-white/60 border border-white/40 rounded-xl text-minto-text placeholder:text-minto-text-muted focus:outline-none focus:ring-1 focus:ring-minto-accent/40"
            />
          </div>
        </div>
      )}

      {error && (
        <p className="text-xs text-minto-negative bg-minto-negative/5 rounded-lg px-3 py-1.5">{error}</p>
      )}

      <button
        onClick={handleSubmit}
        disabled={submitting}
        className="w-full py-2.5 rounded-xl bg-minto-accent text-white text-sm font-medium hover:opacity-90 transition-opacity disabled:opacity-50 flex items-center justify-center gap-2"
      >
        {submitting ? <Spinner size={14} /> : <Bell size={14} />}
        {submitting ? "Setting alert…" : "Set Alert"}
      </button>
    </div>
  );
}
