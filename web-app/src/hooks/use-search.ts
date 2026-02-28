"use client";

import { useState, useEffect } from "react";
import { apiGet } from "@/lib/api";

export function useSearch() {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<Record<string, unknown>[]>([]);
  const [news, setNews] = useState<Record<string, unknown>[]>([]);
  const [searching, setSearching] = useState(false);

  useEffect(() => {
    if (!query.trim()) {
      setResults([]);
      setNews([]);
      return;
    }
    const t = setTimeout(async () => {
      try {
        setSearching(true);
        const data = await apiGet<{ results: Record<string, unknown>[]; news: Record<string, unknown>[] }>(
          `/instruments/search?query=${encodeURIComponent(query)}`
        );
        setResults(data.results || []);
        setNews(data.news || []);
      } catch {
        setResults([]);
        setNews([]);
      } finally {
        setSearching(false);
      }
    }, 400);
    return () => clearTimeout(t);
  }, [query]);

  return { query, setQuery, results, news, searching };
}
