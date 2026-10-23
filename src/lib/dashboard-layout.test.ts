import { describe, expect, it } from "vitest";
import {
  dashboardLayoutSchema,
  dashboardScopeKey,
  defaultDashboardLayout,
  moveDashboardWidget,
} from "./dashboard-layout";

describe("dashboard layouts", () => {
  it("accepts a deliberate empty layout and rejects unknown, duplicate or data-bearing widgets", () => {
    expect(dashboardLayoutSchema.parse({ version: 1, widgets: [] }).widgets).toEqual([]);
    const invalid = [
      { version: 3, widgets: [] },
      { version: 1, widgets: [{ id: "private-data", size: "wide" }] },
      { version: 1, widgets: [{ id: "tasks", size: "giant" }] },
      {
        version: 1,
        widgets: [
          { id: "notes", size: "wide" },
          { id: "notes", size: "compact" },
        ],
      },
      { version: 1, widgets: [{ id: "finance", size: "compact", amount: 100 }] },
      { version: 1, widgets: [], household: "not a layout preference" },
    ];
    for (const value of invalid) expect(dashboardLayoutSchema.safeParse(value).success).toBe(false);
  });

  it("reorders without mutating saved preferences and keeps boundary moves unchanged", () => {
    const original = defaultDashboardLayout();
    const moved = moveDashboardWidget(original, "shopping", -1);
    expect(moved.widgets.slice(0, 2).map((widget) => widget.id)).toEqual(["shopping", "tasks"]);
    expect(original.widgets[0]?.id).toBe("tasks");
    expect(moveDashboardWidget(moved, "shopping", -1)).toBe(moved);
    expect(moveDashboardWidget({ version: 2, widgets: [] }, "notes", 1).widgets).toEqual([]);
  });

  it("separates shared-tablet preferences by household and member", () => {
    const scope = { kind: "device", householdId: "one", memberId: "child" } as const;
    expect(dashboardScopeKey(scope)).not.toBe(dashboardScopeKey({ ...scope, memberId: "adult" }));
    expect(dashboardScopeKey(scope)).not.toBe(dashboardScopeKey({ ...scope, householdId: "two" }));
  });
});

describe("configured dashboard instances", () => {
  it("upgrades saved layouts without changing their order or choices", () => {
    expect(
      dashboardLayoutSchema.parse({
        version: 1,
        widgets: [
          { id: "notes", size: "wide" },
          { id: "family", size: "compact" },
        ],
      }),
    ).toEqual({
      version: 2,
      widgets: [
        { id: "notes", key: "notes", size: "wide" },
        { id: "family", key: "family", size: "compact" },
      ],
    });
  });
  it("keeps copies independent and refuses stored contents or duplicate instance keys", () => {
    const layout = dashboardLayoutSchema.parse({
      version: 2,
      widgets: [
        {
          id: "specific-note",
          key: "first",
          size: "small",
          noteId: "10000000-0000-4000-8000-000000000001",
        },
        {
          id: "specific-note",
          key: "second",
          size: "column",
          noteId: "10000000-0000-4000-8000-000000000002",
        },
      ],
    });
    expect(moveDashboardWidget(layout, "second", -1).widgets[0]?.key).toBe("second");
    expect(layout.widgets[0]?.key).toBe("first");
    expect(
      dashboardLayoutSchema.safeParse({
        ...layout,
        widgets: [layout.widgets[0], layout.widgets[0]],
      }).success,
    ).toBe(false);
    expect(
      dashboardLayoutSchema.safeParse({
        ...layout,
        widgets: [{ ...layout.widgets[0], body: "private note text" }],
      }).success,
    ).toBe(false);
  });
});
