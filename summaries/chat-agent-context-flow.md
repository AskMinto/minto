# Chat Agent Context Flow

How context is assembled and passed to the Minto chat agent.

## End-to-End Flow

```
User sends message
  → Save to chat_messages table
  → Load context (holdings, memory, chat history, risk profile)
  → Build system prompt + user prompt
  → Create Agno Agent (Gemini 3 Flash Preview)
  → Agent runs (sync or streaming), makes tool calls
  → Extract widgets from tool results
  → Apply guardrails (check for blocked phrases)
  → Save assistant reply to DB with widget metadata
  → Store exchange in Mem0 memory
  → Return reply + widgets to frontend
```

## 1. System Prompt (`_build_system_prompt()` in `chats.py`)

The system prompt defines who Minto is and what rules to follow.

**Base identity:**
> "You are Minto, a portfolio assistant for Indian retail investors. You help users understand their portfolio, explain market concepts, and provide data-driven insights."

**Critical instruction:**
- Agent does NOT know current prices/NAVs — must call tools to get them.
- Never state a price without calling `get_current_stock_price` or `_get_mf_nav` first.

**Rules:**
- Never give buy/sell instructions or specific investment recommendations.
- Always use Indian market context (NSE, BSE, Nifty 50, Sensex).
- Explain concepts simply using relatable analogies.
- When asked about news/price moves, call `get_company_news` first.
- Keep responses concise: 3–5 sentences unless asked for detail.
- Never ask the user if they want you to look something up — just do it.
- Never add disclaimers (the app already shows one).

**Risk profile** (conditional): If the user has completed the risk quiz:
> "The user's risk profile is: {level} (score: {score}). Tailor your language and examples to this risk level."

Fetched from the `risk_profiles` Supabase table.

## 2. User Prompt (`_build_user_prompt()` in `chats.py`)

The user prompt is a composite string:

```
{memory_block}                              ← optional, if Mem0 returns memory

Portfolio summary: Invested: ₹X, P&L: Y%
Holdings:
  [MF] HDFC Flexi Cap Fund (scheme_code=118955)
  [EQ] RELIANCE
  [EQ] HDFCBANK
  ...
(For [EQ] holdings: use get_current_stock_price with .NS suffix.
 For [MF] holdings: use _get_mf_nav with the scheme_code.)

User question: {message}
```

### Holdings Snapshot

- Source: `compute_portfolio()` which enriches raw holdings with current prices, values, PnL.
- Only the **top 10 holdings** (by value, descending) are included.
- **Prices/values are deliberately excluded** from the prompt text to prevent hallucination — only names and type labels are shown.
- Mutual funds: `[MF] {scheme_name} (scheme_code={code})`
- Equities: `[EQ] {symbol}` (falls back to ISIN or "Unknown")
- The `totals` dict provides only `invested` and `pnl_pct` in the summary line.

### Memory Block

If `get_memory(user_id)` returns a non-empty string:
```
Previous conversation context:
{memory}
```

## 3. Chat History (`_load_chat_context()` in `chats.py`)

- **Last 10 messages** fetched from `chat_messages`, ordered by `created_at` desc, then reversed to chronological.
- The **most recent message is excluded** (it's the user's current message, just inserted).
- Only `role` and `content` fields are used.

### Cleaning:
- Disclaimer patterns are **stripped** from assistant messages to prevent the model from learning to repeat them.
- **Long assistant messages are truncated** to 500 characters with `"..."` appended.

### How it's passed:
- Converted to `[{"role": "...", "content": "..."}]` format.
- Set on `agent.additional_input` — an Agno property that prepends context messages before the current user prompt.

## 4. Agent Construction (`_build_agent()` in `research_agent.py`)

| Setting | Value |
|---------|-------|
| Model | `gemini-3-flash-preview`, temperature 0.3 |
| System prompt | Passed as `description` |
| Instructions | `AGENT_INSTRUCTIONS` (detailed behavioral rules) |
| Markdown | `False` |
| Tool call limit | 12 |
| Datetime in context | `True`, timezone `Asia/Kolkata` (IST) |

### Tools Available

| Tool | Source | Purpose |
|------|--------|---------|
| `get_current_stock_price` | YFinanceTools | Equity prices (needs .NS/.BO suffix) |
| `get_company_info` | YFinanceTools | Company fundamentals |
| `get_company_news` | YFinanceTools | Stock-specific news |
| `get_analyst_recommendations` | YFinanceTools | Analyst ratings |
| `read_article` | Newspaper4kTools | Full article content (max 3000 chars) |
| `web_search` | DuckDuckGoTools | General web search (5 results, region in-en) |
| `search_news` | DuckDuckGoTools | News search |
| `_get_mf_nav` | Custom | Mutual fund NAV via MFAPI |
| `_search_instrument` | Custom | Search both YFinance and MFAPI |
| `_get_market_overview` | Custom | Nifty 50, Sensex, Bank Nifty indices |

### AGENT_INSTRUCTIONS (key points)

- Identity: "Minto — a chill, sharp portfolio assistant. Makes finance fun and easy."
- Must use tools for all price/NAV lookups — never guess.
- Tool selection strategy:
  - Stock news → `get_company_news`
  - Macro/broad topics → `web_search`
  - Breaking news → `search_news`
  - Full article → `read_article`
  - Market indices → `_get_market_overview`
  - Complex questions → use MULTIPLE tools
- Research process: search first → read articles → cross-reference with portfolio → synthesize.
- Response rules: 3–5 sentences, lead with insight, use ₹ and Indian context.

## 5. Memory (Mem0)

### Retrieval (`get_memory`)
- GET `{MEM0_BASE_URL}/memory?user_id={user_id}`
- Returns stored conversation context as a string.
- Embedded in the user prompt as `"Previous conversation context:\n{memory}"`.

### Storage (`add_memory`)
- POST `{MEM0_BASE_URL}/memory` with `{"user_id", "text", "metadata"}`
- Called **after** the assistant reply is saved.
- Text stored: `"User: {user_message}\nAssistant: {assistant_reply}"` — the full exchange.

## 6. Widget Extraction (`_extract_widgets()` in `research_agent.py`)

After the agent runs, tool execution results are scanned to build widgets:

| Widget | Source Tools | Data |
|--------|------------|------|
| `price_summary` | `get_current_stock_price`, `_get_mf_nav` | symbol, price, change, change_pct, type |
| `news_summary` | `get_company_news` | title, link, publisher |

- For equities, `previous_close` is fetched via `get_quote()` to calculate day change.
- Both are deduplicated (by symbol/scheme_code for prices, by title for news).
- Frontend aggregates all price/news items across multiple widgets into single combined views.

## 7. Guardrails (`guardrails.py`)

**15 blocked regex patterns:**
`strong buy`, `strong sell`, `target price`, `entry price`, `exit price`, `stop.?loss`, `you should buy/sell`, `you must buy/sell`, `I recommend buying/selling`, `buy (this|it|now|today|immediately)`, `sell (this|it|now|today|immediately)`, `accumulate`

**Flow:**
1. If `contains_blocked_phrase(reply)` → replace entire reply with safe response + disclaimer, clear widgets.
2. If no blocked phrases → reply and widgets pass through unchanged.

## 8. Diagram

```
┌──────────────────────────────────────────────────────┐
│                    User Message                       │
└──────────────┬───────────────────────────────────────┘
               │
               ▼
┌──────────────────────────────────────────────────────┐
│              Save to chat_messages                    │
└──────────────┬───────────────────────────────────────┘
               │
               ▼
┌──────────────────────────────────────────────────────┐
│           Load Context (parallel)                     │
│                                                       │
│  ┌─────────────┐  ┌──────────┐  ┌────────────────┐  │
│  │  Holdings    │  │  Mem0    │  │  Chat History  │  │
│  │  (top 10)   │  │  Memory  │  │  (last 10 msg) │  │
│  └──────┬──────┘  └────┬─────┘  └───────┬────────┘  │
│         │              │                │            │
│  ┌──────┴──────┐       │                │            │
│  │ Risk Profile│       │                │            │
│  └──────┬──────┘       │                │            │
└─────────┼──────────────┼────────────────┼────────────┘
          │              │                │
          ▼              ▼                ▼
┌──────────────────────────────────────────────────────┐
│              Build Prompts                            │
│                                                       │
│  System Prompt = identity + rules + risk profile      │
│  User Prompt   = memory + holdings + question         │
│  History       = cleaned past messages                │
└──────────────┬───────────────────────────────────────┘
               │
               ▼
┌──────────────────────────────────────────────────────┐
│           Agno Agent (Gemini 3 Flash)                 │
│                                                       │
│  description  = system prompt                         │
│  instructions = AGENT_INSTRUCTIONS                    │
│  additional_input = chat history                      │
│  user message = user prompt                           │
│  datetime     = IST (Asia/Kolkata)                    │
│  tools        = YFinance, DuckDuckGo, Newspaper4k,   │
│                 MF NAV, Instrument Search,            │
│                 Market Overview                       │
│  tool_call_limit = 12                                 │
└──────────────┬───────────────────────────────────────┘
               │
               ▼
┌──────────────────────────────────────────────────────┐
│         Extract Widgets from Tool Results             │
│                                                       │
│  price_summary: symbol, price, change, change_pct    │
│  news_summary:  title, link, publisher                │
└──────────────┬───────────────────────────────────────┘
               │
               ▼
┌──────────────────────────────────────────────────────┐
│              Apply Guardrails                         │
│                                                       │
│  Check 15 blocked patterns                            │
│  If blocked → safe response, clear widgets            │
│  If safe → pass through                               │
└──────────────┬───────────────────────────────────────┘
               │
               ▼
┌──────────────────────────────────────────────────────┐
│         Save Reply + Store Memory                     │
│                                                       │
│  Save to chat_messages with widget metadata           │
│  POST to Mem0: "User: ...\nAssistant: ..."           │
└──────────────┬───────────────────────────────────────┘
               │
               ▼
┌──────────────────────────────────────────────────────┐
│              Return to Frontend                       │
│                                                       │
│  { reply, widgets: [price_summary, news_summary] }   │
└──────────────────────────────────────────────────────┘
```
