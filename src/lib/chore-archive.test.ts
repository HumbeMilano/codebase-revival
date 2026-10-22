import { describe, expect, it } from "vitest";
import { CHORE_RETENTION_MS, isChoreArchived } from "./chore-archive";
import type { Chore } from "@/components/hub/data";
const completed: Chore = {
  id: "task",
  title: "Lavar",
  memberId: "adult",
  done: true,
  when: "Hoy",
  completedAt: "2026-10-22T20:00:00Z",
};
describe("three-day task archive", () => {
  it("retains a completed task until precisely three days have passed", () => {
    const instant = Date.parse(completed.completedAt!);
    expect(isChoreArchived(completed, instant + CHORE_RETENTION_MS - 1)).toBe(false);
    expect(isChoreArchived(completed, instant + CHORE_RETENTION_MS)).toBe(true);
  });
  it("keeps unfinished tasks and unknown completion dates active", () => {
    expect(isChoreArchived({ ...completed, done: false }, new Date("2027-01-01"))).toBe(false);
    expect(isChoreArchived({ ...completed, completedAt: null })).toBe(false);
    expect(isChoreArchived({ ...completed, completedAt: "invalid" })).toBe(false);
  });
});
