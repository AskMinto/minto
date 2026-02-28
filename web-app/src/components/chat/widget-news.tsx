"use client";

import { Newspaper, ExternalLink } from "lucide-react";

interface NewsItem {
  title: string;
  link?: string;
  publisher?: string;
}

export function WidgetNews({ data }: { data: { items: NewsItem[] } }) {
  const items = data?.items || [];
  if (!items.length) return null;

  return (
    <div className="space-y-1.5 mt-2 mb-2">
      {items.slice(0, 4).map((item, i) => (
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
    </div>
  );
}
