"use client";

import { Card } from "@/components/ui/card";
import { FinancialProfileData } from "@/hooks/use-financial-profile";
import { AlertTriangle, TrendingUp, Wallet, Target, PieChart } from "lucide-react";

/* ── Formatters ──────────────────────────────────────────── */

function fmt(v: number): string {
  if (v >= 1e7) return `₹${(v / 1e7).toFixed(2)} Cr`;
  if (v >= 1e5) return `₹${(v / 1e5).toFixed(2)} L`;
  if (v >= 1e3) return `₹${(v / 1e3).toFixed(1)}K`;
  return `₹${Math.round(v).toLocaleString("en-IN")}`;
}

function pct(v: number): string {
  return `${v.toFixed(1)}%`;
}

type Severity = "g" | "w" | "d";
function severityColor(s: Severity): string {
  return s === "g"
    ? "text-minto-positive"
    : s === "w"
      ? "text-minto-gold"
      : "text-minto-negative";
}

function severityBg(s: Severity): string {
  return s === "g"
    ? "bg-minto-positive/10"
    : s === "w"
      ? "bg-minto-gold/10"
      : "bg-minto-negative/10";
}

/* ── Recompute derived values from responses ─────────────── */

function deriveFromResponses(r: Record<string, any>, m: FinancialProfileData["metrics"]) {
  const n = (k: string) => Number(r[k]) || 0;

  const totalGross = n("grossSalary") + n("employerPF");
  const otherInc = n("rentalIncome") + n("businessIncome") + n("investmentIncome") + n("otherIncome");
  const totalIncome = totalGross + otherInc;
  const mandatoryDed = n("ownPF") + n("incomeTax") + n("employerPF");
  const essentialExp =
    n("housing") + n("groceries") + n("utilities") + n("transport") +
    n("education") + n("medical") + n("insurancePrem");
  const discretionaryExp =
    n("entertainment") + n("lifestyle") + n("subscriptions") + n("otherExpenses");
  const totalEMI =
    n("homeLoanEMI") + n("carLoanEMI") + n("eduLoanEMI") +
    n("personalLoanEMI") + n("otherDebtEMI");
  const monthlySurplus = totalIncome - mandatoryDed - essentialExp - discretionaryExp - totalEMI;
  const annualIncome = totalIncome * 12;

  const totalDebt =
    n("homeLoanOut") + n("carLoanOut") + n("eduLoanOut") +
    n("personalLoanOut") + n("creditCardDue") + n("otherDebtOut");
  const physAssets = n("homeValue") + n("carValue") + n("goldPhysical");
  const esopVested = n("esopVestedValue");
  const esopUnvested = n("esopUnvestedValue");
  const finAssets =
    n("equityMF") + n("debtMF") + n("shares") + n("ppf") + n("epf") +
    n("fd") + n("nps") + n("goldFinancial") + n("cashBank") +
    n("otherInvestments") + n("intlAssets") + esopVested;
  const totalAssets = physAssets + finAssets;
  const netWorth = totalAssets - totalDebt;

  const liquidAssets = n("cashBank") + n("fd") + n("debtMF");
  const monthlyExp = essentialExp + discretionaryExp + totalEMI;
  const liquidityRatio = monthlyExp > 0 ? liquidAssets / monthlyExp : 0;

  return {
    totalIncome, mandatoryDed, essentialExp, discretionaryExp, totalEMI,
    monthlySurplus, annualIncome, totalDebt, physAssets, esopVested,
    esopUnvested, finAssets, totalAssets, netWorth, liquidAssets,
    monthlyExp, liquidityRatio,
  };
}

/* ── Component ───────────────────────────────────────────── */

interface Props {
  profile: FinancialProfileData;
}

export function FinancialProfileTab({ profile }: Props) {
  const { responses: r, metrics: m } = profile;
  const d = deriveFromResponses(r, m);
  const n = (k: string) => Number(r[k]) || 0;

  const dtiS: Severity = m.dti <= 25 ? "g" : m.dti <= 40 ? "w" : "d";
  const savS: Severity = m.savings_ratio >= 30 ? "g" : m.savings_ratio >= 15 ? "w" : "d";
  const liqS: Severity = m.liquidity_ratio >= 6 ? "g" : m.liquidity_ratio >= 3 ? "w" : "d";
  const solS: Severity = m.solvency_ratio >= 70 ? "g" : m.solvency_ratio >= 50 ? "w" : "d";

  const needDebt = m.dti > 40;
  const needEsopDiversify = m.esop_concentration > 25;
  const needEF = m.liquidity_ratio < 3;
  const needIns = n("dependents") > 0 && !r.hasLifeInsurance;
  const hasAlerts = needDebt || needEsopDiversify || needEF || needIns;

  const ratios: { label: string; value: string; severity: Severity }[] = [
    { label: "Savings ratio", value: pct(m.savings_ratio), severity: savS },
    { label: "Expense ratio", value: pct(m.expense_ratio), severity: m.expense_ratio < 70 ? "g" : "w" },
    { label: "Debt-to-Income", value: pct(m.dti), severity: dtiS },
    { label: "Liquidity", value: `${m.liquidity_ratio.toFixed(1)} months`, severity: liqS },
    { label: "Solvency", value: pct(m.solvency_ratio), severity: solS },
    { label: "Leverage", value: pct(m.leverage_ratio), severity: m.leverage_ratio < 30 ? "g" : "w" },
    { label: "Financial assets %", value: pct(m.fin_assets_ratio), severity: m.fin_assets_ratio > 50 ? "g" : "w" },
    { label: "Savings / Income", value: `${m.acc_savings_income.toFixed(1)}x`, severity: m.acc_savings_income >= 3 ? "g" : "w" },
    ...(m.esop_concentration > 0
      ? [{
          label: "ESOP concentration",
          value: pct(m.esop_concentration),
          severity: (m.esop_concentration < 15 ? "g" : m.esop_concentration < 30 ? "w" : "d") as Severity,
        }]
      : []),
  ];

  const alloc = m.allocation;

  return (
    <div className="space-y-4">
      {/* Header */}
      <div>
        <h2 className="text-lg font-bold text-minto-text">
          {r.name ? `${r.name}'s` : "Your"} Financial Blueprint
        </h2>
        <p className="text-xs text-minto-text-muted mt-0.5">
          {r.age && `${r.age} yrs`}
          {r.jobNature && ` · ${r.jobNature}`}
          {n("earningMembers") > 0 && ` · ${n("earningMembers")} earner${n("earningMembers") > 1 ? "s" : ""}`}
          {n("dependents") > 0 && ` · ${n("dependents")} dependent${n("dependents") !== 1 ? "s" : ""}`}
        </p>
      </div>

      {/* Financial Health Ratios */}
      <Card>
        <div className="flex items-center gap-2 mb-3">
          <TrendingUp size={16} className="text-minto-text" />
          <h3 className="text-sm font-bold text-minto-text">Financial Health Ratios</h3>
        </div>
        <p className="text-xs text-minto-text-muted mb-3">NISM-prescribed metrics every RIA computes before advising.</p>
        <div className="grid grid-cols-2 lg:grid-cols-3 gap-2">
          {ratios.map((r, i) => (
            <div key={i} className={`rounded-xl px-3 py-2.5 ${severityBg(r.severity)}`}>
              <p className="text-xs text-minto-text-secondary">{r.label}</p>
              <p className={`text-sm font-bold ${severityColor(r.severity)}`}>{r.value}</p>
            </div>
          ))}
        </div>
      </Card>

      {/* Balance Sheet */}
      <Card>
        <div className="flex items-center gap-2 mb-3">
          <Wallet size={16} className="text-minto-text" />
          <h3 className="text-sm font-bold text-minto-text">Personal Balance Sheet</h3>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {/* Assets */}
          <div>
            <p className="text-xs font-semibold text-minto-text-muted uppercase tracking-wide mb-2">Assets</p>
            <div className="space-y-1.5">
              <div className="flex justify-between text-sm">
                <span className="text-minto-text-secondary">Physical</span>
                <span className="text-minto-text font-medium">{fmt(d.physAssets)}</span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-minto-text-secondary">Financial</span>
                <span className="text-minto-text font-medium">{fmt(d.finAssets - d.esopVested)}</span>
              </div>
              {d.esopVested > 0 && (
                <div className="flex justify-between text-sm">
                  <span className="text-minto-text-secondary">ESOPs (vested)</span>
                  <span className="text-minto-text font-medium">{fmt(d.esopVested)}</span>
                </div>
              )}
              <div className="flex justify-between text-sm font-bold pt-1.5 border-t border-minto-text/10">
                <span className="text-minto-text">Total</span>
                <span className="text-minto-text">{fmt(d.totalAssets)}</span>
              </div>
              {d.esopUnvested > 0 && (
                <div className="flex justify-between text-xs italic text-minto-text-muted">
                  <span>Unvested ESOPs (not counted)</span>
                  <span>{fmt(d.esopUnvested)}</span>
                </div>
              )}
            </div>
          </div>
          {/* Liabilities */}
          <div>
            <p className="text-xs font-semibold text-minto-text-muted uppercase tracking-wide mb-2">Liabilities</p>
            <div className="space-y-1.5">
              <div className="flex justify-between text-sm">
                <span className="text-minto-text-secondary">Debt outstanding</span>
                <span className="text-minto-text font-medium">{fmt(d.totalDebt)}</span>
              </div>
              <div className="flex justify-between text-sm font-bold pt-1.5 border-t border-minto-text/10">
                <span className="text-minto-positive">Net worth</span>
                <span className="text-minto-positive">{fmt(d.netWorth)}</span>
              </div>
            </div>
          </div>
        </div>
      </Card>

      {/* Monthly Cash Flow */}
      <Card>
        <div className="flex items-center gap-2 mb-3">
          <TrendingUp size={16} className="text-minto-text" />
          <h3 className="text-sm font-bold text-minto-text">Monthly Cash Flow</h3>
        </div>
        <div className="space-y-1.5">
          <div className="flex justify-between text-sm">
            <span className="text-minto-text-secondary">Gross income</span>
            <span className="text-minto-text font-medium">{fmt(d.totalIncome)}</span>
          </div>
          <div className="flex justify-between text-sm">
            <span className="text-minto-text-secondary">Mandatory (PF + Tax)</span>
            <span className="text-minto-text font-medium">−{fmt(d.mandatoryDed)}</span>
          </div>
          <div className="flex justify-between text-sm">
            <span className="text-minto-text-secondary">Essential expenses</span>
            <span className="text-minto-text font-medium">−{fmt(d.essentialExp)}</span>
          </div>
          <div className="flex justify-between text-sm">
            <span className="text-minto-text-secondary">Discretionary</span>
            <span className="text-minto-text font-medium">−{fmt(d.discretionaryExp)}</span>
          </div>
          <div className="flex justify-between text-sm">
            <span className="text-minto-text-secondary">Loan EMIs</span>
            <span className="text-minto-text font-medium">−{fmt(d.totalEMI)}</span>
          </div>
          <div className="flex justify-between text-sm font-bold pt-2 border-t border-minto-text/10">
            <span className="text-minto-text">Investable surplus</span>
            <span className={d.monthlySurplus >= 0 ? "text-minto-positive" : "text-minto-negative"}>
              {fmt(d.monthlySurplus)}/mo
            </span>
          </div>
        </div>
      </Card>

      {/* Fix These First */}
      {hasAlerts && (
        <Card>
          <div className="flex items-center gap-2 mb-3">
            <AlertTriangle size={16} className="text-minto-gold" />
            <h3 className="text-sm font-bold text-minto-text">Fix These First</h3>
          </div>
          <div className="space-y-3">
            {needDebt && (
              <div className="flex gap-2 text-sm rounded-xl p-3 bg-minto-negative/5 border border-minto-negative/20">
                <span>🔴</span>
                <div>
                  <p className="font-medium text-minto-text">DTI is {pct(m.dti)}</p>
                  <p className="text-xs text-minto-text-secondary mt-0.5">
                    Above the 40% danger line. Pay down costliest debt first (credit cards → personal loans → car) before growth investing.
                  </p>
                </div>
              </div>
            )}
            {needEsopDiversify && (
              <div className="flex gap-2 text-sm rounded-xl p-3 bg-minto-gold/5 border border-minto-gold/20">
                <span>🟠</span>
                <div>
                  <p className="font-medium text-minto-text">ESOP concentration: {pct(m.esop_concentration)} of financial assets</p>
                  <p className="text-xs text-minto-text-secondary mt-0.5">
                    Your income and your wealth both depend on one company.{" "}
                    {r.esopCompanyType === "listed"
                      ? "Consider a systematic liquidation plan — sell vested tranches quarterly and diversify into index funds."
                      : r.esopCompanyType === "startup"
                        ? "Startup ESOPs are illiquid and binary. Don't count on them for any financial goal. Build your investable corpus separately."
                        : "Unlisted shares can't be easily sold. Build diversified investments in parallel so your financial plan doesn't hinge on one outcome."}
                  </p>
                </div>
              </div>
            )}
            {needEF && (
              <div className="flex gap-2 text-sm rounded-xl p-3 bg-minto-gold/5 border border-minto-gold/20">
                <span>🟡</span>
                <div>
                  <p className="font-medium text-minto-text">Emergency fund: {m.liquidity_ratio.toFixed(1)} months</p>
                  <p className="text-xs text-minto-text-secondary mt-0.5">
                    Need 6. Park {fmt(d.monthlyExp * 6)} in liquid funds before equity.
                  </p>
                </div>
              </div>
            )}
            {needIns && (
              <div className="flex gap-2 text-sm rounded-xl p-3 bg-minto-gold/5 border border-minto-gold/20">
                <span>🟡</span>
                <div>
                  <p className="font-medium text-minto-text">{n("dependents")} dependents, no life insurance</p>
                  <p className="text-xs text-minto-text-secondary mt-0.5">
                    Get a term plan for at least {fmt(d.annualIncome * 10)} before investing.
                  </p>
                </div>
              </div>
            )}
          </div>
        </Card>
      )}

      {/* Suggested Allocation */}
      {alloc && (
        <Card>
          <div className="flex items-center gap-2 mb-3">
            <PieChart size={16} className="text-minto-text" />
            <h3 className="text-sm font-bold text-minto-text">Suggested Allocation</h3>
          </div>
          <div className="flex h-8 rounded-full overflow-hidden">
            {[
              { key: "indiaEq", label: "India Eq", color: "bg-[#3d8b4f]", value: alloc.indiaEq },
              { key: "gold", label: "Gold", color: "bg-[#b8943e]", value: alloc.gold },
              { key: "worldEq", label: "World Eq", color: "bg-[#3d5a3e]", value: alloc.worldEq },
              { key: "stability", label: "Stable", color: "bg-[#8a9a8c]", value: alloc.stability },
            ].map((s) => (
              <div
                key={s.key}
                className={`${s.color} flex items-center justify-center transition-all`}
                style={{ width: `${s.value}%` }}
              >
                {s.value >= 10 && (
                  <span className="text-white text-xs font-medium whitespace-nowrap">
                    {s.label} {s.value}%
                  </span>
                )}
              </div>
            ))}
          </div>
          <div className="flex flex-wrap gap-x-4 gap-y-1 mt-3">
            {[
              { label: "Nifty 50 Index", color: "bg-[#3d8b4f]" },
              { label: "Gold ETF / FoF", color: "bg-[#b8943e]" },
              { label: "S&P 500 FoF", color: "bg-[#3d5a3e]" },
              { label: "Liquid / Arb Fund", color: "bg-[#8a9a8c]" },
            ].map((l) => (
              <span key={l.label} className="flex items-center gap-1.5 text-xs text-minto-text-secondary">
                <span className={`w-2.5 h-2.5 rounded-full ${l.color}`} />
                {l.label}
              </span>
            ))}
          </div>
          <p className="text-xs text-minto-text-muted mt-2">
            Monthly SIP: {fmt(Math.max(0, d.monthlySurplus))} — reviewed and rebalanced annually.
          </p>
        </Card>
      )}

      {/* Goals */}
      {r.goals && r.goals.length > 0 && (
        <Card>
          <div className="flex items-center gap-2 mb-3">
            <Target size={16} className="text-minto-text" />
            <h3 className="text-sm font-bold text-minto-text">Goals Mapped</h3>
          </div>
          <div className="space-y-2">
            {r.goals.map((g: any) => {
              const years = Number(g.years);
              const strategy = years <= 3 ? "stability" : years <= 5 ? "balanced" : "equity";
              const stratColor =
                strategy === "stability"
                  ? "bg-minto-gold/10 text-minto-gold"
                  : strategy === "balanced"
                    ? "bg-minto-positive/10 text-minto-positive"
                    : "bg-[#3d5a3e]/10 text-[#3d5a3e]";
              return (
                <div key={g.id} className="flex items-center justify-between">
                  <div>
                    <p className="text-sm font-medium text-minto-text">{g.name}</p>
                    <p className="text-xs text-minto-text-muted">{fmt(g.amount)} · {g.years}y</p>
                  </div>
                  <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${stratColor}`}>
                    {strategy}
                  </span>
                </div>
              );
            })}
          </div>
        </Card>
      )}
    </div>
  );
}
