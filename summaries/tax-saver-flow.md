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

## DPDPA Compliance

- Raw file bytes are **never stored**. They are extracted in memory and discarded.
- Extracted text strings (the CSV/table content from documents) are stored in
  `tax_sessions.tax_docs` in Supabase as JSONB.
- `DELETE /tax-saver/session` wipes the entire session row — right to erasure.
- An audit trail of uploads (filename, doc_type, parse_status, timestamp) is
  maintained in `tax_documents` table with soft-delete support.
- The `/documents` page shows this audit trail and allows per-document deletion.

---

## Key Files

| File | Purpose |
|---|---|
| `web-app/src/app/(app)/tax-saver/page.tsx` | Phase router — renders the correct screen |
| `web-app/src/hooks/use-tax-saver.ts` | All state management + API calls |
| `web-app/src/app/(app)/tax-saver/components/intake-screen.tsx` | Phase 1 — 4-question chip UI |
| `web-app/src/app/(app)/tax-saver/components/doc-upload-screen.tsx` | Phase 2 — per-doc upload cards |
| `web-app/src/app/(app)/tax-saver/components/analysis-stream.tsx` | Phase 3+4 — streaming + section cards |
| `backend/app/routers/tax_saver.py` | All `/tax-saver/*` API endpoints |
| `backend/app/services/tax_analysis_agent.py` | GPT-5.4 streaming agent |
| `backend/app/services/doc_manifest.py` | US-06 document routing matrix + download instructions |
| `backend/app/services/pdf_extractor.py` | Gemini File API table extraction (sync) |
| `backend/app/services/xlsx_extractor.py` | openpyxl deterministic XLSX → CSV |
| `backend/app/whatsapp_bot/web_session_store.py` | Supabase session persistence |
| `backend/sql/migrations/011_tax_docs_column.sql` | Adds `intake_answers` + `tax_docs` columns |
| `web-app/src/app/api/proxy/tax-saver/analyse/route.ts` | SSE proxy (maxDuration=300) |
| `web-app/src/app/api/proxy/tax-saver/chat/route.ts` | Follow-up chat SSE proxy |
| `web-app/src/app/api/proxy/tax-saver/upload/[doc_key]/route.ts` | Upload proxy (maxDuration=300, streaming) |
