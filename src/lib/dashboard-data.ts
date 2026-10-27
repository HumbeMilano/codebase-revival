import type { HubState } from "@/components/hub/Screens";
import { HOUSEHOLD } from "@/components/hub/data";
import { dateKey } from "@/components/hub/planner-data";
import { calendarBills, upcomingCalendarItems } from "./calendar";
import { isChoreArchived } from "./chore-archive";
import { defaultShoppingList, shoppingListId } from "./offline-shopping";
import { widgetDimensions, type DashboardWidget, type WidgetId } from "./dashboard-layout";

export const isFinancialWidget = (id: WidgetId) =>
  ["finance", "bills", "member-summary", "next-bill"].includes(id);

export const dashboardHousehold = (s: HubState) => s.shoppingSync?.householdId ?? HOUSEHOLD.id;
export function dashboardLists(s: HubState) {
  const lists = s.shoppingLists?.length
    ? s.shoppingLists
    : [defaultShoppingList(dashboardHousehold(s))];
  return lists.filter((list) => !list.archived);
}
export function dashboardList(s: HubState, widget: DashboardWidget) {
  const lists = dashboardLists(s);
  return widget.listId
    ? lists.find((list) => list.id === widget.listId)
    : lists.length === 1
      ? lists[0]
      : undefined;
}
export function dashboardListItems(s: HubState, listId: string) {
  return s.items.filter((item) => shoppingListId(item, dashboardHousehold(s)) === listId);
}
export function dashboardChores(s: HubState, now: Date) {
  const today = dateKey(now);
  return s.chores.filter(
    (chore) =>
      !isChoreArchived(chore, now) &&
      (!chore.dueDate || chore.dueDate === today || (!chore.done && chore.dueDate < today)),
  );
}
export const fundingPercent = (assigned: number, contributed: number) =>
  assigned > 0
    ? Math.min(100, Math.max(0, (contributed / assigned) * 100))
    : contributed > 0
      ? 100
      : 0;

export function dashboardNextBill(s: HubState, now: Date) {
  return Array.from({ length: 13 }, (_, offset) => {
    const month = dateKey(new Date(now.getFullYear(), now.getMonth() + offset, 1)).slice(0, 7);
    return calendarBills(s.bills, month, now);
  })
    .flat()
    .filter((bill) => bill.status !== "paid")
    .sort((a, b) => a.date.localeCompare(b.date))[0];
}

export type DashboardSection = "chores" | "shopping" | "calendar" | "notes" | "finance";
export function widgetSection(id: WidgetId): DashboardSection {
  if (isFinancialWidget(id)) return "finance";
  if (["shopping", "shopping-summary"].includes(id)) return "shopping";
  if (["notes", "pinned-note", "specific-note"].includes(id)) return "notes";
  if (["calendar", "month-calendar", "week", "reminders", "clock"].includes(id)) return "calendar";
  return "chores";
}
export function mobileWidgetDimensions(widget: DashboardWidget): [number, number] {
  const [columns, rows] = widgetDimensions[widget.size];
  if (rows === 1) return [columns === 1 ? 1 : 2, 116];
  if (widget.id === "month-calendar") return [2, 350 + Math.max(0, rows - 2) * 20];
  if (
    [
      "shopping",
      "calendar",
      "week",
      "notes",
      "reminders",
      "bills",
      "tasks",
      "my-tasks",
      "member-tasks",
      "specific-note",
      "pinned-note",
      "quick-add",
      "family",
      "shopping-summary",
    ].includes(widget.id)
  )
    return [2, widget.id === "family" ? 210 : 200 + rows * 24];
  return [
    columns === 3 ? 2 : 1,
    widget.id === "member-summary" ? 264 : widget.id === "progress" ? 208 : 196,
  ];
}

export function mobileWidgetContentDimensions(
  widget: DashboardWidget,
  s: HubState,
  now: Date,
): [number, number] {
  const [columns, maximum] = mobileWidgetDimensions(widget);
  if (widgetDimensions[widget.size][1] === 1) return [columns, maximum];
  let height: number | undefined;
  if (widget.id === "shopping") {
    const list = dashboardList(s, widget);
    height = list ? 150 + Math.min(5, dashboardListItems(s, list.id).length) * 40 : 145;
  } else if (["calendar", "week", "reminders"].includes(widget.id)) {
    const end = new Date(now);
    end.setDate(end.getDate() + 7);
    const entries = upcomingCalendarItems(
      widget.id === "reminders" ? s.events.filter((e) => e.kind === "reminder") : s.events,
      widget.id === "reminders" ? [] : s.bills,
      now,
      10,
      widget.id === "week" ? dateKey(end) : undefined,
    );
    height = Math.max(130, 86 + entries.length * 58);
  } else if (widget.id === "notes") height = s.notes.length ? 98 + s.notes.length * 74 : 130;
  return [columns, height === undefined ? maximum : Math.min(maximum, height)];
}
