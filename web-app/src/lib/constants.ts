export const THEME = {
  colors: {
    accent: "#3d5a3e",
    text: "#2d3a2e",
    textSecondary: "#5a6b5c",
    textMuted: "#8a9a8c",
    positive: "#3d8b4f",
    negative: "#c4483e",
    gold: "#b8943e",
    dark: "#1C211E",
  },
} as const;

export const CHART_COLORS = [
  "#3d5a3e",
  "#5c7c6f",
  "#b8943e",
  "#7b5c5c",
  "#6a8fa0",
  "#9a7daa",
  "#4a7c59",
  "#8b7355",
  "#5b8a9a",
  "#7d6b8a",
  "#6b8c5c",
  "#9a8a6a",
];

export const ASSET_CLASS_COLORS: Record<string, string> = {
  Equity: "#3d5a3e",
  "Equity Funds": "#5c7c6f",
  "Debt Funds": "#6a8fa0",
  "Cash & Liquid": "#8bb0c4",
  Gold: "#b8943e",
  Silver: "#9a9a9a",
  "Arbitrage Funds": "#7b9f7a",
  "Hybrid Funds": "#8b7355",
  Others: "#9a7daa",
};

export const SUGGESTION_CHIPS = [
  "How's my portfolio doing?",
  "Explain Nifty 50",
  "Show me concentration risks",
  "Latest market news",
];
