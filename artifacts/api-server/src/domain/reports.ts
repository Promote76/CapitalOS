export type ReportKind =
  | "weekly_capital"
  | "monthly_portfolio"
  | "goal_progress"
  | "property_readiness"
  | "strategy_performance"
  | "risk"
  | "net_worth";

export type ReportDescriptor = {
  kind: ReportKind;
  title: string;
  status: "available" | "planned";
  private: true;
  hashable: true;
};

export const reportDescriptors: ReportDescriptor[] = [
  ["weekly_capital", "Weekly Capital Report"],
  ["monthly_portfolio", "Monthly Portfolio Report"],
  ["goal_progress", "Goal Progress Report"],
  ["property_readiness", "Property Readiness Report"],
  ["strategy_performance", "Strategy Performance Report"],
  ["risk", "Risk Report"],
  ["net_worth", "Net Worth Statement"],
].map(([kind, title]) => ({ kind: kind as ReportKind, title, status: "planned", private: true, hashable: true }));