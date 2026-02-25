from __future__ import annotations

from typing import Any

import google.generativeai as genai

from ..core.config import GEMINI_API_KEY


class GeminiNotConfigured(Exception):
    pass


# Tool declarations for Gemini function calling
TOOL_DECLARATIONS = [
    {
        "name": "get_price",
        "description": "Get the current price for an Indian stock (NSE/BSE). Use when user asks about a specific stock's price.",
        "parameters": {
            "type": "object",
            "properties": {
                "symbol": {"type": "string", "description": "Stock symbol, e.g. RELIANCE, TCS, INFY"},
                "exchange": {"type": "string", "description": "Exchange: NSE or BSE", "enum": ["NSE", "BSE"]},
            },
            "required": ["symbol"],
        },
    },
    {
        "name": "get_mf_nav",
        "description": "Get the latest NAV for a mutual fund scheme by its scheme code.",
        "parameters": {
            "type": "object",
            "properties": {
                "scheme_code": {"type": "integer", "description": "MFAPI scheme code"},
            },
            "required": ["scheme_code"],
        },
    },
    {
        "name": "get_news",
        "description": "Get recent news for a stock symbol or topic.",
        "parameters": {
            "type": "object",
            "properties": {
                "query": {"type": "string", "description": "Search query for news, e.g. stock symbol or topic"},
            },
            "required": ["query"],
        },
    },
    {
        "name": "search_instrument",
        "description": "Search for stocks or mutual fund schemes by name or symbol.",
        "parameters": {
            "type": "object",
            "properties": {
                "query": {"type": "string", "description": "Search query"},
            },
            "required": ["query"],
        },
    },
]


def generate_response(system_prompt: str, user_prompt: str) -> str:
    if not GEMINI_API_KEY:
        raise GeminiNotConfigured("GEMINI_API_KEY is not configured")
    genai.configure(api_key=GEMINI_API_KEY)
    model = genai.GenerativeModel(
        model_name="gemini-1.5-flash",
        system_instruction=system_prompt,
    )
    result = model.generate_content(user_prompt)
    if not result or not result.text:
        return ""
    return result.text.strip()


def generate_response_with_tools(
    system_prompt: str,
    user_prompt: str,
    tool_executor: Any = None,
) -> tuple[str, list[dict]]:
    """Generate a response using Gemini function calling.

    Returns (text_reply, widgets) where widgets are structured data
    extracted from tool results.
    """
    if not GEMINI_API_KEY:
        raise GeminiNotConfigured("GEMINI_API_KEY is not configured")

    genai.configure(api_key=GEMINI_API_KEY)

    tools = genai.protos.Tool(
        function_declarations=[
            genai.protos.FunctionDeclaration(
                name=t["name"],
                description=t["description"],
                parameters=genai.protos.Schema(**_convert_schema(t["parameters"])),
            )
            for t in TOOL_DECLARATIONS
        ]
    )

    model = genai.GenerativeModel(
        model_name="gemini-1.5-flash",
        system_instruction=system_prompt,
        tools=[tools],
    )

    chat = model.start_chat()
    response = chat.send_message(user_prompt)

    widgets: list[dict] = []
    max_rounds = 3
    round_count = 0

    while round_count < max_rounds:
        # Check if response has function calls
        function_calls = _extract_function_calls(response)
        if not function_calls:
            break

        round_count += 1
        parts = []
        for fc in function_calls:
            if tool_executor:
                result_data = tool_executor(fc["name"], fc["args"])
                # Build widgets from tool results
                widget = _build_widget(fc["name"], fc["args"], result_data)
                if widget:
                    widgets.append(widget)
                parts.append(
                    genai.protos.Part(
                        function_response=genai.protos.FunctionResponse(
                            name=fc["name"],
                            response={"result": result_data},
                        )
                    )
                )

        response = chat.send_message(parts)

    text = ""
    if response and response.text:
        text = response.text.strip()

    return text, widgets


def _extract_function_calls(response) -> list[dict]:
    calls = []
    if not response or not response.candidates:
        return calls
    for candidate in response.candidates:
        if not candidate.content or not candidate.content.parts:
            continue
        for part in candidate.content.parts:
            if part.function_call and part.function_call.name:
                args = {}
                if part.function_call.args:
                    for key, value in part.function_call.args.items():
                        args[key] = value
                calls.append({"name": part.function_call.name, "args": args})
    return calls


def _convert_schema(schema: dict) -> dict:
    """Convert JSON Schema dict to genai.protos.Schema-compatible dict."""
    type_map = {
        "object": genai.protos.Type.OBJECT,
        "string": genai.protos.Type.STRING,
        "integer": genai.protos.Type.NUMBER,
        "number": genai.protos.Type.NUMBER,
        "boolean": genai.protos.Type.BOOLEAN,
        "array": genai.protos.Type.ARRAY,
    }

    result: dict[str, Any] = {"type_": type_map.get(schema.get("type", "object"), genai.protos.Type.OBJECT)}

    if "properties" in schema:
        props = {}
        for key, val in schema["properties"].items():
            prop: dict[str, Any] = {"type_": type_map.get(val.get("type", "string"), genai.protos.Type.STRING)}
            if "description" in val:
                prop["description"] = val["description"]
            if "enum" in val:
                prop["enum"] = val["enum"]
            props[key] = genai.protos.Schema(**prop)
        result["properties"] = props

    if "required" in schema:
        result["required"] = schema["required"]

    return result


def _build_widget(tool_name: str, args: dict, result: Any) -> dict | None:
    """Build a structured widget from tool results."""
    if not result:
        return None

    if tool_name == "get_price" and isinstance(result, dict) and result.get("price"):
        return {
            "type": "ticker_card",
            "data": {
                "symbol": result.get("symbol") or args.get("symbol"),
                "price": result.get("price"),
                "previous_close": result.get("previous_close"),
            },
        }

    if tool_name == "get_mf_nav" and isinstance(result, dict) and result.get("nav"):
        return {
            "type": "ticker_card",
            "data": {
                "scheme_name": result.get("scheme_name"),
                "scheme_code": result.get("scheme_code") or args.get("scheme_code"),
                "nav": result.get("nav"),
                "fund_house": result.get("fund_house"),
            },
        }

    if tool_name == "get_news" and isinstance(result, list) and result:
        return {
            "type": "news_card",
            "data": {
                "query": args.get("query"),
                "items": result[:5],
            },
        }

    return None
