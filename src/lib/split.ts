export type SplitType = "amount" | "percent" | "equal";
export interface Split {
  personId: string;
  type: SplitType;
  value: number;
}

export const moneyCents = (amount: number) => Math.round((amount + Number.EPSILON) * 100);

/** Fixed amounts first, percentages of the remainder, then equal shares.
 * Largest-remainder allocation keeps every cent and is stable by person id.
 * Invalid legacy allocations are bounded to the bill total for display; edits
 * must pass validateSplits before they can be saved.
 */
export function splitBill(total: number, splits: Split[]): Record<string, number> {
  if (!Number.isFinite(total) || total <= 0 || !splits.length) return {};
  const cents = moneyCents(total);
  const fixed = splits
    .filter((s) => s.type === "amount")
    .reduce((sum, s) => sum + Math.max(0, moneyCents(s.value)), 0);
  const remainder = Math.max(0, cents - fixed);
  const percentages = splits
    .filter((s) => s.type === "percent")
    .reduce((sum, s) => sum + Math.max(0, s.value), 0);
  const equalCount = splits.filter((s) => s.type === "equal").length;
  const equalPool = Math.max(0, remainder * (1 - percentages / 100));
  const weights = splits.map((split) => ({
    id: split.personId,
    value:
      split.type === "amount"
        ? Math.max(0, moneyCents(split.value))
        : split.type === "percent"
          ? (remainder * Math.max(0, split.value)) / 100
          : equalCount
            ? equalPool / equalCount
            : 0,
  }));
  const weightTotal = weights.reduce((sum, row) => sum + row.value, 0);
  const rows = weights.map((row, index) => {
    const exact = weightTotal > 0 ? (row.value / weightTotal) * cents : cents / weights.length;
    const value = Math.floor(exact + 1e-8);
    return { ...row, index, exact, cents: value };
  });
  let remaining = cents - rows.reduce((sum, row) => sum + row.cents, 0);
  const ranked = rows
    .slice()
    .sort(
      (a, b) =>
        b.exact - b.cents - (a.exact - a.cents) || a.id.localeCompare(b.id) || a.index - b.index,
    );
  for (const row of ranked) {
    if (remaining <= 0) break;
    row.cents += 1;
    remaining -= 1;
  }
  const result: Record<string, number> = {};
  for (const row of rows) result[row.id] = (moneyCents(result[row.id] ?? 0) + row.cents) / 100;
  return result;
}

export function validateSplits(total: number, splits: Split[]): string | null {
  if (!Number.isFinite(total) || total <= 0 || !Number.isSafeInteger(moneyCents(total)))
    return "El monto debe ser mayor que 0";
  if (Math.abs(total * 100 - moneyCents(total)) > 1e-6)
    return "Usa un máximo de dos decimales para el monto";
  if (!splits.length) return "Elige al menos una persona";
  if (
    new Set(splits.map((s) => s.personId)).size !== splits.length ||
    splits.some((s) => !s.personId)
  )
    return "Cada persona debe aparecer una sola vez";
  if (
    splits.some(
      (s) =>
        !["amount", "percent", "equal"].includes(s.type) ||
        !Number.isFinite(s.value) ||
        s.value < 0,
    )
  )
    return "El reparto contiene un valor no válido";
  if (
    splits.some((s) => s.type === "amount" && Math.abs(s.value * 100 - moneyCents(s.value)) > 1e-6)
  )
    return "Usa un máximo de dos decimales en los montos fijos";
  const fixed = splits
    .filter((s) => s.type === "amount")
    .reduce((sum, s) => sum + moneyCents(s.value), 0);
  const remainder = moneyCents(total) - fixed;
  if (remainder < 0) return "Los montos fijos superan el total; ajusta el reparto";
  const pct = splits.filter((s) => s.type === "percent").reduce((sum, s) => sum + s.value, 0);
  if (pct > 100 + 1e-8) return "Los porcentajes suman más de 100%";
  if (remainder > 0 && !splits.some((s) => s.type === "equal") && Math.abs(pct - 100) > 1e-8)
    return "El reparto debe cubrir todo el monto";
  return null;
}
