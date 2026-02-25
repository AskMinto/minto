from __future__ import annotations

from unittest.mock import patch, MagicMock

import pytest

from app.services.mfapi_service import (
    search_schemes,
    get_latest_nav,
    get_nav_history,
    resolve_isin_to_scheme,
    _search_cache,
    _nav_cache,
    _scheme_list_cache,
)


@pytest.fixture(autouse=True)
def clear_caches():
    _search_cache.clear()
    _nav_cache.clear()
    _scheme_list_cache.clear()
    yield
    _search_cache.clear()
    _nav_cache.clear()
    _scheme_list_cache.clear()


def _mock_response(json_data, status_code=200):
    mock = MagicMock()
    mock.status_code = status_code
    mock.json.return_value = json_data
    mock.raise_for_status.return_value = None
    return mock


class TestSearchSchemes:
    def test_empty_query(self):
        assert search_schemes("") == []

    @patch("app.services.mfapi_service.httpx.get")
    def test_returns_results(self, mock_get):
        mock_get.return_value = _mock_response([
            {"schemeCode": 119551, "schemeName": "Axis Bluechip Fund - Growth"},
            {"schemeCode": 120503, "schemeName": "Axis Midcap Fund - Growth"},
        ])
        results = search_schemes("axis")
        assert len(results) == 2
        assert results[0]["scheme_code"] == 119551
        assert results[0]["scheme_name"] == "Axis Bluechip Fund - Growth"

    @patch("app.services.mfapi_service.httpx.get")
    def test_caches_results(self, mock_get):
        mock_get.return_value = _mock_response([
            {"schemeCode": 119551, "schemeName": "Axis Bluechip Fund - Growth"},
        ])
        search_schemes("axis")
        search_schemes("axis")
        assert mock_get.call_count == 1

    @patch("app.services.mfapi_service.httpx.get")
    def test_handles_error(self, mock_get):
        mock_get.side_effect = Exception("Network error")
        assert search_schemes("axis") == []


class TestGetLatestNav:
    @patch("app.services.mfapi_service.httpx.get")
    def test_returns_nav(self, mock_get):
        mock_get.return_value = _mock_response({
            "meta": {
                "scheme_code": 119551,
                "scheme_name": "Axis Bluechip Fund",
                "fund_house": "Axis Mutual Fund",
                "scheme_type": "Open Ended",
                "scheme_category": "Large Cap",
            },
            "data": [{"date": "25-02-2026", "nav": "55.1234"}],
        })
        result = get_latest_nav(119551)
        assert result["nav"] == 55.1234
        assert result["fund_house"] == "Axis Mutual Fund"
        assert result["scheme_category"] == "Large Cap"

    @patch("app.services.mfapi_service.httpx.get")
    def test_handles_empty(self, mock_get):
        mock_get.return_value = _mock_response({"meta": {}, "data": []})
        result = get_latest_nav(999999)
        assert result["nav"] is None

    @patch("app.services.mfapi_service.httpx.get")
    def test_handles_error(self, mock_get):
        mock_get.side_effect = Exception("timeout")
        assert get_latest_nav(119551) == {}


class TestGetNavHistory:
    @patch("app.services.mfapi_service.httpx.get")
    def test_returns_history(self, mock_get):
        mock_get.return_value = _mock_response({
            "data": [
                {"date": "25-02-2026", "nav": "55.12"},
                {"date": "24-02-2026", "nav": "54.89"},
            ]
        })
        history = get_nav_history(119551)
        assert len(history) == 2
        assert history[0]["nav"] == 55.12

    @patch("app.services.mfapi_service.httpx.get")
    def test_handles_error(self, mock_get):
        mock_get.side_effect = Exception("timeout")
        assert get_nav_history(119551) == []


class TestResolveIsinToScheme:
    def test_empty_isin(self):
        assert resolve_isin_to_scheme("") is None

    @patch("app.services.mfapi_service._get_scheme_list")
    def test_matches_growth_isin(self, mock_list):
        mock_list.return_value = [
            {
                "schemeCode": 119551,
                "schemeName": "Axis Bluechip Fund",
                "isinGrowth": "INF846K01DP8",
                "isinDivReinvestment": "",
            }
        ]
        result = resolve_isin_to_scheme("INF846K01DP8")
        assert result is not None
        assert result["scheme_code"] == 119551

    @patch("app.services.mfapi_service._get_scheme_list")
    @patch("app.services.mfapi_service.search_schemes")
    def test_fallback_to_search(self, mock_search, mock_list):
        mock_list.return_value = []
        mock_search.return_value = [{"scheme_code": 120503, "scheme_name": "Axis Midcap"}]
        result = resolve_isin_to_scheme("INF000000000")
        assert result is not None
        assert result["scheme_code"] == 120503

    @patch("app.services.mfapi_service._get_scheme_list")
    @patch("app.services.mfapi_service.search_schemes")
    def test_no_match(self, mock_search, mock_list):
        mock_list.return_value = []
        mock_search.return_value = []
        assert resolve_isin_to_scheme("INF000000000") is None
