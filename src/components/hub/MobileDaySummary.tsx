import { Bell, CalendarDays, CheckSquare, ChevronRight, ShoppingBasket } from "lucide-react";
import { upcomingCalendarItems, calendarBills } from "@/lib/calendar";
import { dashboardChores, dashboardHousehold, dashboardLists } from "@/lib/dashboard-data";
import { shoppingListId } from "@/lib/offline-shopping";
import { dateKey, parseDate } from "./planner-data";
import type { HubState } from "./Screens";

type Section = "chores" | "shopping" | "calendar";

/** A page header for personal phones; never adds to or rewrites the widget layout. */
export function MobileDaySummary({
  s,
  now,
  go,
  onCreate,
  onOpenRecord,
  financialAccess = false,
}: {
  s: HubState;
  now: Date;
  go: (section: Section) => void;
  onCreate: (section: Section) => void;
  onOpenRecord?: ((section: "shopping" | "calendar", id: string) => void) | undefined;
  financialAccess?: boolean;
}) {
  const today = dateKey(now);
  const tasks = dashboardChores(s, now).filter((chore) => !chore.done).length;
  const lists = dashboardLists(s);
  const active = new Set(lists.map((list) => list.id));
  const products = s.items.filter(
    (item) => !item.done && active.has(shoppingListId(item, dashboardHousehold(s))),
  ).length;
  const bills = financialAccess ? s.bills : [];
  const agenda = [...s.events, ...calendarBills(bills, today.slice(0, 7), now)].filter(
    (entry) =>
      entry.date === today && (entry.kind === "bill" ? entry.status !== "paid" : !entry.completed),
  ).length;
  const next = upcomingCalendarItems(s.events, bills, now, 1)[0];
  const tomorrow = dateKey(new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1));
  const open = (section: "shopping" | "calendar", id: string) => {
    if (onOpenRecord) onOpenRecord(section, id);
    else go(section);
  };
  return (
    <section className="home-day-summary" aria-label="Tu día">
      <div className="home-day-actions">
        <button
          type="button"
          className="home-day-action home-day-tasks"
          aria-label={tasks ? "Abrir tareas del día" : "Añadir tarea al día"}
          onClick={() => (tasks ? go("chores") : onCreate("chores"))}
        >
          <CheckSquare aria-hidden="true" />
          <strong>Tareas</strong>
          <span>{tasks ? `${tasks} pendiente${tasks === 1 ? "" : "s"}` : "Añadir tarea"}</span>
        </button>
        <button
          type="button"
          className="home-day-action home-day-shopping"
          aria-label="Abrir compras del día"
          onClick={() => (lists.length === 1 ? open("shopping", lists[0]!.id) : go("shopping"))}
        >
          <ShoppingBasket aria-hidden="true" />
          <strong>Compras</strong>
          <span>
            {products
              ? `${products} por comprar`
              : lists.length > 1
                ? "Ver listas"
                : "Añadir productos"}
          </span>
        </button>
        <button
          type="button"
          className="home-day-action home-day-agenda"
          aria-label={agenda ? "Ver agenda de hoy" : "Añadir fecha al calendario"}
          onClick={() => (agenda ? open("calendar", `date:${today}`) : onCreate("calendar"))}
        >
          <CalendarDays aria-hidden="true" />
          <strong>Agenda</strong>
          <span>{agenda ? `${agenda} para hoy` : "Añadir fecha"}</span>
        </button>
      </div>
      {next && (
        <button
          type="button"
          className="home-next-entry"
          aria-label={`Abrir ${next.title}`}
          onClick={() => open("calendar", next.id)}
        >
          <span className="home-next-icon" aria-hidden="true">
            {next.kind === "reminder" ? <Bell /> : <CalendarDays />}
          </span>
          <span className="min-w-0 flex-1 text-left">
            <span className="home-next-meta">
              {next.kind === "bill"
                ? "Factura"
                : next.kind === "reminder"
                  ? "Recordatorio"
                  : "Evento"}
              {" · "}
              {next.date === today
                ? "Hoy"
                : next.date === tomorrow
                  ? "Mañana"
                  : parseDate(next.date).toLocaleDateString("es", {
                      day: "numeric",
                      month: "short",
                    })}
              {next.time && ` · ${next.time}`}
            </span>
            <strong className="block truncate">{next.title}</strong>
          </span>
          <ChevronRight className="size-4 shrink-0" aria-hidden="true" />
        </button>
      )}
    </section>
  );
}
