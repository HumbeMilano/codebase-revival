import type { HubState } from "@/components/hub/Screens";
import { HOUSEHOLD } from "@/components/hub/data";
import { dateKey } from "@/components/hub/planner-data";
import { calendarBills, upcomingCalendarItems } from "./calendar";
import { isChoreArchived } from "./chore-archive";
import { defaultShoppingList, shoppingListId } from "./offline-shopping";
import type { DashboardWidget, WidgetId } from "./dashboard-layout";

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
