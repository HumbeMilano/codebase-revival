import { describe, expect, it } from "vitest";
import {
  dashboardLayoutSchema,
  dashboardScopeKey,
  defaultDashboardLayout,
  MAX_DASHBOARD_WIDGETS,
  moveDashboardWidget,
} from "./dashboard-layout";

describe("dashboard layouts", () => {
  it("accepts a deliberate empty layout and rejects unknown, duplicate or data-bearing widgets", () => {
    expect(dashboardLayoutSchema.parse({ version: 1, widgets: [] }).widgets).toEqual([]);
    const invalid = [
      { version: 5, widgets: [] },
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
    expect(moved.widgets.slice(0, 2).map((widget) => widget.id)).toEqual(["tasks", "shopping"]);
    expect(original.widgets[0]?.id).toBe("tasks");
    expect(moveDashboardWidget(original, "tasks", -1)).toBe(original);
    expect(moveDashboardWidget({ version: 4, widgets: [] }, "notes", 1).widgets).toEqual([]);
  });

  it("separates shared-tablet preferences by household and member", () => {
    const scope = { kind: "device", householdId: "one", memberId: "child" } as const;
    expect(dashboardScopeKey(scope)).not.toBe(dashboardScopeKey({ ...scope, memberId: "adult" }));
    expect(dashboardScopeKey(scope)).not.toBe(dashboardScopeKey({ ...scope, householdId: "two" }));
  });
});

describe("configured dashboard instances", () => {
  const firstId = "abcdefab-cdef-4abc-8def-abcdefabcdef";
  const secondId = "10000000-0000-4000-8000-000000000002";
  for (const [id, field] of [
    ["specific-note", "noteId"],
    ["shopping", "listId"],
    ["member-summary", "memberId"],
    ["member-tasks", "memberId"],
  ] as const) {
    it(`allows distinct ${id} selections and rejects the same selection under another key`, () => {
      const widgets = [
        { id, key: "first", size: "compact", [field]: firstId },
        { id, key: "second", size: "column", [field]: secondId },
      ];
      expect(dashboardLayoutSchema.parse({ version: 4, widgets }).widgets).toEqual(widgets);
      expect(
        dashboardLayoutSchema.safeParse({
          version: 4,
          widgets: [widgets[0], { ...widgets[1], [field]: firstId }],
        }).success,
      ).toBe(false);
    });
  }
  it("canonicalizes UUID references while preserving case-sensitive member keys", () => {
    const note = { id: "specific-note", key: "first", size: "wide", noteId: firstId };
    expect(
      dashboardLayoutSchema.safeParse({
        version: 4,
        widgets: [note, { ...note, key: "other", noteId: firstId.toUpperCase() }],
      }).success,
    ).toBe(false);
    expect(
      dashboardLayoutSchema.parse({
        version: 4,
        widgets: [{ ...note, noteId: firstId.toUpperCase() }],
      }).widgets[0]?.noteId,
    ).toBe(firstId);
    expect(
      dashboardLayoutSchema.parse({
        version: 4,
        widgets: [
          { id: "member-tasks", key: "a", size: "compact", memberId: "m_A" },
          { id: "member-tasks", key: "b", size: "compact", memberId: "m_a" },
        ],
      }).widgets,
    ).toHaveLength(2);
  });
  it("keeps different widget purposes for the same member, and generic widgets remain single", () => {
    expect(
      dashboardLayoutSchema.parse({
        version: 4,
        widgets: [
          { id: "member-summary", key: "summary", size: "compact", memberId: "m_ana" },
          { id: "member-tasks", key: "tasks", size: "compact", memberId: "m_ana" },
        ],
      }).widgets,
    ).toHaveLength(2);
    expect(
      dashboardLayoutSchema.safeParse({
        version: 4,
        widgets: [
          { id: "calendar", key: "a", size: "compact" },
          { id: "calendar", key: "b", size: "wide" },
        ],
      }).success,
    ).toBe(false);
  });
  it("does not allow an implicit shopping list beside explicit lists", () => {
    expect(
      dashboardLayoutSchema.safeParse({
        version: 4,
        widgets: [
          { id: "shopping", key: "implicit", size: "wide" },
          { id: "shopping", key: "explicit", size: "wide", listId: firstId },
        ],
      }).success,
    ).toBe(false);
  });
  it("supports more than one per type within a bounded document and retains the legacy v3 contract", () => {
    const widgets = Array.from({ length: MAX_DASHBOARD_WIDGETS }, (_, i) => ({
      id: "specific-note",
      key: `note-${i}`,
      size: "small",
      noteId: crypto.randomUUID(),
    }));
    expect(dashboardLayoutSchema.parse({ version: 4, widgets }).widgets).toHaveLength(
      MAX_DASHBOARD_WIDGETS,
    );
    expect(
      dashboardLayoutSchema.safeParse({
        version: 4,
        widgets: [...widgets, { ...widgets[0], key: "overflow", noteId: crypto.randomUUID() }],
      }).success,
    ).toBe(false);
    expect(
      dashboardLayoutSchema.safeParse({ version: 3, widgets: widgets.slice(0, 2) }).success,
    ).toBe(false);
  });
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
      version: 4,
      widgets: [
        { id: "notes", key: "notes", size: "wide" },
        { id: "family", key: "family", size: "compact" },
      ],
    });
  });
  it("preserves distinct legacy reference choices and refuses duplicate selections or private contents", () => {
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
    expect(layout.version).toBe(4);
    expect(layout.widgets).toHaveLength(2);
    expect(layout.widgets[0]?.noteId).toBe("10000000-0000-4000-8000-000000000001");
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
