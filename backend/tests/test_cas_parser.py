from __future__ import annotations

from unittest.mock import patch

from app.services.cas_parser import _flatten_records, _normalize_records


class TestFlattenRecords:
    def test_flat_dict_with_isin(self):
        record = {"isin": "INE002A01018", "qty": 10}
        result = _flatten_records(record)
        assert any(r["isin"] == "INE002A01018" for r in result)

    def test_nested_list(self):
        data = [{"isin": "INE009A01021", "qty": 5}]
        result = _flatten_records(data)
        assert len(result) >= 1

    def test_deeply_nested(self):
        data = {"folios": [{"schemes": [{"isin": "INE001A01036", "units": 100}]}]}
        result = _flatten_records(data)
        assert any(r.get("isin") == "INE001A01036" for r in result)

    def test_empty(self):
        assert _flatten_records({}) == []
        assert _flatten_records([]) == []


class TestNormalizeRecords:
    def test_basic(self):
        records = [{"isin": "INE002A01018", "qty": 10, "asset_type": "equity", "avg_cost": 100}]
        result = _normalize_records(records)
        assert len(result) == 1
        assert result[0]["isin"] == "INE002A01018"

    def test_alternate_keys(self):
        records = [{"ISIN": "INE009A01021", "quantity": 5, "type": "equity", "average_cost": 50}]
        result = _normalize_records(records)
        assert result[0]["isin"] == "INE009A01021"
        assert result[0]["qty"] == 5

    def test_skips_empty(self):
        records = [{"other_field": "value"}]
        result = _normalize_records(records)
        assert result == []
