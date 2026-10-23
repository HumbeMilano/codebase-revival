import { CalendarDays, Check, FileText, StickyNote, Users } from "lucide-react";
import { Button } from "@/components/ui/button";
import { widgetDimensions, type DashboardWidget, type WidgetId } from "@/lib/dashboard-layout";
import { calendarBills, upcomingCalendarItems } from "@/lib/calendar";
import { monthSummary } from "@/lib/ledger";
import { isChoreArchived } from "@/lib/chore-archive";
import { dateKey, parseDate } from "./planner-data";
import { MEMBERS, type Member } from "./data";
import { Avatar } from "./Kiosk";
import type { HubState } from "./Screens";

const money = (n: number) => n.toLocaleString("en-US", { style: "currency", currency: "USD" });
type Props = {
  widget: DashboardWidget;
  s: HubState;
  now: Date;
  user: Member;
  configure: () => void;
  open: (section: "calendar" | "notes", id: string) => void;
  go: (section: "chores" | "shopping" | "calendar" | "notes" | "finance") => void;
};
export function PersonalWidget({ widget, s, now, configure, open, go }: Props) {
  const mk = dateKey(now).slice(0, 7),
    rows = widgetDimensions[widget.size][1];
  switch (widget.id) {
    case "member-summary": {
      const person = MEMBERS.find((p) => p.id === widget.memberId);
      if (!person)
        return (
          <Button variant="ghost" className="my-auto whitespace-normal" onClick={configure}>
            <Users className="size-4" />
            Elegir miembro
          </Button>
        );
      const summary = monthSummary(s.bills, s.contributions, mk, now, [person.id]).persons.find(
        (p) => p.personId === person.id,
      );
      return (
        <>
          <button className="flex items-center gap-3 text-left" onClick={() => go("finance")}>
            <Avatar m={person} />
            <span className="min-w-0 break-words font-display text-lg font-bold">
              {person.name}
            </span>
          </button>
          <p className="mt-3 text-xs capitalize opacity-70">
            {now.toLocaleDateString("es", { month: "long" })}
          </p>
          <dl className="mt-3 space-y-3 text-sm">
            {[
              ["Asignado", summary?.assigned ?? 0],
              ["Aportado", summary?.contributed ?? 0],
              ["Por aportar", summary?.stillOwes ?? 0],
            ].map(([label, value]) => (
              <div key={label} className="flex flex-wrap justify-between gap-x-2">
                <dt className="opacity-70">{label}</dt>
                <dd className="font-bold tabular-nums">{money(Number(value))}</dd>
              </div>
            ))}
          </dl>
        </>
      );
    }
    case "specific-note": {
      const note = s.notes.find((n) => n.id === widget.noteId);
      if (!note)
        return (
          <Button variant="ghost" className="my-auto whitespace-normal" onClick={configure}>
            <StickyNote className="size-4" />
            Elegir nota
          </Button>
        );
      return (
        <button onClick={() => open("notes", note.id)} className="flex h-full flex-col text-left">
          <StickyNote className="mb-3 size-5 shrink-0" />
          <h3 className="break-words font-display text-lg font-bold">{note.title}</h3>
          <p className="mt-3 whitespace-pre-wrap break-words text-sm leading-relaxed opacity-80">
            {note.body}
          </p>
        </button>
      );
    }
    case "bills": {
      const bills = calendarBills(s.bills, mk, now);
      return (
        <>
          <button
            onClick={() => go("finance")}
            className="mb-4 flex items-center gap-2 text-left font-display text-lg font-bold"
          >
            <FileText className="size-5 shrink-0" />
            Facturas
          </button>
          <ul className="space-y-2">
            {bills.slice(0, rows > 2 ? 8 : 3).map((b) => (
              <li key={b.id}>
                <button
                  className="w-full rounded-xl bg-background/65 p-3 text-left text-sm"
                  onClick={() => open("calendar", b.id)}
                >
                  <span className="flex items-center justify-between gap-2">
                    <span className="min-w-0 break-words font-bold">{b.title}</span>
                    {b.status === "paid" && (
                      <Check className="size-4 shrink-0 text-success-strong" aria-label="Pagada" />
                    )}
                  </span>
                  <span className="mt-1 flex flex-wrap justify-between gap-1 text-xs opacity-75">
                    <span>
                      {parseDate(b.date).toLocaleDateString("es", {
                        day: "numeric",
                        month: "short",
                      })}
                    </span>
                    <span>{money(b.amount)}</span>
                  </span>
                </button>
              </li>
            ))}
          </ul>
          {!bills.length && <p className="my-auto text-sm opacity-70">Sin facturas</p>}
        </>
      );
    }
    case "month-calendar": {
      const start = new Date(now.getFullYear(), now.getMonth(), 1),
        offset = (start.getDay() + 6) % 7;
      const days = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();
      const entries = [...s.events, ...calendarBills(s.bills, mk, now)];
      return (
        <>
          <button
            onClick={() => go("calendar")}
            className="mb-3 flex items-center gap-2 text-left font-display text-base font-bold capitalize"
          >
            <CalendarDays className="size-4 shrink-0" />
            {now.toLocaleDateString("es", { month: "long" })}
          </button>
          <div className="widget-month-grid">
            {["L", "M", "X", "J", "V", "S", "D"].map((d, i) => (
              <span key={i} className="opacity-50">
                {d}
              </span>
            ))}
            {Array.from({ length: offset }, (_, i) => (
              <span key={`blank${i}`} />
            ))}
            {Array.from({ length: days }, (_, i) => {
              const key = dateKey(new Date(now.getFullYear(), now.getMonth(), i + 1));
              return (
                <button
                  type="button"
                  key={key}
                  aria-label={`Abrir calendario ${key}`}
                  aria-current={key === dateKey(now) ? "date" : undefined}
                  onClick={() => open("calendar", `date:${key}`)}
                >
                  <span>{i + 1}</span>
                  {entries.some((e) => e.date === key) && (
                    <i className="size-1 rounded-full bg-current" />
                  )}
                </button>
              );
            })}
          </div>
        </>
      );
    }
    default:
      return null;
  }
}
export function TinyWidget({ widget, s, now, user, configure, open, go }: Props) {
  const pending = s.chores.filter(
    (c) =>
      !c.done && !isChoreArchived(c, now) && (widget.id !== "my-tasks" || c.memberId === user.id),
  ).length;
  const end = new Date(now);
  end.setDate(end.getDate() + 7);
  const entries = upcomingCalendarItems(
    s.events,
    s.bills,
    now,
    1,
    widget.id === "week" ? dateKey(end) : undefined,
  );
  const note =
    widget.id === "specific-note"
      ? s.notes.find((n) => n.id === widget.noteId)
      : (s.notes.find((n) => n.id === widget.noteId) ??
        s.notes.find((n) => n.pinned) ??
        s.notes[0]);
  const info: Record<WidgetId, { title: string; value: string; action: () => void }> = {
    tasks: { title: "Tareas", value: String(pending), action: () => go("chores") },
    "my-tasks": { title: "Mis tareas", value: String(pending), action: () => go("chores") },
    shopping: {
      title: "Compras",
      value: String(s.items.filter((i) => !i.done).length),
      action: () => go("shopping"),
    },
    calendar: {
      title: "Agenda",
      value: entries[0]?.title ?? "Sin eventos",
      action: () => go("calendar"),
    },
    week: {
      title: "Esta semana",
      value: entries[0]?.title ?? "Sin eventos",
      action: () => go("calendar"),
    },
    notes: { title: "Notas", value: note?.title ?? "Sin notas", action: () => go("notes") },
    "pinned-note": {
      title: "Nota fijada",
      value: note?.title ?? "Sin notas",
      action: () => go("notes"),
    },
    "specific-note": {
      title: note?.title ?? "Elegir nota",
      value: widget.noteId ? (note?.body ?? "Nota no disponible") : "",
      action: () => (note ? open("notes", note.id) : configure()),
    },
    family: { title: "Familia", value: String(MEMBERS.length), action: () => go("chores") },
    finance: {
      title: "Fondo común",
      value: money(
        monthSummary(
          s.bills,
          s.contributions,
          dateKey(now).slice(0, 7),
          now,
          MEMBERS.map((p) => p.id),
        ).contributed,
      ),
      action: () => go("finance"),
    },
    bills: {
      title: "Facturas",
      value: String(
        calendarBills(s.bills, dateKey(now).slice(0, 7), now).filter((b) => b.status === "pending")
          .length,
      ),
      action: () => go("finance"),
    },
    "member-summary": {
      title: MEMBERS.find((p) => p.id === widget.memberId)?.name ?? "Elegir miembro",
      value: widget.memberId
        ? money(
            s.contributions
              .filter((c) => c.personId === widget.memberId && c.month === dateKey(now).slice(0, 7))
              .reduce((a, c) => a + c.amount, 0),
          )
        : "",
      action: configure,
    },
    "month-calendar": {
      title: now.toLocaleDateString("es", { month: "long" }),
      value: String(now.getDate()),
      action: () => go("calendar"),
    },
    clock: {
      title: now.toLocaleDateString("es", { weekday: "short", day: "numeric" }),
      value: now.toLocaleTimeString("es", { hour: "2-digit", minute: "2-digit" }),
      action: () => go("calendar"),
    },
    progress: { title: "Pendientes", value: String(pending), action: () => go("chores") },
    "quick-add": { title: "Crear", value: "+", action: () => go("notes") },
  };
  const entry = info[widget.id];
  return (
    <button
      type="button"
      onClick={entry.action}
      className="flex h-full min-h-0 flex-col justify-center gap-2 text-left"
    >
      <span className="line-clamp-2 break-words text-xs font-bold opacity-75">{entry.title}</span>
      <span className="line-clamp-2 break-words font-display text-xl font-bold tabular-nums">
        {entry.value}
      </span>
    </button>
  );
}
