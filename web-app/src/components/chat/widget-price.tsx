"use client";

import { useState, useEffect, useCallback } from "react";
import { TrendingUp, TrendingDown, X, ExternalLink } from "lucide-react";
import { apiGet } from "@/lib/api";
import { formatPrice } from "@/lib/format";
import { classifyFund, fundTypeLabel, fundTypeVariant } from "@/lib/fund-classifier";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { Spinner } from "@/components/ui/spinner";
import {
  LineChart,
  Line,
  ResponsiveContainer,
  YAxis,
} from "recharts";

interface PriceItem {
  symbol?: string;
  scheme_name?: string;
  scheme_code?: number;
  fund_house?: string;
  price?: number;
  nav?: number;
  change?: number;
  change_pct?: number;
  type: "equity" | "mf";
}

const MAX_VISIBLE = 3;

/* ── Detail Modal ──────────────────────────────────────────── */

function DetailModal({ item, onClose }: { item: PriceItem; onClose: () => void }) {
  const [detail, setDetail] = useState<Record<string, unknown> | null>(null);
  const [loading, setLoading] = useState(true);

  const isMF = item.type === "mf";

  useEffect(() => {
    const load = async () => {
      try {
        setLoading(true);
        const data = isMF
          ? await apiGet<Record<string, unknown>>(`/mf/${item.scheme_code}/detail`)
          : await apiGet<Record<string, unknown>>(`/instruments/${item.symbol}/detail`);
        setDetail(data);
      } catch {
        setDetail(null);
      } finally {
        setLoading(false);
      }
    };
    load();
  }, [item, isMF]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);

  const change = detail?.change as number | undefined;
  const changePct = detail?.change_pct as number | undefined;
  const isUp = (change ?? 0) >= 0;
  const changeColor = isUp ? "text-minto-positive" : "text-minto-negative";
  const ChangeIcon = isUp ? TrendingUp : TrendingDown;

  const fundType = isMF
    ? classifyFund({
        schemeCategory: detail?.scheme_category as string | undefined,
        schemeType: detail?.scheme_type as string | undefined,
        schemeName: detail?.scheme_name as string | undefined,
        name: detail?.name as string | undefined,
        symbol: item.symbol,
      })
    : null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/35"
      onClick={onClose}
    >
      <div
        className="bg-[#f2f5ef] rounded-2xl shadow-xl max-h-[85vh] overflow-auto w-full max-w-lg mx-4"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-6 pt-5 pb-3">
          <h2 className="font-bold text-minto-text text-lg truncate pr-4">
            {isMF
              ? (detail?.scheme_name || item.scheme_name || "Mutual Fund") as string
              : (detail?.name || item.symbol || "Detail") as string}
          </h2>
          <button
            onClick={onClose}
            className="w-8 h-8 rounded-full bg-black/5 flex items-center justify-center hover:bg-black/10 flex-shrink-0"
          >
            <X size={16} className="text-minto-text-muted" />
          </button>
        </div>

        <div className="px-6 pb-6">
          {loading && (
            <div className="flex justify-center py-12"><Spinner size={24} /></div>
          )}

          {/* ── Equity Detail ── */}
          {!loading && detail && !isMF && (
            <>
              <div className="flex flex-wrap items-center gap-2 mb-2">
                <p className="text-xs text-minto-text-muted">
                  {(detail.exchange || "") as string}
                  {detail.sector ? ` · ${detail.sector}` : ""}
                </p>
              </div>
              <div className="flex items-center gap-3 mb-4">
                <span className="text-2xl font-bold text-minto-text">
                  {formatPrice(detail.price as number)}
                </span>
                {change != null && (
                  <div className={`flex items-center gap-1 text-xs font-medium ${changeColor}`}>
                    <ChangeIcon size={12} />
                    {isUp ? "+" : ""}{change.toFixed(2)} ({changePct?.toFixed(2)}%)
                  </div>
                )}
              </div>

              {(detail.price_history as { date: string; close: number }[] | undefined)?.length ? (
                <Card className="mb-4 !p-3">
                  <p className="text-[10px] text-minto-text-muted mb-2">30-day price</p>
                  <ResponsiveContainer width="100%" height={100}>
                    <LineChart data={detail.price_history as { close: number }[]}>
                      <YAxis domain={["dataMin", "dataMax"]} hide />
                      <Line type="monotone" dataKey="close" stroke={isUp ? "#3d8b4f" : "#c4483e"} strokeWidth={2} dot={false} />
                    </LineChart>
                  </ResponsiveContainer>
                </Card>
              ) : null}

              <div className="grid grid-cols-3 gap-2 mb-4">
                {[
                  { label: "Day Low", value: formatPrice(detail.day_low as number) },
                  { label: "Day High", value: formatPrice(detail.day_high as number) },
                  { label: "Prev Close", value: formatPrice(detail.previous_close as number) },
                ].map((s) => (
                  <Card key={s.label} className="!p-3 text-center">
                    <p className="text-[10px] text-minto-text-muted">{s.label}</p>
                    <p className="text-xs font-medium text-minto-text mt-1">{s.value}</p>
                  </Card>
                ))}
              </div>
            </>
          )}

          {/* ── MF Detail ── */}
          {!loading && detail && isMF && (
            <>
              <p className="text-xs text-minto-text-muted mb-1">{(detail.fund_house || item.fund_house || "") as string}</p>
              <div className="flex flex-wrap items-center gap-2 mb-3">
                {fundType ? (
                  <Badge variant={fundTypeVariant(fundType)}>
                    {fundTypeLabel(fundType)}
                  </Badge>
                ) : null}
                {detail.scheme_category ? (
                  <Badge variant="mf">{detail.scheme_category as string}</Badge>
                ) : null}
              </div>
              <div className="flex items-baseline gap-2 mb-4">
                <span className="text-2xl font-bold text-minto-text">
                  ₹{(detail.nav as number)?.toFixed(4) ?? "—"}
                </span>
                {detail.nav_date ? (
                  <span className="text-[10px] text-minto-text-muted">as of {detail.nav_date as string}</span>
                ) : null}
              </div>

              {(detail.nav_history as { nav: number }[] | undefined)?.length ? (
                <Card className="mb-4 !p-3">
                  <p className="text-[10px] text-minto-text-muted mb-2">30-day NAV</p>
                  <ResponsiveContainer width="100%" height={100}>
                    <LineChart data={detail.nav_history as { nav: number }[]}>
                      <YAxis domain={["dataMin", "dataMax"]} hide />
                      <Line type="monotone" dataKey="nav" stroke="#3d8b4f" strokeWidth={2} dot={false} />
                    </LineChart>
                  </ResponsiveContainer>
                </Card>
              ) : null}

              {detail.returns && Object.keys(detail.returns as Record<string, number>).length > 0 ? (
                <Card className="mb-4 !p-3">
                  <div className="flex justify-around">
                    {Object.entries(detail.returns as Record<string, number>).map(([period, val]) => {
                      const pos = val >= 0;
                      return (
                        <div key={period} className="text-center">
                          <p className="text-[10px] text-minto-text-muted uppercase">{period}</p>
                          <p className={`text-sm font-bold ${pos ? "text-minto-positive" : "text-minto-negative"}`}>
                            {pos ? "+" : ""}{val.toFixed(2)}%
                          </p>
                        </div>
                      );
                    })}
                  </div>
                </Card>
              ) : null}
            </>
          )}

          {/* ── News ── */}
          {!loading && detail && (detail.news as Record<string, unknown>[] | undefined)?.length ? (
            <div>
              <h4 className="text-xs font-medium text-minto-text mb-2">Related News</h4>
              <div className="space-y-1.5">
                {(detail.news as { title: string; link?: string; publisher?: string }[]).slice(0, 5).map((n, i) => (
                  <a
                    key={i}
                    href={n.link || "#"}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="block glass-card !p-3 hover:bg-white/70 transition-colors"
                  >
                    <p className="text-xs text-minto-text leading-relaxed">{n.title}</p>
                    <div className="flex items-center gap-1 mt-1">
                      <span className="text-[10px] text-minto-text-muted">{n.publisher || ""}</span>
                      {n.link && <ExternalLink size={8} className="text-minto-text-muted" />}
                    </div>
                  </a>
                ))}
              </div>
            </div>
          ) : null}

          {!loading && !detail && (
            <p className="text-sm text-minto-text-muted text-center py-12">Unable to load details.</p>
          )}
        </div>
      </div>
    </div>
  );
}

/* ── Price Chip ─────────────────────────────────────────────── */

function PriceChip({ item, onClick }: { item: PriceItem; onClick: () => void }) {
  const label = item.type === "equity" ? item.symbol : (item.scheme_name || "MF");
  const shortLabel = label && label.length > 20 ? label.slice(0, 18) + "…" : label;
  const value = item.type === "equity"
    ? `₹${item.price?.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
    : `NAV ₹${item.nav?.toFixed(2)}`;
  const hasChange = item.change != null && item.change_pct != null;
  const isUp = hasChange ? (item.change ?? 0) >= 0 : null;
  const Icon = isUp === null ? null : isUp ? TrendingUp : TrendingDown;
  const changeColor = isUp === null ? "text-minto-text-muted" : isUp ? "text-minto-positive" : "text-minto-negative";
  const iconBg = isUp === null ? "bg-minto-text-muted/10" : isUp ? "bg-minto-positive/10" : "bg-minto-negative/10";

  return (
    <button
      onClick={onClick}
      className="glass-card flex items-center gap-2 px-3 py-2 text-xs cursor-pointer hover:bg-white/70 transition-colors text-left"
    >
      <div className={`w-6 h-6 rounded-lg flex items-center justify-center ${iconBg}`}>
        {Icon && <Icon size={12} className={changeColor} />}
      </div>
      <div className="min-w-0">
        <p className="font-semibold text-minto-text truncate">{shortLabel}</p>
        <div className="flex items-center gap-1.5">
          <span className="text-minto-text-secondary font-medium">{value}</span>
          {hasChange && (
            <span className={`${changeColor} font-medium`}>
              {isUp ? "+" : ""}{item.change_pct!.toFixed(2)}%
            </span>
          )}
        </div>
      </div>
    </button>
  );
}

/* ── Main Widget ────────────────────────────────────────────── */

export function WidgetPrice({ data }: { data: { items: PriceItem[] } }) {
  const [open, setOpen] = useState(false);
  const [detailItem, setDetailItem] = useState<PriceItem | null>(null);
  const items = data?.items || [];
  if (!items.length) return null;

  const visible = items.slice(0, MAX_VISIBLE);
  const remaining = items.length - MAX_VISIBLE;

  const openDetail = (item: PriceItem) => {
    setDetailItem(item);
    setOpen(false);
  };

  return (
    <>
      <div className="flex flex-wrap items-center gap-2 mt-2 mb-2">
        {visible.map((item, i) => (
          <PriceChip key={i} item={item} onClick={() => openDetail(item)} />
        ))}
        {remaining > 0 && (
          <button
            onClick={() => setOpen(true)}
            className="glass-card px-3 py-2 text-xs font-bold text-minto-accent hover:bg-white/70 transition-colors cursor-pointer"
          >
            +{remaining} more
          </button>
        )}
      </div>

      {/* +N more list modal */}
      {open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center" onClick={() => setOpen(false)}>
          <div className="absolute inset-0 bg-black/35" />
          <div
            className="relative bg-[#f2f5ef] rounded-2xl shadow-xl w-full max-w-md max-h-[70vh] overflow-y-auto"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between p-4 border-b border-black/5">
              <h3 className="text-sm font-bold text-minto-text">Price Lookups</h3>
              <button onClick={() => setOpen(false)} className="w-7 h-7 rounded-full bg-black/5 flex items-center justify-center hover:bg-black/10">
                <X size={14} />
              </button>
            </div>
            <div className="p-4 space-y-2">
              {items.map((item, i) => {
                const label = item.type === "equity" ? item.symbol : (item.scheme_name || "MF");
                const value = item.type === "equity"
                  ? `₹${item.price?.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
                  : `NAV ₹${item.nav?.toFixed(2)}`;
                const hasChange = item.change != null && item.change_pct != null;
                const isUp = hasChange ? (item.change ?? 0) >= 0 : null;
                const Icon = isUp === null ? null : isUp ? TrendingUp : TrendingDown;
                const changeColor = isUp === null ? "text-minto-text-muted" : isUp ? "text-minto-positive" : "text-minto-negative";

                return (
                  <button
                    key={i}
                    onClick={() => openDetail(item)}
                    className="flex items-center gap-3 p-3 rounded-xl bg-white/50 w-full text-left cursor-pointer hover:bg-white/70 transition-colors"
                  >
                    <div className={`w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0 ${isUp === null ? "bg-minto-text-muted/10" : isUp ? "bg-minto-positive/10" : "bg-minto-negative/10"}`}>
                      {Icon && <Icon size={14} className={changeColor} />}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-semibold text-minto-text truncate">{label}</p>
                      <div className="flex items-center gap-2 mt-0.5">
                        <span className="text-sm text-minto-text-secondary font-medium">{value}</span>
                        {hasChange && (
                          <span className={`text-xs font-bold ${changeColor} ${isUp ? "bg-minto-positive/8" : "bg-minto-negative/8"} px-1.5 py-0.5 rounded`}>
                            {isUp ? "↑" : "↓"} {isUp ? "+" : ""}{item.change_pct!.toFixed(2)}%
                            ({isUp ? "+" : ""}{item.change!.toFixed(2)})
                          </span>
                        )}
                      </div>
                    </div>
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      )}

      {/* Instrument detail modal */}
      {detailItem && (
        <DetailModal item={detailItem} onClose={() => setDetailItem(null)} />
      )}
    </>
  );
}
