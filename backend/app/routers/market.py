from __future__ import annotations

from fastapi import APIRouter, Depends

from ..core.auth import UserContext, get_user_context
from ..services.yfinance_service import search, get_quote, get_news
from ..services.mfapi_service import search_schemes, get_latest_nav, get_nav_history

router = APIRouter(prefix="", tags=["market"])


@router.get("/instruments/search")
def instruments_search(query: str, user: UserContext = Depends(get_user_context)):
    _ = user
    # Equity results from yfinance
    yf_data = search(query)
    equity_results = [
        {**q, "type": "EQUITY"}
        for q in yf_data.get("quotes", [])
    ]

    # MF results from MFAPI
    mf_results_raw = search_schemes(query)
    mf_results = [
        {
            "scheme_code": m.get("scheme_code"),
            "name": m.get("scheme_name"),
            "type": "MUTUAL_FUND",
        }
        for m in mf_results_raw[:12]
    ]

    return {
        "results": equity_results + mf_results,
        "news": yf_data.get("news", []),
    }


@router.get("/prices/quote")
def price_quote(
    exchange: str | None = None,
    symbol: str | None = None,
    user: UserContext = Depends(get_user_context),
):
    _ = user
    return get_quote(exchange=exchange, symbol=symbol)


@router.get("/instruments/{symbol}/detail")
def equity_detail(symbol: str, exchange: str | None = None, user: UserContext = Depends(get_user_context)):
    _ = user
    import yfinance as yf
    from ..services.yfinance_service import _to_yahoo_symbol, _strip_suffix

    yahoo_symbol = _to_yahoo_symbol(symbol, exchange)
    if not yahoo_symbol:
        return {}

    try:
        ticker = yf.Ticker(yahoo_symbol)
        info = ticker.info or {}
        hist = ticker.history(period="1mo", interval="1d")
    except Exception:
        return {}

    # Build price history for chart
    price_history = []
    if hist is not None and not hist.empty:
        for date, row in hist.iterrows():
            price_history.append({
                "date": date.strftime("%Y-%m-%d"),
                "close": float(row["Close"]),
            })

    close_series = hist["Close"] if hist is not None and not hist.empty else None
    last_close = float(close_series.iloc[-1]) if close_series is not None and len(close_series) > 0 else None
    prev_close = float(close_series.iloc[-2]) if close_series is not None and len(close_series) > 1 else None

    change = (last_close - prev_close) if last_close is not None and prev_close is not None else None
    change_pct = (change / prev_close * 100) if change is not None and prev_close else None

    # Related news
    news_items = get_news(symbol, limit=5)

    return {
        "symbol": _strip_suffix(symbol) or symbol,
        "yahoo_symbol": yahoo_symbol,
        "exchange": exchange,
        "name": info.get("shortName") or info.get("longName"),
        "price": last_close,
        "previous_close": prev_close,
        "change": change,
        "change_pct": change_pct,
        "day_high": info.get("dayHigh"),
        "day_low": info.get("dayLow"),
        "fifty_two_week_high": info.get("fiftyTwoWeekHigh"),
        "fifty_two_week_low": info.get("fiftyTwoWeekLow"),
        "market_cap": info.get("marketCap"),
        "sector": info.get("sector"),
        "industry": info.get("industry"),
        "price_history": price_history,
        "news": news_items,
    }


@router.get("/mf/{scheme_code}/detail")
def mf_detail(scheme_code: int, user: UserContext = Depends(get_user_context)):
    _ = user
    nav_info = get_latest_nav(scheme_code)
    if not nav_info:
        return {}

    # Get NAV history for chart and return calculations
    history = get_nav_history(scheme_code)

    # 30-day history for chart
    chart_data = history[:30] if history else []
    # Reverse so oldest is first (MFAPI returns newest first)
    chart_data = list(reversed(chart_data))

    # Calculate returns from history
    current_nav = nav_info.get("nav")
    returns = {}
    if current_nav and history:
        period_days = {"1y": 365, "3y": 1095, "5y": 1825}
        for label, days in period_days.items():
            if len(history) > days:
                old_nav = history[days].get("nav")
                if old_nav and old_nav > 0:
                    years = days / 365
                    if years == 1:
                        returns[label] = ((current_nav - old_nav) / old_nav) * 100
                    else:
                        returns[label] = ((current_nav / old_nav) ** (1 / years) - 1) * 100

    return {
        "scheme_code": scheme_code,
        "scheme_name": nav_info.get("scheme_name"),
        "fund_house": nav_info.get("fund_house"),
        "scheme_type": nav_info.get("scheme_type"),
        "scheme_category": nav_info.get("scheme_category"),
        "nav": current_nav,
        "nav_date": nav_info.get("date"),
        "returns": returns,
        "nav_history": chart_data,
    }


@router.get("/news")
def news(query: str, user: UserContext = Depends(get_user_context)):
    _ = user
    return {"news": get_news(query)}
