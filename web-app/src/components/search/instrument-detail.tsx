"use client";

import { useEffect, useState } from "react";
import { apiGet } from "@/lib/api";
import { formatPrice } from "@/lib/format";
import { Spinner } from "@/components/ui/spinner";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { classifyFund, fundTypeLabel, fundTypeVariant } from "@/lib/fund-classifier";
import { X, TrendingUp, TrendingDown, ExternalLink } from "lucide-react";
import {
  LineChart,
  Line,
  ResponsiveContainer,
  YAxis,
} from "recharts";

interface Props {
  item: Record<string, unknown>;
  onClose: () => void;
}

export function InstrumentDetail({ item, onClose }: Props) {
  const [detail, setDetail] = useState<Record<string, unknown> | null>(null);
  const [loading, setLoading] = useState(true);

  const isMF = item.type === "MUTUAL_FUND";
  const isETF = !isMF && /etf/i.test(String(detail?.name || item.name || item.symbol || ""));

  useEffect(() => {
    const load = async () => {
      try {
        setLoading(true);
        const data = isMF
          ? await apiGet<Record<string, unknown>>(`/mf/${item.scheme_code}/detail`)
          : await apiGet<Record<string, unknown>>(
              `/instruments/${item.symbol}/detail${item.exchange ? `?exchange=${item.exchange}` : ""}`
            );
        setDetail(data);
      } catch {
        setDetail(null);
      } finally {
        setLoading(false);
      }
    };
    load();
  }, [item, isMF]);

  const change = detail?.change as number | undefined;
  const changePct = detail?.change_pct as number | undefined;
  const isUp = (change ?? 0) >= 0;
  const changeColor = isUp ? "text-minto-positive" : "text-minto-negative";
  const ChangeIcon = isUp ? TrendingUp : TrendingDown;

  const fundType = classifyFund({
    schemeCategory: detail?.scheme_category as string | undefined,
    schemeType: detail?.scheme_type as string | undefined,
    schemeName: detail?.scheme_name as string | undefined,
    name: (detail?.name as string | undefined) || (item.name as string | undefined),
    symbol: item.symbol as string | undefined,
  });

  return (
    <div className="fixed inset-y-0 right-0 w-full max-w-md bg-[#f2f5ef] shadow-2xl z-40 flex flex-col">
      {/* Header */}
      <div className="flex items-center justify-between px-5 pt-5 pb-3">
        <h2 className="text-lg font-bold text-minto-text truncate pr-4">
          {(detail?.name || detail?.scheme_name || item.name || item.symbol || "Detail") as string}
        </h2>
        <button onClick={onClose} className="w-8 h-8 rounded-full bg-black/5 flex items-center justify-center hover:bg-black/10">
          <X size={16} />
        </button>
      </div>

      <div className="flex-1 overflow-y-auto px-5 pb-6">
        {loading && (
          <div className="flex justify-center py-12"><Spinner size={24} /></div>
        )}

        {!loading && detail && !isMF && (
          <>
            <div className="flex flex-wrap items-center gap-2 mb-2">
              <p className="text-xs text-minto-text-muted">
                {(detail.exchange || "") as string}
                {detail.sector ? ` · ${detail.sector}` : ""}
              </p>
              {isETF && fundType ? (
                <Badge variant={fundTypeVariant(fundType)}>
                  {fundTypeLabel(fundType)}
                </Badge>
              ) : null}
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

            {/* Chart */}
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

            {/* Stats */}
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

        {!loading && detail && isMF && (
          <>
            <p className="text-xs text-minto-text-muted mb-1">{(detail.fund_house || "") as string}</p>
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

            {/* NAV chart */}
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

            {/* Returns */}
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

        {/* News */}
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
  );
}
