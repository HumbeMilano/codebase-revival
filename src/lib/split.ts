export type SplitType = "amount" | "percent" | "equal";
export interface Split {
  personId: string;
  type: SplitType;
  value: number;
}

/**
 * Household split engine:
 * 1. fixed amounts are deducted first
 * 2. percentages apply to the remainder
 * 3. whatever is left is divided equally among "equal" entries
 */
export function splitBill(total: number, splits: Split[]): Record<string, number> {
  const out: Record<string, number> = {};
  const fixed = splits.filter((s) => s.type === "amount").reduce((a, s) => a + s.value, 0);
  const remainder = Math.max(0, total - fixed);
  const pctTotal = splits.filter((s) => s.type === "percent").reduce((a, s) => a + s.value, 0);
  const afterPct = Math.max(0, remainder - (remainder * pctTotal) / 100);
  const equalCount = splits.filter((s) => s.type === "equal").length;
  for (const s of splits) {
    const share =
      s.type === "amount"
        ? s.value
        : s.type === "percent"
          ? (remainder * s.value) / 100
          : equalCount
            ? afterPct / equalCount
            : 0;
    out[s.personId] = Math.round(((out[s.personId] ?? 0) + share) * 100) / 100;
  }
  return out;
}

export function validateSplits(total: number, splits: Split[]): string | null {
  if (!(total > 0)) return "El monto debe ser mayor que 0";
  const fixed = splits.filter((s) => s.type === "amount").reduce((a, s) => a + s.value, 0);
  if (fixed > total) return "Los montos fijos superan el total";
  const pct = splits.filter((s) => s.type === "percent").reduce((a, s) => a + s.value, 0);
  if (pct > 100) return "Los porcentajes suman más de 100%";
  return null;
}
