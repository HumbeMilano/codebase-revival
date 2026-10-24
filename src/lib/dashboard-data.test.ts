import { describe, expect, it } from "vitest";
import type { HubState } from "@/components/hub/Screens";
import { HOUSEHOLD } from "@/components/hub/data";
import {
  dashboardChores,
  dashboardList,
  dashboardListItems,
  fundingPercent,
} from "./dashboard-data";

describe("dashboard record selection", () => {
  it("never substitutes another list after the chosen list is archived or missing", () => {
    const lists = [
      { id: "a", name: "Groceries", archived: false },
      { id: "b", name: "School", archived: false },
    ];
    const state = {
      shoppingLists: lists,
      items: [
        { id: "old", name: "Milk", done: false },
        { id: "school", name: "Pen", done: false, listId: "b" },
      ],
    } as HubState;
    const widget = { id: "shopping", key: "shopping", size: "compact" } as const;
    expect(dashboardList(state, widget)).toBeUndefined();
    expect(dashboardList(state, { ...widget, listId: "b" })?.name).toBe("School");
    lists[1]!.archived = true;
    expect(dashboardList(state, { ...widget, listId: "b" })).toBeUndefined();
    expect(dashboardList(state, widget)?.name).toBe("Groceries");
    expect(dashboardListItems(state, HOUSEHOLD.id).map((i) => i.name)).toEqual(["Milk"]);
    expect(dashboardListItems(state, "b").map((i) => i.name)).toEqual(["Pen"]);
  });
  it("excludes archived completions and future tasks but keeps overdue pending tasks", () => {
    const chores = [
      { id: "old", done: true, completedAt: "2026-10-19T12:00:00Z" },
      { id: "yesterday", done: false, dueDate: "2026-10-23" },
      { id: "later", done: false, dueDate: "2026-10-27" },
      { id: "today", done: true, dueDate: "2026-10-24", completedAt: "2026-10-24T11:00:00Z" },
    ];
    expect(
      dashboardChores({ chores } as HubState, new Date("2026-10-24T12:00:00Z")).map((c) => c.id),
    ).toEqual(["yesterday", "today"]);
  });
  it("keeps financial progress finite with no assigned bills and caps overfunding", () => {
    expect(fundingPercent(0, 0)).toBe(0);
    expect(fundingPercent(0, 20)).toBe(100);
    expect(fundingPercent(40, 10)).toBe(25);
    expect(fundingPercent(40, 90)).toBe(100);
  });
});
