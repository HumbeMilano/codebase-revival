import { useState, type ReactNode } from "react";
import {
  CalendarDays,
  Check,
  CheckSquare,
  ChevronLeft,
  ChevronRight,
  ShoppingBasket,
  StickyNote,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { widgetDimensions, type DashboardWidget } from "@/lib/dashboard-layout";
import {
  dashboardChores,
  dashboardHousehold,
  dashboardList,
  dashboardListItems,
  dashboardLists,
  dashboardNextBill,
  fundingPercent,
} from "@/lib/dashboard-data";
import { calendarBills, upcomingCalendarItems } from "@/lib/calendar";
import { monthSummary } from "@/lib/ledger";
import { cn } from "@/lib/utils";
import { shoppingListId } from "@/lib/offline-shopping";
import { dateKey, eventWhen, parseDate } from "./planner-data";
import type { FamilyNote } from "./planner-data";
import { MEMBERS, type Member } from "./data";
import { Avatar } from "./Kiosk";
import { describeWidget } from "./widget-catalogue";
import type { HubState } from "./Screens";

type Section = "chores" | "shopping" | "calendar" | "notes" | "finance";
type Props = {
  widget: DashboardWidget;
  s: HubState;
  now: Date;
  user: Member;
  configure: () => void;
  onCreate: (section: Section) => void;
  onBrowseShopping: (listId?: string) => void;
  onBrowse: () => void;
  onOpenDay: (date: string) => void;
  onBrowseNotes: () => void;
  onOpenNote: (id: string) => void;
};
const money = (amount: number) =>
  amount.toLocaleString("en-US", { style: "currency", currency: "USD" });
const percentage = (done: number, total: number) => (total ? (done / total) * 100 : 0);

function Header({ widget, onBrowse }: Pick<Props, "widget" | "onBrowse">) {
  const { title, Icon } = describeWidget(widget.id);
  return (
    <header className="dw-header">
      <Icon aria-hidden="true" />
      <h3>
        {widget.id === "quick-add" ? (
          title
        ) : (
          <button
            type="button"
            className="dw-header-link"
            aria-label={
              widget.id === "notes" ? "Ver todas las notas" : `Ver ${title.toLocaleLowerCase("es")}`
            }
            onClick={onBrowse}
          >
            <span>{title}</span>
            <ChevronRight aria-hidden="true" className="dw-open-arrow" />
          </button>
        )}
      </h3>
    </header>
  );
}
function OpenNote({
  note,
  onOpen,
  compact = false,
  preview = false,
}: {
  note: FamilyNote;
  onOpen: Props["onOpenNote"];
  compact?: boolean;
  preview?: boolean;
}) {
  return (
    <button
      type="button"
      className={cn("dw-note-open", preview && "dw-list-card")}
      aria-label={`Abrir nota ${note.title}`}
      onClick={() => onOpen(note.id)}
    >
      {compact ? (
        note.title
      ) : (
        <>
          <strong className="dw-note-title">{note.title}</strong>
          <span className="dw-note-body">{note.body}</span>
        </>
      )}
    </button>
  );
}
function Empty({ children }: { children: ReactNode }) {
  return <p className="dw-empty">{children}</p>;
}
function Choose({ label, onClick }: { label: string; onClick: () => void }) {
  return (
    <Button
      type="button"
      variant="ghost"
      className="my-auto whitespace-normal text-current"
      onClick={onClick}
    >
      {label}
    </Button>
  );
}
export function WidgetProgress({
  value,
  label,
  text,
}: {
  value: number;
  label: string;
  text?: string;
}) {
  const safe = Math.max(0, Math.min(100, value));
  return (
    <div
      className="dw-progress"
      role="progressbar"
      aria-label={label}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={Math.round(safe)}
      aria-valuetext={text}
    >
      <i style={{ width: `${safe}%` }} />
    </div>
  );
}
function CheckMark({ done }: { done: boolean }) {
  return (
    <span className={cn("dw-check", done && "dw-done")} aria-hidden="true">
      {done && <Check />}
    </span>
  );
}
function Stats({ rows }: { rows: [string, number][] }) {
  return (
    <dl className="dw-stats">
      {rows.map(([label, value]) => (
        <div key={label}>
          <dt>{label}</dt>
          <dd>{money(value)}</dd>
        </div>
      ))}
    </dl>
  );
}

function MonthCalendar({ s, now, onOpenDay }: Pick<Props, "s" | "now" | "onOpenDay">) {
  const [offset, setOffset] = useState(0);
  const [selected, setSelected] = useState(dateKey(now));
  const month = new Date(now.getFullYear(), now.getMonth() + offset, 1);
  const start = new Date(month);
  start.setDate(1 - ((month.getDay() + 6) % 7));
  const entries = [...s.events, ...calendarBills(s.bills, dateKey(month).slice(0, 7), now)];
  return (
    <div className="dw-calendar">
      <div className="dw-month-heading">
        <button
          type="button"
          aria-label="Mes anterior del widget"
          onClick={() => setOffset((n) => n - 1)}
        >
          <ChevronLeft />
        </button>
        <strong>{month.toLocaleDateString("es", { month: "long", year: "numeric" })}</strong>
        <button
          type="button"
          aria-label="Mes siguiente del widget"
          onClick={() => setOffset((n) => n + 1)}
        >
          <ChevronRight />
        </button>
      </div>
      <div className="dw-weekdays" aria-hidden="true">
        {["L", "M", "X", "J", "V", "S", "D"].map((day, index) => (
          <span key={index}>{day}</span>
        ))}
      </div>
      <div className="dw-month-grid">
        {Array.from({ length: 42 }, (_, i) => {
          const date = new Date(start);
          date.setDate(date.getDate() + i);
          const key = dateKey(date);
          const kinds = new Set(
            entries.filter((e) => e.date === key).map((e) => e.kind ?? "event"),
          );
          return (
            <button
              type="button"
              key={key}
              aria-label={date.toLocaleDateString("es", {
                day: "numeric",
                month: "long",
                year: "numeric",
              })}
              aria-current={key === dateKey(now) ? "date" : undefined}
              aria-pressed={key === selected}
              onClick={() => {
                setSelected(key);
                onOpenDay(key);
              }}
              className={cn("dw-day", date.getMonth() !== month.getMonth() && "dw-outside")}
            >
              <span>{date.getDate()}</span>
              <i className="dw-day-dots" aria-hidden="true">
                {[...kinds].map((kind) => (
                  <b key={kind} className={`dw-dot-${kind}`} />
                ))}
              </i>
            </button>
          );
        })}
      </div>
    </div>
  );
}

function TinyWidget({
  widget,
  s,
  now,
  user,
  onCreate,
  onBrowseNotes,
  onOpenNote,
  onBrowse,
}: Props) {
  const chores = dashboardChores(s, now).filter(
    (c) => widget.id !== "my-tasks" || c.memberId === user.id,
  );
  const list = dashboardList(s, widget);
  const note =
    widget.id === "specific-note"
      ? s.notes.find((n) => n.id === widget.noteId)
      : s.notes.find((n) => n.pinned);
  const person = MEMBERS.find((p) => p.id === widget.memberId);
  const summary = monthSummary(
    s.bills,
    s.contributions,
    dateKey(now).slice(0, 7),
    now,
    MEMBERS.map((p) => p.id),
  );
  const individual = summary.persons.find((p) => p.personId === person?.id);
  const end = new Date(now);
  end.setDate(end.getDate() + 7);
  const events = upcomingCalendarItems(
    s.events,
    s.bills,
    now,
    1,
    widget.id === "week" ? dateKey(end) : undefined,
  );
  const next = dashboardNextBill(s, now);
  let title: string = describeWidget(widget.id).title;
  let value: ReactNode;
  let isMoney = false;
  switch (widget.id) {
    case "clock":
      title = now.toLocaleDateString("es", { weekday: "short", day: "numeric" });
      value = now.toLocaleTimeString("es", { hour: "2-digit", minute: "2-digit" });
      break;
    case "tasks":
    case "my-tasks":
      value = chores.filter((c) => !c.done).length;
      break;
    case "shopping":
      title = list?.name ?? title;
      value = list ? dashboardListItems(s, list.id).filter((i) => !i.done).length : "—";
      break;
    case "shopping-summary":
      value = dashboardLists(s).length;
      break;
    case "month-calendar":
      title = now.toLocaleDateString("es", { month: "long" });
      value = now.getDate();
      break;
    case "calendar":
    case "week":
      value = events[0]?.title ?? "Sin eventos";
      break;
    case "reminders":
      value = s.events.filter((e) => e.kind === "reminder" && !e.completed).length;
      break;
    case "notes":
      value = (
        <button
          type="button"
          className="dw-note-open"
          aria-label="Ver todas las notas"
          onClick={onBrowseNotes}
        >
          {s.notes.length}
        </button>
      );
      break;
    case "specific-note":
    case "pinned-note":
      value = note ? (
        <OpenNote note={note} onOpen={onOpenNote} compact />
      ) : (
        <button type="button" className="dw-note-open" onClick={onBrowseNotes}>
          Sin nota fijada
        </button>
      );
      break;
    case "family":
      value = MEMBERS.length;
      break;
    case "finance":
      value = money(summary.contributed - summary.paid);
      isMoney = true;
      break;
    case "bills":
      value = summary.pendingCount;
      break;
    case "next-bill":
      title = next?.title ?? title;
      value = next ? money(next.amount) : "—";
      isMoney = !!next;
      break;
    case "member-summary":
      title = person?.name ?? title;
      value = money(individual?.contributed ?? 0);
      isMoney = true;
      break;
    case "member-tasks":
      title = person?.name ?? title;
      value = chores.filter((c) => c.memberId === person?.id && !c.done).length;
      break;
    case "progress":
      value = `${Math.round(percentage(chores.filter((c) => c.done).length, chores.length))}%`;
      break;
    case "quick-add":
      value = (
        <button
          type="button"
          className="dw-quick-tiny"
          aria-label="Crear tarea"
          onClick={() => onCreate("chores")}
        >
          +
        </button>
      );
      break;
  }
  return (
    <div className="dw-tiny">
      <h3>
        {["notes", "specific-note", "pinned-note", "quick-add"].includes(widget.id) ? (
          title
        ) : (
          <button
            type="button"
            className="dw-header-link"
            onClick={onBrowse}
            aria-label={`Ver ${describeWidget(widget.id).title.toLocaleLowerCase("es")}`}
          >
            <span>{title}</span>
            <ChevronRight aria-hidden="true" className="dw-open-arrow" />
          </button>
        )}
      </h3>
      <div className={cn("dw-tiny-value", isMoney && "dw-money")}>{value}</div>
      {widget.id === "member-summary" && individual && (
        <WidgetProgress
          value={fundingPercent(individual.assigned, individual.contributed)}
          label={`Aporte de ${person?.name}`}
          text={`${money(individual.contributed)} de ${money(individual.assigned)}`}
        />
      )}
    </div>
  );
}

export function DashboardWidgetContent(props: Props) {
  const {
    widget,
    s,
    now,
    user,
    configure,
    onCreate,
    onBrowseShopping,
    onBrowseNotes,
    onOpenNote,
    onBrowse,
    onOpenDay,
  } = props;
  const list = dashboardList(s, widget);
  const note =
    widget.id === "specific-note"
      ? s.notes.find((n) => n.id === widget.noteId)
      : s.notes.find((n) => n.pinned);
  const person = MEMBERS.find((p) => p.id === widget.memberId);
  if (widget.id === "shopping" && !list)
    return (
      <>
        <Header widget={widget} onBrowse={onBrowse} />
        <Choose label="Elegir lista" onClick={configure} />
      </>
    );
  if (widget.id === "specific-note" && !note)
    return (
      <>
        <Header widget={widget} onBrowse={onBrowse} />
        {s.notes.length ? (
          <Choose label="Elegir nota" onClick={configure} />
        ) : (
          <Choose label="Crear nota" onClick={() => onCreate("notes")} />
        )}
      </>
    );
  if (["member-summary", "member-tasks"].includes(widget.id) && !person)
    return (
      <>
        <Header widget={widget} onBrowse={onBrowse} />
        <Choose label="Elegir miembro" onClick={configure} />
      </>
    );
  if (widgetDimensions[widget.size][1] === 1) return <TinyWidget {...props} />;
  const chores = dashboardChores(s, now).filter((c) =>
    widget.id === "my-tasks"
      ? c.memberId === user.id
      : widget.id === "member-tasks"
        ? c.memberId === person?.id
        : true,
  );
  const month = dateKey(now).slice(0, 7);
  const summary = monthSummary(
    s.bills,
    s.contributions,
    month,
    now,
    MEMBERS.map((p) => p.id),
  );
  let content: ReactNode;
  switch (widget.id) {
    case "month-calendar":
      content = <MonthCalendar s={s} now={now} onOpenDay={onOpenDay} />;
      break;
    case "clock":
      content = (
        <div className="dw-clock">
          <time dateTime={now.toISOString()}>
            {now.toLocaleTimeString("es", { hour: "2-digit", minute: "2-digit" })}
          </time>
          <strong>{now.toLocaleDateString("es", { weekday: "long" })}</strong>
          <span>{now.toLocaleDateString("es", { day: "numeric", month: "long" })}</span>
        </div>
      );
      break;
    case "tasks":
    case "my-tasks":
    case "member-tasks": {
      const done = chores.filter((c) => c.done).length;
      content = (
        <>
          {widget.id === "member-tasks" && person && (
            <div className="dw-person">
              <Avatar m={person} size="sm" />
              <strong>{person.name}</strong>
            </div>
          )}
          <div className="dw-stat-line">
            <strong className="dw-stat">{chores.length - done}</strong>
            <span>pendientes</span>
          </div>
          <div className="dw-rows">
            {[...chores]
              .sort((a, b) => Number(a.done) - Number(b.done))
              .map((chore) => (
                <div className="dw-row" key={chore.id}>
                  <CheckMark done={chore.done} />
                  <div className={cn("dw-row-text", chore.done && "dw-completed")}>
                    {chore.title}
                    {widget.id === "tasks" && (
                      <span>{MEMBERS.find((p) => p.id === chore.memberId)?.name}</span>
                    )}
                  </div>
                </div>
              ))}
          </div>
          {widget.id === "member-tasks" && (
            <WidgetProgress
              label={`Tareas de ${person?.name}`}
              value={percentage(done, chores.length)}
            />
          )}
        </>
      );
      break;
    }
    case "shopping": {
      const items = dashboardListItems(s, list!.id);
      const done = items.filter((i) => i.done).length;
      const issue =
        s.shoppingSync?.error ||
        (s.shoppingSync?.conflict ? "La lista cambió en otro dispositivo." : "");
      content = (
        <>
          <h4 className="dw-note-title">{list!.name}</h4>
          {issue && (
            <div role="alert" className="dw-shopping-error">
              <p>{issue}</p>
              <button
                type="button"
                className="underline"
                onClick={() => onBrowseShopping(list!.id)}
              >
                Revisar compras
              </button>
            </div>
          )}
          <div className="dw-rows dw-shopping-items">
            {items.map((item) => (
              <button
                type="button"
                role="checkbox"
                aria-label={item.name}
                aria-checked={item.done}
                className="dw-row dw-shopping-toggle"
                key={item.id}
                onClick={() =>
                  void s.setItems((rows) =>
                    rows.map((row) =>
                      row.id === item.id && shoppingListId(row, dashboardHousehold(s)) === list!.id
                        ? { ...row, done: !row.done }
                        : row,
                    ),
                  )
                }
              >
                <CheckMark done={item.done} />
                <span className={cn("dw-row-text", item.done && "dw-completed")}>{item.name}</span>
              </button>
            ))}
          </div>
          {items.length ? (
            <WidgetProgress
              value={percentage(done, items.length)}
              label={`Productos de ${list!.name}`}
              text={`${done} de ${items.length} comprados`}
            />
          ) : (
            <Empty>Sin productos</Empty>
          )}
        </>
      );
      break;
    }
    case "shopping-summary":
      content = (
        <div className="dw-rows">
          {dashboardLists(s).map((row) => (
            <button
              type="button"
              className="dw-list-card dw-row-action"
              key={row.id}
              onClick={() => onBrowseShopping(row.id)}
            >
              <strong>{row.name}</strong>
              <span>{dashboardListItems(s, row.id).filter((i) => !i.done).length} pendientes</span>
            </button>
          ))}
        </div>
      );
      break;
    case "specific-note":
    case "pinned-note":
      content = note ? (
        <OpenNote note={note} onOpen={onOpenNote} />
      ) : (
        <>
          <Empty>Sin nota fijada</Empty>
          <Choose
            label={s.notes.length ? "Ver notas" : "Crear nota"}
            onClick={() => (s.notes.length ? onBrowseNotes() : onCreate("notes"))}
          />
        </>
      );
      break;
    case "notes":
      content = s.notes.length ? (
        <div className="dw-rows">
          {[...s.notes]
            .sort((a, b) => Number(b.pinned) - Number(a.pinned))
            .map((note) => (
              <OpenNote key={note.id} note={note} onOpen={onOpenNote} preview />
            ))}
        </div>
      ) : (
        <Choose label="Crear nota" onClick={() => onCreate("notes")} />
      );
      break;
    case "member-summary": {
      const value = summary.persons.find((p) => p.personId === person!.id)!;
      const narrow =
        widgetDimensions[widget.size][0] === 1 && widgetDimensions[widget.size][1] === 2;
      content = (
        <>
          <div className="dw-person">
            <Avatar m={person!} size="sm" />
            <strong>{person!.name}</strong>
          </div>
          {!narrow && (
            <p className="dw-month-name">{now.toLocaleDateString("es", { month: "long" })}</p>
          )}
          {narrow ? (
            <>
              <strong className="dw-stat dw-money">{money(value.contributed)}</strong>
              <span className="dw-subtitle">de {money(value.assigned)} asignados</span>
            </>
          ) : (
            <Stats
              rows={[
                ["Asignado", value.assigned],
                ["Aportado", value.contributed],
                ["Por aportar", value.stillOwes],
              ]}
            />
          )}
          <div className="dw-funded">
            <span>{Math.round(fundingPercent(value.assigned, value.contributed))}%</span>
            <WidgetProgress
              value={fundingPercent(value.assigned, value.contributed)}
              label={`Aporte de ${person!.name}`}
              text={`${money(value.contributed)} de ${money(value.assigned)} asignados`}
            />
          </div>
        </>
      );
      break;
    }
    case "family":
      content = (
        <div className="dw-family">
          {MEMBERS.map((p) => {
            const assigned = chores.filter((c) => c.memberId === p.id),
              done = assigned.filter((c) => c.done).length;
            return (
              <div key={p.id}>
                <Avatar m={p} />
                <strong>{p.name}</strong>
                <span>
                  {done}/{assigned.length} tareas
                </span>
                <WidgetProgress
                  value={percentage(done, assigned.length)}
                  label={`Tareas de ${p.name}`}
                />
              </div>
            );
          })}
        </div>
      );
      break;
    case "calendar":
    case "week":
    case "reminders": {
      const end = new Date(now);
      end.setDate(end.getDate() + 7);
      const entries = upcomingCalendarItems(
        widget.id === "reminders" ? s.events.filter((e) => e.kind === "reminder") : s.events,
        widget.id === "reminders" ? [] : s.bills,
        now,
        10,
        widget.id === "week" ? dateKey(end) : undefined,
      );
      content = entries.length ? (
        <div className="dw-rows">
          {entries.map((entry) => (
            <button
              type="button"
              className="dw-row dw-agenda-row dw-row-action"
              key={entry.id}
              onClick={() => onOpenDay(entry.date)}
            >
              <span className="dw-date-chip">
                <strong>{parseDate(entry.date).getDate()}</strong>
                <span>{parseDate(entry.date).toLocaleDateString("es", { month: "short" })}</span>
              </span>
              <span className="dw-row-text">
                <strong>{entry.title}</strong>
                <span>
                  {eventWhen(entry)}
                  {entry.kind === "bill" ? ` · ${money(entry.amount)}` : ""}
                </span>
              </span>
            </button>
          ))}
        </div>
      ) : (
        <Empty>{widget.id === "reminders" ? "Sin recordatorios" : "Sin próximos eventos"}</Empty>
      );
      break;
    }
    case "bills": {
      const bills = calendarBills(s.bills, month, now);
      content = bills.length ? (
        <div className="dw-rows">
          {bills.map((bill) => (
            <div className="dw-row" key={bill.id}>
              <span className={cn("dw-status-dot", bill.status === "paid" && "dw-paid")} />
              <div className="dw-row-text">
                <strong>{bill.title}</strong>
                <span>{bill.status === "paid" ? "Pagada" : eventWhen(bill)}</span>
              </div>
              <strong className="dw-bill-amount">{money(bill.amount)}</strong>
            </div>
          ))}
        </div>
      ) : (
        <Empty>Sin facturas</Empty>
      );
      break;
    }
    case "next-bill": {
      const next = dashboardNextBill(s, now);
      content = next ? (
        <>
          <h4 className="dw-note-title">{next.title}</h4>
          <strong className="dw-stat dw-money">{money(next.amount)}</strong>
          <p className="dw-subtitle">
            {parseDate(next.date).toLocaleDateString("es", { day: "numeric", month: "long" })}
          </p>
          {next.date < dateKey(now) && <span className="dw-overdue">Vencida</span>}
        </>
      ) : (
        <Empty>Sin próximos vencimientos</Empty>
      );
      break;
    }
    case "finance":
      content = (
        <>
          <span className="dw-subtitle">Disponible</span>
          <strong className="dw-stat dw-money">{money(summary.contributed - summary.paid)}</strong>
          <Stats
            rows={[
              ["Aportado", summary.contributed],
              ["Pagado", summary.paid],
            ]}
          />
        </>
      );
      break;
    case "progress": {
      const done = chores.filter((c) => c.done).length,
        percent = Math.round(percentage(done, chores.length));
      content = (
        <div className="dw-ring-wrap">
          <div className="dw-ring">
            <svg viewBox="0 0 100 100" aria-hidden="true">
              <circle cx="50" cy="50" r="43" className="dw-ring-track" />
              <circle
                cx="50"
                cy="50"
                r="43"
                strokeDasharray={`${percent * 2.7} 270`}
                className="dw-ring-value"
              />
            </svg>
            <strong>{percent}%</strong>
          </div>
          <span className="dw-subtitle">
            {done} de {chores.length} tareas
          </span>
        </div>
      );
      break;
    }
    case "quick-add":
      content = (
        <div className="dw-quick-grid">
          {(
            [
              ["chores", "Tarea", CheckSquare],
              ["shopping", "Producto", ShoppingBasket],
              ["calendar", "Evento", CalendarDays],
              ["notes", "Nota", StickyNote],
            ] as const
          ).map(([section, label, Icon]) => (
            <button type="button" key={section} onClick={() => onCreate(section)}>
              <Icon />
              <span>{label}</span>
            </button>
          ))}
        </div>
      );
      break;
  }
  return (
    <>
      <Header widget={widget} onBrowse={onBrowse} />
      <div className="dw-body">{content}</div>
    </>
  );
}
