"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import type { CSSProperties } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { useAuth } from "@/providers/auth-provider";

/* ─── Helpers ────────────────────────────────────────────────── */
function fmt(n: number | string | null | undefined) {
  if (n === "" || n === undefined || n === null || isNaN(Number(n))) return "—";
  const num = Number(n);
  if (num >= 10000000) return `₹${(num / 10000000).toFixed(2)} Cr`;
  if (num >= 100000) return `₹${(num / 100000).toFixed(1)}L`;
  if (num >= 1000) return `₹${(num / 1000).toFixed(0)}K`;
  return `₹${num.toLocaleString("en-IN")}`;
}
function pct(n: number) {
  return isNaN(n) || !isFinite(n) ? "—" : `${n.toFixed(1)}%`;
}

/* ─── Steps Definition ───────────────────────────────────────── */
const STEPS: { id: string; q: string | ((d: Record<string, any>) => string) }[] = [
  {
    id: "name",
    q: "I'm Minto — your investment adviser.\nBefore I recommend anything, I need to understand your life. Not just your money.\n\nWhat should I call you?",
  },
  { id: "age", q: (d) => `Nice to meet you, ${d.name}. How old are you?` },
  {
    id: "household",
    q: () =>
      "How many people earn in your household, and how many depend on that income?\n\nMore dependents = more protection needed. More earners = more risk capacity.",
  },
  { id: "work", q: () => "What's your work situation?" },
  {
    id: "currency",
    q: () =>
      "Is your income primarily in rupees, or do you earn in foreign currency too?\n\nThis determines how much international diversification you need.",
  },
  {
    id: "gross",
    q: () =>
      "What's your total monthly gross salary?\n\nThe full amount before PF and TDS are deducted. If you're self-employed, your gross monthly earnings.",
  },
  {
    id: "otherIncome",
    q: (d) =>
      `Any income beyond your salary? Rental, investments, side business?\n\nLeave at 0 if none. Even small amounts matter — we're building a complete picture.`,
  },
  {
    id: "deductions",
    q: () =>
      "Now the mandatory deductions from your gross salary.\n\nYour PF contribution (employee share) and monthly income tax / TDS. These aren't expenses you choose — they're taken before the money hits your account.",
  },
  {
    id: "essential",
    q: (d) =>
      `Let's map where the money goes, ${d.name}.\n\nEssential expenses first — things you need to live. If you pay a home loan EMI, don't include it here, that goes under loans.`,
  },
  {
    id: "discretionary",
    q: () =>
      "Now the lifestyle spending — entertainment, shopping, subscriptions.\n\nNo judgment. But this is the category an RIA looks at first when savings aren't enough.",
  },
  {
    id: "loans",
    q: () =>
      "Do you have any loans?\n\nFor each, I need the monthly EMI and total outstanding balance. EMI shows your cash flow burden. Outstanding shows your leverage.\n\nA debt-to-income ratio above 35-40% is a red flag for any adviser.",
  },
  {
    id: "insurance",
    q: () =>
      "Quick check on protection.\n\nDo you have life insurance and health insurance? If yes, how much cover?",
  },
  {
    id: "esops",
    q: () =>
      "Do you hold ESOPs, RSUs, or stock options from your employer?\n\nThis matters a lot. Vested ESOPs are a financial asset — but they're concentrated single-stock risk. If your company's stock tanks, your income AND your investments take the hit at the same time.\n\nAn RIA would never ignore this.",
  },
  {
    id: "assets",
    q: () =>
      "Now let's build your personal balance sheet.\n\nCurrent market value of everything you own. I'm separating physical assets (home, car) from financial assets (investments) — because only financial assets count toward your investable corpus.",
  },
  {
    id: "intl",
    q: () =>
      "Any international investments?\n\nUS stocks, S&P 500 funds, foreign property, NRE deposits. This affects how much more global diversification we add.",
  },
  {
    id: "goals",
    q: (d) =>
      `What are you saving for, ${d.name}?\n\nName each goal, the amount you'll need in today's rupees, and when you need it. I'll inflation-adjust.\n\nGoals within 3 years go to stability. Beyond 5 years, equity can work harder.`,
  },
  {
    id: "comfort",
    q: () =>
      "Last question, and it's the most important one.\n\nImagine your portfolio drops 30% in one month. You had ₹10 lakhs invested. You open the app and see ₹7 lakhs. Markets are panicking. News is screaming.\n\nBe honest — what do you actually do?",
  },
];

/* ─── Reusable Input Components ──────────────────────────────── */
function NumIn({
  label,
  value,
  onChange,
  placeholder,
  prefix = "₹",
  suffix = "",
  sub,
}: {
  label: string;
  value: number | string;
  onChange: (value: number | string) => void;
  placeholder?: string;
  prefix?: string;
  suffix?: string;
  sub?: string;
}) {
  const ref = useRef<HTMLInputElement | null>(null);
  return (
    <div style={S.inField}>
      <label style={S.inLabel}>
        {label}
        {sub && <span style={S.inSub}> {sub}</span>}
      </label>
      <div style={S.inRow}>
        {prefix && <span style={S.inPre}>{prefix}</span>}
        <input
          ref={ref}
          type="number"
          inputMode="numeric"
          placeholder={placeholder}
          value={value === 0 || value === "" ? "" : value}
          onChange={(e) => {
            const raw = e.target.value;
            onChange(raw === "" ? "" : Math.max(0, Number(raw)));
          }}
          style={S.inInput}
          onFocus={(e) => e.target.select()}
        />
        {suffix && <span style={S.inSuf}>{suffix}</span>}
      </div>
    </div>
  );
}

function ChoiceIn({
  options,
  value,
  onChange,
}: {
  options: { val: any; label: string; emoji?: string }[];
  value: any;
  onChange: (value: any) => void;
}) {
  return (
    <div style={S.choiceWrap}>
      {options.map((o) => (
        <button
          key={String(o.val)}
          onClick={() => onChange(o.val)}
          style={{ ...S.choiceBtn, ...(value === o.val ? S.choiceActive : {}) }}
        >
          {o.emoji && <span style={{ marginRight: 6 }}>{o.emoji}</span>}
          {o.label}
        </button>
      ))}
    </div>
  );
}

function SubmitBtn({
  onClick,
  disabled,
  label = "Continue",
}: {
  onClick: () => void;
  disabled?: boolean;
  label?: string;
}) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      style={{ ...S.submitBtn, ...(disabled ? S.submitDisabled : {}) }}
    >
      {label} →
    </button>
  );
}

/* ─── Main Component ─────────────────────────────────────────── */
export default function FinancialProfilePage() {
  const router = useRouter();
  const supabase = createClient();
  const { user, recheckOnboarding } = useAuth();
  const [step, setStep] = useState(0);
  const [messages, setMessages] = useState<{ from: "minto" | "user"; text: string }[]>([]);
  const [typing, setTyping] = useState(true);
  const [showInput, setShowInput] = useState(false);
  const [showSummary, setShowSummary] = useState(false);
  const [saveStatus, setSaveStatus] = useState<"idle" | "saving" | "saved" | "error">("idle");
  const [saveError, setSaveError] = useState<string | null>(null);

  const [d, setD] = useState<Record<string, any>>({
    name: "",
    age: "",
    earningMembers: "",
    dependents: "",
    jobNature: "",
    incomeCurrency: "",
    grossSalary: "",
    employerPF: "",
    rentalIncome: "",
    businessIncome: "",
    investmentIncome: "",
    otherIncome: "",
    ownPF: "",
    incomeTax: "",
    housing: "",
    groceries: "",
    utilities: "",
    transport: "",
    education: "",
    medical: "",
    insurancePrem: "",
    entertainment: "",
    lifestyle: "",
    subscriptions: "",
    otherExpenses: "",
    homeLoanEMI: "",
    homeLoanOut: "",
    carLoanEMI: "",
    carLoanOut: "",
    eduLoanEMI: "",
    eduLoanOut: "",
    personalLoanEMI: "",
    personalLoanOut: "",
    creditCardDue: "",
    otherDebtEMI: "",
    otherDebtOut: "",
    hasLifeInsurance: null,
    lifeInsuranceCover: "",
    hasHealthInsurance: null,
    healthInsuranceCover: "",
    hasEsops: null,
    esopCompanyType: "",
    esopVestedValue: "",
    esopUnvestedValue: "",
    homeValue: "",
    carValue: "",
    goldPhysical: "",
    equityMF: "",
    debtMF: "",
    shares: "",
    ppf: "",
    epf: "",
    fd: "",
    nps: "",
    goldFinancial: "",
    cashBank: "",
    otherInvestments: "",
    hasIntlExposure: null,
    intlAssets: "",
    goals: [],
    comfortLevel: null,
  });

  const [goalDraft, setGoalDraft] = useState<{ name: string; amount: string; years: string }>({
    name: "",
    amount: "",
    years: "",
  });
  const chatRef = useRef<HTMLDivElement | null>(null);
  const inputRef = useRef<HTMLInputElement | null>(null);

  const set = (k: string, v: any) => setD((prev) => ({ ...prev, [k]: v }));
  const n = (k: string) => Number(d[k]) || 0;

  const scrollBottom = useCallback(() => {
    setTimeout(() => {
      chatRef.current?.scrollTo({
        top: chatRef.current.scrollHeight,
        behavior: "smooth",
      });
    }, 80);
  }, []);

  const pushMinto = useCallback(
    (text: string) => {
      setShowInput(false);
      setTyping(true);
      scrollBottom();
      setTimeout(() => {
        setMessages((m) => [...m, { from: "minto", text }]);
        setTyping(false);
        setShowInput(true);
        scrollBottom();
        setTimeout(() => inputRef.current?.focus?.(), 200);
      }, 600 + Math.min(text.length * 4, 800));
    },
    [scrollBottom]
  );

  useEffect(() => {
    pushMinto(typeof STEPS[0].q === "function" ? STEPS[0].q(d) : STEPS[0].q);
  }, []);

  const addUserMsg = (text: string) => {
    setMessages((m) => [...m, { from: "user", text }]);
    scrollBottom();
  };

  /* ── Derived computations ── */
  const totalGross = n("grossSalary") + n("employerPF");
  const otherInc =
    n("rentalIncome") +
    n("businessIncome") +
    n("investmentIncome") +
    n("otherIncome");
  const totalIncome = totalGross + otherInc;
  const mandatoryDed = n("ownPF") + n("incomeTax") + n("employerPF");
  const disposableIncome = totalIncome - mandatoryDed;
  const essentialExp =
    n("housing") +
    n("groceries") +
    n("utilities") +
    n("transport") +
    n("education") +
    n("medical") +
    n("insurancePrem");
  const discretionaryExp =
    n("entertainment") +
    n("lifestyle") +
    n("subscriptions") +
    n("otherExpenses");
  const totalEMI =
    n("homeLoanEMI") +
    n("carLoanEMI") +
    n("eduLoanEMI") +
    n("personalLoanEMI") +
    n("otherDebtEMI");
  const totalExpenses = mandatoryDed + essentialExp + discretionaryExp + totalEMI;
  const monthlySurplus = totalIncome - totalExpenses;
  const annualIncome = totalIncome * 12;

  const totalDebt =
    n("homeLoanOut") +
    n("carLoanOut") +
    n("eduLoanOut") +
    n("personalLoanOut") +
    n("creditCardDue") +
    n("otherDebtOut");
  const physAssets = n("homeValue") + n("carValue") + n("goldPhysical");
  const esopVested = n("esopVestedValue");
  const esopUnvested = n("esopUnvestedValue");
  const finAssets =
    n("equityMF") +
    n("debtMF") +
    n("shares") +
    n("ppf") +
    n("epf") +
    n("fd") +
    n("nps") +
    n("goldFinancial") +
    n("cashBank") +
    n("otherInvestments") +
    n("intlAssets") +
    esopVested;
  const totalAssets = physAssets + finAssets;
  const netWorth = totalAssets - totalDebt;
  const esopConcentration = finAssets > 0 ? (esopVested / finAssets) * 100 : 0;

  const savingsRatio = totalIncome > 0 ? (monthlySurplus / totalIncome) * 100 : 0;
  const dti = totalIncome > 0 ? (totalEMI / totalIncome) * 100 : 0;
  const expenseRatio = totalIncome > 0 ? (totalExpenses / totalIncome) * 100 : 0;
  const solvencyRatio = totalAssets > 0 ? (netWorth / totalAssets) * 100 : 0;
  const leverageRatio = totalAssets > 0 ? (totalDebt / totalAssets) * 100 : 0;
  const liquidAssets = n("cashBank") + n("fd") + n("debtMF");
  const monthlyExp = essentialExp + discretionaryExp + totalEMI;
  const liquidityRatio = monthlyExp > 0 ? liquidAssets / monthlyExp : 0;
  const finAssetsRatio = totalAssets > 0 ? (finAssets / totalAssets) * 100 : 0;
  const accSavInc = annualIncome > 0 ? finAssets / annualIncome : 0;

  const derivedAllocation = () => {
    let worldEq =
      d.incomeCurrency === "inr"
        ? d.hasIntlExposure
          ? 10
          : 15
        : d.incomeCurrency === "mixed"
          ? 10
          : 5;
    const hasShortGoal = d.goals.some((g: any) => Number(g.years) <= 3);
    let stability = hasShortGoal ? 15 : 5;
    if (liquidityRatio < 3) stability += 5;
    let gold = 10;
    if (d.comfortLevel === "anxious" || d.comfortLevel === "sell") gold = 13;
    if (d.comfortLevel === "buy_more") gold = 7;
    if (dti > 40) {
      worldEq = Math.max(5, worldEq - 5);
      stability += 5;
    }
    if (esopConcentration > 25) {
      gold += 3;
      stability += 2;
    }
    let indiaEq = Math.max(30, 100 - stability - gold - worldEq);
    const t = indiaEq + gold + worldEq + stability;
    if (t !== 100) indiaEq += 100 - t;
    return { indiaEq, gold, worldEq, stability };
  };

  const persistProfile = useCallback(async () => {
    if (!user) {
      setSaveStatus("error");
      setSaveError("No user session found.");
      return false;
    }
    try {
      setSaveStatus("saving");
      setSaveError(null);
      const payload = {
        user_id: user.id,
        version: "v1",
        responses: d,
        metrics: {
          total_income: totalIncome,
          monthly_surplus: monthlySurplus,
          total_debt: totalDebt,
          total_assets: totalAssets,
          net_worth: netWorth,
          savings_ratio: savingsRatio,
          dti,
          expense_ratio: expenseRatio,
          solvency_ratio: solvencyRatio,
          leverage_ratio: leverageRatio,
          liquidity_ratio: liquidityRatio,
          fin_assets_ratio: finAssetsRatio,
          acc_savings_income: accSavInc,
          esop_concentration: esopConcentration,
          allocation: derivedAllocation(),
        },
      };
      const { error } = await supabase
        .from("financial_profiles")
        .upsert(payload, { onConflict: "user_id" });
      if (error) {
        setSaveStatus("error");
        setSaveError(error.message);
        return false;
      }
      setSaveStatus("saved");
      setSaveError(null);
      await recheckOnboarding();
      return true;
    } catch (err: unknown) {
      setSaveStatus("error");
      setSaveError(err instanceof Error ? err.message : "Failed to save profile");
      return false;
    }
  }, [
    user,
    d,
    supabase,
    recheckOnboarding,
    totalIncome,
    monthlySurplus,
    totalDebt,
    totalAssets,
    netWorth,
    savingsRatio,
    dti,
    expenseRatio,
    solvencyRatio,
    leverageRatio,
    liquidityRatio,
    finAssetsRatio,
    accSavInc,
    esopConcentration,
  ]);

  const goNext = (userText?: string, nextStep?: number) => {
    if (userText) addUserMsg(userText);
    const ns = nextStep ?? step + 1;
    if (ns < STEPS.length) {
      setStep(ns);
      const q = typeof STEPS[ns].q === "function" ? STEPS[ns].q(d) : STEPS[ns].q;
      setTimeout(() => pushMinto(q), 300);
    } else {
      setStep(ns);
      setTimeout(() => {
        setMessages((m) => [
          ...m,
          {
            from: "minto",
            text: `Here's your complete financial picture, ${d.name}. This is what a SEBI-registered Investment Adviser would compute before making a single recommendation.`,
          },
        ]);
        setTyping(false);
        setShowInput(false);
        setShowSummary(true);
        scrollBottom();
        void persistProfile();
      }, 800);
    }
  };

  /* ─── Input Area Renderer ────────────────────────────────────── */
  const numProps = (stateKey: string) => ({
    value: d[stateKey],
    onChange: (v: number | string) => set(stateKey, v),
  });

  const renderInputArea = () => {
    if (!showInput) return null;
    const sid = STEPS[step]?.id;

    if (sid === "name")
      return (
        <div style={S.inputPanel}>
          <div style={S.inField}>
            <input
              ref={inputRef}
              type="text"
              value={d.name}
              onChange={(e) => set("name", e.target.value)}
              placeholder="Your first name"
              style={S.inInputFull}
              onKeyDown={(e) => {
                if (e.key === "Enter" && d.name.trim()) goNext(d.name.trim());
              }}
              autoFocus
            />
          </div>
          <SubmitBtn onClick={() => goNext(d.name.trim())} disabled={!d.name.trim()} />
        </div>
      );

    if (sid === "age")
      return (
        <div style={S.inputPanel}>
          <NumIn label="Age" {...numProps("age")} prefix="" suffix="years" placeholder="28" />
          <SubmitBtn
            onClick={() => goNext(`${d.age} years old`)}
            disabled={n("age") < 18 || n("age") > 90}
          />
        </div>
      );

    if (sid === "household")
      return (
        <div style={S.inputPanel}>
          <div style={S.fieldRow}>
            <NumIn
              label="Earning members"
              {...numProps("earningMembers")}
              prefix=""
              placeholder="1"
              sub="(incl. you)"
            />
            <NumIn
              label="Dependents"
              {...numProps("dependents")}
              prefix=""
              placeholder="0"
              sub="(spouse, kids, parents)"
            />
          </div>
          <SubmitBtn
            onClick={() => goNext(`${n("earningMembers")} earning, ${n("dependents")} dependents`)}
            disabled={!n("earningMembers")}
          />
        </div>
      );

    if (sid === "work")
      return (
        <div style={S.inputPanel}>
          <ChoiceIn
            value={d.jobNature}
            onChange={(v) => {
              set("jobNature", v);
              setTimeout(
                () =>
                  goNext(
                    {
                      salaried: "Salaried",
                      business: "Self-employed / Business",
                      freelance: "Freelance / Gig work",
                      retired: "Retired / Pension",
                    }[v]
                  ),
                200
              );
            }}
            options={[
              { val: "salaried", label: "Salaried" },
              { val: "business", label: "Business / Self-employed" },
              { val: "freelance", label: "Freelance / Gig" },
              { val: "retired", label: "Retired / Pension" },
            ]}
          />
        </div>
      );

    if (sid === "currency")
      return (
        <div style={S.inputPanel}>
          <ChoiceIn
            value={d.incomeCurrency}
            onChange={(v) => {
              set("incomeCurrency", v);
              setTimeout(
                () =>
                  goNext(
                    {
                      inr: "Primarily INR",
                      mixed: "Mixed INR + foreign",
                      usd: "Primarily foreign currency",
                    }[v]
                  ),
                200
              );
            }}
            options={[
              { val: "inr", label: "₹ INR only" },
              { val: "mixed", label: "₹ + $ Mixed" },
              { val: "usd", label: "$ Foreign" },
            ]}
          />
        </div>
      );

    if (sid === "gross")
      return (
        <div style={S.inputPanel}>
          <div style={S.fieldRow}>
            <NumIn
              label="Gross monthly salary"
              {...numProps("grossSalary")}
              placeholder="100000"
              sub="(before PF, TDS)"
            />
            <NumIn label="Employer PF" {...numProps("employerPF")} placeholder="6000" sub="(company's share)" />
          </div>
          {totalGross > 0 && <div style={S.liveHint}>Total gross: {fmt(totalGross)}/mo</div>}
          <SubmitBtn
            onClick={() =>
              goNext(`Gross salary: ${fmt(n("grossSalary"))}/mo + Employer PF: ${fmt(n("employerPF"))}`)
            }
            disabled={!n("grossSalary")}
          />
        </div>
      );

    if (sid === "otherIncome")
      return (
        <div style={S.inputPanel}>
          <div style={S.fieldRow}>
            <NumIn label="Rental" {...numProps("rentalIncome")} placeholder="0" />
            <NumIn label="Business / freelance" {...numProps("businessIncome")} placeholder="0" />
          </div>
          <div style={S.fieldRow}>
            <NumIn label="Investment income" {...numProps("investmentIncome")} placeholder="0" sub="(dividends, interest)" />
            <NumIn label="Other" {...numProps("otherIncome")} placeholder="0" />
          </div>
          {otherInc > 0 && (
            <div style={S.liveHint}>
              Other income: {fmt(otherInc)}/mo → Total: {fmt(totalIncome)}/mo
            </div>
          )}
          <SubmitBtn
            onClick={() => goNext(otherInc > 0 ? `Other income: ${fmt(otherInc)}/mo` : "No other income")}
          />
        </div>
      );

    if (sid === "deductions")
      return (
        <div style={S.inputPanel}>
          <div style={S.fieldRow}>
            <NumIn label="Your PF contribution" {...numProps("ownPF")} placeholder="6000" sub="(employee share)" />
            <NumIn label="Income tax / TDS" {...numProps("incomeTax")} placeholder="8000" sub="(monthly)" />
          </div>
          {n("ownPF") + n("incomeTax") > 0 && (
            <div style={S.liveHint}>
              Disposable income: {fmt(totalIncome - n("ownPF") - n("incomeTax") - n("employerPF"))}/mo
            </div>
          )}
          <SubmitBtn onClick={() => goNext(`PF: ${fmt(n("ownPF"))}, Tax: ${fmt(n("incomeTax"))}`)} />
        </div>
      );

    if (sid === "essential")
      return (
        <div style={S.inputPanel}>
          <div style={S.fieldRow}>
            <NumIn label="Rent / Housing" {...numProps("housing")} placeholder="20000" sub="(not EMI)" />
            <NumIn label="Groceries" {...numProps("groceries")} placeholder="10000" />
          </div>
          <div style={S.fieldRow}>
            <NumIn label="Utilities" {...numProps("utilities")} placeholder="4000" sub="(power, water, internet)" />
            <NumIn label="Transport" {...numProps("transport")} placeholder="5000" />
          </div>
          <div style={S.fieldRow}>
            <NumIn label="Education & fees" {...numProps("education")} placeholder="0" />
            <NumIn label="Medical (recurring)" {...numProps("medical")} placeholder="0" />
          </div>
          <NumIn label="Insurance premiums" {...numProps("insurancePrem")} placeholder="3000" sub="(life + health, monthly)" />
          {essentialExp > 0 && <div style={S.liveHint}>Essential: {fmt(essentialExp)}/mo</div>}
          <SubmitBtn onClick={() => goNext(`Essential expenses: ${fmt(essentialExp)}/mo`)} />
        </div>
      );

    if (sid === "discretionary")
      return (
        <div style={S.inputPanel}>
          <div style={S.fieldRow}>
            <NumIn label="Entertainment" {...numProps("entertainment")} placeholder="5000" sub="(dining, movies)" />
            <NumIn label="Lifestyle" {...numProps("lifestyle")} placeholder="5000" sub="(shopping, gadgets)" />
          </div>
          <div style={S.fieldRow}>
            <NumIn label="Subscriptions" {...numProps("subscriptions")} placeholder="1500" sub="(OTT, gym, apps)" />
            <NumIn label="Other" {...numProps("otherExpenses")} placeholder="0" />
          </div>
          {essentialExp + discretionaryExp > 0 && (
            <div style={S.liveHint}>
              Discretionary: {fmt(discretionaryExp)}/mo · Surplus so far: {fmt(disposableIncome - essentialExp - discretionaryExp)}/mo
            </div>
          )}
          <SubmitBtn onClick={() => goNext(`Discretionary: ${fmt(discretionaryExp)}/mo`)} />
        </div>
      );

    if (sid === "loans")
      return (
        <div style={S.inputPanel}>
          {[
            { e: "homeLoanEMI", o: "homeLoanOut", l: "Home loan" },
            { e: "carLoanEMI", o: "carLoanOut", l: "Car loan" },
            { e: "eduLoanEMI", o: "eduLoanOut", l: "Education loan" },
            { e: "personalLoanEMI", o: "personalLoanOut", l: "Personal loan" },
            { e: "otherDebtEMI", o: "otherDebtOut", l: "Other loans" },
          ].map(({ e, o, l }) => (
            <div key={e} style={S.fieldRow}>
              <NumIn label={`${l} EMI`} value={d[e]} onChange={(v) => set(e, v)} placeholder="0" />
              <NumIn label={`${l} outstanding`} value={d[o]} onChange={(v) => set(o, v)} placeholder="0" />
            </div>
          ))}
          <NumIn label="Credit card dues outstanding" {...numProps("creditCardDue")} placeholder="0" />
          <div style={S.liveHint}>
            Total EMIs: {fmt(totalEMI)}/mo · DTI:{" "}
            <strong
              style={{
                color: dti <= 35 ? "#3d8b4f" : dti <= 50 ? "#b8943e" : "#c4483e",
              }}
            >
              {pct(dti)}
            </strong>
            {dti > 40 && <span style={{ color: "#c4483e" }}> ⚠ Above safe limit</span>}
          </div>
          <SubmitBtn
            onClick={() =>
              goNext(
                totalEMI > 0
                  ? `EMIs: ${fmt(totalEMI)}/mo · Outstanding: ${fmt(totalDebt)} · DTI: ${pct(dti)}`
                  : "No loans — debt free"
              )
            }
          />
        </div>
      );

    if (sid === "insurance")
      return (
        <div style={S.inputPanel}>
          <div style={S.miniSection}>
            <span style={S.miniLabel}>Life insurance?</span>
            <ChoiceIn
              value={d.hasLifeInsurance}
              onChange={(v) => set("hasLifeInsurance", v)}
              options={[
                { val: true, label: "Yes" },
                { val: false, label: "No" },
              ]}
            />
            {d.hasLifeInsurance && (
              <NumIn label="Total life cover" {...numProps("lifeInsuranceCover")} placeholder="5000000" />
            )}
          </div>
          <div style={S.miniSection}>
            <span style={S.miniLabel}>Health insurance?</span>
            <ChoiceIn
              value={d.hasHealthInsurance}
              onChange={(v) => set("hasHealthInsurance", v)}
              options={[
                { val: true, label: "Yes" },
                { val: false, label: "No" },
              ]}
            />
            {d.hasHealthInsurance && (
              <NumIn label="Health cover" {...numProps("healthInsuranceCover")} placeholder="1000000" />
            )}
          </div>
          <SubmitBtn
            onClick={() => {
              const p = [];
              p.push(d.hasLifeInsurance ? `Life: ${fmt(n("lifeInsuranceCover"))}` : "No life insurance");
              p.push(d.hasHealthInsurance ? `Health: ${fmt(n("healthInsuranceCover"))}` : "No health insurance");
              goNext(p.join(", "));
            }}
            disabled={d.hasLifeInsurance === null || d.hasHealthInsurance === null}
          />
        </div>
      );

    if (sid === "esops")
      return (
        <div style={S.inputPanel}>
          <ChoiceIn
            value={d.hasEsops}
            onChange={(v) => set("hasEsops", v)}
            options={[
              { val: true, label: "Yes, I hold ESOPs / RSUs" },
              { val: false, label: "No stock options" },
            ]}
          />
          {d.hasEsops && (
            <>
              <div style={S.miniSection}>
                <span style={S.miniLabel}>Company type</span>
                <ChoiceIn
                  value={d.esopCompanyType}
                  onChange={(v) => set("esopCompanyType", v)}
                  options={[
                    { val: "listed", label: "Listed (NSE/BSE)" },
                    { val: "unlisted", label: "Unlisted / Pre-IPO" },
                    { val: "startup", label: "Early-stage startup" },
                  ]}
                />
              </div>
              <div style={S.fieldRow}>
                <NumIn label="Vested value" {...numProps("esopVestedValue")} placeholder="0" sub="(can sell today, market value)" />
                <NumIn label="Unvested value" {...numProps("esopUnvestedValue")} placeholder="0" sub="(locked, estimated)" />
              </div>
              {d.esopCompanyType === "startup" && (
                <div style={S.liveHint}>
                  Startup ESOPs are illiquid and speculative — we won't count unvested value as a reliable asset.
                </div>
              )}
              {d.esopCompanyType === "unlisted" && (
                <div style={S.liveHint}>
                  Unlisted shares have no liquid market. We'll count vested value as an asset but flag concentration risk.
                </div>
              )}
            </>
          )}
          {d.hasEsops !== null && (
            <SubmitBtn
              onClick={() => {
                if (!d.hasEsops) return goNext("No ESOPs or stock options");
                const parts = [
                  `${{ listed: "Listed", unlisted: "Unlisted", startup: "Startup" }[d.esopCompanyType] || ""} ESOPs`,
                ];
                if (n("esopVestedValue")) parts.push(`Vested: ${fmt(n("esopVestedValue"))}`);
                if (n("esopUnvestedValue")) parts.push(`Unvested: ${fmt(n("esopUnvestedValue"))}`);
                goNext(parts.join(" · "));
              }}
              disabled={d.hasEsops && !d.esopCompanyType}
            />
          )}
        </div>
      );

    if (sid === "assets")
      return (
        <div style={S.inputPanel}>
          <span style={S.miniLabel}>Physical assets</span>
          <div style={S.fieldRow}>
            <NumIn label="Home (market value)" {...numProps("homeValue")} placeholder="0" />
            <NumIn label="Car / vehicles" {...numProps("carValue")} placeholder="0" />
          </div>
          <NumIn label="Physical gold & jewelry" {...numProps("goldPhysical")} placeholder="0" sub="(resale value)" />
          <span style={{ ...S.miniLabel, marginTop: 12, display: "block" }}>Financial investments</span>
          <div style={S.fieldRow}>
            <NumIn label="Equity mutual funds" {...numProps("equityMF")} placeholder="0" />
            <NumIn label="Debt mutual funds" {...numProps("debtMF")} placeholder="0" />
          </div>
          <div style={S.fieldRow}>
            <NumIn label="Direct shares" {...numProps("shares")} placeholder="0" />
            <NumIn label="Gold ETF / SGB" {...numProps("goldFinancial")} placeholder="0" />
          </div>
          <div style={S.fieldRow}>
            <NumIn label="EPF balance" {...numProps("epf")} placeholder="0" />
            <NumIn label="PPF balance" {...numProps("ppf")} placeholder="0" />
          </div>
          <div style={S.fieldRow}>
            <NumIn label="Fixed deposits" {...numProps("fd")} placeholder="0" />
            <NumIn label="NPS" {...numProps("nps")} placeholder="0" />
          </div>
          <div style={S.fieldRow}>
            <NumIn label="Cash & bank" {...numProps("cashBank")} placeholder="0" sub="(savings + current a/c)" />
            <NumIn label="Other investments" {...numProps("otherInvestments")} placeholder="0" />
          </div>
          {totalAssets > 0 && <div style={S.liveHint}>Total assets: {fmt(totalAssets)} · Net worth: {fmt(netWorth)}</div>}
          <SubmitBtn onClick={() => goNext(`Assets: ${fmt(totalAssets)} · Liabilities: ${fmt(totalDebt)} · Net worth: ${fmt(netWorth)}`)} />
        </div>
      );

    if (sid === "intl")
      return (
        <div style={S.inputPanel}>
          <ChoiceIn
            value={d.hasIntlExposure}
            onChange={(v) => set("hasIntlExposure", v)}
            options={[
              { val: true, label: "Yes, I have international investments" },
              { val: false, label: "No international exposure" },
            ]}
          />
          {d.hasIntlExposure && <NumIn label="Total value in ₹" {...numProps("intlAssets")} placeholder="0" />}
          {d.hasIntlExposure !== null && (
            <SubmitBtn
              onClick={() =>
                goNext(d.hasIntlExposure ? `International: ${fmt(n("intlAssets"))}` : "No international exposure")
              }
            />
          )}
        </div>
      );

    if (sid === "goals")
      return (
        <div style={S.inputPanel}>
          <div style={S.fieldRow}>
            <div style={S.inField}>
              <label style={S.inLabel}>Goal name</label>
              <input
                type="text"
                value={goalDraft.name}
                onChange={(e) => setGoalDraft((g) => ({ ...g, name: e.target.value }))}
                placeholder="e.g. Emergency fund"
                style={S.inInputFull}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    document.getElementById("goalAmt")?.focus();
                  }
                }}
              />
            </div>
          </div>
          <div style={S.fieldRow}>
            <div style={S.inField}>
              <label style={S.inLabel}>Amount (today's ₹)</label>
              <div style={S.inRow}>
                <span style={S.inPre}>₹</span>
                <input
                  id="goalAmt"
                  type="number"
                  inputMode="numeric"
                  placeholder="500000"
                  value={goalDraft.amount}
                  onChange={(e) => setGoalDraft((g) => ({ ...g, amount: e.target.value }))}
                  style={S.inInput}
                  onFocus={(e) => e.target.select()}
                />
              </div>
            </div>
            <div style={S.inField}>
              <label style={S.inLabel}>Years away</label>
              <div style={S.inRow}>
                <input
                  type="number"
                  inputMode="numeric"
                  placeholder="3"
                  value={goalDraft.years}
                  onChange={(e) => setGoalDraft((g) => ({ ...g, years: e.target.value }))}
                  style={S.inInput}
                  onFocus={(e) => e.target.select()}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && goalDraft.name && goalDraft.amount && goalDraft.years) {
                      setD((prev) => ({
                        ...prev,
                        goals: [...prev.goals, { ...goalDraft, id: Date.now() }],
                      }));
                      setGoalDraft({ name: "", amount: "", years: "" });
                    }
                  }}
                />
                <span style={S.inSuf}>yrs</span>
              </div>
            </div>
          </div>
          <button
            onClick={() => {
              if (goalDraft.name && goalDraft.amount && goalDraft.years) {
                setD((prev) => ({ ...prev, goals: [...prev.goals, { ...goalDraft, id: Date.now() }] }));
                setGoalDraft({ name: "", amount: "", years: "" });
              }
            }}
            style={S.addGoalBtn}
            disabled={!goalDraft.name || !goalDraft.amount || !goalDraft.years}
          >
            + Add goal
          </button>
          {d.goals.length > 0 && (
            <div style={S.goalList}>
              {d.goals.map((g: any) => (
                <div key={g.id} style={S.goalChip}>
                  <span>
                    {g.name} · {fmt(g.amount)} · {g.years}y
                  </span>
                  <button
                    onClick={() =>
                      setD((prev) => ({
                        ...prev,
                        goals: prev.goals.filter((x: any) => x.id !== g.id),
                      }))
                    }
                    style={S.goalX}
                  >
                    ×
                  </button>
                </div>
              ))}
            </div>
          )}
          <SubmitBtn
            onClick={() => goNext(d.goals.map((g: any) => `${g.name}: ${fmt(g.amount)} in ${g.years}y`).join("\n"))}
            disabled={d.goals.length === 0}
            label="Done adding goals"
          />
        </div>
      );

    if (sid === "comfort")
      return (
        <div style={S.inputPanel}>
          <ChoiceIn
            value={d.comfortLevel}
            onChange={(v) => {
              set("comfortLevel", v);
              const labels: Record<string, string> = {
                buy_more: "🔥 Buy more — this is a sale",
                calm: "😌 Hold. It'll recover.",
                anxious: "😰 Lose sleep, check every hour",
                sell: "🚪 Probably sell some",
              };
              setTimeout(() => goNext(labels[v]), 300);
            }}
            options={[
              { val: "buy_more", emoji: "🔥", label: "Buy more — this is a sale" },
              { val: "calm", emoji: "😌", label: "Hold. It'll recover." },
              { val: "anxious", emoji: "😰", label: "Lose sleep, check app hourly" },
              { val: "sell", emoji: "🚪", label: "Probably sell some" },
            ]}
          />
        </div>
      );

    return null;
  };

  /* ─── Summary Render ───────────────────────────────────────── */
  const renderSummary = () => {
    const alloc = derivedAllocation();
    const clr = (s: string) => (s === "g" ? "#3d8b4f" : s === "w" ? "#b8943e" : "#c4483e");
    const dtiS = dti <= 25 ? "g" : dti <= 40 ? "w" : "d";
    const savS = savingsRatio >= 30 ? "g" : savingsRatio >= 15 ? "w" : "d";
    const liqS = liquidityRatio >= 6 ? "g" : liquidityRatio >= 3 ? "w" : "d";
    const solS = solvencyRatio >= 70 ? "g" : solvencyRatio >= 50 ? "w" : "d";
    const needIns = n("dependents") > 0 && !d.hasLifeInsurance;
    const needEF = liquidityRatio < 3;
    const needDebt = dti > 40;
    const needEsopDiversify = esopConcentration > 25;

    return (
      <div style={S.summaryWrap}>
        <div style={S.summaryCard}>
          <h2 style={S.summaryTitle}>{d.name}'s Financial Blueprint</h2>
          <p style={S.summaryAge}>
            {d.age} yrs · {d.jobNature} · {n("earningMembers")} earner{n("earningMembers") > 1 ? "s" : ""} ·{" "}
            {n("dependents")} dependent{n("dependents") !== 1 ? "s" : ""}
          </p>

          <div style={S.secWrap}>
            <h3 style={S.secH}>Financial health ratios</h3>
            <p style={S.secSub}>NISM-prescribed metrics every RIA computes before advising.</p>
            <div style={S.ratioGrid}>
              {[
                { l: "Savings ratio", v: pct(savingsRatio), s: savS },
                { l: "Expense ratio", v: pct(expenseRatio), s: expenseRatio < 70 ? "g" : "w" },
                { l: "Debt-to-Income", v: pct(dti), s: dtiS },
                { l: "Liquidity", v: `${liquidityRatio.toFixed(1)} months`, s: liqS },
                { l: "Solvency", v: pct(solvencyRatio), s: solS },
                { l: "Leverage", v: pct(leverageRatio), s: leverageRatio < 30 ? "g" : "w" },
                { l: "Financial assets %", v: pct(finAssetsRatio), s: finAssetsRatio > 50 ? "g" : "w" },
                { l: "Savings / Income", v: `${accSavInc.toFixed(1)}x`, s: accSavInc >= 3 ? "g" : "w" },
                ...(esopVested > 0
                  ? [
                      {
                        l: "ESOP concentration",
                        v: pct(esopConcentration),
                        s: esopConcentration < 15 ? "g" : esopConcentration < 30 ? "w" : "d",
                      },
                    ]
                  : []),
              ].map((r, i) => (
                <div key={i} style={S.ratioCell}>
                  <span style={S.rL}>{r.l}</span>
                  <span style={{ ...S.rV, color: clr(r.s) }}>{r.v}</span>
                </div>
              ))}
            </div>
          </div>

          <div style={S.secWrap}>
            <h3 style={S.secH}>Personal balance sheet</h3>
            <div style={S.bsGrid}>
              <div style={S.bsCol}>
                <div style={S.bsHead}>Assets</div>
                <div style={S.bsRow}>
                  <span>Physical</span>
                  <span>{fmt(physAssets)}</span>
                </div>
                <div style={S.bsRow}>
                  <span>Financial</span>
                  <span>{fmt(finAssets - esopVested)}</span>
                </div>
                {esopVested > 0 && (
                  <div style={S.bsRow}>
                    <span>ESOPs (vested)</span>
                    <span>{fmt(esopVested)}</span>
                  </div>
                )}
                <div style={S.bsTotal}>
                  <span>Total</span>
                  <span>{fmt(totalAssets)}</span>
                </div>
                {esopUnvested > 0 && (
                  <div style={{ ...S.bsRow, fontSize: 11, color: "#9a9590", fontStyle: "italic" }}>
                    <span>Unvested ESOPs (not counted)</span>
                    <span>{fmt(esopUnvested)}</span>
                  </div>
                )}
              </div>
              <div style={S.bsCol}>
                <div style={S.bsHead}>Liabilities</div>
                <div style={S.bsRow}>
                  <span>Debt outstanding</span>
                  <span>{fmt(totalDebt)}</span>
                </div>
                <div style={{ ...S.bsTotal, color: "#3d8b4f" }}>
                  <span>Net worth</span>
                  <span>{fmt(netWorth)}</span>
                </div>
              </div>
            </div>
          </div>

          <div style={S.secWrap}>
            <h3 style={S.secH}>Monthly cash flow</h3>
            <div style={S.cfWrap}>
              <div style={S.cfRow}>
                <span>Gross income</span>
                <span>{fmt(totalIncome)}</span>
              </div>
              <div style={S.cfRow}>
                <span>Mandatory (PF + Tax)</span>
                <span>−{fmt(mandatoryDed)}</span>
              </div>
              <div style={S.cfRow}>
                <span>Essential expenses</span>
                <span>−{fmt(essentialExp)}</span>
              </div>
              <div style={S.cfRow}>
                <span>Discretionary</span>
                <span>−{fmt(discretionaryExp)}</span>
              </div>
              <div style={S.cfRow}>
                <span>Loan EMIs</span>
                <span>−{fmt(totalEMI)}</span>
              </div>
              <div style={S.cfBig}>
                <span>Investable surplus</span>
                <span style={{ color: monthlySurplus >= 0 ? "#3d8b4f" : "#c4483e" }}>
                  {fmt(monthlySurplus)}/mo
                </span>
              </div>
            </div>
          </div>

          {(needIns || needEF || needDebt || needEsopDiversify) && (
            <div style={S.secWrap}>
              <h3 style={S.secH}>⚠ Fix these first</h3>
              {needDebt && (
                <div style={S.alertRow}>
                  <span>🔴</span>
                  <div>
                    <strong>DTI is {pct(dti)}</strong> — above the 40% danger line. Pay down costliest debt first
                    (credit cards → personal loans → car) before growth investing.
                  </div>
                </div>
              )}
              {needEsopDiversify && (
                <div style={S.alertRow}>
                  <span>🟠</span>
                  <div>
                    <strong>ESOP concentration: {pct(esopConcentration)} of financial assets</strong> in a single stock.
                    Your income and your wealth both depend on one company.{" "}
                    {d.esopCompanyType === "listed"
                      ? "Consider a systematic liquidation plan — sell vested tranches quarterly and diversify into index funds."
                      : d.esopCompanyType === "startup"
                        ? "Startup ESOPs are illiquid and binary. Don't count on them for any financial goal. Build your investable corpus separately."
                        : "Unlisted shares can't be easily sold. Build diversified investments in parallel so your financial plan doesn't hinge on one outcome."}
                  </div>
                </div>
              )}
              {needEF && (
                <div style={S.alertRow}>
                  <span>🟡</span>
                  <div>
                    <strong>Emergency fund: {liquidityRatio.toFixed(1)} months</strong> — need 6. Park{" "}
                    {fmt(monthlyExp * 6)} in liquid funds before equity.
                  </div>
                </div>
              )}
              {needIns && (
                <div style={S.alertRow}>
                  <span>🟡</span>
                  <div>
                    <strong>{n("dependents")} dependents, no life insurance</strong> — get a term plan for at least{" "}
                    {fmt(annualIncome * 10)} before investing.
                  </div>
                </div>
              )}
            </div>
          )}

          <div style={S.secWrap}>
            <h3 style={S.secH}>Suggested allocation</h3>
            <div style={S.allocBar}>
              {[
                { k: "indiaEq", l: "India Eq", c: "#3d8b4f", v: alloc.indiaEq },
                { k: "gold", l: "Gold", c: "#b8943e", v: alloc.gold },
                { k: "worldEq", l: "World Eq", c: "#3d5a3e", v: alloc.worldEq },
                { k: "stability", l: "Stable", c: "#8a9a8c", v: alloc.stability },
              ].map((s) => (
                <div key={s.k} style={{ ...S.allocSeg, width: `${s.v}%`, background: s.c }}>
                  {s.v >= 10 && <span style={S.allocTxt}>{s.l} {s.v}%</span>}
                </div>
              ))}
            </div>
            <div style={S.allocLeg}>
              <span style={S.legI}>
                <span style={{ ...S.legD, background: "#3d8b4f" }} />
                Nifty 50 Index
              </span>
              <span style={S.legI}>
                <span style={{ ...S.legD, background: "#b8943e" }} />
                Gold ETF / FoF
              </span>
              <span style={S.legI}>
                <span style={{ ...S.legD, background: "#3d5a3e" }} />
                S&P 500 FoF
              </span>
              <span style={S.legI}>
                <span style={{ ...S.legD, background: "#8a9a8c" }} />
                Liquid / Arb Fund
              </span>
            </div>
            <p style={S.allocNote}>
              Monthly SIP: {fmt(Math.max(0, monthlySurplus))} — reviewed and rebalanced annually.
            </p>
          </div>

          {d.goals.length > 0 && (
            <div style={{ ...S.secWrap, borderBottom: "none" }}>
              <h3 style={S.secH}>Goals mapped</h3>
              {d.goals.map((g: any) => (
                <div key={g.id} style={S.goalSRow}>
                  <span style={S.goalSName}>{g.name}</span>
                  <span style={S.goalSMeta}>
                    {fmt(g.amount)} · {g.years}y ·{" "}
                    {Number(g.years) <= 3 ? "stability" : Number(g.years) <= 5 ? "balanced" : "equity"}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>

        <div style={S.saveRow}>
          {saveStatus === "saving" && <span style={S.saveHint}>Saving your profile…</span>}
          {saveStatus === "error" && (
            <span style={{ ...S.saveHint, color: "#c4483e" }}>
              {saveError || "Unable to save profile"}
            </span>
          )}
          {saveStatus === "saved" && <span style={S.saveHint}>Saved</span>}
          <button
            style={{ ...S.submitBtn, marginTop: 12 }}
            onClick={async () => {
              if (saveStatus !== "saved") {
                const ok = await persistProfile();
                if (!ok) return;
              }
              router.push("/chat");
            }}
          >
            Continue →
          </button>
        </div>
      </div>
    );
  };

  /* ─── Main Render ──────────────────────────────────────────── */
  return (
    <div style={S.shell}>
      <style>{`
        @keyframes fadeUp { from { opacity:0; transform:translateY(10px) } to { opacity:1; transform:translateY(0) } }
        @keyframes dot1 { 0%,80%,100% { transform:scale(0) } 40% { transform:scale(1) } }
        @keyframes dot2 { 0%,80%,100% { transform:scale(0) } 50% { transform:scale(1) } }
        @keyframes dot3 { 0%,80%,100% { transform:scale(0) } 60% { transform:scale(1) } }
        input[type="number"]::-webkit-inner-spin-button,input[type="number"]::-webkit-outer-spin-button { -webkit-appearance:none; margin:0 }
        input[type="number"] { -moz-appearance:textfield }
        ::selection { background:#b5c9a8 }
        * { box-sizing:border-box }
        ::-webkit-scrollbar { width:4px } ::-webkit-scrollbar-thumb { background:#9fb28f; border-radius:4px }
      `}</style>

      <div ref={chatRef} style={S.chatArea}>
        {messages.map((m, i) => (
          <div
            key={i}
            style={{
              ...S.msgWrap,
              justifyContent: m.from === "user" ? "flex-end" : "flex-start",
              animation: "fadeUp 0.3s ease forwards",
            }}
          >
            {m.from === "minto" && <div style={S.avatar}>M</div>}
            <div style={m.from === "minto" ? S.mintoMsg : S.userMsg}>
              {m.text.split("\n").map((line, j) => (
                <p key={j} style={{ margin: "0 0 4px", lineHeight: 1.55 }}>
                  {line}
                </p>
              ))}
            </div>
          </div>
        ))}
        {typing && (
          <div style={{ ...S.msgWrap, justifyContent: "flex-start" }}>
            <div style={S.avatar}>M</div>
            <div style={S.mintoMsg}>
              <div style={S.dots}>
                <span style={{ ...S.dot, animation: "dot1 1.4s infinite" }} />
                <span style={{ ...S.dot, animation: "dot2 1.4s infinite" }} />
                <span style={{ ...S.dot, animation: "dot3 1.4s infinite" }} />
              </div>
            </div>
          </div>
        )}
        {showSummary && renderSummary()}
      </div>

      <div style={S.inputBar}>{renderInputArea()}</div>
    </div>
  );
}

/* ─── Styles ─────────────────────────────────────────────────── */
const S: Record<string, CSSProperties> = {
  shell: {
    fontFamily: "inherit",
    background: "linear-gradient(160deg, #c8d5c0 0%, #b5c9a8 50%, #d4dcc8 100%)",
    color: "#2d3a2e",
    height: "100vh",
    display: "flex",
    flexDirection: "column",
    maxWidth: 720,
    margin: "0 auto",
  },
  chatArea: {
    flex: 1,
    overflowY: "auto",
    padding: "16px 16px 8px",
    display: "flex",
    flexDirection: "column",
    gap: 6,
  },
  msgWrap: { display: "flex", gap: 8, alignItems: "flex-end", maxWidth: "100%" },
  avatar: {
    width: 28,
    height: 28,
    borderRadius: "50%",
    background: "#3d5a3e",
    color: "#f2f5ef",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    fontSize: 12,
    fontWeight: 700,
    flexShrink: 0,
    marginBottom: 2,
  },
  mintoMsg: {
    background: "rgba(255,255,255,0.7)",
    border: "1px solid rgba(255,255,255,0.45)",
    borderRadius: "16px 16px 16px 4px",
    padding: "12px 16px",
    maxWidth: "85%",
    fontSize: 14,
    lineHeight: 1.6,
    color: "#2d3a2e",
  },
  userMsg: {
    background: "#3d5a3e",
    color: "#f2f5ef",
    borderRadius: "16px 16px 4px 16px",
    padding: "10px 16px",
    maxWidth: "75%",
    fontSize: 14,
    lineHeight: 1.5,
  },
  dots: { display: "flex", gap: 4, padding: "4px 2px" },
  dot: { width: 7, height: 7, borderRadius: "50%", background: "#8a9a8c" },
  inputBar: {
    borderTop: "1px solid rgba(255,255,255,0.4)",
    background: "rgba(255,255,255,0.6)",
    padding: "10px 16px 16px",
    flexShrink: 0,
    zIndex: 2,
  },
  inputPanel: { display: "flex", flexDirection: "column", gap: 10 },
  fieldRow: { display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 },
  inField: { display: "flex", flexDirection: "column", gap: 3 },
  inLabel: { fontSize: 12, fontWeight: 600, color: "#5a6b5c" },
  inSub: { fontWeight: 400, color: "#8a9a8c" },
  inRow: {
    display: "flex",
    alignItems: "center",
    background: "rgba(255,255,255,0.75)",
    border: "1.5px solid rgba(61,90,62,0.2)",
    borderRadius: 10,
    padding: "0 10px",
    height: 40,
  },
  inPre: { fontSize: 13, color: "#8a9a8c", marginRight: 4 },
  inSuf: { fontSize: 12, color: "#8a9a8c", marginLeft: 4 },
  inInput: {
    flex: 1,
    border: "none",
    background: "transparent",
    fontSize: 15,
    fontWeight: 600,
    fontFamily: "inherit",
    outline: "none",
    color: "#2d3a2e",
    width: "100%",
  },
  inInputFull: {
    width: "100%",
    border: "1.5px solid rgba(61,90,62,0.2)",
    borderRadius: 10,
    padding: "9px 14px",
    fontSize: 15,
    fontWeight: 500,
    fontFamily: "inherit",
    background: "rgba(255,255,255,0.75)",
    outline: "none",
    color: "#2d3a2e",
  },
  choiceWrap: { display: "flex", flexWrap: "wrap", gap: 6 },
  choiceBtn: {
    padding: "9px 16px",
    borderRadius: 22,
    border: "1.5px solid rgba(61,90,62,0.2)",
    background: "rgba(255,255,255,0.7)",
    fontSize: 13,
    fontWeight: 600,
    cursor: "pointer",
    color: "#2d3a2e",
    fontFamily: "inherit",
    transition: "all 0.15s",
    whiteSpace: "nowrap",
  },
  choiceActive: { borderColor: "#3d5a3e", background: "#3d5a3e", color: "#f2f5ef" },
  submitBtn: {
    alignSelf: "flex-end",
    fontSize: 13,
    fontWeight: 700,
    color: "#f2f5ef",
    background: "#3d5a3e",
    border: "none",
    borderRadius: 22,
    padding: "10px 24px",
    cursor: "pointer",
    fontFamily: "inherit",
    transition: "all 0.2s",
  },
  submitDisabled: { opacity: 0.25, cursor: "not-allowed" },
  liveHint: { fontSize: 12, color: "#5a6b5c", padding: "4px 0", lineHeight: 1.4 },
  miniSection: { display: "flex", flexDirection: "column", gap: 6, paddingBottom: 8 },
  miniLabel: { fontSize: 13, fontWeight: 700, color: "#2d3a2e" },
  addGoalBtn: {
    fontSize: 13,
    fontWeight: 700,
    color: "#3d5a3e",
    background: "rgba(61,90,62,0.12)",
    border: "1.5px solid rgba(61,90,62,0.2)",
    borderRadius: 10,
    padding: "9px 16px",
    cursor: "pointer",
    fontFamily: "inherit",
    alignSelf: "flex-start",
  },
  goalList: { display: "flex", flexWrap: "wrap", gap: 6 },
  goalChip: {
    display: "flex",
    alignItems: "center",
    gap: 8,
    padding: "7px 12px",
    background: "rgba(255,255,255,0.7)",
    border: "1px solid rgba(255,255,255,0.4)",
    borderRadius: 20,
    fontSize: 13,
  },
  goalX: {
    width: 20,
    height: 20,
    borderRadius: "50%",
    border: "none",
    background: "rgba(61,90,62,0.12)",
    fontSize: 14,
    cursor: "pointer",
    color: "#5a6b5c",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    padding: 0,
  },
  summaryWrap: { animation: "fadeUp 0.5s ease forwards", padding: "8px 0 24px" },
  summaryCard: {
    background: "rgba(255,255,255,0.7)",
    border: "1px solid rgba(255,255,255,0.45)",
    borderRadius: 20,
    overflow: "hidden",
  },
  summaryTitle: { fontSize: 22, fontWeight: 700, padding: "24px 24px 2px", margin: 0 },
  summaryAge: { fontSize: 13, color: "#5a6b5c", padding: "0 24px 16px", margin: 0 },
  secWrap: { padding: "18px 24px", borderBottom: "1px solid rgba(255,255,255,0.35)" },
  secH: { fontSize: 12, fontWeight: 700, textTransform: "uppercase", letterSpacing: "1px", color: "#7c8d7d", margin: "0 0 8px" },
  secSub: { fontSize: 12, color: "#7c8d7d", marginBottom: 12, lineHeight: 1.4 },
  ratioGrid: { display: "grid", gridTemplateColumns: "1fr 1fr", gap: 6 },
  ratioCell: {
    display: "flex",
    justifyContent: "space-between",
    padding: "8px 12px",
    background: "rgba(255,255,255,0.6)",
    borderRadius: 8,
    fontSize: 13,
  },
  rL: { color: "#5a6b5c" },
  rV: { fontWeight: 700 },
  bsGrid: { display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 },
  bsCol: { padding: "12px 14px", background: "rgba(255,255,255,0.6)", borderRadius: 12 },
  bsHead: { fontSize: 11, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.5px", color: "#7c8d7d", marginBottom: 8 },
  bsRow: { display: "flex", justifyContent: "space-between", padding: "4px 0", fontSize: 13, color: "#2d3a2e" },
  bsTotal: { display: "flex", justifyContent: "space-between", padding: "6px 0 0", fontSize: 14, fontWeight: 700, borderTop: "1.5px solid #3d5a3e", marginTop: 6 },
  cfWrap: { padding: "12px 14px", background: "rgba(255,255,255,0.6)", borderRadius: 12 },
  cfRow: { display: "flex", justifyContent: "space-between", padding: "4px 0", fontSize: 13, color: "#5a6b5c" },
  cfBig: { display: "flex", justifyContent: "space-between", padding: "8px 0 0", fontSize: 15, fontWeight: 700, borderTop: "1.5px solid #3d5a3e", marginTop: 6, color: "#2d3a2e" },
  alertRow: { display: "flex", gap: 10, padding: "10px 0", fontSize: 13, lineHeight: 1.5, color: "#2d3a2e" },
  allocBar: { display: "flex", height: 44, borderRadius: 12, overflow: "hidden" },
  allocSeg: { display: "flex", alignItems: "center", justifyContent: "center", minWidth: 20, transition: "width 0.4s ease" },
  allocTxt: { color: "#fff", fontSize: 10, fontWeight: 700, textShadow: "0 1px 2px rgba(0,0,0,0.3)", whiteSpace: "nowrap" },
  allocLeg: { display: "flex", flexWrap: "wrap", gap: 12, marginTop: 10 },
  legI: { fontSize: 11, color: "#6a655e", display: "flex", alignItems: "center", gap: 4 },
  legD: { width: 8, height: 8, borderRadius: "50%", display: "inline-block" },
  allocNote: { fontSize: 12, color: "#7c8d7d", marginTop: 10, textAlign: "center", fontStyle: "italic" },
  goalSRow: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    padding: "8px 12px",
    background: "rgba(255,255,255,0.6)",
    borderRadius: 8,
    marginBottom: 6,
  },
  goalSName: { fontSize: 14, fontWeight: 600 },
  goalSMeta: { fontSize: 12, color: "#5a6b5c" },
  saveRow: { display: "flex", flexDirection: "column", alignItems: "flex-end", padding: "16px 8px 0" },
  saveHint: { fontSize: 12, color: "#5a6b5c" },
};
