# Minto WhatsApp Tax Harvesting Bot — Complete User Stories v5
**Data Sources:** MFCentral CAS + Broker Tax P&L + Broker Holdings + ITR
**Resident Indians only | FY 2025-26**

---

## Epic 1: Onboarding

### US-01 — Entry Point
**As a new user, I want to start the bot via a WhatsApp link so I don't need to download an app.**

* User clicks minto.in/tax → opens WhatsApp with pre-filled message
* Bot sends:

```
Hi! I'm Minto. I'll build your capital gains tax picture across mutual funds, stocks and ETFs — and tell you exactly how to save tax before March 31st.

Takes about 5 minutes.
```

* CTAs: "Let's go" / "How does this work?"
* If "How does this work?": bot explains the documents it needs and why, then returns to "Let's go"

### US-02 — Residency Check
**As a user, I want the bot to confirm I am eligible to use this tool before I spend time on it.**

* Immediately after "Let's go", bot asks:

```
Are you a resident Indian for tax purposes this financial year?

1. Yes, I am a resident Indian
2. No, I am an NRI or live abroad
```

* If "Yes" → proceed to US-03
* If "No" → block:

```
Thanks for sharing. Unfortunately this tool is currently built for resident Indians only.

NRIs have different tax rules — including TDS on redemptions, different rate structures, and potential DTAA benefits — that this tool doesn't handle yet.

Acting on a plan designed for residents could result in incorrect tax treatment for you.

We're working on NRI support. Want to be notified when it's ready?
```

   * CTA: "Notify me" → captures name and email
   * Session ends after notification opt-in

* **Acceptance criteria:** NRI block is hard — no option to proceed; block is triggered by self-declaration only; "Notify me" is always offered; session terminates cleanly after the block

### US-03 — Portfolio Type Selection
**As a user, I want to tell the bot what I hold so it only asks me for relevant documents — and understand whether my other investments affect my eligibility.**

* Bot sends:

```
First, what do you hold?
(Select all that apply)

1. Mutual Funds
2. Stocks & ETFs (in a demat account)
3. NPS (National Pension System)
4. ULIPs (Unit Linked Insurance Plans)
5. Unlisted shares
6. Foreign stocks or equity investments
   (e.g. US stocks via Vested, INDmoney,
   or any international broker)
```

* If user selects only 1 and/or 2 → proceed to US-04
* If user selects 3 (NPS) — alone or alongside other selections → bot explains NPS is not relevant and proceeds:

Bot asks:

```
Which NPS tier do you hold?

1. Tier I only
2. Tier II only
3. Both Tier I and Tier II
```

* If Tier I only → proceed to US-04:

```
NPS Tier I withdrawals and gains are not
taxed as capital gains. They have a
completely separate tax treatment under
Sections 10(12A) and 10(12B) — so your
NPS Tier I does not affect your ₹1.25L
LTCG exemption or your harvesting plan
in any way.

We'll proceed with your mutual funds
and stocks analysis.
```

* If Tier II (alone or alongside Tier I) → inform and proceed with caveat:

```
NPS Tier I is clearly not taxed as
capital gains — no impact on your plan.

NPS Tier II is different. Tier II does
not have the same exemption framework
as Tier I, and the tax treatment of
Tier II equity gains is debated among
tax professionals — some treat it as
capital gains, others as income from
other sources.

This tool does not factor in NPS Tier II
gains or losses. If you have significant
Tier II transactions this year, consult
a CA.

We'll proceed with your mutual funds
and stocks analysis.
```

→ proceed to US-04

* If user selects 4 (ULIPs) alone or alongside MFs/stocks → bot explains and asks a follow-up:

```
Got it. Before we continue, I need to
check one thing about your ULIPs.

A quick explainer:

Realised gains are profits you have
actually locked in by selling or
surrendering an investment this
financial year (Apr 2025 to today).

They are different from unrealised
gains, which are profits that exist
on paper because your investment has
grown — but you haven't sold yet,
so no tax applies.

Example: You bought units for
₹1,00,000 and they are now worth
₹1,40,000. If you haven't sold, your
₹40,000 gain is unrealised — no tax
yet. If you sold them, that ₹40,000
becomes a realised gain and is taxable.
```

Bot then asks:

```
Does any single ULIP policy you hold
have an annual premium above ₹2.5 lakh?
(This is per policy, not total across
all policies)

1. Yes
2. No
3. Not sure
```

* If "No" → proceed to US-04:

```
ULIPs with annual premium up to ₹2.5L
are exempt under Section 10(10D) — they
don't affect your capital gains at all.

We'll proceed with your analysis.
```

* If "Yes" or "Not sure" → bot asks about realised gains:

```
Equity ULIPs with annual premium above
₹2.5L are taxed like equity mutual
funds under Section 112A. This means
they share the same ₹1.25L LTCG
exemption.

Have you surrendered or partially
withdrawn from such a ULIP this year
and made a profit?

Yes / No
```

   * If "No" → proceed to US-04:

```
Since you haven't realised any gains
from high-premium ULIPs this year,
your ₹1.25L exemption is unaffected.

We'll proceed with your analysis.
```

   * If "Yes" → warn and offer exit:

```
Thanks for sharing. This is important.

Since you've realised gains from a
high-premium equity ULIP this year,
part of your ₹1.25L LTCG exemption
may already be consumed in ways we
can't see or calculate here.

Any gains harvesting plan we generate
could cause you to inadvertently
exceed your exemption limit and create
an unexpected tax bill.

We'd strongly recommend consulting
a CA who can look at your complete
picture before you act.

Want to be notified when Minto
supports ULIPs?
```

   * CTA: "Notify me" → captures name and email

* If user selects 5 (Unlisted shares) alone or alongside MFs/stocks → bot explains different tax treatment:

```
Got it. Important note about unlisted
shares:

Unlisted shares are taxed under Section
112, not Section 112A. This means they
have a separate LTCG rate of 12.5% but
do NOT share the ₹1.25L exemption that
applies to listed stocks and equity MFs.

So any gains or losses from unlisted
shares won't affect your equity LTCG
exemption calculation.

However, if you have realised losses
from unlisted shares this year, those
could potentially offset other capital
gains — which this tool doesn't handle.

If you've had significant unlisted share
transactions this year, we recommend
consulting a CA for the complete picture.

We'll proceed with your mutual funds
and stocks analysis.
```

→ proceed to US-04 (no block needed since unlisted shares don't share the 112A exemption)

* If user selects 6 (Foreign stocks or equity investments) — alone or alongside any other selection → **hard block:**

```
Thanks for sharing. Unfortunately this
tool cannot currently handle foreign
equity investments.

Foreign stocks and equity investments
have a significantly different tax
treatment for Indian residents:

• Gains are taxed under Section 112
  (not Section 112A) — no ₹1.25L
  exemption applies
• No STT is paid, so Sections 111A and
  112A do not apply
• Currency conversion gains/losses must
  be factored into the cost basis
• Foreign tax credits (DTAA) may apply
  if tax was withheld abroad
• Schedule FA (Foreign Assets) and
  Schedule FSI (Foreign Source Income)
  must be filed in the ITR
• Black Money Act disclosure obligations
  may apply

Getting any of these wrong can result
in penalties. This tool doesn't handle
these complexities.

We're working on foreign equity support.
Want to be notified when it's ready?
```

   * CTA: "Notify me" → captures name and email
   * **This is a hard block** — no option to proceed, even if the user also holds domestic MFs/stocks. The foreign equity gains interact with the domestic computation (e.g., foreign LTCL can offset domestic LTCG) in ways the tool cannot capture. Session ends after notification opt-in.

* If user confirms ULIP realised gains but still wants to proceed:

```
You can still proceed, but please note
this analysis will not account for
LTCG exemption already consumed by
your equity ULIP gains.

You may end up over-harvesting.

Proceed with this limitation? Yes / No
```

   * If "Yes" → proceed with prominent disclaimer shown on every output screen for the rest of the session
   * If "No" → end session with notification opt-in

* **Combination selection handling:** If the user selects multiple non-standard instruments (e.g., NPS + ULIPs + Unlisted shares alongside MFs/stocks), the bot processes each instrument's sub-flow sequentially in the order 6→3→4→5: **foreign equity check first** (hard block if selected — session ends immediately regardless of other selections), then NPS tier check, then ULIP premium/realised gains check, then unlisted shares informational note. Each sub-flow completes before the next begins. The most restrictive outcome applies — foreign equity is always a hard block; ULIP realised gains trigger a persistent disclaimer.

* **Acceptance criteria:** NPS users are never blocked or warned about the ₹1.25L exemption — NPS gains are not taxed as capital gains under Sections 111A/112A; unlisted share users are informed their gains fall under Section 112 (not 112A) and don't share the ₹1.25L exemption — they proceed without a blocking question; only equity ULIP users (annual premium >₹2.5L) with realised gains trigger the exemption warning, because only these ULIPs are taxed under Section 112A; ULIPs with premium ≤₹2.5L are exempt under Section 10(10D) and don't affect exemption; realised vs unrealised explanation shown before any follow-up; users who confirm ULIP realised gains are warned but not hard-blocked; disclaimer shown prominently at every output screen for users who proceed despite the ULIP warning; **foreign equity investors are hard-blocked** — session terminates with explanation of Section 112 treatment, DTAA complexities, Schedule FA/FSI obligations, and notification opt-in; block is hard even if user also holds domestic MFs/stocks because foreign equity losses interact with domestic netting; **combination selections processed sequentially (Foreign equity→NPS→ULIPs→Unlisted shares)** with most restrictive outcome persisting — foreign equity triggers immediate session end before any other sub-flow runs

### US-04 — Carry-Forward Loss Check
**As a user, I want the bot to ask me about carry-forward losses before it starts collecting documents so nothing is missed.**

* Bot sends:

```
Do you have capital losses from any previous year that you couldn't fully offset?

Capital losses can be carried forward for up to 8 years. Even losses from FY 2017-18 onwards could still reduce your tax bill this year.

1. Yes, I have carry forward losses
2. No, I don't have any
3. Not sure, help me check
```

* If "Yes" → ITR upload added to document collection queue
* If "No" → ITR skipped entirely
* If "Not sure" → proceed to US-05
* **Acceptance criteria:** Always shown regardless of portfolio type selection; answer stored and carried into analysis

### US-05 — Not Sure: How to Check Carry-Forward Losses
**As a user who doesn't know if they have carry-forward losses, I want the bot to show me exactly where to find this.**

* Bot sends:

```
No problem. Here's how to check in 2 minutes:

Option 1 — Check your last ITR online:
1. Go to incometax.gov.in
2. Login with PAN + password or Aadhaar OTP
3. e-File > Income Tax Returns >
   View Filed Returns
4. Click on AY 2025-26 (filed for FY 24-25)
5. Open the ITR > go to Schedule CFL

Look for "Loss to be carried forward"
under Capital Gains. Any non-zero figure
means you have CF losses.
━━━━━━━━━━━━━━━━━━━━━━━━
Option 2 — Check with your CA:
Ask them: "Do I have any capital loss
carry forward from FY 2024-25?"
━━━━━━━━━━━━━━━━━━━━━━━━
Option 3 — You probably don't if:
You didn't sell any investments at a loss
in FY 2024-25, or you filed ITR-1 which
doesn't include capital gains.
```

* Bot then asks:

```
Were you able to check?
1. Yes, I have carry forward losses
2. No, I don't have any
3. Skip this for now
```

* If "Yes" → ITR added to queue
* If "No" or "Skip" → ITR skipped; flagged in final disclaimer
* **Acceptance criteria:** Skip path delivers a complete analysis with a clear note that carry forward losses were excluded

### US-05A — Tax Regime Selection (Conditional)
**As a user with non-equity investments, I want the bot to know my tax bracket so slab-rate calculations are accurate.**

* **Triggered if** the user selected Mutual Funds in US-03 (since non-equity MFs may be present in the CAS) **OR** selected Stocks & ETFs (since broker holdings may contain Gold ETFs, REITs, InvITs, or other non-equity ETFs whose short-term gains are taxed at slab rate)
* **Skipped only if** the user somehow has no investments at all (edge case — should not occur in normal flow)
* Bot asks:

```
One last question before we collect
your documents.

For any non-equity investments (like
debt or hybrid funds), gains are taxed
at your income tax slab rate. Which
regime are you on this year?

1. New tax regime (default for FY 2025-26)
2. Old tax regime
3. Not sure — use new regime rates
```

* If New regime or Not sure → bot asks:

```
Under the new regime, what's your
approximate total income this year
from salary and other non-investment
sources? (We ask this separately
because capital gains are taxed at
their own rates — we need your base
income to determine the slab rate
for any non-equity gains.)

1. Up to ₹12 lakh (effectively 0%
   due to Section 87A rebate — but note:
   this rebate only reduces slab-rate tax.
   Equity STCG at 20% and equity LTCG at
   12.5% are NOT covered by the rebate.
   Also: if your capital gains push your
   TOTAL income above ₹12L, the rebate
   is lost entirely — even on slab-rated
   portions. We'll re-check this after
   analysing your portfolio.)
2. ₹12L - ₹16 lakh (15% bracket)
3. ₹16L - ₹20 lakh (20% bracket)
4. ₹20L - ₹24 lakh (25% bracket)
5. Above ₹24 lakh (30% bracket)
6. Not sure — assume 30%
```

* If Old regime → bot asks:

```
Under the old regime, what's your
approximate total taxable income
this year (after deductions like
80C, 80D, HRA)?

1. Up to ₹5 lakh (0-5% bracket)
2. ₹5L - ₹10 lakh (20% bracket)
3. Above ₹10 lakh (30% bracket)
4. Not sure — assume 30%
```

* Slab rate stored and used for all slab-rate calculations (non-equity STCG, post-Apr 2023 debt gains)
* If at analysis time the CAS turns out to contain only equity funds, the slab rate is unused and no harm done
* **Acceptance criteria:** Asked if user selected MFs OR Stocks & ETFs in US-03 (since both can contain non-equity assets requiring slab rate); slab rate choice drives all non-equity tax calculations; "Not sure" defaults to 30% (conservative — overstates liability slightly rather than understating); regime and slab shown in the tax summary output so user can verify; if user later says "actually I'm on old regime", bot recalculates

### US-06 — Document Collection Routing
**As a user, I want the bot to collect all documents in a logical sequence before any analysis begins.**

Routing logic:

```
MF only + No CF       → CAS
MF only + CF          → CAS → ITR

Stocks only + No CF   → P&L → Holdings
Stocks only + CF      → P&L → Holdings → ITR

Both + No CF          → CAS → P&L → Holdings
Both + CF             → CAS → P&L → Holdings → ITR
```

* Bot tells user upfront how many documents are needed:

```
Great. I'll collect 3 documents from you,
then build your complete tax plan.

Step 1 of 3: MFCentral CAS
```

* Progress indicator updates after each upload
* **Acceptance criteria:** All documents collected before any analysis begins; no document described as optional; routing determined entirely by US-03 and US-04 answers; if user says mid-flow "actually I also have stocks", bot offers to restart from US-03

---

## Epic 2: MFCentral CAS Upload

### US-07 — CAS Education & Download Instructions
**As a user, I want step-by-step instructions to download my MFCentral CAS.**

* Bot sends:

```
📄 Download your MFCentral CAS

1. Go to mfcentral.com
2. Enter your mobile number and OTP
3. Go to Reports > Consolidated Account
   Statement
4. Select: Detailed (not Summary)
5. Check the box: Select All Folios
6. Period: Apr 2025 to Today
7. Set a password for the document
   (choose anything you'll remember —
    you'll need it in the next step)
8. Download the PDF

Upload the PDF here ⬆️
```

* Bot also sends a screenshot guide as an image
* **Acceptance criteria:** Instructions explicitly call out the Select All Folios checkbox and the user-set password step; bot warns that if all folios are not selected some funds will be missing from the analysis; fallback instructions provided for email-based CAS if mobile number not registered

### US-08 — CAS Upload & Validation
**As a user, I want to upload my CAS PDF and have the bot confirm it was read correctly.**

* Bot accepts PDF attachment in WhatsApp
* Immediately after upload bot asks:

```
This PDF is password protected.

Enter the password you set while downloading
from MFCentral:
```

* User types password in WhatsApp
* If correct: "Got it, reading your portfolio… ⏳"
* If incorrect: "That password didn't work. Please try again — it's the one you set on MFCentral before downloading, not your PAN."
* Bot retries up to 3 times then prompts user to re-download with a fresh password
* If wrong file: "This doesn't look like a CAS statement. Please upload the PDF from MFCentral."
* If summary CAS: "This looks like a Summary CAS. I need the Detailed version. Please re-download with Detailed selected."
* If date range incomplete: "Your CAS only covers until [date]. Please re-download with the period set to Apr 2025 to today."
* **CAS staleness check:** After parsing, bot detects the CAS generation date and always shows:

```
📅 Your CAS was generated on [date].

NAV figures and holdings are as of that
date. In volatile markets, gains and
losses may have changed since then.

Recent transactions (last 1-2 business
days) may not appear in the CAS due to
processing delays.

For the most accurate plan, download
a fresh CAS from MFCentral right before
uploading. Want to continue with this
CAS or re-download?
```

   * "Continue" → proceed with staleness noted in all estimate labels
   * "Re-download" → bot re-shows US-07 instructions
* **Acceptance criteria:** Password collected via WhatsApp message; never stored beyond session; PDF unlocked in memory only; handles both CAMS-format and KFintech-format CAS; ELSS funds identified by scheme category during parsing and their per-unit purchase dates recorded; **Section 112A grandfathering applied:** for equity-oriented MF units and listed equity ETF units acquired before February 1, 2018, the cost of acquisition is computed as the higher of (a) actual purchase price or (b) the lower of (i) fair market value (NAV) as on January 31, 2018 and (ii) the sale/redemption price — this directly affects LTCG calculations for long-held positions and must be applied during CAS parsing, not retroactively

### US-09 — Portfolio Identity Confirmation
**As a user, I want the bot to confirm whose portfolio it has parsed and flag any ELSS lock-in positions.**

* Bot sends:

```
✅ I've read the portfolio for:

Name: Rahul Sharma
PAN: ABCXX1234X
Folios with balance: 8

Realised transactions found this FY:
LTCG (equity MFs):           ₹66,038
STCG (equity MFs):               ₹0
STCL (equity MFs):           -₹3,940
Non-equity LTCG (pre-Apr 23): ₹14,200
Non-equity STCG (post-Apr 23): ₹6,500

Note: These are realised gains from
actual redemptions this year. Unrealised
gains on your current holdings (including
ELSS unlocked units) are shown separately
in the harvesting section — they are not
taxable until you act on them.

Is this correct?
```

* Yes → proceed; if ELSS funds are detected proceed to US-10 before moving to next document
* No → ask to re-upload
* **Acceptance criteria:** Shows only folios with a current unit balance; zero-balance folios parsed for transaction history but not shown here; ELSS detection triggers US-10 automatically

### US-10 — ELSS Lock-In Status
**As a user with ELSS funds, I want to know which units are locked and which are available — so I know what I can and cannot act on.**

* Triggered automatically if any ELSS fund is found in the CAS
* Bot sends:

```
🔒 ELSS Lock-In Status

I found ELSS funds in your portfolio.
Each investment has its own 3-year
lock-in from the date it was invested.
For SIPs, each instalment locks
independently. For lump sum investments,
the entire amount locks from the
investment date.

Here's the status of your ELSS units:

Axis Long Term Equity Fund Direct Growth
Units available (lock-in expired):
Jan 2021 SIP → Unlocked Jan 2024 ✅
Mar 2021 SIP → Unlocked Mar 2024 ✅
Available LTCG: ₹14,200

Units still locked:
Jun 2023 SIP → Unlocks Jun 2026 🔒
Sep 2023 SIP → Unlocks Sep 2026 🔒
Dec 2023 SIP → Unlocks Dec 2026 🔒
Locked value: ₹28,400

Upcoming unlocks (within 6 months):
None for this fund.
━━━━━━━━━━━━━━━━━━━━━━━━
Mirae Asset Tax Saver Fund Direct Growth
Units available (lock-in expired):
Feb 2021 SIP → Unlocked Feb 2024 ✅
Available LTCG: ₹6,800

Units still locked:
Apr 2023 SIP → Unlocks Apr 2026 🔒
  📅 Unlocks in 12 days — but that's
     FY 2026-27, not this year
May 2023 SIP → Unlocks May 2026 🔒
Locked value: ₹19,600
```

* For units unlocking within the current financial year (before March 31):

```
⚡ Some of your ELSS units unlock
before March 31st. Once unlocked they
become available for harvesting.

I'll include them in the plan.
```

* Locked units are excluded from both gain and loss harvesting recommendations throughout the session
* Unlocked units are treated identically to any other equity MF
* Units unlocking before March 31 are included in the harvesting plan with their unlock date noted
* **Acceptance criteria:** Lock-in status calculated at individual investment level (each SIP instalment independently, and each lump sum investment as a single block) not fund level; locked units never appear in any harvesting recommendation; units unlocking before March 31 included with date clearly marked; units unlocking after March 31 excluded from this year's plan but noted for future reference; ELSS tax treatment same as equity MF once unlocked (12-month LTCG threshold runs from purchase date, not lock-in expiry)

---

## Epic 3: Broker Tax P&L Upload

### US-11 — Broker Selection
**As a user with a demat account, I want to select my broker so I get the right download instructions.**

* Bot sends:

```
Which broker(s) do you use?
(Select all that apply)

1. Zerodha
2. Groww
3. Upstox
4. Angel One
5. ICICI Direct
6. Other (HDFC Securities, Kotak,
   SBI, or any other broker)
```

* User can select multiple
* Bot queues Tax P&L instructions followed immediately by Holdings instructions for each selected broker
* **Acceptance criteria:** Broker selection drives both P&L and Holdings instruction sets; user does not need to select broker again for the Holdings step

### US-12 — Broker Tax P&L Download Instructions
**As a user, I want step-by-step instructions to download my Tax P&L from my exact broker.**

Zerodha (Web):

```
📊 Zerodha Tax P&L

1. Go to console.zerodha.com
2. Reports > Tax P&L
3. Select FY 2025-26
4. Download P&L Statement (CSV)

Upload the CSV here ⬆️
```

Zerodha (Kite App):

```
📊 Zerodha Tax P&L via Kite App

1. Open the Kite app
2. Tap Profile (bottom right)
3. Tap Console
4. Reports > Tax P&L
5. Select FY 2025-26
6. Download

Upload here ⬆️
```

Groww:

```
📊 Groww Tax P&L

1. Open Groww app or groww.in
2. Profile > Reports
3. Capital Gains Report
4. Select FY 2025-26
5. Download PDF or Excel

Upload here ⬆️
```

Upstox (Web):

```
📊 Upstox Tax P&L

1. Go to upstox.com and login
2. Reports > Profit & Loss
3. Select FY 2025-26
4. Download (CSV or Excel)

Upload here ⬆️
```

Upstox (App):

```
📊 Upstox Tax P&L via App

1. Open the Upstox app
2. Tap Profile (bottom right)
3. My Account > Reports
4. P&L Report
5. Select FY 2025-26
6. Download

Upload here ⬆️
```

Angel One:

```
📊 Angel One Tax P&L

1. Go to angelone.in and login
2. My Portfolio > Reports
3. P&L Report > FY 2025-26
4. Download

Upload here ⬆️
```

ICICI Direct:

```
📊 ICICI Direct Tax P&L

1. Login to icicidirect.com
2. My Account > Reports
3. Capital Gain/Loss Statement
4. FY 2025-26 > Download

Upload here ⬆️
```

Other (HDFC Securities, Kotak, SBI, or any other):

```
📊 Other Broker Tax P&L

Most brokers have this under:
Reports > Tax P&L
or
Reports > Capital Gains Statement

Select FY 2025-26 (Apr 2025 to Mar 2026)
Download as CSV, Excel or PDF

Upload here ⬆️

Can't find it? Search "[your broker name]
Tax P&L download" — most brokers have
a help article for this.
```

### US-13 — Broker Tax P&L Upload & Validation
**As a user, I want to upload my broker report and get confirmation it was read correctly.**

* Bot accepts CSV, Excel, or PDF
* Validates: contains realised gains/losses; covers FY 2025-26
* Extracts: STCG, LTCG, STCL, LTCL broken down by scrip
* Confirms:

```
✅ Added Zerodha Tax P&L:

LTCG:  ₹21,350
STCG:   ₹8,200
STCL:  -₹6,188

These are aggregate figures across all
delivery-based trades. Equity vs
non-equity classification (for different
tax rates) is applied automatically
during analysis based on each scrip's
category.

Add another broker P&L? Yes / No
```

* If unrecognised format: "I couldn't read this file. Try downloading as CSV or Excel."
* **Acceptance criteria:** Native parsing for Zerodha CSV, Groww, Upstox, Angel One; generic column-mapping fallback for others; running tally shown after each upload; up to 5 brokers supported; **cross-broker handling: aggregate (sum) P&L across brokers, do NOT deduplicate** — each broker independently maintains FIFO for its own depository holdings, so the same scrip held across two brokers has independent tax lots and independent P&L calculations; simply sum the gains and losses from each broker; **intraday and F&O filtering: the parser must exclude intraday equity trades (speculative business income under Section 43(5)) and all F&O trades (non-speculative business income) from the capital gains computation** — these are taxed under "Profits and Gains from Business or Profession," not "Capital Gains," and use different tax heads and rates; if intraday or F&O transactions are detected, bot informs user:

```
ℹ️ I found intraday stock trades and/or
F&O (futures & options) transactions in
your P&L. These are not capital gains —
they're taxed as business income under
a different head.

This tool only covers capital gains from
delivery-based stock and ETF trades.
Your intraday/F&O income is excluded
from this analysis. Consult a CA for
those.
```

---

## Epic 4: Broker Holdings Upload

### US-14 — Broker Holdings Download Instructions
**As a user, I want step-by-step instructions to download my current holdings from my exact broker.**

* Bot transitions directly from P&L confirmation:

```
Great. Now I need your current holdings
to see your unrealised positions.

This tells me which stocks and ETFs
you've held long enough to qualify for
LTCG treatment — and flags any unrealised
losses you could book to save tax.
```

Zerodha (Web):

```
📈 Zerodha Holdings

1. Go to console.zerodha.com
2. Portfolio > Holdings
3. Download Holdings (CSV)

Upload here ⬆️
```

Zerodha (Kite App):

```
📈 Zerodha Holdings via Kite App

1. Open the Kite app
2. Tap Profile > Console
3. Portfolio > Holdings
4. Download

Upload here ⬆️
```

Groww:

```
📈 Groww Holdings

1. Open Groww app or groww.in
2. Stocks > Holdings
3. Tap Export or Download

Upload here ⬆️
```

Upstox (Web):

```
📈 Upstox Holdings

1. Go to upstox.com and login
2. Portfolio > Holdings
3. Export Holdings (CSV)

Upload here ⬆️
```

Upstox (App):

```
📈 Upstox Holdings via App

1. Open Upstox app
2. Tap Profile > My Account
3. Reports > Holdings
4. Download

Upload here ⬆️
```

Angel One (Web):

```
📈 Angel One Holdings

1. Go to angelone.in and login
2. My Portfolio > Holdings
3. Download Holdings (CSV or PDF)

Upload here ⬆️
```

Angel One (App):

```
📈 Angel One Holdings via App

1. Open Angel One app
2. Portfolio > Holdings
3. Download or Export

Upload here ⬆️
```

Other:

```
📈 Other Broker Holdings

Look for:
Portfolio > Holdings > Download
or
Portfolio > Export

Download as CSV, Excel or PDF

Upload here ⬆️
```

### US-15 — Broker Holdings Upload & Validation
**As a user, I want to upload my holdings and get a clear confirmation of what the bot has found.**

* Bot accepts CSV, Excel, or PDF
* Parses: scrip name, quantity, current market price, and **lot-level purchase data (date and price per lot)** for stocks (FIFO method applies under the IT Act — average cost is NOT permitted for shares; each lot's purchase date determines STCG vs LTCG classification and each lot's purchase price determines the gain/loss); for MF holdings within the CAS, weighted average cost is used per Section 48
* Separates into four groups: LTCG eligible (held >12 months, in profit), LTCL candidates (held >12 months, at a loss), STCL candidates (held ≤12 months, at a loss), not yet LTCG eligible (held ≤12 months, in profit or flat)
* Confirms:

```
✅ Found in your Zerodha holdings:

LTCG eligible (held over 1 year, in profit):
Infosys          Est. LTCG:  ₹18,400
Titan Company    Est. LTCG:  ₹12,250
Nifty BeES ETF   Est. LTCG:   ₹9,100

LTCL candidates (held over 1 year, at loss):
Vedanta          Est. LTCL:  -₹3,100
                 Held: 15 months

STCL candidates (held under 1 year, at loss):
Paytm            Est. STCL:  -₹4,200
                 Held: 6 months
Zomato           Est. STCL:  -₹1,800
                 Held: 4 months

Not yet LTCG eligible (held under 1 year, in profit):
HDFC Bank        Held: 8 months

Total est. unrealised LTCG:  ₹39,750
Total est. unrealised LTCL:  -₹3,100
Total est. unrealised STCL:  -₹6,000

Estimates based on today's price.
Actual figures depend on price at
time of sale.

Add holdings from another broker? Yes / No
```

* **Acceptance criteria:** Native parsing for Zerodha, Groww, Upstox, Angel One; all figures labelled as estimates; **four-group separation** applied clearly (LTCG eligible, LTCL candidates, STCL candidates, not yet LTCG eligible); LTCL candidates are critical for loss harvesting against LTCG and must not be missed; running tally updated after each broker's holdings; **corporate actions handling:** bonus shares have zero acquisition cost and the holding period starts from the allotment date (not the original share's purchase date) — they are typically short-term unless the bonus was allotted over 12 months ago; stock splits change per-share cost but not total cost and do not reset the holding period; rights shares have their own acquisition cost (rights price paid); the parser must use the broker's lot-level data which reflects these adjustments, not attempt to reconstruct them

---

## Epic 5: ITR Upload

### US-16 — ITR Education & Download Instructions
**As a user, I want the bot to guide me to download my ITR so carry-forward losses are extracted automatically.**

* Bot sends:

```
📋 Download your ITR

1. Go to incometax.gov.in
2. Login with PAN + password
3. e-File > Income Tax Returns >
   View Filed Returns
4. Select AY 2025-26 (for FY 2024-25)
5. Download the ITR PDF or JSON

Upload here ⬆️
```

* Accepts ITR-V PDF, ITR-2 PDF, ITR-3 PDF, ITR JSON
* **Acceptance criteria:** Bot clarifies ITR must be AY 2025-26 i.e. filed for FY 2024-25; bot explains this is only needed to extract Schedule CFL carry-forward figures

### US-17 — ITR Upload & Carry-Forward Extraction
**As a user, I want the bot to automatically extract my carry-forward losses from my ITR.**

* After successful upload, bot asks the filing date check:

```
One important question: Was the ITR
for the loss year filed on or before
the due date (usually July 31)?

Under Section 80 of the IT Act, capital
losses can only be carried forward if
the return was filed on time. If you
filed a belated return (after July 31),
those losses legally cannot be carried
forward — even though they appear in
Schedule CFL.

1. Yes, it was filed on time
2. No, it was filed late
3. Not sure
```

* If "Yes" → proceed with extraction
* If "No" → bot warns:

```
Since the return was filed late, the
capital losses from that year legally
cannot be carried forward under Section
80, even though they appear in your ITR.

I'll exclude carry-forward losses from
your plan to avoid incorrect offsets.

You can still proceed — the analysis
will work without carry-forward losses.
```

→ CF losses set to ₹0; proceed to analysis

* If "Not sure" → bot provides guidance:

```
You can check this on the IT portal:
e-File > View Filed Returns > look at
the "Date of Filing" column.

If it says a date on or before July 31
of the year after the FY (e.g., July 31,
2025 for FY 2024-25), you're fine.

For now, I'll include the losses. If you
later discover the return was belated,
the carry-forward portion of your plan
should be disregarded.
```

→ Proceed with extraction; flag in final disclaimer

* Bot parses Schedule CFL
* Extracts LTCL and STCL from FY 2024-25 and any older tranches still within the 8-year window
* Confirms:

```
✅ Found in your ITR (AY 2025-26):

LTCL carried forward: ₹45,000
  (from FY 2024-25, expires FY 2032-33)

STCL carried forward: ₹12,000
  (from FY 2024-25, expires FY 2032-33)

I'll factor these into your tax plan.
```

* If none found: "No carry forward losses in your ITR. You start this year clean."
* If ITR unreadable → proceed to US-18
* **Acceptance criteria:** Filing date check (Section 80) performed before extracting CF losses — belated returns result in CF losses being excluded; multiple years of carry forward losses aggregated correctly; expiry year tracked and displayed per tranche; **note on ITR sourcing:** the most recent ITR (AY 2025-26) contains Schedule CFL which aggregates all carry-forward loss tranches from prior years still within the 8-year window — so a single ITR upload is sufficient even if the losses originated in FY 2020-21 or earlier; if a user's most recent ITR is for an earlier AY (e.g. they haven't filed AY 2025-26 yet), the bot should accept the latest available ITR and extract whatever Schedule CFL data is present, noting that any losses from the most recent unfiled year won't be captured

### US-18 — Manual Carry-Forward Entry (Fallback)
**As a user who can't upload their ITR, I want to enter carry-forward figures manually.**

* Bot asks:

```
No problem. Find these in Schedule CFL
of your last filed ITR.

Enter your figures (or 0 if none):

LTCL carried forward: ₹ ?
STCL carried forward: ₹ ?
```

* Bot confirms figures before proceeding
* **Acceptance criteria:** Inputs validated; negative values not accepted for loss fields; confirmed back to user before proceeding

---

## Epic 6: Tax Analysis

### US-19 — Unified Tax Summary
**As a user, I want to see my complete FY 2025-26 tax position across all sources in one clear summary.**

At this point the bot has all documents. Netting logic applied in strict order:

1. Classify every realised item from CAS and broker P&L:
   * Equity STCG / STCL: equity-oriented funds (>65% domestic equity) or listed stocks/ETFs held ≤12 months
   * Equity LTCG / LTCL: equity-oriented funds (>65% domestic equity) or listed stocks/ETFs held >12 months; **for units/shares acquired before Feb 1, 2018, apply the Section 112A grandfathering rule to compute cost of acquisition** (see US-08 acceptance criteria)
   * Non-equity STCG / STCL: non-equity funds held ≤24 months; or any post-Apr 2023 debt/specified fund (equity allocation <35%) regardless of holding period
   * Non-equity LTCG / LTCL: non-equity funds held >24 months, purchased before Apr 2023 only
   * Hybrid funds: classify based on actual SEBI category — aggressive hybrid (>65% equity) → equity treatment; conservative hybrid, balanced advantage with <65% equity → non-equity treatment (see fund classification rules below)
   * International equity funds: always non-equity treatment regardless of equity allocation, because underlying is foreign equity
   * Fund-of-funds: classified based on the underlying fund's category, not the FoF wrapper
   * Gold ETFs and Gold MFs: non-equity treatment; Gold ETFs are listed securities so LTCG threshold is >12 months; Gold MFs structured as fund-of-funds may fall under Section 50AA if purchased after April 2023 (equity allocation <35%) — treat as slab-rated in that case
   * ELSS: classified as equity; locked units excluded entirely from all calculations

2. Net current year losses first (per Sections 70 and 71 of the Income Tax Act — current year set-off must be applied before brought-forward losses under Section 72), **targeting higher-taxed gains first:**
   * Current year STCL offsets current year STCG first, then LTCG. **Within STCG, target the higher-taxed category first:** non-equity STCG (slab rate, up to 30%) before equity STCG (flat 20%). This maximises the tax value of each rupee of STCL. Section 70 does not explicitly prescribe an order between categories — the prevailing practice among CAs is to exercise discretion in the allocation order, and this is widely accepted. (Note: this discretion is not explicitly codified in the statute; in rare cases the tax department could challenge the ordering. The risk is low for retail investors but should be disclosed.)
   * If STCL exceeds total STCG, the remainder spills to LTCG — **target non-exempt LTCG first** (non-equity LTCG, which has no ₹1.25L exemption) before equity LTCG.
   * Current year LTCL offsets current year LTCG only (both within and across categories — target non-equity LTCG first, then equity LTCG, for the same exemption-preservation reason). LTCL can never offset STCG.

3. Apply carry-forward losses in order (Section 72 — only after current year set-off is complete), **targeting non-exempt taxable gains first:**
   * CF LTCL offsets remaining LTCG — **apply against non-equity LTCG first** (which has no exemption and is fully taxable at 12.5%), then against equity LTCG (which has the ₹1.25L exemption as a buffer). This ordering saves real tax; applying CF LTCL against exemption-covered equity LTCG wastes the loss on gains that would have been tax-free anyway.
   * Between CF LTCL and CF STCL: apply CF LTCL first against LTCG (since LTCL can only offset LTCG), preserving CF STCL for remaining STCG or LTCG.
   * CF STCL offsets remaining STCG first (targeting higher-taxed STCG), then any remaining LTCG (targeting non-exempt LTCG before equity LTCG).
   * CF LTCL cannot offset STCG under any circumstance.
   * **Generic rule:** When equity LTCG exceeds ₹1.25L even after optimal CF allocation, the exemption becomes irrelevant to the allocation choice (both equity and non-equity LTCG are taxed at 12.5%). In that case, CF losses against either type yield the same tax saving. The "non-exempt first" rule only matters when equity LTCG would be partially or fully covered by the exemption.

4. Apply ₹1.25L exemption to net equity LTCG only. No equivalent exemption exists for non-equity LTCG.

5. **Section 87A rebate re-check (new regime only):** If the user selected the "Up to ₹12L (87A rebate)" slab bracket in US-05A, the bot must re-verify eligibility now that all gains are known. The ₹12L threshold is checked against **total income including ALL capital gains** — equity STCG (Section 111A), equity LTCG (Section 112A), non-equity STCG (slab), non-equity LTCG (Section 112), and slab-rated post-Apr 2023 debt gains. Total income for 87A threshold = base income (from US-05A) + ALL net capital gains across every category. If this total exceeds ₹12L, the 87A rebate is forfeited entirely — even the slab-rate portion loses the rebate — and the bot must recalculate using actual marginal slab rates instead of 0%. Note: the rebate itself only reduces tax on slab-rated income (it cannot reduce tax computed under Sections 111A, 112, or 112A), but the threshold test uses total income from all sources. The bot should inform the user:

```
ℹ️ Your total income including capital
gains is ₹[X] — above ₹12 lakh.

The Section 87A rebate no longer applies.
(The ₹12L threshold includes all income
— salary, non-equity gains, AND equity
gains — even though the rebate itself
only reduces slab-rate tax.)

Your non-equity gains will now be taxed
at your actual marginal slab rate instead
of 0%.

Updated slab rate: [X]%
```

6. Apply tax rates:
   * Net equity STCG after offsets: 20%
   * Net equity LTCG above ₹1.25L after offsets: 12.5%
   * Non-equity STCG after offsets: slab rate (as determined by Step 5 re-check)
   * Non-equity LTCG after offsets (pre-Apr 2023 purchases only): 12.5%
   * Post-Apr 2023 debt/specified fund gains: always slab rate regardless of holding period

Note: Unrealised positions from Holdings (US-15) and ELSS locked units are not included in this summary — unrealised gains are not taxable. This data is held for loss and gains harvesting sections.

Bot shows:

```
📊 Your Complete FY 2025-26 Tax Summary
━━━━━━━━━━━━━━━━━━━━━━━━━

Step 1 — Current year set-off (Sec 70):
(Capital Gains is one head — losses
offset gains across all categories.
Higher-taxed gains targeted first.)

All STCG:
  Non-equity STCG:             ₹6,500
  (post-Apr 2023 debt @ slab 30%)
  Equity STCG:                 ₹8,200
  (@ 20%)
  Total STCG:                 ₹14,700

All STCL:
  Equity STCL (MF):           -₹3,940
  Equity STCL (stocks):       -₹6,188
  Total STCL:                -₹10,128

STCL applied vs higher-taxed STCG first:
  Non-eq STCG ₹6,500 @30% → ₹0 ✅
  (₹6,500 of STCL used)
  Equity STCG ₹8,200 @20% → ₹4,572
  (remaining ₹3,628 of STCL used)
  STCL fully absorbed — none spills
  to LTCG.

All LTCG:
  Equity LTCG (MF + Stocks):  ₹87,388
  Non-equity LTCG:             ₹14,200
  (pre-Apr 2023 debt @ 12.5%)

No current year LTCL to apply.

━━━━━━━━━━━━━━━━━━━━━━━━━

Step 2 — Carry-forward set-off (Sec 72):
(Non-exempt gains targeted first to
maximise tax saved per rupee of CF loss)

CF LTCL (FY 24-25):          -₹45,000
  vs non-equity LTCG first:  -₹14,200
  Non-equity LTCG → ₹0 ✅
  Remaining CF LTCL:          -₹30,800
  vs equity LTCG:            -₹30,800
  Equity LTCG remaining:      ₹56,588

CF STCL (FY 24-25):          -₹12,000
  vs equity STCG (₹4,572):    -₹4,572
  Equity STCG → ₹0 ✅
  Remaining CF STCL:           -₹7,428
  vs equity LTCG:              -₹7,428
  Equity LTCG remaining:      ₹49,160

━━━━━━━━━━━━━━━━━━━━━━━━━

Step 3 — Exemption (Sec 112A):
Net equity LTCG:              ₹49,160
Less ₹1.25L exemption:      -₹49,160
Taxable equity LTCG:              ₹0 ✅

━━━━━━━━━━━━━━━━━━━━━━━━━

Summary:
Tax on equity LTCG:               ₹0 ✅
Tax on equity STCG:               ₹0 ✅
Tax on non-equity LTCG:          ₹0 ✅
Tax on non-equity STCG:          ₹0 ✅

TOTAL TAX LIABILITY:              ₹0 ✅

Exemption used:              ₹49,160
Exemption remaining:         ₹75,840

Why ₹0? Your carry-forward losses were
strategically applied against non-equity
LTCG first (which has no exemption),
saving ₹1,775 vs the alternative of
applying them against equity LTCG
(which was exemption-covered anyway).

Note: Surcharge and 4% cess not
included. Consult a CA for your
final liability.

Your tax regime: New regime
Your slab rate: 30% (income above ₹24L)
(Change this? Reply "Change slab")

This summary covers capital gains only.
Dividend income from mutual funds and
stocks is taxable separately as "Income
from Other Sources" at your slab rate
and is not included here.

STT (Securities Transaction Tax) is
automatically deducted on equity MF
and stock transactions. STT payment
is what makes your equity gains
eligible for the 20%/12.5% rates
under Sections 111A and 112A.
```

* **Acceptance criteria:** Current year losses applied before carry-forward losses (Sections 70/71 before Section 72); **STCL targets higher-taxed STCG first** (non-equity slab-rate before equity 20%); STCL applied against STCG first before spilling to LTCG; **CF losses target non-exempt LTCG first** (non-equity LTCG before equity LTCG, because non-equity LTCG has no ₹1.25L exemption); CF LTCL applied against LTCG before CF STCL (to preserve STCL flexibility); LTCL never applied against STCG; **when equity LTCG exceeds ₹1.25L even after optimal allocation, both equity and non-equity LTCG are taxed at 12.5% and allocation order becomes neutral**; **87A rebate re-checked after parsing** — threshold test uses total income including ALL capital gains (equity + non-equity); if total exceeds ₹12L, rebate is forfeited entirely and actual marginal slab rates used for non-equity gains; the rebate itself only reduces slab-rate tax but the ₹12L eligibility check includes equity gains at special rates too; ₹1.25L exemption never applied to non-equity; post-Apr 2023 debt gains always slab-rated regardless of holding period; locked ELSS units excluded from all figures; surcharge, cess, and slab rate assumption disclaimed; **dividend income exclusion explicitly stated** — dividends from MFs and stocks are taxable at slab rate under "Income from Other Sources" and are outside the scope of this tool; **STT prerequisite noted** — equity STCG/LTCG rates under Sections 111A/112A require STT to have been paid

### US-20 — Tax Liability Breakdown on Request
**As a user, I want to drill into any line item to understand how it was calculated.**

* User can reply "Explain non-equity" or "How was STCG calculated?" or "What is CF LTCL?"
* Bot sends a plain-English breakdown of that specific line
* If user asks "I haven't sold anything — why do I have realised gains?":

```
This usually happens because of:

1. STP (Systematic Transfer Plan):
   Each STP instalment is a redemption
   from the source fund and a purchase
   in the target fund. Each transfer is
   a taxable event.

2. Switch transactions:
   Switching from Fund A to Fund B
   (even within the same AMC) is treated
   as a redemption from A + fresh purchase
   in B. The redemption triggers capital
   gains.

3. Dividend reinvestment (pre-2020):
   Older dividend reinvestment plans
   involved actual unit transactions.

Check your CAS transaction history
to see these events.
```

* **Acceptance criteria:** Every figure in the summary explainable in one follow-up message; ELSS lock-in exclusions explainable if asked; switch and STP transactions explained if user is surprised by unexpected realised gains

---

## Epic 7: Loss Harvesting

### US-21 — Loss Harvesting Plan — Mutual Funds
**As a user, I want the bot to identify unrealised MF losses I can book to reduce my tax bill or build a carry-forward loss bank for future years.**

* Bot scans all MF folios for unrealised losses
* Excludes any ELSS units that are still within the 3-year lock-in
* Applies correct loss type based on holding period and fund category
* **If no unrealised losses found across any MF folio**, bot shows:

```
📉 Loss Harvesting — Mutual Funds

No unrealised losses found in your
mutual fund portfolio. All your MF
positions are currently in profit
or have locked units only.

Nothing to harvest here — skipping
to stock loss harvesting.
```

→ proceed directly to US-22

* If unrealised losses exist, sends:

```
📉 Tax Saving Plan — Mutual Funds

Good news: your tax liability is already
₹0 thanks to your carry-forward losses
and the ₹1.25L exemption.

Booking these losses won't reduce your
tax this year — but it builds a carry-
forward loss bank for FY 2026-27 and
beyond (valid for 8 years).

This is worth doing if:
• You expect taxable capital gains in
  the next few years
• The fund has nil exit load
• You reinvest immediately to stay in
  the market

⚠️ IMPORTANT: To actually carry forward
these losses, you MUST:

1. File your FY 2025-26 ITR on or before
   July 31, 2026 (the due date under
   Section 139(1)). If you file late,
   these losses CANNOT be carried forward
   — they're legally dead under Section 80.

2. File ITR-2 or ITR-3 (NOT ITR-1).
   ITR-1 does not have Schedule CG or
   Schedule CFL, so your capital gains
   and carry-forward losses won't be
   captured. If you normally file ITR-1,
   you'll need to switch to ITR-2 this
   year because you have capital gains.

━━━━━━━━━━━━━━━━━━━━━━━━

Funds with harvestable losses:

a) Kotak Small Cap Fund Direct Growth
   Unrealised STCL: -₹8,240
   Held: 8 months (short term loss)
   Exit load: Nil ✅
   Tax saved this year: ₹0
   CF value: ₹8,240 STCL for FY 2026-27
   (can offset future STCG and LTCG)

b) Mirae Asset Emerging Bluechip
   Unrealised LTCL: -₹4,100
   Held: 26 months (long term loss)
   Exit load: Nil ✅
   Tax saved this year: ₹0
   CF value: ₹4,100 LTCL for FY 2026-27
   (can offset future LTCG only)

Combined CF value if booked: ₹12,340
(₹8,240 STCL + ₹4,100 LTCL)

Tax saved this year: ₹0
```

* If an ELSS fund has locked units at a loss:

```
ℹ️ Axis Long Term Equity Fund has units
at a loss but they are still within the
3-year lock-in period. These cannot be
redeemed yet.
```

* **Reinvestment timing for loss harvesting (different from gains harvesting):**

```
After booking a loss, reinvest immediately
— the same day or next business day.

Unlike gains harvesting (where you wait
until April to reset cost basis), loss
harvesting has no reason to wait.
You want to stay invested.

For stocks: buy back the same day ✅
For MFs: place a fresh purchase order
the same day — the new units will be
allotted at that day's NAV (if before
cut-off) or next day's NAV.

There is no wash sale rule in India
for either stocks or mutual funds.
```

* **Recommendation threshold (conditional on base liability):**
   * **When base liability > ₹0 (tax-saving mode):** only recommend if tax saved minus exit load > ₹200
   * **When base liability = ₹0 (carry-forward-building mode):** recommend any position with nil exit load, regardless of the ₹200 tax-saving threshold — the value is the carry-forward loss itself, not current-year tax reduction; positions with non-nil exit load are excluded unless the user explicitly asks to include them
* **Anti-avoidance check (Sections 94(7) and 94(8)):** Before recommending any MF loss harvesting, the bot must check:
   * **Section 94(7) — Bonus stripping:** If bonus units were allotted and the original units are being sold at a loss within 9 months after the record date, the loss is disallowed to the extent of the value of bonus units. Bot must check CAS transaction history for bonus allotments and exclude affected folios from loss harvesting recommendations.
   * **Section 94(8) — Dividend stripping:** If units were purchased within 3 months before the record date for a dividend/income distribution and sold within 9 months after the record date at a loss, the loss is disallowed to the extent of the dividend received. Bot must check CAS transaction history for dividend record dates and exclude affected folios.
   * If a folio is excluded due to either provision, bot explains:

```
ℹ️ [Fund Name] shows an unrealised loss
but was excluded from the plan.

You received [bonus units / a dividend]
on [date] and selling within 9 months
of that date would trigger Section
94(7)/94(8), which disallows the loss.

This loss becomes available for
harvesting after [date + 9 months].
```

* **Acceptance criteria:** Correctly distinguishes STCL vs LTCL based on holding period and fund category; post-Apr 2023 debt fund losses always classified as STCL; cross-bucket offsets applied correctly; locked ELSS units never recommended; **recommendation threshold is conditional:** when base liability > ₹0, funds where tax saved minus exit load < ₹200 are excluded; when base liability = ₹0, any nil-exit-load fund is recommended for carry-forward value (no ₹200 tax-saving filter); **ITR filing prerequisite always shown when CF-building mode is active:** user warned they must file ITR-2/ITR-3 (not ITR-1) before July 31, 2026 to carry forward losses — this warning appears in the loss harvesting plan, the recalculated summary (US-25), and the PDF report (US-36); **Section 94(7) bonus stripping and Section 94(8) dividend stripping checks applied** — any folio where selling would trigger loss disallowance is excluded with explanation and the date when the loss becomes harvestable is shown

### US-22 — Loss Harvesting Plan — Stocks & ETFs
**As a user with stock losses, I want the bot to identify both realised and unrealised stock losses I can use to reduce my tax bill.**

* **If no unrealised stock losses exist in holdings** (all positions in profit or no holdings uploaded), bot shows:

```
📉 Loss Harvesting — Stocks & ETFs

No unrealised losses found in your
stock holdings. All positions are
currently in profit.

Skipping to non-equity loss harvesting.
```

→ proceed directly to US-23

* If unrealised stock losses exist, bot first surfaces realised losses from the Tax P&L already collected:

```
📉 From your Zerodha P&L:

Realised STCL from stocks: -₹6,188

This has already been factored into
your tax summary. Along with your
MF STCL of ₹3,940, your total current
year STCL of ₹10,128 offset ₹6,500
non-equity STCG (at 30% slab) and
₹3,628 of equity STCG (at 20%) —
targeting the higher-taxed gains first.

No additional action needed — these
savings are already captured.
```

* Bot then surfaces unrealised losing positions from the Holdings file:

```
I can also see these positions in your
holdings are currently at a loss:

Vedanta   Unrealised LTCL: -₹3,100
          Held: 15 months (long term)

Paytm     Unrealised STCL: -₹4,200
          Held: 6 months

Zomato    Unrealised STCL: -₹1,800
          Held: 4 months

Your tax liability is already ₹0 this
year. Booking these losses won't save
tax now, but creates carry-forward
losses for future years.

Vedanta   Tax saved this year: ₹0
          CF value: ₹3,100 LTCL for
          FY 2026-27 (offsets future
          LTCG only)

Paytm     Tax saved this year: ₹0
          CF value: ₹4,200 STCL for
          FY 2026-27 (offsets future
          STCG and LTCG)

Zomato    Tax saved this year: ₹0
          CF value: ₹1,800 STCL for
          FY 2026-27

You can sell these to book the loss
and immediately buy them back.

India does not have a wash sale rule
like the US — you can repurchase the
same stock on the same day or the
next day and the loss is still
recognised for tax purposes.

Note: While this is standard practice,
if you do this repeatedly and at very
large scale, the tax department could
theoretically invoke GAAR (General
Anti-Avoidance Rules, Chapter X-A)
if they view the transactions as having
no commercial substance beyond tax
avoidance. For typical retail investors
doing this once a year, this is not
a practical concern.

Additional tax saved from stocks: ₹0
Additional CF value from stocks: ₹9,100
(₹3,100 LTCL + ₹4,200 STCL + ₹1,800 STCL)
```

* If user asks "should I buy back immediately or wait?":

```
You can buy back immediately — same day
is fine under Indian tax law.

The only thing to watch: if the stock
rises between your sell and buy-back,
your repurchase cost is higher. For
most cases the difference is negligible,
especially for same-day transactions.

For mutual funds specifically, also note
that Sections 94(7) and 94(8) can
disallow losses in certain situations
involving bonus units or dividends —
but those checks are already applied
in the MF section of your plan.
```

* **Acceptance criteria:** Realised losses from P&L surfaced first; unrealised losses from Holdings surfaced second; STCL vs LTCL correctly identified based on holding period; **tax saved per position computed against remaining taxable gains after all prior recommendations** (MF harvesting runs first, so stock harvesting sees the post-MF residual); **STCL applied against remaining STCG first before LTCG** — if any STCG survives the base netting, STCL targets it before spilling to LTCG; positions where tax saving is under ₹200 excluded; buy-back logic explained proactively; GAAR caveat included for transparency without discouraging standard practice

### US-23 — Loss Harvesting Plan — Non-Equity Mutual Funds
**As a user with non-equity funds showing unrealised losses, I want to know if booking them reduces my tax.**

* **If no unrealised non-equity losses exist**, bot shows:

```
📉 Non-Equity Loss Harvesting

No unrealised losses found in your
non-equity mutual fund holdings.

Skipping to carry-forward strategy.
```

→ proceed directly to US-24

* If unrealised non-equity losses exist, bot sends:

```
📉 Non-Equity Loss Harvesting

After equity MF and stock loss harvesting
above, all taxable gains have been offset.
No additional tax can be saved this year.

1. HDFC Corporate Bond Fund
   Purchased: Jan 2022 (pre-Apr 2023)
   Unrealised LTCL: -₹5,400
   Offsets: any LTCG (equity or non-equity)
   Tax saved this year: ₹0
   (no taxable LTCG remains)
   Full ₹5,400 carries forward to
   FY 2026-27

2. Nippon Liquid Fund
   Purchased: Jun 2023 (post-Apr 2023)
   Unrealised STCL: -₹1,200
   Tax saved this year: ₹0
   (no taxable gains remain)
   Full ₹1,200 carries forward

Consider booking these losses anyway
to build a carry-forward position for
next year — but only if the fund has
nil exit load and you plan to reinvest
immediately in a similar fund.

Losses booked in FY 2025-26 can be
carried forward for 8 years (until
FY 2033-34). This is most useful if
you expect taxable capital gains in
the next 2-3 years. If you're a
buy-and-hold investor who rarely sells,
the carry-forward may expire unused.
```

* **Acceptance criteria:** Pre/post April 2023 purchase date split applied at folio level not fund level; non-equity LTCL can legally offset any LTCG (equity or non-equity) under Section 70, but the bot should strategically recommend offsetting non-equity LTCG first (which has no exemption) to preserve the ₹1.25L equity LTCG exemption headroom; LTCL can never offset STCG; post-Apr 2023 debt losses always classified as STCL regardless of holding period

### US-24 — Carry-Forward Loss Strategy
**As a user with carry-forward losses, I want to understand how they were applied and what carries over to next year.**

* Bot sends:

```
💡 Carry Forward Strategy

You had ₹45,000 LTCL and ₹12,000 STCL
carried forward from last year.

Here's how they were strategically used:

CF LTCL: ₹45,000
  → First against non-equity LTCG of
    ₹14,200 (fully taxable at 12.5%,
    no exemption). Non-equity LTCG → ₹0.
    This saved ₹1,775 in real tax.
  → Remaining ₹30,800 against equity
    LTCG (₹87,388 → ₹56,588). This
    is covered by the ₹1.25L exemption.

CF STCL: ₹12,000
  → First against remaining equity STCG
    ₹4,572 → ₹0.
  → Remaining ₹7,428 against equity
    LTCG (₹56,588 → ₹49,160). Also
    covered by exemption.

Remaining CF losses: ₹0

Why this order matters: by targeting
non-equity LTCG first (which has no
exemption), your CF losses saved ₹1,775
in real tax. If we'd applied them against
equity LTCG first, you would have owed
₹1,775 on non-equity LTCG — a ₹1,775
difference from the same CF losses.
```

* **Acceptance criteria:** Carry-forward applied after current year set-off (Step 2 in US-19) and before the ₹1.25L exemption (Step 4 in US-19) in the netting logic; **CF losses target non-exempt taxable gains first** (non-equity LTCG before equity LTCG); CF LTCL applied before CF STCL against LTCG to preserve STCL flexibility; **the tax saving from optimal allocation vs naive allocation is shown** so the user understands why the order matters; expiry year shown per tranche; remaining balance correctly calculated and surfaced

### US-25 — Recalculated Tax Summary After Loss Harvesting
**As a user who has reviewed the loss harvesting plan, I want to see my updated tax position before moving to gains harvesting.**

* Bot shows:

```
✅ Updated Tax Summary

If you book the recommended losses:

Your tax was already ₹0 before any
loss harvesting — thanks to optimal
carry-forward loss allocation.

Loss harvesting this year is about
building a carry-forward loss bank:

CF losses generated if you act:
  MF STCL:     ₹8,240 (Kotak)
  MF LTCL:     ₹4,100 (Mirae)
  Stock LTCL:  ₹3,100 (Vedanta)
  Stock STCL:  ₹6,000 (Paytm + Zomato)
  Total:      ₹21,440 CF for FY 2026-27

LTCG exemption used so far:  ₹49,160
LTCG exemption remaining:    ₹75,840

Now let's use that remaining exemption
to save tax in future years by resetting
your cost basis today.

⚠️ Remember: to carry forward the losses
above, file ITR-2/ITR-3 before July 31,
2026. Filing late or filing ITR-1 means
these losses are lost.
```

* If base liability is already ₹0 (as in this example), bot clarifies:

```
You owe ₹0 tax this year already.
Gains harvesting is NOT about reducing
this year's tax — it's about using your
remaining ₹1.25L exemption to book
gains tax-free NOW, resetting your cost
basis higher so you pay less tax when
you eventually sell in future years.
```

* If base liability is under ₹500 but above ₹0, bot adds:

```
Your remaining tax liability is very
small (₹[X]). The effort of executing
the loss harvesting trades may outweigh
the savings. Consider skipping loss
harvesting and proceeding directly to
gains harvesting to use your ₹1.25L
exemption for future tax savings.
```

* User can reply "Skip gains harvesting" to jump to action guidance
* **Acceptance criteria:** Figures reflect all loss harvesting recommendations across MF, stocks, and non-equity; **gains harvesting target computed via full netting re-run:** once the user confirms which loss harvesting recommendations to act on, the bot re-runs the complete netting (Steps 1-4 of US-19) with the newly booked losses included as additional current-year losses — this produces the exact remaining exemption for gains harvesting, accounting for all interaction effects between new losses, CF allocation, and exemption consumption; the incremental approach (simply adding losses to the old computation) is NOT used because it can produce a different target due to CF reallocation; **negligible liability check** — if base liability is ₹0 or under ₹500, bot explains this and reframes loss harvesting as carry-forward-building rather than tax-saving

---

## Epic 8: Gains Harvesting

### US-26 — Exemption Remaining Callout
**As a user with unused LTCG exemption, I want to know exactly how much I can still book tax-free — and be warned if my stock holdings could eat into that limit.**

* Bot calculates remaining exemption from realised data only:

```
Remaining = ₹1,25,000 minus net realised
equity LTCG after all loss offsets
```

* Sends:

```
💡 Your Gains Harvesting Opportunity

LTCG exemption remaining:  ₹75,840

This is based on your realised gains
and losses so far this year.
```

* Then surfaces unrealised stock holdings as a warning, not a deduction:

```
⚠️ Important: Your stock holdings show
estimated unrealised LTCG of ₹39,750.

If you sell any of those stocks before
March 31st, those gains will consume
part of your ₹75,840 limit.

If you have no plans to sell those
stocks this year, your full ₹75,840
is available for MF harvesting.
```

* If no stock holdings were uploaded:

```
💡 LTCG exemption remaining: ₹75,840

Note: If you hold stocks with unrealised
long-term gains and plan to sell them
before March 31st, that will reduce
this limit. The plan below assumes
you won't.
```

* If remaining is ₹0: skip gains harvesting with explanation
* **Acceptance criteria:** Unrealised stock LTCG shown as contextual warning only; never deducted from available limit automatically; calculation uses only realised figures; user retains full agency

### US-27 — Gains Harvesting Plan — Mutual Funds
**As a user with unused exemption, I want to know which mutual funds are eligible and how much I need to exit in total.**

* Bot identifies MF folios with unrealised **equity** LTCG only for the ₹1.25L exemption target:
   * Held >12 months for equity-oriented funds (domestic equity allocation >65%)
   * ELSS: unlocked units only (lock-in expired); locked units excluded entirely
   * Non-equity funds are **excluded** from gains harvesting — the ₹1.25L exemption under Section 112A does not apply to non-equity LTCG, so harvesting non-equity gains would create a fully taxable event at 12.5% (pre-Apr 2023) or slab rate (post-Apr 2023) with no exemption benefit

* Accounts for exit load in two ways: (a) **gain estimate adjusted** — exit load reduces the sale consideration (NAV × units × (1 - exit load %)), which reduces the actual LTCG booked vs the unrealised estimate; the bot must show the gain estimate net of exit load impact, not gross; (b) **viability check** — excludes any fund where net benefit after exit load is under ₹200

* Sends:

```
🌾 Gains Harvesting Plan

Available limit for MF harvesting: ₹75,840

These funds are eligible:

1. Navi Nifty 50 Index Fund Direct Growth
   Unrealised LTCG available: ₹62,902
   Held: 14 months ✅
   Exit load: Nil ✅

2. PPFAS Flexi Cap Direct Growth
   Unrealised LTCG available: ₹31,200
   Held: 18 months ✅
   Exit load: Nil ✅

3. Axis Long Term Equity Fund (ELSS)
   Unrealised LTCG available: ₹14,200
   Unlocked units only ✅
   Exit load: Nil ✅
   Note: ₹28,400 in locked units
   excluded — not available this FY

You need to exit a combination of
these funds such that your total
booked LTCG equals ₹75,840.

You could take the full amount from
one fund or split across multiple
in any proportion — entirely your choice.

Keep your total exits to ₹75,840
of gains.

Going above means you'll pay 12.5% tax
on the excess — unnecessary when you
could harvest that portion next year
using next year's fresh ₹1.25L exemption.

Going below leaves tax-free capacity
unused this year. The exemption does NOT
carry forward — each FY you get a fresh
₹1.25L regardless of what you used
this year.

Your exact redemption amounts depend
on NAV at the time you place the order.
Use your fund app or MFCentral.
```

* If total available unrealised equity LTCG across all eligible funds is less than the remaining exemption:

```
Your total available unrealised equity
LTCG is ₹[X] — less than your remaining
₹[Y] exemption limit.

You can harvest all ₹[X] tax-free.
The unused ₹[Y-X] of exemption cannot
be carried forward to next year — each
FY gives a fresh ₹1.25L regardless.

If you expect more equity LTCG to
materialise before March 31 (e.g. from
stock sales), that would also use this
exemption.
```

* If exit load makes a fund unviable:

```
⚠️ HDFC Flexi Cap Direct Growth
   Unrealised STCG: ₹8,400
   (held 9 months — short term, not
    eligible for LTCG exemption)
   Exit load: 1%
   Exit load cost: ~₹840
   Even without exit load, this fund
   is not eligible for gains harvesting
   because it hasn't been held >12 months.
   Excluded from plan.
```

* **Acceptance criteria:** Bot communicates the total gains target as a single number; user decides how to split across eligible funds; no exact unit counts or rupee redemption amounts specified; ELSS locked units never included; total target is gains booked not redemption value; funds with net benefit under ₹200 after exit load excluded with explanation; **only equity-oriented funds (>65% domestic equity) are eligible** — non-equity, hybrid (<65% equity), international equity, and fund-of-funds are never included in the gains harvesting plan because the ₹1.25L Section 112A exemption does not apply to them

### US-28 — ELSS Upcoming Unlock Alert
**As a user with ELSS funds that unlock after March 31st, I want to know when they become available so I can plan for next year.**

* Triggered automatically after gains harvesting plan is shown
* Bot sends:

```
🔓 Upcoming ELSS Unlocks

These ELSS units are currently locked
but will become available soon:

Axis Long Term Equity Fund
Apr 2023 SIP → Unlocks Apr 2026
May 2023 SIP → Unlocks May 2026
Jun 2023 SIP → Unlocks Jun 2026
Combined est. LTCG: ₹18,900

Mirae Asset Tax Saver Fund
Aug 2023 SIP → Unlocks Aug 2026
Est. LTCG: ₹6,400

These will be available for gains
harvesting in FY 2026-27. Minto will
remind you when they unlock.
```

* Shown only if locked units with unrealised gains exist
* **Acceptance criteria:** Grouped by fund; estimated LTCG shown per batch; unlock dates accurate to the SIP date not the fund's general purchase date; reminder CTA offered for FY 2026-27

### US-29 — Reinvestment Instruction (Gains Harvesting Only)
**As a user acting on the gains harvesting plan, I want to know when and how to reinvest.**

*Note: This is for gains harvesting reinvestment only. For loss harvesting reinvestment (immediate same-day buyback), see US-21.*

* Bot sends proactively:

```
⚡ GAINS HARVESTING reinvestment:
Reinvest on the first business day of
FY 2026-27 (April 1, 2026 is a Wednesday,
so it works) — not before March 31st.

(For loss harvesting, you should have
already reinvested immediately — see
the guidance in your loss harvesting
plan above.)

Why it matters:

Reinvesting before March 31st keeps
your new units in FY 2025-26.

Reinvesting on the first business day of
FY 2026-27 or later means your new units
cleanly start the new FY with a fresh
holding period and a higher cost basis.

The gap means you'll be out of the market
for approximately 4 to 7 calendar days
depending on when you redeem, weekends,
and market holidays. For example, if you
redeem on Thursday March 26, equity MF
proceeds credit on T+1 (March 27), but
you reinvest on April 1 (Wednesday) —
that's 6 calendar days out of the market.

For index funds and diversified equity
funds, this short gap is typically
negligible relative to the tax saved.

There is no wash sale rule in India —
you can reinvest in the exact same fund
on the first business day of the new FY.

You can also reinvest in a different fund
if you prefer — there's no restriction.
Same fund, similar fund (e.g. switching
from one Nifty 50 index fund to another),
or a completely different fund — all work.

Exception: If you redeem ELSS units,
reinvesting in ELSS starts a new 3-year
lock-in from the reinvestment date.
Factor this in if you need liquidity
before 2029.
```

* **Acceptance criteria:** First business day of new FY reinvestment recommendation explicitly stated (with specific date for FY 2026-27 confirmed as April 1, 2026); ELSS-specific lock-in implication called out for users who hold ELSS; no mandatory waiting period beyond FY boundary implied

---

## Epic 9: Action Guidance

### US-30 — Redemption Instructions
**As a user ready to act, I want exact steps to place the redemption.**

* User taps "How do I do this?"
* Bot sends fund-specific instructions:
   * For MFCentral: step-by-step redemption via mfcentral.com
   * For AMC apps: AMC-specific app instructions
   * For ELSS: confirms that only unlocked units can be redeemed; bot never instructs user to redeem locked units
   * For stocks: directs to the relevant broker app to place a sell order
* **Acceptance criteria:** Instructions are AMC and fund specific; bot does not specify unit counts since NAV changes; ELSS instructions explicitly reference unlocked units only

### US-31 — Deadline Awareness
**As a user, I want to always know how many days I have left.**

* Bot shows on every major output screen:

```
⏰ X days left until March 31, 2026
```

* If fewer than 7 days: shown first before any analysis output in bold
* If fewer than 3 days: shown with additional urgency:

```
⚠️ Only X days left. Redemptions placed
today may take 1 to 2 business days
to process. Act today to be safe.
```

* On March 31 specifically, add cut-off time warning:

```
🚨 CRITICAL: March 31 is the last day.

For your gains/losses to count in
FY 2025-26, your redemption order
must be placed BEFORE the cut-off time:

Equity MFs: before 3:00 PM (SEBI standard)
Debt MFs: before 1:30 PM (SEBI standard)
Stocks/ETFs: before market close (3:30 PM)

⚠️ Some AMC apps and platforms enforce
earlier internal cut-offs (e.g., 2:30 PM).
Check your app's cut-off time — don't
rely only on the SEBI standard above.

If you place an MF order after the
cut-off time, the NAV applied will be
April 1st — meaning the gain or loss
falls in FY 2026-27, not this year.

This would defeat the purpose of
your harvesting plan entirely.
```

* **Acceptance criteria:** Calculated from system date; urgency language scales with proximity; settlement timing warning added for final 3 days to account for T+1 and T+2 processing; **MF cut-off time warning shown on March 31** — equity MFs 3:00 PM, debt MFs 1:30 PM; post-cut-off orders get next business day NAV (April 1), which moves the gain into FY 2026-27; stock market close time (3:30 PM) also noted for stock transactions

### US-32 — Reminder Opt-In
**As a user who can't act immediately, I want a reminder before the deadline.**

* Bot offers:

```
Want me to remind you on March 28th
with your full plan ready to execute?
```

* Yes → plan saved; WhatsApp reminder sent on March 28 with fund names, eligibility summary, gains target, and deadline
* Reminder message includes staleness warning:

```
📅 This plan was built on [original session
date] using data from that day.

NAVs and unrealised gains may have changed.
Before acting, check your current holdings
on your fund/broker app to verify the
figures are still approximately correct.

If your portfolio has changed significantly
since [date], consider re-running the bot
for an updated plan.
```

* **Acceptance criteria:** Opt-in only; single reminder; plan persisted so user does not need to re-upload documents; **staleness warning included** showing original session date and advising the user to verify current NAVs before acting

---

## Epic 10: Trust, Disclaimers & Data Handling

### US-33 — Source-Specific Disclaimers
**As a user, I want clear disclosure about what is and is not included in this analysis.**

* Bot displays at the start of analysis:

```
What's included:
✅ Mutual funds (MFCentral CAS)
✅ ELSS (unlocked units only)
✅ Stocks & ETFs (broker P&L + holdings)
✅ Carry forward losses (ITR)

Not included:
❌ ELSS locked units
❌ NPS (not taxed as capital gains)
❌ ULIPs (separate tax treatment)
❌ Unlisted shares (taxed under Sec 112,
   not Sec 112A — no ₹1.25L exemption)
❌ Foreign stocks and equity investments
   (hard-blocked — different tax treatment)
❌ Property, gold jewellery
❌ Dividend income (taxed separately
   as Income from Other Sources)

The ₹1.25L exemption under Section 112A
applies across listed equity shares,
equity-oriented MFs, and equity ULIPs
(annual premium >₹2.5L). If you hold
equity ULIPs with realised gains this
year, your actual remaining exemption
may be lower than shown.

NPS and unlisted shares do NOT share
this exemption — NPS is not taxed as
capital gains, and unlisted shares fall
under Section 112 (a different provision).

This is not tax advice. Consult a CA
for complex situations.
```

* If user is proceeding despite the equity ULIP warning from US-03: this disclaimer is shown in bold at the top of every output screen for the remainder of the session
* **Acceptance criteria:** ELSS lock-in exclusion explicitly called out; NPS exclusion clarified as "not capital gains" (not as an exemption-sharing risk); unlisted shares clarified as Section 112 (not 112A); equity ULIP warning shown persistently for flagged users; dividend income exclusion noted

### US-34 — Data Privacy
**As a user, I want to know what happens to my documents after the session.**

* Bot states before first document upload — this serves as the DPDPA 2023-compliant privacy notice and must be shown in full before any document is uploaded:

```
🔒 Your data is private

Before you share any documents, here's
exactly what we do with your data:

What we collect:
Your CAS, broker reports, and ITR
contain personal data including your
PAN, portfolio holdings, and tax figures.

Why we collect it:
Solely to generate your tax harvesting
report for this session. We do not use
your data for marketing, profiling,
or any other purpose.

How we handle it:
• Raw files (PDFs, CSVs) are deleted
  from our servers within 60 seconds
  of parsing — we do not retain copies.
• Only derived summary figures (gain/loss
  totals, fund names, holding periods)
  are stored to generate your report.
• Summary data is auto-deleted after
  30 days unless you opt into reminders.
• All data is stored on servers located
  in India.

Your rights under DPDPA 2023:
• You can request deletion of all your
  data at any time by messaging "Delete
  my data" in this chat.
• You can request a copy of all data we
  hold about you by messaging "My data".
• You can withdraw consent at any time —
  this will end your session and trigger
  immediate deletion.

We never share your data with
third parties.

By uploading your first document,
you consent to the above.
```

* If user messages "Delete my data" at any point → all stored data (summary figures, session data, reminder preferences) deleted immediately; confirmation sent; session ended
* If user messages "My data" → bot sends a summary of all data points currently stored for that user
* **Acceptance criteria:** DPDPA 2023 compliance: privacy notice shown before first data collection; purpose limitation enforced (tax report generation only); specific retention period stated (30 days); data localization disclosed (India); right to erasure implemented; right to access implemented; consent withdrawal mechanism available; all raw files — CAS, broker P&L, holdings, ITR — deleted from server within 60 seconds of parsing; only summary figures retained; consent is affirmative (uploading the document) not pre-checked; separate consent obtained for reminder opt-in (US-32) since it extends retention

### US-35 — Unsupported Broker Fallback
**As a user whose broker is not supported, I want a clear alternative so I am not stuck.**

* Bot sends:

```
Your broker isn't directly supported yet.

You can add your figures manually.

From your Tax P&L:
Total LTCG from stocks this year: ₹ ?
Total STCG from stocks this year: ₹ ?
Total LTCL from stocks this year: ₹ ?
Total STCL from stocks this year: ₹ ?

From your Holdings:
Total estimated unrealised LTCG
(stocks held over 1 year, in profit): ₹ ?

Total estimated unrealised LTCL
(stocks held over 1 year, at a loss): ₹ ?

Total estimated unrealised STCL
(stocks held under 1 year, at a loss): ₹ ?

Find these in your broker's Tax P&L
and Holdings or Portfolio section.
```

* **Acceptance criteria:** Both P&L and holdings figures covered in the manual fallback; holdings broken into LTCG, LTCL, and STCL to match the four-group classification in US-15 (LTCL candidates are critical for loss harvesting and must not be missed even in manual entry); inputs validated on entry; negative values not accepted for gain fields

---

## Epic 11: Report & Conversion

### US-36 — Share Your Report
**As a user who found this useful, I want to save or share my complete tax report.**

* At end of session bot generates a PDF summary covering:
   * **Step-by-step computation sheet** mirroring ITR Schedule CG format: gross gains by category → current year loss set-off (Section 70) → carry-forward loss set-off (Section 72) → exemption → taxable amount → tax. This allows a CA to directly verify the figures and use them for ITR filing.
   * Complete tax summary with all figures
   * Loss harvesting recommendations with tax savings per fund
   * Gains harvesting eligible funds and total target amount
   * ELSS lock-in status and upcoming unlock dates
   * March 31 deadline prominently displayed
   * All disclaimers and data source notes
   * Tax regime and slab rate assumed
   * **CF loss allocation strategy explained:** the PDF includes a note explaining why carry-forward losses were applied against non-exempt gains first, with the tax saving this produced vs the alternative allocation — this allows the CA to replicate the strategy in the actual ITR filing (the ITR Schedule CG does not enforce an allocation order, so the CA needs to know the intended strategy)
   * **ITR filing reminder:** if any loss harvesting was recommended for carry-forward value, the PDF prominently notes: "File ITR-2 or ITR-3 (not ITR-1) before July 31, 2026 to carry forward these losses. Late filing or wrong ITR form = losses lost."

* User can forward directly to their CA or family member from WhatsApp
* **Acceptance criteria:** PDF is self-contained and readable without the chat context; all figures, fund names, lock-in statuses, and the gains target included; **computation sheet included** showing the step-by-step netting in a format a CA can verify against ITR Schedule CG

---

## Out of Scope — v1

| Feature | Target |
|---|---|
| Direct redemption execution via bot | v2 |
| NPS taxation | v2 |
| Multi-year ITR aggregation beyond 1 year | v2 |
| NRI tax rules | v2 |
| SGB secondary market taxation (Apr 2026 rules) | v2 |
| Equity ULIP and unlisted share gain calculation | v2 |
| Unrealised stock loss detection without holdings upload | v2 |
| Foreign equity investments (US stocks, international brokers) | v2 |
| Income Tax Act 2025 transition (effective Apr 1, 2026) | v2 |
| Buyback taxation as capital gains (effective Apr 1, 2026) | v2 |

**Important note for v2:** The Income Tax Act 2025 replaces the Income Tax Act 1961 from April 1, 2026 (FY 2026-27). While the capital gains set-off rules are preserved as-is, section numbers, schedule formats, and certain provisions (e.g., buyback taxation) will change. US-28 (ELSS Upcoming Unlock Alerts) and US-32 (Reminder Opt-In) promise FY 2026-27 analysis — any reminders or future-year projections sent after April 1, 2026 must disclaim that they are based on FY 2025-26 rules under the old Act, and the user should verify applicability under the new Act.
