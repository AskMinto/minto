"use client";

export type FundType = "index" | "equity" | "debt" | "arbitrage" | "gold" | "silver";

export interface FundClassifierInput {
  schemeCategory?: string | null;
  schemeType?: string | null;
  schemeName?: string | null;
  name?: string | null;
  symbol?: string | null;
}

const RULES: { type: FundType; patterns: RegExp[] }[] = [
  {
    type: "silver",
    patterns: [/\bsilver\b/],
  },
  {
    type: "gold",
    patterns: [/\bgold\b/],
  },
  {
    type: "arbitrage",
    patterns: [/\barbitrage\b/, /\barb\b/],
  },
  {
    type: "index",
    patterns: [
      /\bindex\b/,
      /\bnifty\b/,
      /\bsensex\b/,
      /\bs&p\b/,
      /\bsp\s?500\b/,
      /\bnasdaq\b/,
      /\bdow\b/,
      /\bftse\b/,
      /\bmsci\b/,
      /\bbse\b/,
    ],
  },
  {
    type: "debt",
    patterns: [
      /\bdebt\b/,
      /\bbond\b/,
      /\bgilt\b/,
      /\bcredit\b/,
      /\bcorporate bond\b/,
      /\bfixed income\b/,
      /\bmoney market\b/,
      /\bliquid\b/,
      /\bultra short\b/,
      /\bshort duration\b/,
      /\blow duration\b/,
      /\bovernight\b/,
      /\bgovernment\b/,
      /\bg-sec\b/,
      /\bbanking\s*&\s*psu\b/,
      /\bpsu\b/,
      /\bfloater\b/,
      /\bfmp\b/,
      /\bfixed maturity\b/,
    ],
  },
  {
    type: "equity",
    patterns: [
      /\bequity\b/,
      /\belss\b/,
      /\blarge cap\b/,
      /\bmid cap\b/,
      /\bsmall cap\b/,
      /\bflexi cap\b/,
      /\bmulti cap\b/,
      /\bfocused\b/,
      /\bvalue\b/,
      /\bdividend\b/,
      /\bgrowth\b/,
      /\bcontra\b/,
      /\bthematic\b/,
      /\bsectoral\b/,
      /\bquality\b/,
      /\bmomentum\b/,
      /\bquant\b/,
    ],
  },
];

const LABELS: Record<FundType, string> = {
  index: "Index",
  equity: "Equity",
  debt: "Debt",
  arbitrage: "Arbitrage",
  gold: "Gold",
  silver: "Silver",
};

export function classifyFund(input: FundClassifierInput): FundType | null {
  const text = [
    input.schemeCategory,
    input.schemeType,
    input.schemeName,
    input.name,
    input.symbol,
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();

  if (!text) return null;

  for (const rule of RULES) {
    if (rule.patterns.some((pattern) => pattern.test(text))) {
      return rule.type;
    }
  }

  return null;
}

export function fundTypeLabel(type: FundType): string {
  return LABELS[type];
}

export function fundTypeVariant(type: FundType):
  | "fund-index"
  | "fund-equity"
  | "fund-debt"
  | "fund-arbitrage"
  | "fund-gold"
  | "fund-silver" {
  switch (type) {
    case "index":
      return "fund-index";
    case "equity":
      return "fund-equity";
    case "debt":
      return "fund-debt";
    case "arbitrage":
      return "fund-arbitrage";
    case "gold":
      return "fund-gold";
    case "silver":
      return "fund-silver";
  }
}
