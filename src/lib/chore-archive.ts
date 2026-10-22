import type { Chore } from "@/components/hub/data";

export const CHORE_RETENTION_MS = 3 * 24 * 60 * 60 * 1000;
export function isChoreArchived(chore: Chore, now: Date | number = Date.now()): boolean {
  if (!chore.done || !chore.completedAt) return false;
  const completed = Date.parse(chore.completedAt);
  return Number.isFinite(completed) && Number(now) - completed >= CHORE_RETENTION_MS;
}
