"use client";

import { useState } from "react";
import { Newspaper, ExternalLink, X } from "lucide-react";

interface NewsItem {
  title: string;
  link?: string;
  publisher?: string;
}

const MAX_VISIBLE = 2;

export function WidgetNews({ data }: { data: { items: NewsItem[] } }) {
  const [open, setOpen] = useState(false);
  const items = data?.items || [];
  if (!items.length) return null;

  const visible = items.slice(0, MAX_VISIBLE);
  const remaining = items.length - MAX_VISIBLE;

  return (
    <>
      <div className="space-y-1.5 mt-2 mb-2">
        {visible.map((item, i) => (
          <a
            key={i}
            href={item.link || "#"}
            target="_blank"
            rel="noopener noreferrer"
            className="glass-card flex items-center gap-2 px-3 py-2 text-xs hover:bg-white/70 transition-colors group"
          >
            <div className="w-6 h-6 rounded-lg bg-minto-gold/10 flex items-center justify-center shrink-0">
              <Newspaper size={12} className="text-minto-gold" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="font-medium text-minto-text truncate">{item.title}</p>
              {item.publisher && <p className="text-minto-text-muted">{item.publisher}</p>}
            </div>
            {item.link && (
              <ExternalLink size={12} className="text-minto-text-muted shrink-0 opacity-0 group-hover:opacity-100 transition-opacity" />
            )}
          </a>
        ))}
        {remaining > 0 && (
          <button
            onClick={() => setOpen(true)}
            className="glass-card flex items-center gap-2 px-3 py-2 text-xs font-bold text-minto-gold hover:bg-white/70 transition-colors cursor-pointer w-full"
          >
            <div className="w-6 h-6 rounded-lg bg-minto-gold/10 flex items-center justify-center shrink-0">
              <Newspaper size={12} className="text-minto-gold" />
            </div>
            +{remaining} more articles
          </button>
        )}
      </div>

      {open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center" onClick={() => setOpen(false)}>
          <div className="absolute inset-0 bg-black/35" />
          <div
            className="relative bg-[#f2f5ef] rounded-2xl shadow-xl w-full max-w-lg max-h-[70vh] overflow-y-auto"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between p-4 border-b border-black/5">
              <h3 className="text-sm font-bold text-minto-text">News ({items.length})</h3>
              <button onClick={() => setOpen(false)} className="w-7 h-7 rounded-full bg-black/5 flex items-center justify-center hover:bg-black/10">
                <X size={14} />
              </button>
            </div>
            <div className="p-4 space-y-1">
              {items.map((item, i) => (
                <a
                  key={i}
                  href={item.link || "#"}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center gap-3 p-3 rounded-xl hover:bg-white/50 transition-colors group"
                >
                  <div className="w-8 h-8 rounded-lg bg-minto-gold/10 flex items-center justify-center shrink-0">
                    <Newspaper size={14} className="text-minto-gold" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-minto-text leading-snug">{item.title}</p>
                    {item.publisher && (
                      <p className="text-xs text-minto-text-muted mt-0.5">{item.publisher}</p>
                    )}
                  </div>
                  {item.link && (
                    <ExternalLink size={14} className="text-minto-text-muted shrink-0 opacity-0 group-hover:opacity-100 transition-opacity" />
                  )}
                </a>
              ))}
            </div>
          </div>
        </div>
      )}
    </>
  );
}
