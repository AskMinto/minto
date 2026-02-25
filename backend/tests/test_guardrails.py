from __future__ import annotations

from app.services.guardrails import contains_blocked_phrase, safe_response, append_disclaimer


class TestContainsBlockedPhrase:
    def test_blocks_buy(self):
        assert contains_blocked_phrase("Should I buy RELIANCE?") is True

    def test_blocks_sell(self):
        assert contains_blocked_phrase("Time to sell TCS") is True

    def test_blocks_target_price(self):
        assert contains_blocked_phrase("What is the target price?") is True

    def test_blocks_recommend(self):
        assert contains_blocked_phrase("Can you recommend a stock?") is True

    def test_allows_safe_text(self):
        assert contains_blocked_phrase("What is the P/E ratio of HDFC Bank?") is False

    def test_allows_empty(self):
        assert contains_blocked_phrase("") is False

    def test_allows_none(self):
        assert contains_blocked_phrase(None) is False

    def test_case_insensitive(self):
        assert contains_blocked_phrase("BUY NOW") is True


class TestSafeResponse:
    def test_includes_disclaimer(self):
        result = safe_response("buy reliance")
        assert "can't provide buy/sell" in result
        assert "Minto provides informational insights" in result


class TestAppendDisclaimer:
    def test_appends(self):
        result = append_disclaimer("Hello")
        assert "Minto provides informational insights" in result

    def test_no_duplicate(self):
        text = "Hello\n\nMinto provides informational insights, not investment advice. Consider consulting a SEBI-registered advisor before making decisions."
        result = append_disclaimer(text)
        assert result == text
