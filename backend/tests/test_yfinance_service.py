from __future__ import annotations

from app.services.yfinance_service import (
    _normalize_exchange,
    _is_indian_symbol,
    _to_yahoo_symbol,
    _strip_suffix,
    _normalize_quote,
)


class TestNormalizeExchange:
    def test_nse(self):
        assert _normalize_exchange("NSE") == "NSE"
        assert _normalize_exchange("NS") == "NSE"
        assert _normalize_exchange("nse") == "NSE"

    def test_bse(self):
        assert _normalize_exchange("BSE") == "BSE"
        assert _normalize_exchange("BO") == "BSE"
        assert _normalize_exchange("bse") == "BSE"

    def test_none(self):
        assert _normalize_exchange(None) is None
        assert _normalize_exchange("") is None

    def test_unknown(self):
        assert _normalize_exchange("NYSE") is None


class TestIsIndianSymbol:
    def test_ns_suffix(self):
        assert _is_indian_symbol("RELIANCE.NS", None) is True

    def test_bo_suffix(self):
        assert _is_indian_symbol("TCS.BO", None) is True

    def test_with_exchange(self):
        assert _is_indian_symbol("RELIANCE", "NSE") is True

    def test_non_indian(self):
        assert _is_indian_symbol("AAPL", "NASDAQ") is False

    def test_empty(self):
        assert _is_indian_symbol(None, None) is False


class TestToYahooSymbol:
    def test_already_suffixed(self):
        assert _to_yahoo_symbol("RELIANCE.NS", None) == "RELIANCE.NS"

    def test_nse(self):
        assert _to_yahoo_symbol("RELIANCE", "NSE") == "RELIANCE.NS"

    def test_bse(self):
        assert _to_yahoo_symbol("TCS", "BSE") == "TCS.BO"

    def test_none(self):
        assert _to_yahoo_symbol(None, None) is None

    def test_plain_defaults_to_nse(self):
        assert _to_yahoo_symbol("SBIN", None) == "SBIN.NS"

    def test_foreign_symbol_unchanged(self):
        assert _to_yahoo_symbol("AAPL", "NASDAQ") == "AAPL.NS"

    def test_dotted_symbol_unchanged(self):
        assert _to_yahoo_symbol("BRK.B", None) == "BRK.B"


class TestStripSuffix:
    def test_ns(self):
        assert _strip_suffix("RELIANCE.NS") == "RELIANCE"

    def test_bo(self):
        assert _strip_suffix("TCS.BO") == "TCS"

    def test_plain(self):
        assert _strip_suffix("INFY") == "INFY"

    def test_none(self):
        assert _strip_suffix(None) is None


class TestNormalizeQuote:
    def test_basic(self):
        quote = {
            "symbol": "RELIANCE.NS",
            "shortname": "Reliance Industries",
            "quoteType": "EQUITY",
            "exchDisp": "NSE",
        }
        result = _normalize_quote(quote)
        assert result["symbol"] == "RELIANCE"
        assert result["exchange"] == "NSE"
        assert result["yahoo_symbol"] == "RELIANCE.NS"
        assert result["name"] == "Reliance Industries"
        assert result["type"] == "EQUITY"
