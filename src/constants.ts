import { ProductionStatus } from "./types";

export const STATUS_COLORS: Record<ProductionStatus, string> = {
  [ProductionStatus.IN_ANALYSIS]: "bg-blue-900/30 text-blue-400 border-blue-800",
  [ProductionStatus.RELEASED]: "bg-emerald-900/30 text-emerald-400 border-emerald-800",
  [ProductionStatus.CLOSED]: "bg-slate-800/50 text-slate-400 border-slate-700",
};

export const STATUS_LABELS: Record<ProductionStatus, string> = {
  [ProductionStatus.IN_ANALYSIS]: "In Analysis",
  [ProductionStatus.RELEASED]: "Released",
  [ProductionStatus.CLOSED]: "Closed",
};

export const STATUS_OPTIONS = Object.values(ProductionStatus);
