# Tax Saver Page — Complete Flow Documentation

The Tax Saver page (`/tax-saver`) is a multi-phase workflow that collects a user's
investment documents, extracts structured data from them, and produces a personalised
FY 2025-26 capital gains tax and harvesting analysis powered by GPT-5.4.

---

## Architecture Overview

```
page.tsx
  └── useTaxSaver() hook          ← all state + API calls live here
        ├── Phase: loading
        ├── Phase: intake         → <IntakeScreen />
        ├── Phase: upload         → <DocUploadScreen />
        ├── Phase: analysing      → <AnalysisStream /> (streaming)
        └── Phase: done           → <AnalysisStream /> (done + follow-up chat)
```

Session state is persisted in Supabase (`tax_sessions` table, columns
`intake_answers` and `tax_docs`) so the user can close the browser and resume.
On mount, `loadSession()` checks for an existing session and fast-forwards to the
correct phase automatically.

---

## Phase 0 — Loading

**What happens:** `useTaxSaver` calls `GET /tax-saver/session` on mount.

| Condition | Result |
|---|---|
| No session / no intake_answers | → Phase: **intake** |
| Has intake_answers, no messages | → Phase: **upload** |
| Has intake_answers + messages | → Phase: **done** (resume previous analysis) |

The loading state shows three bouncing dots while this check completes.

---

## Phase 1 — Intake

**Component:** `intake-screen.tsx`
**API call:** `POST /tax-saver/intake`

The user answers 4 questions presented as chip/button selectors. No LLM involved —
answers are saved directly.

### Question 1 — Income slab
Chips: `< ₹5L` / `₹5–10L` / `₹10–15L` / `₹15–30L` / `> ₹30L`

Stored as `income_slab` in `intake_answers`. Used later to compute the slab rate
for non-equity gains (FoF, Gold MF, Debt MF).

### Question 2 — Tax regime
Cards: `New Regime` (default FY 2025-26) / `Old Regime` (with 80C, HRA deductions)

Stored as `tax_regime`. Used to determine 87A rebate eligibility and non-equity
tax rate.

### Question 3 — What do you invest in? (multi-select)
Split into two labelled groups:

**Mutual Funds section:**
- `Mutual Funds (via CAMS / KFintech)` — selecting this triggers a CAS PDF upload

**Stocks & ETFs section (demat brokers):**
- Zerodha, Groww, Upstox, Angel One, ICICI Direct, HDFC Securities, Other broker
- Each broker selected generates a Tax P&L + Holdings document pair

Selecting both MF and a broker generates all three document types.

### Question 4 — Carry-forward losses
Chips: `Yes, I do` / `No / Not sure`

If `Yes` → an ITR PDF upload is added to the document manifest.

### On submit
`POST /tax-saver/intake` is called with all four answers. The backend runs
`compute_doc_manifest()` — a pure Python function that applies the US-06 routing
matrix:

| Selected | Carry-forward | Documents required |
|---|---|---|
| Mutual Funds only | No | `cas_pdf` |
| Mutual Funds only | Yes | `cas_pdf`, `itr_pdf` |
| Broker only | No | `{broker}_taxpnl`, `{broker}_holdings` |
| Broker only | Yes | `{broker}_taxpnl`, `{broker}_holdings`, `itr_pdf` |
| Both | No | `cas_pdf`, `{broker}_taxpnl`, `{broker}_holdings` |
| Both | Yes | `cas_pdf`, `{broker}_taxpnl`, `{broker}_holdings`, `itr_pdf` |

The manifest is stored in `tax_sessions.tax_docs` as `{doc_key: null}`. Each
`null` value means not yet uploaded. The response includes per-document download
instructions for the detected brokers. Phase transitions to **upload**.

---

## Phase 2 — Document Upload

**Component:** `doc-upload-screen.tsx`
**API call:** `POST /tax-saver/upload/{doc_key}?password=xxx` (multipart)

### Progress bar
Shows `X of N uploaded`. The Analyse button appears once **any** document is
uploaded (not all — partial analysis is allowed).

### Per-document card
Each document in the manifest gets a collapsible card showing:
- Document label and description
- Step-by-step download instructions for that specific broker/source
- Password field (shown upfront for `cas_pdf` and `itr_pdf` which are always encrypted)
- File picker

### Password handling
- **CAS PDF / ITR PDF**: always encrypted. The password field is shown *before* the
  file picker so the user enters it first (avoids the two-round-trip upload→prompt
  flow).
- **Zerodha XLSX**: sometimes encrypted. The card shows a password field only *after*
  encryption is detected.
- **Groww, Upstox, others**: rarely encrypted. Password field shown only if needed.

### Upload flow (per document)

```
User selects file
  → DocCard.handleFileChange()
  → doUpload(file, password)
  → uploadDocument(docKey, file, password) in hook
  → POST /api/proxy/tax-saver/upload/{doc_key}?password=xxx
  → Next.js proxy route (maxDuration=300, streams response directly)
  → FastAPI sync def upload_document()
       ├── file.file.read()           — reads SpooledTemporaryFile synchronously
       ├── is_pdf_encrypted()         — pikepdf check
       ├── decrypt_pdf()              — pikepdf decryption (if encrypted)
       ├── [PDF]  extract_pdf_tables_sync()  — Gemini File API (30–90s, blocking)
       ├── [XLSX] extract_xlsx()             — openpyxl deterministic (instant)
       ├── [CSV]  raw decode
       ├── validate: len(extracted) > 50 chars
       ├── load_tax_saver_session()   — load existing tax_docs from Supabase
       ├── tax_docs[doc_key] = extracted_text
       ├── save_tax_saver_session()   — upsert tax_docs to Supabase
       └── return {status: "extracted", preview, all_uploaded, remaining_docs}
```

**PDF timeout recovery:** The Gemini File API can take 60–90s. The Next.js
proxy has `maxDuration=300` and streams the response body directly (no buffering).
If Cloud Run still drops the connection before the backend responds, the frontend
detects the non-ok status and calls `pollUntilDocUploaded()` — polling
`GET /tax-saver/docs` every 5 seconds for up to 2 minutes until the extracted
text appears in Supabase.

### Upload result states

| Status | Meaning | UI behaviour |
|---|---|---|
| `extracted` | Success | Card collapses, shows ✅ green badge + text preview |
| `needs_password` | Encrypted file, no password | Shows password field inline |
| `wrong_password` | Incorrect password | Shows error under password field |
| `likely_invalid` | Extracted text < 50 non-whitespace chars | Shows "wrong file" error |
| `error` | Any other failure | Shows error, triggers `onRefreshDocs` recovery check |

### Re-upload
Any uploaded card shows a "Re-upload" button that re-expands the card and
overwrites the previous extracted text.

---

## Phase 3 — Analysing

**Component:** `analysis-stream.tsx` (streaming state)
**API call:** `POST /tax-saver/analyse` (SSE)

Triggered when the user clicks "Analyse with N documents" or "Analyse my tax
situation". The page transitions immediately to the analysis view.

### What the backend does

```
FastAPI sync def analyse_stream()
  → load_tax_saver_session()          — get intake_answers + tax_docs
  → _stream_sse(user_message, ...)    — synchronous SSE generator
       └── stream_tax_analysis()
             ├── _build_system_prompt()    — 4-step analyst prompt
             ├── _build_context()          — intake_answers + all extracted text
             ├── Build messages list:
             │     [{role: "system", content: system + context},
             │      {role: "user",   content: analysis_request}]
             ├── openai.OpenAI(api_key=OPENAI_API_KEY)
             ├── client.chat.completions.create(model="gpt-5.4", stream=True)
             └── yield chunk.choices[0].delta.content for each token
  → save messages to tax_sessions
  → yield SSE done event
```

The analysis request asks GPT-5.4 to follow 4 steps explicitly:
1. Parse all realised exits and classify (LTCG/STCG, equity/debt/FoF)
2. Evaluate all open positions (unrealised P&L, holding period, tax-if-sold-today)
3. Compute net tax position (exemption used/remaining, estimated liability)
4. Produce a prioritised action list ranked by total tax impact

### Streaming to the frontend

SSE events:
- `{"type": "token", "content": "..."}` — appended to the message content
- `{"type": "done"}` — transitions phase to **done**

**During streaming (Option 1):** Tokens are rendered via `<TaxMarkdown>` — a
custom `ReactMarkdown` configuration with styled tables (glassmorphism container,
accent header row), auto-coloured rupee amounts (green for gains, red for losses),
and section headers with accent underlines.

**After streaming completes (Option 2):** `splitIntoSections()` parses the
completed response by `##` headings and renders each section as a purpose-built
card:

| Section heading matches | Rendered as |
|---|---|
| "Step 1" / "Realised" | 📋 **Realised Trades This FY** glass card |
| "Step 2" / "Open Position" | 📈 **Open Positions** glass card |
| "Step 3" / "Net Tax" | 🧮 **Net Tax Position** glass card |
| "Step 4" / "Action" | ✅ **Action Plan** card with `ActionCard` components |
| "Deadline" / "Time Left" | Amber-bordered deadline callout |
| Anything else | Default glass card |

### Action cards
`parseActionCards()` splits the Step 4 section on `###` headings. Each card:

```
### [Sell to book a loss] — Kotak Small Cap Fund
**Do this:** Sell your entire holding...
**Tax impact:** ₹4,200 saved
**Why:** ...
**Deadline:** 5 days to March 31.
> ⚠️ No exit load — can sell and rebuy same day.
```

Parsed into a `ParsedAction` object and rendered as a coloured `ActionCard`:

| Action type | Colour | Icon |
|---|---|---|
| Sell to book a loss / HARVEST_LOSS | Red | TrendingDown |
| Sell and rebuy / BOOK_LTCG_EXEMPTION | Emerald | TrendingUp |
| Don't sell / AVOID_SELL | Amber | AlertTriangle |
| Wait X months / UPGRADE_TERM | Blue | Clock |
| ELSS unlock / ELSS_REMINDER | Purple | Lock |

Each card shows an **Action N** pill (Action 1, Action 2, ...) in the top-right
corner — ordered by tax impact, largest first.

---

## Phase 4 — Done (Analysis + Follow-up Chat)

**Component:** `analysis-stream.tsx` (done state)
**API call:** `POST /tax-saver/chat` (SSE)

After analysis completes, the full structured analysis remains visible. A follow-up
chat input appears at the bottom.

### Follow-up message flow

```
User types question → sendFollowUp()
  → POST /api/proxy/tax-saver/chat   (dedicated proxy, maxDuration=300)
  → FastAPI sync def chat_stream()
  → _stream_sse(user_message, intake_answers, uploaded_docs, messages)
  → stream_tax_analysis() — same function, but:
       ├── is_followup = True (messages list has an assistant turn)
       ├── history_messages = last 12 messages as role/content pairs
       │   (assistant messages truncated to 1200 chars to avoid token overload)
       └── agent sees full conversation history → gives targeted answer
           (does NOT re-run the full 4-step analysis)
```

The `<followup_behaviour>` section in the system prompt instructs the model:
> "If there is conversation history, answer only what they asked. Do not repeat
> the full analysis. Be concise. Reference specific numbers from the documents."

### Navigation
- **← Upload more docs** — calls `goToUpload()`, returns to upload phase without
  resetting intake or existing doc uploads. User can upload an additional document
  and re-run analysis.
- **Start over** — calls `DELETE /tax-saver/session`, clears all state, returns
  to intake phase.

---

---

## File Extraction — Implementation Detail

### PDF Extraction (`backend/app/services/pdf_extractor.py`)

PDFs are always sent to the Gemini File API for table extraction. The function
runs **synchronously** inside uvicorn's thread pool (the upload route is `def`,
not `async def`) so a client disconnect cannot cancel it mid-way.

```python
_EXTRACT_PROMPT = (
    "Extract all tables and structured data from this financial document. "
    "For each table, output a CSV block with a header row and all data rows. "
    "Preserve all numerical values exactly as they appear — do not summarise or omit rows. "
    "Separate each table with a blank line and a label like '# Table: <description>'. "
    "Include every page. Do not add commentary — output data only."
)

def extract_pdf_tables_sync(pdf_bytes: bytes, filename: str = "document.pdf") -> str:
    client = genai.Client(api_key=GEMINI_API_KEY)
    model_id = "gemini-3-flash-preview"   # fast, cheap, handles table extraction well

    # 1. Upload to Gemini File API
    file_ref = client.files.upload(
        file=io.BytesIO(pdf_bytes),
        config={"mime_type": "application/pdf", "display_name": filename},
    )

    # 2. Poll for ACTIVE state (up to 30s)
    for _ in range(30):
        f = client.files.get(name=file_ref.name)
        if f.state.name == "ACTIVE":
            break
        time.sleep(1)

    # 3. Generate content — model reads the PDF and extracts all tables as CSV
    response = client.models.generate_content(
        model=model_id,
        contents=[_EXTRACT_PROMPT, f],
    )
    extracted = response.text or ""

    # 4. Delete upload immediately (DPDPA — raw file gone within seconds)
    client.files.delete(name=file_ref.name)

    # 5. If Gemini failed, raise so the router returns a clear error
    if not extracted:
        raise RuntimeError("Gemini table extraction failed")

    return extracted
```

**Why Gemini for PDFs?**
CAS PDFs from MFCentral are complex multi-page documents with nested tables,
headers repeated across pages, and varied layouts between CAMS and KFintech formats.
A rule-based parser would need constant maintenance. Gemini's multimodal capability
reads the rendered PDF (not just raw text) and extracts the full table structure
reliably across all formats.

**Why `gemini-3-flash-preview` and not a larger model?**
Table extraction from a financial PDF is a structured data task, not a reasoning
task. Flash handles it well and completes in 30–60s vs 90–120s for Pro. The
extracted output is plain CSV — the heavy reasoning happens in GPT-5.4 later.

**Typical output for a Zerodha MF statement:**
```
# Table: Tradewise Exits from 2025-04-01
,Symbol,ISIN,Entry Date,Exit Date,Quantity,Buy Value,Sell Value,Profit,Period of Holding,...
,GROWW NIFTY TOTAL MARKET INDEX FUND,INF666M01HM4,2023-11-01,2025-10-14,10060.669,99995.00,139468.04,39473.03,713,...

# Table: Mutual Funds Summary
,Short Term profit Equity,-3938.3782
,Long Term profit Equity,66045.1844
...
```

---

### XLSX Extraction (`backend/app/services/xlsx_extractor.py`)

Excel files (Zerodha Console exports) are extracted **deterministically** using
`openpyxl` — no LLM, no network, completes in milliseconds.

The extractor tries three strategies in order per worksheet:

#### Strategy 1 — Named Tables (preferred)
If the sheet has an Excel Table object (defined range with headers), extract it
directly via the table's cell reference.

```python
def _iter_table_rows(ws, tbl) -> Generator:
    ref = tbl.ref   # e.g. "A1:F50"
    for row in ws[ref]:
        values = [cell.value for cell in row]
        if any(v is not None for v in values):
            yield values
```

#### Strategy 2 — Auto-detected Contiguous Blocks (fallback)
Zerodha's XLSX exports use a sparse layout: metadata rows at the top, then blank
rows, then the data table. The extractor groups contiguous rows where at least
2 cells are non-None, separated by blank/sparse rows.

```python
_MIN_CELLS = 2      # minimum non-empty cells to count as a data row
_MIN_BLOCK_ROWS = 2 # minimum rows in a block to emit it

def _detect_blocks(all_rows):
    current_block = []
    for row in all_rows:
        non_null_count = sum(1 for v in row if v is not None)
        if non_null_count >= _MIN_CELLS:
            current_block.append(list(row))
        else:
            if len(current_block) >= _MIN_BLOCK_ROWS:
                yield current_block   # emit completed block
            current_block = []
    if len(current_block) >= _MIN_BLOCK_ROWS:
        yield current_block
```

This correctly handles Zerodha's Tax P&L format where each section
(`Equity and Non Equity`, `Mutual Funds`, `F&O`, etc.) is a separate block
separated by blank rows.

#### Strategy 3 — Full Sheet Dump (last resort)
If no named tables and no blocks detected, emit all non-empty rows as a single
CSV section.

#### Output format
Each block/table is labelled and separated by blank lines:

```
# Sheet: Mutual Funds | Block 2
,Short Term profit Equity,-3938.3782,,,
,Long Term profit Equity,66045.1844,,,

# Sheet: Mutual Funds | Block 3
,Symbol,Quantity,Buy Value,Sell Value,Realized P&L
,TATA SMALL CAP FUND - DIRECT PLAN,713.041,33998.29,31311.06,-2687.24
,KOTAK SMALL CAP FUND - DIRECT PLAN,159.087,50997.54,47893.94,-3103.60
...

# Sheet: Open Positions as of 2026-03-24 | Block 1
...
```

The labels (`# Sheet: X | Block N`) are included so the LLM can identify which
part of the document each block came from.

---

### Encrypted File Handling

Both PDF and XLSX encryption is detected and decrypted before extraction.

**PDF — pikepdf:**
```python
def is_pdf_encrypted(pdf_bytes: bytes) -> bool:
    # Try to open with empty password — if it raises, it's encrypted
    try:
        with pikepdf.open(io.BytesIO(pdf_bytes), password=""):
            return False
    except Exception:
        return True

def decrypt_pdf(pdf_bytes: bytes, password: str) -> bytes:
    with pikepdf.open(io.BytesIO(pdf_bytes), password=password) as pdf:
        out = io.BytesIO()
        pdf.save(out)
        return out.getvalue()
    # Raises pikepdf.PasswordError on wrong password → caught by router → returns wrong_password
```

**XLSX — msoffcrypto:**
```python
def is_xlsx_encrypted(excel_bytes: bytes) -> bool:
    office_file = msoffcrypto.OfficeFile(io.BytesIO(excel_bytes))
    return office_file.is_encrypted()

def _decrypt_xlsx(excel_bytes: bytes, password: str) -> bytes:
    encrypted = io.BytesIO(excel_bytes)
    decrypted = io.BytesIO()
    office_file = msoffcrypto.OfficeFile(encrypted)
    office_file.load_key(password=password)
    office_file.decrypt(decrypted)
    return decrypted.getvalue()
    # Raises ValueError("INCORRECT_PASSWORD") on wrong password
```

**Why password goes in the URL query string:**
The upload is multipart (`Content-Type: multipart/form-data`). Adding the
password to the form body would require parsing it before reading the file.
Using `?password=xxx` as a query param lets FastAPI resolve it via
`password: Optional[str] = Query(None)` without touching the form stream.
The password appears in Cloud Run access logs but is not stored anywhere.

---

---

## Analysis Agent Prompt (`_build_system_prompt()`)

The full system prompt injected into GPT-5.4 on every analysis call.
Context (intake answers + extracted document text) is appended to this
before being sent as the `system` role message.

```
<role>
You are an Indian personal finance and tax analyst.
The user has provided their investment documents (tax P&L, CAS, holdings).
Your job: identify tax gain and loss harvesting opportunities for the current
Indian financial year (April 2025 – March 2026).
</role>

<context>
You will receive two sections:
- INTAKE ANSWERS: the user's income, tax regime (old/new), and basic profile
- TAX DOCUMENTS: extracted text from their uploaded financial documents

Work only from data present in these sections.
If data is missing or ambiguous, say so explicitly — do not guess or invent figures.
</context>

<tax_rules>
EXEMPTION LIMIT:
- The LTCG exemption for equity / equity MF is ₹1.25 lakh per financial year
  (revised in Budget 2024, effective FY 2024-25 onwards). Use ₹1.25L, not ₹1L.

CLASSIFICATION:
- Equity MF / direct equity held ≤12 months → STCG, taxed at 20%
- Equity MF / direct equity held >12 months → LTCG, first ₹1.25L exempt, rest taxed at 12.5%
- FoF, Gold MF, Debt MF purchased AFTER Apr 2023 → always taxed at income slab rate
  regardless of holding period
- FoF, Gold MF, Debt MF purchased BEFORE Apr 2023, held ≤24 months → STCG, slab rate
- FoF, Gold MF, Debt MF purchased BEFORE Apr 2023, held >24 months → LTCG, slab rate
- ELSS: 3-year lock-in from allotment date — exclude entirely from all calculations
- STT confirms equity treatment but is not deductible
- Debt ETFs (e.g. LiquidBees) follow the same rules as Debt MF:
  purchased after Apr 2023 → slab rate always;
  purchased before Apr 2023 → STCG at slab if ≤24 months, LTCG at slab if >24 months.
  Check the purchase date from the CAS before classifying.

LOSS SET-OFF ORDER:
1. STCG losses offset STCG gains first; surplus can offset LTCG
2. LTCL offsets LTCG only — never STCG
3. Carried-forward losses from prior years follow the same order
4. Unabsorbed losses carry forward 8 years (requires timely ITR-2/ITR-3 filing)

No wash-sale rule in India — can sell and repurchase the same fund/stock the same day.
Assume FIFO for partial redemptions unless documents state otherwise.
</tax_rules>

<holding_period_inference>
When a CAS shows an "Opening Unit Balance" for a folio with NO purchase transaction
during the statement period (Apr 2025 – Mar 2026), all units were purchased before
April 2025 — meaning the holding period is already at least 12 months as of April 2026.
Treat these as long-term for equity MF / equity purposes and state this assumption
explicitly in Step 2.

When a purchase date IS present in the CAS transaction history for a currently-open
position, extract and use that exact date — do not flag it as unknown.

Only flag a date as missing if it is genuinely absent from both the CAS and the
holdings export.

This inference applies to all asset types including debt ETFs (e.g. LiquidBees):
if the CAS shows an opening balance with no purchase transaction this FY, infer
the purchase predates Apr 2025 and classify accordingly using the pre/post Apr 2023
debt rules above.
</holding_period_inference>

<loss_harvesting_logic>
When evaluating whether to recommend selling a loss position, consider not just
this year's realised gains but also the FUTURE tax liability on open positions:

- If an open position has unrealised LTCG that will eventually exceed the ₹1.25L
  exemption, any LTCL harvested today carries forward and offsets that future
  taxable gain. Calculate the tax saving as: LTCL amount × 12.5%.
- If an open position has unrealised gains taxed at slab rate (FoF, Gold MF, Debt ETF),
  calculate the tax saving using the user's income slab rate from INTAKE ANSWERS.
- Always state both the current-FY impact AND the multi-year impact separately.
- Since there is no wash-sale rule, explicitly note when the investor can sell and
  immediately repurchase the same instrument to crystallise the loss while
  maintaining market exposure.
- Recommend harvesting a loss if the current-year
  exemption has not been fully used. The correct test is: will this loss save tax
  now or in future years? If yes, recommend harvesting it.
</loss_harvesting_logic>

<steps>
Follow these four steps in order. Show your work — do not hide intermediate reasoning.

STEP 1 — REALISED EXITS
Parse every exit/redemption this FY from the tax P&L and CAS transaction history.
For each trade produce a row with: instrument, exit date, holding period in days,
gain/loss classification, gain/loss amount, applicable tax rate, and tax owed.
Apply loss set-off in the correct order before computing tax owed.
Then produce the realised summary totals.

STEP 2 — OPEN POSITIONS
For each currently-held position determine:
- Unrealised gain or loss in ₹ (from holdings export)
- Held since (from CAS purchase date, or inferred from opening balance — state which)
- Months held (approximate)
- Short-term or long-term classification, with the tax rate that applies
- Tax if sold today (rate × unrealised gain, using the user's income slab for
  slab-rate instruments)
- Flag if within 1–3 months of crossing a short→long term threshold, showing
  exact days and ₹ tax saving from waiting

STEP 3 — NET TAX POSITION
Compute net figures after applying all loss set-offs in the correct order:
STCG losses → STCG gains first, surplus to LTCG.
LTCL → LTCG only.
Show exemption used and remaining separately (use the ₹1.25L limit and calculate precisely).
Show estimated tax liability as of today.

STEP 4 — PRIORITISED ACTION LIST
Rank actions by total tax impact across current AND future years, largest first.

For every action:
- The action type label and the instruction text MUST be consistent —
  if the action type is "Sell to book a loss", the instruction must say to sell.
  If the action type is "Do not sell", the instruction must say to hold or wait.
  Double-check every action for this consistency before writing it.
- Include exact ₹ figures for tax saved, exemption used, or tax avoided.
- For loss harvesting actions, show both current-FY saving and future-year saving
  from carrying the loss forward against open unrealised gains.
- For "wait" recommendations, show the exact number of days and the ₹ difference
  between selling now vs after the threshold date.
- Where no wash-sale rule applies, note that sell-and-rebuy is available.
</steps>

<output_instructions>
Use markdown tables, bold headers, and clear section breaks.
Show actual numbers from the documents — do not round or summarise away detail.
Every recommendation must include a concrete ₹ figure for the tax impact.
Flag positions where waiting crosses a tax threshold — show exact days and ₹ saving.
Do not invent data. If a figure is genuinely missing, say so.
</output_instructions>

<followup_behaviour>
If there is conversation history before the current message, the user is asking a
follow-up question. Answer only what they asked — do not repeat the full analysis.
Be concise. Reference specific numbers from the documents.
</followup_behaviour>

<output_format>
(Use this full format only for the initial analysis, not for follow-ups.)

---

## Step 1 — Realised trades this FY (grouped by instrument — overall gain/loss)

| Instrument | Exit date | Holding (days) | Type | Gain / Loss | Tax rate | Tax |
|---|---|---|---|---|---|---|
| ... | ... | ... | ... | ... | ... | ... |

**Realised summary:**
- Total equity LTCG: ₹X
- Total equity STCG (gross): ₹X
- Total STCG losses: ₹X
- Net STCG after set-off: ₹X
- Total debt/FoF gains (slab): ₹X
- Total LTCL: ₹X

---

## Step 2 — Open positions

| Instrument | Unrealised P&L | Held since | Months held | ST or LT | Tax if sold today | Notes |
|---|---|---|---|---|---|---|
| ... | ... | ... | ... | ... | ... | ... |

⚠️ Flag format: "X days to LT threshold — waiting saves ₹Y in tax."

---

## Step 3 — Net tax position

| | |
|---|---|
| **LTCG realised** | ₹X |
| **₹1.25L exemption used** | ₹X |
| **Exemption remaining** | ₹X |
| **STCG realised (gross)** | ₹X |
| **STCG losses offsetting STCG** | ₹X |
| **Surplus STCG losses offsetting LTCG** | ₹X |
| **LTCL available** | ₹X |
| **Carry-forward losses (prior ITR)** | ₹X (if provided) |
| **Estimated tax liability today** | ₹X |

---

## Step 4 — Action plan

Ranked by total tax impact (current + future years), largest first.

### [ACTION TYPE] — Instrument Name
**Do this:** One clear sentence. (Must match the action type label.)
**Tax impact:** ₹X saved / ₹X exemption used / ₹X avoided
**Current FY impact:** ₹X
**Future year impact:** ₹X (explain which open position this offsets)
**Why:** 2 sentences referencing actual figures from the documents.
**Deadline:** X days to March 31. [Add T+1/T+2 settlement note if fewer than
5 trading days remain.]
> ⚠️ Caveat if relevant (exit load, lock-in, slab rate risk, wash-sale note, etc.)

Action types:
- **Sell to book a loss** — harvests a loss to offset gains now or in future years
- **Sell and rebuy** — books gains within the ₹1.25L exemption, resets cost basis
- **Wait X more days** — exact days and ₹ saving from waiting for LT status
- **Do not sell** — position would trigger slab-rate tax or forfeit LT status
- **Next FY strategy** — annual ₹1.25L LTCG harvest, CF loss utilisation plan

---

## Deadline

[One concise line — days to March 31 and T+2 settlement cutoff date if close.]
Note: STCG losses can be carried forward if ITR is filed on time (before July 31).

---

*This is an informational analysis, not formal tax advice. Verify with a CA before acting.*

</output_format>
```

### How context is appended

The prompt above is the static system instructions. Before sending to GPT-5.4,
`_build_context()` appends the user's actual data:

```python
def _build_context(intake_answers: dict, tax_docs: dict) -> str:
    lines = []

    lines.append("## INTAKE ANSWERS")
    lines.append(f"- Income slab: {intake_answers.get('income_slab', 'not provided')}")
    lines.append(f"- Tax regime: {intake_answers.get('tax_regime', 'not provided')}")
    lines.append(f"- Financial year: {intake_answers.get('financial_year', '2025-26')}")
    brokers = intake_answers.get("brokers") or []
    lines.append(f"- Brokers/platforms: {', '.join(brokers) if brokers else 'not specified'}")
    lines.append(f"- Has carry-forward losses: {intake_answers.get('has_carry_forward')}")

    lines.append("\n## TAX DOCUMENTS")
    for doc_key, content in tax_docs.items():
        if content:
            lines.append(f"\n### {doc_key}")
            lines.append(content)   # ← full extracted CSV text, can be 50-200KB

    return "\n".join(lines)
```

The final message sent to GPT-5.4 as the `system` role:
```
[_build_system_prompt()]

## INTAKE ANSWERS
- Income slab: >30L
- Tax regime: new
- Financial year: 2025-26
- Brokers/platforms: Zerodha
- Has carry-forward losses: False

## TAX DOCUMENTS

### zerodha_taxpnl_xlsx
# Sheet: Tradewise Exits from 2025-04-01 | Block 1
...
# Sheet: Mutual Funds | Block 2
...

### zerodha_holdings_xlsx
# Sheet: Equity | Block 2
...
# Sheet: Mutual Funds | Block 2
...
```

### Follow-up message structure

For follow-up questions the `<followup_behaviour>` tag fires. The message list
sent to GPT-5.4 is:

```python
[
    {"role": "system",    "content": system_prompt + "\n\n" + context},
    {"role": "assistant", "content": "[initial analysis truncated to 1200 chars...]"},
    {"role": "user",      "content": "What should I do about the Paytm position?"},
    {"role": "assistant", "content": "[previous follow-up answer if any]"},
    {"role": "user",      "content": "[current question]"},   # ← new message
]
```

This gives the model full conversation awareness without re-running the 4-step
format — it answers only the specific question and references exact figures from
the document context which is always present in the system message.

---

## DPDPA Compliance

- Raw file bytes are **never stored**. They are extracted in memory and discarded.
- Extracted text strings (the CSV/table content from documents) are stored in
  `tax_sessions.tax_docs` in Supabase as JSONB.
- `DELETE /tax-saver/session` wipes the entire session row — right to erasure.
- An audit trail of uploads (filename, doc_type, parse_status, timestamp) is
  maintained in `tax_documents` table with soft-delete support.
- The `/documents` page shows this audit trail and allows per-document deletion.

---


