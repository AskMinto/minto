from __future__ import annotations

from unittest.mock import patch

import pytest

from app.services.portfolio import compute_portfolio, concentration_flags, extract_prices


class TestExtractPrices:
    def test_basic_quote(self):
        ltp, prev = extract_prices({"price": 100.5, "previous_close": 99.0})
        assert ltp == 100.5
        assert prev == 99.0

    def test_wrapped_quote(self):
        ltp, prev = extract_prices({"data": {"price": 50.0, "previous_close": 48.0}})
        assert ltp == 50.0
        assert prev == 48.0

    def test_empty(self):
        ltp, prev = extract_prices({})
        assert ltp is None
        assert prev is None


class TestComputePortfolio:
    @patch("app.services.portfolio.get_quote")
    @patch("app.services.portfolio.get_latest_nav")
    def test_equity_holdings(self, mock_nav, mock_quote):
        mock_quote.return_value = {"price": 200.0, "previous_close": 195.0}
        holdings = [
            {"symbol": "RELIANCE", "exchange": "NSE", "qty": 10, "avg_cost": 180.0,
             "sector": "Energy", "mcap_bucket": "Large", "asset_type": "equity"},
        ]
        result = compute_portfolio(holdings)
        assert result["totals"]["total_value"] == 2000.0
        assert result["totals"]["invested"] == 1800.0
        assert result["totals"]["pnl"] == 200.0
        assert len(result["holdings"]) == 1

    @patch("app.services.portfolio.get_quote")
    @patch("app.services.portfolio.get_latest_nav")
    def test_mf_holdings(self, mock_nav, mock_quote):
        mock_nav.return_value = {"nav": 55.0}
        holdings = [
            {"scheme_code": 119551, "qty": 100, "avg_cost": 50.0,
             "asset_type": "mutual_fund", "sector": "Large Cap", "mcap_bucket": "Unknown"},
        ]
        result = compute_portfolio(holdings)
        assert result["totals"]["total_value"] == 5500.0
        assert result["totals"]["invested"] == 5000.0
        assert result["totals"]["pnl"] == 500.0

    @patch("app.services.portfolio.get_quote")
    @patch("app.services.portfolio.get_latest_nav")
    def test_mixed_holdings(self, mock_nav, mock_quote):
        mock_quote.return_value = {"price": 300.0, "previous_close": 290.0}
        mock_nav.return_value = {"nav": 60.0}
        holdings = [
            {"symbol": "TCS", "exchange": "NSE", "qty": 5, "avg_cost": 280.0,
             "sector": "IT", "mcap_bucket": "Large", "asset_type": "equity"},
            {"scheme_code": 120503, "qty": 50, "avg_cost": 55.0,
             "asset_type": "mutual_fund", "sector": "Mid Cap", "mcap_bucket": "Unknown"},
        ]
        result = compute_portfolio(holdings)
        equity_value = 300.0 * 5
        mf_value = 60.0 * 50
        assert result["totals"]["total_value"] == equity_value + mf_value
        assert len(result["asset_split"]) == 2

    @patch("app.services.portfolio.get_quote")
    @patch("app.services.portfolio.get_latest_nav")
    def test_empty_holdings(self, mock_nav, mock_quote):
        result = compute_portfolio([])
        assert result["totals"]["total_value"] == 0.0
        assert result["holdings"] == []

    @patch("app.services.portfolio.get_quote")
    @patch("app.services.portfolio.get_latest_nav")
    def test_splits_add_up(self, mock_nav, mock_quote):
        mock_quote.return_value = {"price": 100.0, "previous_close": 100.0}
        holdings = [
            {"symbol": "A", "exchange": "NSE", "qty": 10, "avg_cost": 100.0,
             "sector": "IT", "mcap_bucket": "Large", "asset_type": "equity"},
            {"symbol": "B", "exchange": "NSE", "qty": 10, "avg_cost": 100.0,
             "sector": "Finance", "mcap_bucket": "Mid", "asset_type": "equity"},
        ]
        result = compute_portfolio(holdings)
        sector_total = sum(s["value"] for s in result["sector_split"])
        assert abs(sector_total - result["totals"]["total_value"]) < 0.01


class TestConcentrationFlags:
    @patch("app.services.portfolio.get_quote")
    @patch("app.services.portfolio.get_latest_nav")
    def test_single_stock_flag(self, mock_nav, mock_quote):
        mock_quote.return_value = {"price": 100.0, "previous_close": 100.0}
        holdings = [
            {"symbol": "A", "exchange": "NSE", "qty": 50, "avg_cost": 100.0,
             "sector": "IT", "mcap_bucket": "Large", "asset_type": "equity"},
            {"symbol": "B", "exchange": "NSE", "qty": 10, "avg_cost": 100.0,
             "sector": "Finance", "mcap_bucket": "Mid", "asset_type": "equity"},
        ]
        flags = concentration_flags(holdings)
        stock_flags = [f for f in flags if f["type"] == "stock"]
        assert len(stock_flags) >= 1
        assert stock_flags[0]["label"] == "A"

    @patch("app.services.portfolio.get_quote")
    @patch("app.services.portfolio.get_latest_nav")
    def test_no_flags_balanced(self, mock_nav, mock_quote):
        mock_quote.return_value = {"price": 100.0, "previous_close": 100.0}
        holdings = [
            {"symbol": s, "exchange": "NSE", "qty": 10, "avg_cost": 100.0,
             "sector": f"Sector{i}", "mcap_bucket": "Large", "asset_type": "equity"}
            for i, s in enumerate(["A", "B", "C", "D", "E", "F", "G", "H", "I", "J"])
        ]
        flags = concentration_flags(holdings)
        stock_flags = [f for f in flags if f["type"] == "stock"]
        assert len(stock_flags) == 0
