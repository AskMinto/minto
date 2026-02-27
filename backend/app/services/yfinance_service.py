from __future__ import annotations

import logging
from typing import Any

from cachetools import TTLCache
import yfinance as yf

from ..core.config import YFINANCE_MAX_RESULTS, YFINANCE_NEWS_COUNT

# Suppress yfinance's noisy stderr output for invalid/delisted symbols
logging.getLogger("yfinance").setLevel(logging.CRITICAL)

_search_cache: TTLCache[str, dict] = TTLCache(maxsize=256, ttl=60)
_news_cache: TTLCache[str, list] = TTLCache(maxsize=256, ttl=300)
_quote_cache: TTLCache[str, dict] = TTLCache(maxsize=512, ttl=30)
# Separate cache for symbols that fail lookup — longer TTL to avoid repeated noisy retries
_failed_symbol_cache: TTLCache[str, bool] = TTLCache(maxsize=256, ttl=600)


def _normalize_exchange(raw: str | None) -> str | None:
    if not raw:
        return None
    value = raw.upper()
    if "NSE" in value or value in {"NS", "NSE"}:
        return "NSE"
    if "BSE" in value or value in {"BO", "BSE"}:
        return "BSE"
    return None


def _is_indian_symbol(symbol: str | None, exchange: str | None) -> bool:
    if not symbol and not exchange:
        return False
    sym = (symbol or "").upper()
    if sym.endswith(".NS") or sym.endswith(".BO"):
        return True
    exch = _normalize_exchange(exchange)
    return exch in {"NSE", "BSE"}


def _to_yahoo_symbol(symbol: str | None, exchange: str | None) -> str | None:
    if not symbol:
        return None
    sym = symbol.upper()
    if sym.endswith(".NS") or sym.endswith(".BO"):
        return symbol
    exch = _normalize_exchange(exchange)
    if exch == "NSE":
        return f"{symbol}.NS"
    if exch == "BSE":
        return f"{symbol}.BO"
    return symbol


def _strip_suffix(symbol: str | None) -> str | None:
    if not symbol:
        return None
    if symbol.upper().endswith(".NS"):
        return symbol[:-3]
    if symbol.upper().endswith(".BO"):
        return symbol[:-3]
    return symbol


def _normalize_quote(quote: dict[str, Any]) -> dict[str, Any]:
    symbol = quote.get("symbol") or quote.get("ticker")
    exchange = _normalize_exchange(
        quote.get("exchDisp")
        or quote.get("exchange")
        or quote.get("fullExchangeName")
        or quote.get("exchangeDisp")
    )
    if symbol:
        if symbol.upper().endswith(".NS"):
            exchange = "NSE"
        elif symbol.upper().endswith(".BO"):
            exchange = "BSE"

    yahoo_symbol = _to_yahoo_symbol(symbol, exchange)

    return {
        "symbol": _strip_suffix(symbol),
        "yahoo_symbol": yahoo_symbol,
        "exchange": exchange,
        "name": quote.get("shortname") or quote.get("longname") or quote.get("name"),
        "type": quote.get("quoteType") or quote.get("typeDisp"),
    }


def search(query: str) -> dict[str, Any]:
    if not query:
        return {"quotes": [], "news": []}

    cache_key = query.lower()
    if cache_key in _search_cache:
        return _search_cache[cache_key]

    try:
        result = yf.Search(query, max_results=YFINANCE_MAX_RESULTS, news_count=YFINANCE_NEWS_COUNT)
        quotes = result.quotes or []
        news = result.news or []
    except Exception:
        quotes, news = [], []

    normalized_quotes = []
    for quote in quotes:
        if not isinstance(quote, dict):
            continue
        normalized = _normalize_quote(quote)
        if _is_indian_symbol(quote.get("symbol"), normalized.get("exchange")):
            normalized_quotes.append(normalized)

    normalized_news = []
    for item in news:
        if not isinstance(item, dict):
            continue
        normalized_news.append(
            {
                "title": item.get("title"),
                "publisher": item.get("publisher"),
                "link": item.get("link") or item.get("url"),
                "provider_publish_time": item.get("providerPublishTime"),
            }
        )

    data = {"quotes": normalized_quotes, "news": normalized_news}
    _search_cache[cache_key] = data
    return data


def get_quote(symbol: str | None, exchange: str | None) -> dict[str, Any]:
    yahoo_symbol = _to_yahoo_symbol(symbol, exchange)
    if not yahoo_symbol:
        return {}

    cache_key = yahoo_symbol.upper()
    if cache_key in _quote_cache:
        return _quote_cache[cache_key]
    if cache_key in _failed_symbol_cache:
        return {}

    import warnings
    try:
        with warnings.catch_warnings():
            warnings.simplefilter("ignore")
            ticker = yf.Ticker(yahoo_symbol)
            hist = ticker.history(period="5d", interval="1d")
        if hist is None or hist.empty:
            _failed_symbol_cache[cache_key] = True
            data = {}
        else:
            close_series = hist["Close"]
            last_close = float(close_series.iloc[-1])
            prev_close = float(close_series.iloc[-2]) if len(close_series) > 1 else None
            data = {
                "symbol": _strip_suffix(symbol) or yahoo_symbol,
                "yahoo_symbol": yahoo_symbol,
                "price": last_close,
                "previous_close": prev_close,
            }
    except Exception:
        data = {}

    _quote_cache[cache_key] = data
    return data


def get_news(query: str, limit: int = 6) -> list[dict[str, Any]]:
    if not query:
        return []
    cache_key = f"news:{query.lower()}:{limit}"
    if cache_key in _news_cache:
        return _news_cache[cache_key]

    data = search(query)
    news = data.get("news", [])[:limit]
    _news_cache[cache_key] = news
    return news


def map_isin_to_ticker(isin: str) -> dict[str, Any] | None:
    data = search(isin)
    quotes = data.get("quotes", [])
    if quotes:
        return quotes[0]
    return None
