# PRD: Indian Portfolio Tax Harvesting Analyser
**Status:** Draft v1.0  
**Stack:** Next.js (existing) · Agno Multi-Agent Framework · Python backend  
**Date:** March 2026

---

## 1. Overview

A conversational page inside the existing Next.js app that guides users through uploading their financial documents, automatically extracts and normalises holding and transaction data, then produces an actionable Indian tax-harvesting analysis — identical in depth to the manually produced example (LTCG/STCG breakdown, loss harvesting opportunities, broker-specific nuances, exemption utilisation).

The entire analysis pipeline runs as an Agno multi-agent system exposed as a streaming API endpoint that the existing chat component consumes.

---

## 2. Goals

| Goal | Success metric |
|---|---|
| Collect just enough user context (income, broker, account type) before asking for documents | User reaches document-upload step in ≤ 3 conversation turns |
| Parse every major Indian broker/registrar format | CAS PDF, Zerodha Console XLSX, Groww CSV, CAMS/KFintech CAS — all parse without manual intervention |
| Handle password-protected PDFs transparently | User is prompted for password; pipeline decrypts and continues |
| Produce analysis indistinguishable from a CA's first-pass review | LTCG/STCG split, FOF debt rules, ELSS lock-in detection, exemption headroom, specific sell/hold/harvest actions |
| Plug into existing chat UI with zero frontend changes beyond a new route | Reuse existing `ChatMessage`, `MessageList`, `FileUpload` components |

---

## 3. User Journey (Conversation Flow)

```
┌─────────────────────────────────────────────────────────┐
│  Step 1 — Income & tax context                          │
│  Bot asks: income slab, old vs new regime, FY           │
├─────────────────────────────────────────────────────────┤
│  Step 2 — Broker & account discovery                    │
│  Bot asks: which brokers/AMCs, demat vs physical,       │
│  NRI/resident, any F&O activity                         │
├─────────────────────────────────────────────────────────┤
│  Step 3 — Document checklist (generated per user)       │
│  Bot lists exactly which files are needed + where       │
│  to download them, with direct download links           │
├─────────────────────────────────────────────────────────┤
│  Step 4 — File upload                                   │
│  User uploads PDFs / XLSXs. Bot detects password-       │
│  protected files and prompts for passwords inline.      │
├─────────────────────────────────────────────────────────┤
│  Step 5 — Processing (streamed status updates)          │
│  Agents parse, normalise, and cross-validate data.      │
│  Progress shown in existing chat bubble style.          │
├─────────────────────────────────────────────────────────┤
│  Step 6 — Analysis output                              │
│  Rich dashboard card (same visual as example above)     │
│  streamed into chat. Each action is a clickable card.   │
└─────────────────────────────────────────────────────────┘
```

---

## 4. Agent Architecture (Agno)

### 4.1 Agent Roster

```
OrchestratorAgent
├── IntakeAgent          ← conversation, collects context
├── DocumentRouterAgent  ← detects file type, extracts text
│   ├── PDFAgent         ← handles CAS PDFs, password unlock
│   ├── ExcelAgent       ← Zerodha XLSX, taxpnl, holdings
│   └── CSVAgent         ← Groww, other CSV exports
├── NormalisationAgent   ← merges into unified schema
├── TaxComputationAgent  ← LTCG/STCG/FOF/ELSS rules engine
└── HarvestingAgent      ← generates actionable recommendations
```

### 4.2 OrchestratorAgent

```python
from agno.agent import Agent
from agno.models.openai import OpenAIChat  # or Anthropic/Gemini

orchestrator = Agent(
    name="TaxOrchestrator",
    model=OpenAIChat(id="gpt-4o"),
    team=[intake, doc_router, normalisation, tax_computation, harvesting],
    instructions="""
    You coordinate a tax harvesting analysis for Indian retail investors.
    Follow this strict sequence:
    1. Use IntakeAgent to collect income slab, regime, and broker list.
    2. Generate a document checklist using the broker list.
    3. Wait for file uploads. Route each file to DocumentRouterAgent.
    4. Once all files processed, call NormalisationAgent.
    5. Call TaxComputationAgent, then HarvestingAgent.
    6. Stream the final structured analysis back.
    Never skip ahead — do not ask for files before completing step 1-2.
    """,
    markdown=True,
    stream=True,
)
```

### 4.3 IntakeAgent

Collects exactly these fields before proceeding:

| Field | Options | Why needed |
|---|---|---|
| `financial_year` | FY 2025-26 (default) | Period for P&L calculation |
| `income_slab` | `< 5L / 5-10L / 10-15L / 15-30L / > 30L` | STCG slab rate calculation |
| `tax_regime` | `Old / New` | Determines 80C relevance, surcharge |
| `resident_status` | `Resident / NRI` | TDS thresholds differ |
| `brokers` | `Zerodha / Groww / Kite / ICICI Direct / HDFC Sec / Other` | Controls which documents to request |
| `has_fno` | `Yes / No` | F&O is speculative business income — different treatment |
| `has_mf_outside_demat` | `Yes / No` | Triggers CAS PDF request |

```python
intake_agent = Agent(
    name="IntakeAgent",
    model=OpenAIChat(id="gpt-4o"),
    instructions="""
    Collect user context through a friendly conversation.
    Ask all required fields in at most 2 messages.
    Present options as a numbered list for each field.
    Once all fields collected, output a JSON block tagged <intake_complete>.
    """,
)
```

### 4.4 DocumentRouterAgent

Receives uploaded file bytes + filename. Determines parser, handles passwords.

```python
from agno.tools import tool

@tool
def detect_file_type(filename: str, file_bytes: bytes) -> dict:
    """Returns {type: 'pdf'|'xlsx'|'csv', password_protected: bool}"""
    import fitz  # PyMuPDF
    import openpyxl, io
    
    if filename.endswith('.pdf'):
        doc = fitz.open(stream=file_bytes, filetype='pdf')
        return {"type": "pdf", "password_protected": doc.needs_pass}
    elif filename.endswith(('.xlsx', '.xlsm')):
        try:
            openpyxl.load_workbook(io.BytesIO(file_bytes))
            return {"type": "xlsx", "password_protected": False}
        except Exception:
            return {"type": "xlsx", "password_protected": True}
    elif filename.endswith('.csv'):
        return {"type": "csv", "password_protected": False}

doc_router = Agent(
    name="DocumentRouterAgent",
    tools=[detect_file_type],
    instructions="""
    For each uploaded file:
    1. Detect type and password status.
    2. If password protected, reply: "The file {filename} is password protected.
       Please enter the password to continue."
    3. Once password provided, pass to appropriate sub-agent.
    4. Return structured extraction results.
    """,
)
```

### 4.5 PDFAgent — CAS PDF Parser

CAS PDFs from CAMS/KFintech are the primary mutual fund source.

```python
import fitz  # PyMuPDF
import re

def extract_cas_pdf(file_bytes: bytes, password: str = None) -> dict:
    doc = fitz.open(stream=file_bytes, filetype='pdf')
    
    if doc.needs_pass:
        if not password or not doc.authenticate(password):
            raise ValueError("INCORRECT_PASSWORD")
    
    full_text = "\n".join(page.get_text() for page in doc)
    
    # Parse portfolio summary block
    portfolio = parse_portfolio_summary(full_text)
    # Parse individual fund transactions
    transactions = parse_fund_transactions(full_text)
    # Parse folio metadata (ISIN, scheme name, registrar)
    folios = parse_folio_metadata(full_text)
    
    return {
        "source": "CAS",
        "period": extract_period(full_text),
        "portfolio": portfolio,
        "transactions": transactions,
        "folios": folios,
    }

def parse_fund_transactions(text: str) -> list[dict]:
    """
    Parses date, transaction type, amount, units, price, balance
    from the standardised CAMS/KFintech CAS format.
    Handles: Purchase, Redemption, Switch In/Out, STP, SWP, STT lines.
    """
    pattern = re.compile(
        r'(\d{2}-\w{3}-\d{4})\s+(Purchase|Redemption|Switch|STP|SWP)[^\n]*'
        r'\s+([\d,\.]+)\s+([\d,\.]+)\s+([\d,\.]+)\s+([\d,\.]+)'
    )
    return [m.groupdict() for m in pattern.finditer(text)]
```

**Password-protected CAS flow:**
1. Bot detects `doc.needs_pass == True`
2. Sends message: *"Your CAS PDF is password protected. Typically the password is your PAN (e.g. ABCDE1234F) or date of birth (DDMMYYYY). Please enter it:"*
3. User replies with password in chat
4. Agent retries `doc.authenticate(password)` — loops with friendly error on failure.

### 4.6 ExcelAgent — Zerodha Console XLSX Parser

Zerodha's taxpnl and holdings exports are multi-sheet XLSXs with a specific sparse layout (data starts at a variable row after several blank rows and metadata rows).

```python
import pandas as pd
import openpyxl
import msoffcrypto, io

def decrypt_xlsx(file_bytes: bytes, password: str) -> bytes:
    """Decrypt password-protected XLSX using msoffcrypto-tool."""
    encrypted = io.BytesIO(file_bytes)
    decrypted = io.BytesIO()
    office_file = msoffcrypto.OfficeFile(encrypted)
    office_file.load_key(password=password)
    office_file.decrypt(decrypted)
    return decrypted.getvalue()

def parse_zerodha_taxpnl(file_bytes: bytes) -> dict:
    """
    Reads Zerodha taxpnl XLSX.
    Sheet: 'Tradewise Exits from YYYY-MM-DD'
    Data layout: sparse rows, section headers mixed with data.
    Sections: Equity-Intraday, Equity-Short Term, Equity-Long Term,
              Mutual Funds, F&O, Currency, Commodity
    """
    wb = openpyxl.load_workbook(io.BytesIO(file_bytes), read_only=True)
    
    results = {}
    for sheet_name in wb.sheetnames:
        ws = wb[sheet_name]
        rows = [row for row in ws.iter_rows(values_only=True) 
                if any(v is not None for v in row)]
        results[sheet_name] = parse_sparse_sheet(rows)
    
    return results

def parse_sparse_sheet(rows: list) -> dict:
    """
    Zerodha sheets: non-null rows only. Section headers are single-cell rows.
    Data rows follow a header row containing column names like 
    ['Symbol', 'ISIN', 'Entry Date', 'Exit Date', ...].
    """
    sections = {}
    current_section = None
    current_headers = None
    
    for row in rows:
        non_null = [v for v in row if v is not None]
        if len(non_null) == 1 and isinstance(non_null[0], str):
            # Section header (e.g. "Equity - Short Term")
            current_section = non_null[0]
            sections[current_section] = []
        elif non_null and non_null[0] == 'Symbol':
            # Column header row
            current_headers = [v for v in row if v is not None]
        elif current_headers and len(non_null) >= 5:
            # Data row
            sections.setdefault(current_section, []).append(
                dict(zip(current_headers, non_null))
            )
    return sections

def parse_zerodha_holdings(file_bytes: bytes) -> dict:
    """
    Holdings XLSX has sheets: Equity, Mutual Funds, Combined.
    Summary block + individual holding rows.
    Columns: Symbol, ISIN, Quantity, Average Price, 
             Previous Closing Price, Unrealized P&L
    """
    # Similar sparse-row approach
    ...
```

### 4.7 NormalisationAgent

Merges outputs from all parsers into a single unified schema.

```python
# Unified trade schema
TRADE_SCHEMA = {
    "instrument_name": str,
    "isin": str,
    "instrument_type": str,      # equity | equity_mf | debt_mf | fof | elss | etf | fno
    "holding_period_days": int,
    "term": str,                  # short | long
    "entry_date": date,
    "exit_date": date,
    "buy_value": float,
    "sell_value": float,
    "profit": float,
    "taxable_profit": float,
    "source": str,                # CAS | Zerodha | Groww
}

# Unified open position schema
POSITION_SCHEMA = {
    "instrument_name": str,
    "isin": str,
    "instrument_type": str,
    "quantity": float,
    "avg_price": float,
    "current_price": float,
    "unrealized_pnl": float,
    "unrealized_pnl_pct": float,
    "purchase_date": date,        # earliest lot (for LTCG eligibility)
    "lock_in_expiry": date,       # ELSS only
    "is_locked": bool,
}
```

The NormalisationAgent also applies enrichment rules:

- **Instrument type classification** from ISIN prefix + scheme name keywords (ELSS, Index Fund, FOF, Gold, ETF)
- **Holding period** = exit_date − entry_date (or today − purchase_date for open positions)
- **LTCG eligibility:** equity/equity MF > 12 months; debt FOF > 24 months (post Apr 2023 rules)
- **FOF detection:** scheme names containing "Fund of Fund", "Gold Savings", "US", "International"

### 4.8 TaxComputationAgent

Applies Indian tax rules as of Finance Act 2024.

```python
TAX_RULES = {
    "equity_stcg_rate": 0.20,           # post Jul 2024 Budget
    "equity_ltcg_rate": 0.125,          # post Jul 2024 Budget
    "ltcg_exemption_limit": 125000,     # ₹1.25 lakh per year
    "equity_mf_stcg_rate": 0.20,
    "equity_mf_ltcg_rate": 0.125,
    "fof_debt_slab_rate": True,         # purchased after Apr 1 2023: slab rate
    "elss_lock_in_years": 3,
    "stcl_setoff_priority": ["stcg", "ltcg"],  # STCL can offset both
    "ltcl_setoff_priority": ["ltcg"],          # LTCL only offsets LTCG
    "loss_carryforward_years": 8,
}

def compute_tax_liability(
    realised_trades: list[dict],
    open_positions: list[dict],
    income_slab: str,
    ltcg_used_so_far: float = 0,
) -> dict:
    """
    Returns:
    - realised_ltcg, realised_stcg, realised_ltcl, realised_stcl
    - net_taxable_ltcg (after exemption and set-off)
    - net_taxable_stcg (after set-off)
    - ltcg_tax, stcg_tax, total_tax
    - exemption_remaining (how much more LTCG can be booked tax-free)
    - open_positions_ltcg_potential (unrealised LTCG on eligible positions)
    - open_positions_loss_potential (unrealised losses on harvestable positions)
    """
    ...
```

### 4.9 HarvestingAgent

Generates a ranked list of specific actions.

```python
def generate_harvest_actions(
    computation: dict,
    open_positions: list[dict],
    days_remaining_in_fy: int,
) -> list[dict]:
    """
    Action types:
    - HARVEST_LOSS: sell position with unrealised loss to create tax-deductible loss
    - BOOK_LTCG_EXEMPTION: sell + repurchase to use remaining ₹1.25L exemption
    - AVOID_SELL: flag positions where selling now would be suboptimal (e.g. FOF < 24m)
    - UPGRADE_TERM: flag positions close to LTCG threshold (e.g. 11.5 months held)
    - ELSS_REMINDER: ELSS lock-in status
    
    Each action includes:
    - action_type, priority (HIGH/MEDIUM/LOW)
    - instrument_name, current_pnl
    - tax_saving_estimate (concrete ₹ amount)
    - rationale (1-2 sentences)
    - suggested_deadline (days_remaining pressure)
    - caveat (risks, wash-sale note, etc.)
    """
    actions = []
    
    # Priority 1: Loss harvesting (immediate cash saving)
    for pos in open_positions:
        if pos['unrealized_pnl'] < 0 and not pos['is_locked']:
            loss = abs(pos['unrealized_pnl'])
            if pos['term'] == 'short':
                tax_saving = loss * TAX_RULES['equity_stcg_rate']
            else:
                tax_saving = loss * TAX_RULES['equity_ltcg_rate']
            actions.append({
                "action_type": "HARVEST_LOSS",
                "priority": "HIGH" if tax_saving > 1000 else "MEDIUM",
                "tax_saving_estimate": tax_saving,
                ...
            })
    
    # Priority 2: LTCG exemption booking
    exemption_remaining = computation['exemption_remaining']
    if exemption_remaining > 5000:
        for pos in open_positions:
            if pos['term'] == 'long' and pos['unrealized_pnl'] > 0:
                bookable = min(pos['unrealized_pnl'], exemption_remaining)
                actions.append({
                    "action_type": "BOOK_LTCG_EXEMPTION",
                    "priority": "HIGH",
                    "tax_saving_estimate": bookable * TAX_RULES['equity_ltcg_rate'],
                    ...
                })
    
    return sorted(actions, key=lambda x: -x['tax_saving_estimate'])
```

---

## 5. API Design

### 5.1 Endpoints

```
POST /api/tax-harvest/session
→ Creates a session, returns session_id

POST /api/tax-harvest/message
Body: { session_id, message, files?: [{ name, data: base64, password?: str }] }
→ SSE stream of { type, content } events

GET  /api/tax-harvest/session/:id/analysis
→ Returns final structured analysis JSON
```

### 5.2 SSE Event Types

```typescript
type TaxHarvestEvent =
  | { type: "text";       content: string }           // chat bubble text
  | { type: "status";     content: string }           // "Parsing Zerodha XLSX..."
  | { type: "password_required"; filename: string }   // triggers inline password prompt
  | { type: "analysis";   content: AnalysisPayload }  // final dashboard card
  | { type: "error";      content: string }
```

### 5.3 AnalysisPayload Schema

```typescript
interface AnalysisPayload {
  tax_year: string;
  income_slab: string;
  
  realised: {
    ltcg: number;
    stcg: number;
    ltcl: number;
    stcl: number;
    net_taxable_ltcg: number;
    net_taxable_stcg: number;
    estimated_tax: number;
    exemption_used: number;
    exemption_remaining: number;
  };
  
  open_positions: OpenPosition[];
  
  harvest_actions: HarvestAction[];   // ranked by tax_saving_estimate desc
  
  warnings: string[];   // e.g. "F&O activity detected — consult CA for business income treatment"
}
```

---

## 6. Frontend Integration

### 6.1 New Route

```
/tax-harvest
```

This is a new page in the existing Next.js app. It reuses:
- `<ChatMessage>` — renders bot text bubbles and the analysis card
- `<MessageList>` — scrollable chat thread
- `<FileUpload>` — existing multi-file upload component
- Existing SSE/streaming hook (or `useChat` from Vercel AI SDK if already in use)

No new chat primitives needed.

### 6.2 Password Prompt Component

The only new UI element. Renders inline when `password_required` event arrives:

```tsx
// components/tax-harvest/PasswordPrompt.tsx
interface Props {
  filename: string;
  onSubmit: (password: string) => void;
}

export function PasswordPrompt({ filename, onSubmit }: Props) {
  const [value, setValue] = useState('');
  return (
    <div className="inline-flex items-center gap-2 p-3 rounded-lg border 
                    border-border-tertiary bg-background-secondary text-sm">
      <span className="text-text-secondary">🔒 {filename} — enter password:</span>
      <input
        type="password"
        className="border rounded px-2 py-1 text-sm w-40"
        value={value}
        onChange={e => setValue(e.target.value)}
        onKeyDown={e => e.key === 'Enter' && onSubmit(value)}
        autoFocus
      />
      <button onClick={() => onSubmit(value)} className="btn-sm">Unlock</button>
    </div>
  );
}
```

### 6.3 Analysis Card Component

Renders the structured `AnalysisPayload` as the visual dashboard seen above. Already designed — implement using Tailwind classes matching existing app style. Key sub-components:

- `<MetricGrid>` — summary numbers (LTCG, STCG, estimated tax)
- `<PositionTable>` — open holdings with unrealised P&L
- `<HarvestActionCard>` — each action as colour-coded card (red = loss harvest, green = LTCG book, amber = hold/wait)
- `<TaxBreakdownTable>` — set-off arithmetic

---

## 7. Document Checklist Logic

When IntakeAgent has `brokers`, it generates a personalised checklist:

| Broker/Source | Document | Where to download |
|---|---|---|
| Zerodha | Tax P&L XLSX | Console → Reports → Tax P&L → Download XLSX |
| Zerodha | Holdings XLSX | Console → Portfolio → Holdings → Download |
| Any MF (non-demat) | CAS PDF | [camsonline.com](https://www.camsonline.com) → Investor Services → SOA |
| Any MF (via CAMS) | CAS PDF | CAMS mailback (email registered with folio) |
| Groww | Capital Gains report | Groww app → Stocks → P&L → Download |
| ICICI Direct | Tax P&L | ICICIDirect → Reports → Tax → Capital Gains |

The bot message includes the exact download path and notes that CAS PDFs often arrive by email to the registered address.

---

## 8. Edge Cases & Handling

| Edge case | Handling |
|---|---|
| Password-protected CAS PDF | PyMuPDF detects, agent prompts, retries with password |
| Password-protected XLSX | msoffcrypto-tool decrypts, passes to openpyxl |
| CAS with multiple folios (same PAN) | NormalisationAgent deduplicates by ISIN + purchase date |
| Partial FY (user joined broker mid-year) | TaxComputationAgent marks affected P&L as "partial year — verify" |
| FOF / gold funds (debt taxation post-2023) | Instrument type detection flags these; separate tax rate path |
| ELSS lock-in expiry check | Entry date + 3 years compared to today; flagged as locked or expiry date shown |
| NRI user | Warns about TDS implications; recommends CA review for DTAA |
| F&O detected | Warns this is business income; main analysis excludes F&O from capital gains; flags for CA |
| Groww "KYC NOT OK" in CAS | Logged as warning; positions still parsed |
| Missing cost basis (gifted/inherited units) | User prompted to enter cost manually |
| Multiple tax years in one file | Agent uses only current FY trades; shows prior year data as context |

---

## 9. Dependencies

```
# Python
agno                    # multi-agent framework
PyMuPDF (fitz)          # PDF parsing + decryption
openpyxl                # XLSX reading
msoffcrypto-tool        # XLSX decryption
pandas                  # data manipulation
python-dateutil         # date parsing
fastapi + uvicorn       # API server (or extend existing backend)
sse-starlette           # SSE streaming

# Node (existing, no additions needed)
# Next.js, Tailwind, existing chat components
```

---

## 10. Agent Prompts — Key Extracts

### IntakeAgent system prompt
```
You are a friendly Indian tax assistant beginning a portfolio analysis.
Your job is to collect exactly these fields before proceeding:
financial_year, income_slab, tax_regime, resident_status, brokers, has_fno, has_mf_outside_demat.

Ask naturally. Present options as short numbered lists.
Do NOT ask for documents yet.
When all fields are collected, output ONLY a JSON block:
<intake_complete>
{"financial_year": "2025-26", "income_slab": "10-15L", ...}
</intake_complete>
```

### HarvestingAgent system prompt
```
You are a senior Indian CA's tax harvesting assistant.
Tax rates: STCG equity 20%, LTCG equity 12.5%, LTCG exemption ₹1.25L/year.
FOF/Gold funds purchased after Apr 2023: taxed at income slab rate regardless of holding period.
ELSS: 3-year lock-in from unit allotment date.

For each open position, evaluate:
1. Should it be sold before 31 March to harvest a loss?
2. Can LTCG exemption headroom be used by selling + repurchasing?
3. Is there a minimum holding period worth waiting for (e.g. 11 months → wait 1 more)?

Return a JSON array of actions sorted by tax_saving_estimate descending.
Every action must include a concrete ₹ tax saving estimate.
Include a caveat for anything that requires CA verification.
```

---

## 11. Out of Scope (v1)

- Direct broker API integration (OAuth to Zerodha/Groww) — v2
- AY filing preparation (ITR form pre-fill) — v2
- NRI DTAA calculations — v2
- Crypto assets — v2
- Real-time price refresh during analysis — v2
- Multi-user / saved sessions — v2

---

## 12. Open Questions

1. **Backend language:** Existing backend is Python (FastAPI assumed) — confirm before wiring Agno agents as route handlers vs separate microservice.
2. **LLM choice for agents:** GPT-4o recommended for parsing accuracy; Claude Sonnet as fallback. Confirm API keys available.
3. **File size limits:** CAS PDFs can be 2–5 MB; Zerodha XLSXs 500 KB–2 MB. Confirm upload limits on existing backend.
4. **Session persistence:** Should analysis be saved per user account, or ephemeral per browser session?
5. **Disclaimer:** Legal disclaimer copy needed before launch ("not a substitute for CA advice").
