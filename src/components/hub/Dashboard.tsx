import { useState } from "react";
import {
  ArrowDown,
  ArrowUp,
  ArrowUpRight,
  CalendarDays,
  Check,
  CheckCheck,
  CheckSquare,
  LayoutGrid,
  Maximize2,
  Minimize2,
  Pin,
  Plus,
  RotateCcw,
  ShoppingBasket,
  SlidersHorizontal,
  StickyNote,
  Users,
  Wallet,
  X,
} from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { useDashboardLayout } from "@/hooks/use-dashboard-layout";
import { useToday } from "@/hooks/use-today";
import { isChoreArchived } from "@/lib/chore-archive";
import {
  defaultDashboardLayout,
  moveDashboardWidget,
  WIDGET_IDS,
  type DashboardLayout,
  type DashboardScope,
  type DashboardSnapshot,
  type DashboardWidget,
  type WidgetId,
} from "@/lib/dashboard-layout";
import { db } from "@/lib/db";
import { canViewFinances } from "@/lib/finance-visibility";
import { monthKey, monthSummary } from "@/lib/ledger";
import { cn } from "@/lib/utils";
import { MEMBERS, type Member } from "./data";
import { Avatar } from "./Kiosk";
import { dateKey, eventWhen, parseDate, upcomingEvents } from "./planner-data";
import { Ring, type HubState } from "./Screens";

type Section = "chores" | "shopping" | "calendar" | "notes" | "finance";
const widgets = {
  tasks: { title: "Tareas de hoy", Icon: CheckSquare, tone: "bg-success text-success-foreground" },
  shopping: {
    title: "Lista de compras",
    Icon: ShoppingBasket,
    tone: "bg-accent text-accent-foreground",
  },
  calendar: {
    title: "Próximos eventos",
    Icon: CalendarDays,
    tone: "bg-lilac text-foreground",
  },
  notes: { title: "Notas", Icon: StickyNote, tone: "bg-card text-card-foreground" },
  family: { title: "La familia hoy", Icon: Users, tone: "bg-sky text-foreground" },
  finance: { title: "Fondo común", Icon: Wallet, tone: "bg-primary text-primary-foreground" },
} as const;
const member = (id: string) => MEMBERS.find((person) => person.id === id);
const money = (amount: number) =>
  amount.toLocaleString("en-US", { style: "currency", currency: "USD" });

function WidgetHeader({ id, onOpen }: { id: WidgetId; onOpen: () => void }) {
  const { title, Icon } = widgets[id];
  return (
    <header className="mb-4 flex items-center justify-between gap-3">
      <h3 className="flex min-w-0 items-center gap-2 font-display text-lg font-bold">
        <Icon className="size-5 shrink-0" aria-hidden="true" /> {title}
      </h3>
      <Button
        variant="ghost"
        size="icon"
        className="size-10 shrink-0 rounded-full text-current hover:bg-foreground/10 hover:text-current"
        aria-label={`Abrir ${title.toLocaleLowerCase("es")}`}
        onClick={onOpen}
      >
        <ArrowUpRight className="size-5" />
      </Button>
    </header>
  );
}

function WidgetAction({ children, onClick }: { children: React.ReactNode; onClick: () => void }) {
  return (
    <Button
      variant="ghost"
      onClick={onClick}
      className="mt-4 h-11 w-full justify-start rounded-xl border border-current/15 text-current hover:bg-foreground/10 hover:text-current"
    >
      <Plus className="size-4" /> {children}
    </Button>
  );
}

function WidgetContent({
  widget,
  s,
  now,
  go,
  onCreate,
  onOpenRecord,
}: {
  widget: DashboardWidget;
  s: HubState;
  now: Date;
  go: (section: Section) => void;
  onCreate: (section: Section) => void;
  onOpenRecord: (section: "calendar" | "notes", id: string) => void;
}) {
  const today = dateKey(now);
  const chores = s.chores.filter(
    (chore) =>
      !isChoreArchived(chore, now) &&
      (chore.dueDate === today || (!chore.done && !!chore.dueDate && chore.dueDate < today)),
  );
  const count = widget.size === "wide" ? 6 : 4;
  switch (widget.id) {
    case "tasks": {
      const pending = chores.filter((chore) => !chore.done).length;
      const ordered = [...chores].sort(
        (a, b) =>
          Number(a.done) - Number(b.done) || (a.dueDate ?? "").localeCompare(b.dueDate ?? ""),
      );
      return (
        <>
          <WidgetHeader id="tasks" onOpen={() => go("chores")} />
          <div className="mb-4 flex items-end gap-3">
            <span className="font-display text-5xl font-extrabold tabular-nums">{pending}</span>
            <span className="pb-1 text-sm opacity-70">
              {pending === 1 ? "pendiente" : "pendientes"}
            </span>
          </div>
          {ordered.length ? (
            <ul className="space-y-1">
              {ordered.slice(0, count).map((chore) => (
                <li key={chore.id}>
                  <button
                    type="button"
                    aria-label={chore.title}
                    aria-pressed={chore.done}
                    onClick={() =>
                      void s.setChores((rows) =>
                        rows.map((row) =>
                          row.id === chore.id ? { ...row, done: !row.done } : row,
                        ),
                      )
                    }
                    className="flex min-h-12 w-full items-center gap-3 rounded-xl px-2 py-2 text-left transition hover:bg-foreground/5 focus-visible:outline-2 focus-visible:outline-offset-2"
                  >
                    <span
                      className={cn(
                        "grid size-6 shrink-0 place-items-center rounded-full border border-current/30",
                        chore.done && "bg-foreground text-background",
                      )}
                    >
                      {chore.done ? <Check className="size-4" /> : null}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span
                        className={cn(
                          "block break-words text-sm font-semibold",
                          chore.done && "line-through opacity-60",
                        )}
                      >
                        {chore.title}
                      </span>
                      <span className="block text-xs opacity-65">
                        {member(chore.memberId)?.name ?? "Sin miembro"}
                        {chore.dueDate && chore.dueDate < today ? " · Atrasada" : ""}
                      </span>
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          ) : (
            <p className="flex items-center gap-2 py-4 text-sm opacity-75">
              <CheckCheck className="size-5" /> Todo al día
            </p>
          )}
          {chores.length > count ? (
            <Button variant="link" className="px-0 text-current" onClick={() => go("chores")}>
              Ver todas las tareas
            </Button>
          ) : null}
          <WidgetAction onClick={() => onCreate("chores")}>Crear tarea</WidgetAction>
        </>
      );
    }
    case "shopping": {
      const pending = s.items.filter((item) => !item.done);
      return (
        <>
          <WidgetHeader id="shopping" onOpen={() => go("shopping")} />
          <div className="mb-4 flex items-end gap-3">
            <span className="font-display text-5xl font-extrabold tabular-nums">
              {pending.length}
            </span>
            <span className="pb-1 text-sm opacity-70">por comprar</span>
          </div>
          {pending.length ? (
            <ul className="space-y-1">
              {pending.slice(0, count).map((item) => (
                <li key={item.id}>
                  <button
                    type="button"
                    aria-label={`Marcar ${item.name} como comprado`}
                    onClick={() =>
                      void s.setItems((rows) =>
                        rows.map((row) => (row.id === item.id ? { ...row, done: true } : row)),
                      )
                    }
                    className="flex min-h-12 w-full items-center gap-3 rounded-xl px-2 py-2 text-left text-sm font-semibold transition hover:bg-foreground/5 focus-visible:outline-2 focus-visible:outline-offset-2"
                  >
                    <span
                      className="size-5 shrink-0 rounded-md border border-current/35"
                      aria-hidden="true"
                    />
                    <span className="min-w-0 break-words">{item.name}</span>
                  </button>
                </li>
              ))}
            </ul>
          ) : (
            <p className="py-4 text-sm opacity-75">
              {s.items.length ? "La compra está lista" : "Tu próxima compra empieza aquí"}
            </p>
          )}
          {pending.length > count ? (
            <Button variant="link" className="px-0 text-current" onClick={() => go("shopping")}>
              Ver lista completa
            </Button>
          ) : null}
          <WidgetAction onClick={() => onCreate("shopping")}>Añadir producto</WidgetAction>
        </>
      );
    }
    case "calendar": {
      const events = upcomingEvents(s.events, now, count);
      return (
        <>
          <WidgetHeader id="calendar" onOpen={() => go("calendar")} />
          {events.length ? (
            <ul className="space-y-2">
              {events.map((event) => (
                <li key={event.id}>
                  <button
                    type="button"
                    onClick={() => onOpenRecord("calendar", event.id)}
                    className="flex min-h-16 w-full items-center gap-3 rounded-2xl bg-background/50 p-3 text-left transition hover:bg-background/80 focus-visible:outline-2 focus-visible:outline-offset-2"
                  >
                    <span className="flex size-11 shrink-0 flex-col items-center justify-center rounded-xl bg-background text-xs">
                      <span className="text-lg font-bold leading-none">
                        {parseDate(event.date).getDate()}
                      </span>
                      {parseDate(event.date).toLocaleDateString("es", { month: "short" })}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block break-words text-sm font-semibold">{event.title}</span>
                      <span className="block text-xs opacity-65">{eventWhen(event)}</span>
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          ) : (
            <p className="py-7 text-sm opacity-75">Sin próximos eventos</p>
          )}
          <WidgetAction onClick={() => onCreate("calendar")}>Añadir evento</WidgetAction>
        </>
      );
    }
    case "notes": {
      const notes = [...s.notes]
        .sort((a, b) => Number(b.pinned) - Number(a.pinned))
        .slice(0, widget.size === "wide" ? 4 : 2);
      return (
        <>
          <WidgetHeader id="notes" onOpen={() => go("notes")} />
          {notes.length ? (
            <ul className={cn("grid gap-3", widget.size === "wide" && "sm:grid-cols-2")}>
              {notes.map((note) => (
                <li key={note.id}>
                  <button
                    type="button"
                    onClick={() => onOpenRecord("notes", note.id)}
                    className="h-full w-full space-y-1 rounded-2xl bg-accent/50 p-4 text-left transition hover:bg-accent/80 focus-visible:outline-2 focus-visible:outline-offset-2"
                  >
                    <span className="flex items-start gap-2 text-sm font-bold">
                      <span className="min-w-0 flex-1 break-words">{note.title}</span>
                      {note.pinned ? <Pin className="size-4 shrink-0" aria-label="Fijada" /> : null}
                    </span>
                    <span className="line-clamp-2 whitespace-pre-line break-words text-sm text-muted-foreground">
                      {note.body}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          ) : (
            <p className="py-7 text-sm text-muted-foreground">
              Un lugar para lo que no quieres olvidar
            </p>
          )}
          <WidgetAction onClick={() => onCreate("notes")}>Escribir nota</WidgetAction>
        </>
      );
    }
    case "family":
      return (
        <>
          <WidgetHeader id="family" onOpen={() => go("chores")} />
          <div
            className={cn(
              "grid grid-cols-3 gap-x-2 gap-y-4 py-2",
              widget.size === "wide" && "sm:grid-cols-5",
            )}
          >
            {MEMBERS.map((person) => {
              const assigned = chores.filter((chore) => chore.memberId === person.id);
              const done = assigned.filter((chore) => chore.done).length;
              return (
                <button
                  type="button"
                  key={person.id}
                  onClick={() => go("chores")}
                  className="flex min-w-0 flex-col items-center gap-2 rounded-2xl px-1 py-2 hover:bg-foreground/5 focus-visible:outline-2 focus-visible:outline-offset-2"
                  aria-label={`Tareas de ${person.name}: ${done} de ${assigned.length}`}
                >
                  <Ring pct={assigned.length ? done / assigned.length : 1} size={58} stroke={3}>
                    <Avatar m={person} />
                  </Ring>
                  <span className="max-w-full truncate text-xs font-bold">{person.name}</span>
                  <span className="text-xs opacity-65">
                    {assigned.length ? `${done}/${assigned.length}` : "Al día"}
                  </span>
                </button>
              );
            })}
          </div>
        </>
      );
    case "finance": {
      const summary = monthSummary(
        s.bills,
        s.contributions,
        monthKey(now.getFullYear(), now.getMonth()),
        now,
        MEMBERS.map((person) => person.id),
      );
      return (
        <>
          <WidgetHeader id="finance" onOpen={() => go("finance")} />
          <p className="text-xs font-semibold opacity-70 first-letter:uppercase">
            {now.toLocaleDateString("es", { month: "long", year: "numeric" })}
          </p>
          <p className="mt-2 break-words font-display text-3xl font-extrabold tabular-nums">
            {money(summary.contributed - summary.paid)}
          </p>
          <p className="mt-1 text-xs opacity-70">Saldo después de pagos</p>
          <div className="mt-6 space-y-2 text-sm">
            <div className="flex justify-between gap-3">
              <span className="opacity-75">Aportado</span>
              <span className="font-semibold tabular-nums">{money(summary.contributed)}</span>
            </div>
            <div className="flex justify-between gap-3">
              <span className="opacity-75">Pagado</span>
              <span className="font-semibold tabular-nums">{money(summary.paid)}</span>
            </div>
            <div
              className="h-1.5 overflow-hidden rounded-full bg-primary-foreground/15"
              aria-hidden="true"
            >
              <div
                className="h-full rounded-full bg-success"
                style={{
                  width: `${Math.min(100, Math.max(0, summary.total ? (summary.paid / summary.total) * 100 : 0))}%`,
                }}
              />
            </div>
            <p className="text-xs opacity-70">
              {summary.pendingCount}{" "}
              {summary.pendingCount === 1 ? "factura pendiente" : "facturas pendientes"}
            </p>
          </div>
        </>
      );
    }
  }
}

type EditorState = DashboardSnapshot & { hidden: DashboardWidget[] };

export function Dashboard({
  s,
  user,
  compact,
  scope,
  go,
  onCreate,
  onOpenRecord,
  now: clock,
  adultAuthorized = false,
}: {
  s: HubState;
  user: Member;
  compact: boolean;
  scope: DashboardScope;
  go: (section: Section) => void;
  onCreate: (section: Section) => void;
  onOpenRecord?: (section: "calendar" | "notes", id: string) => void;
  now: Date | null;
  adultAuthorized?: boolean;
}) {
  const today = useToday();
  const now = clock ?? today;
  // Keep the original actor's client through sign-out/context invalidation.
  // The shell remounts this component for the next household/member identity.
  const [client] = useState(db);
  const preference = useDashboardLayout(scope, client);
  const [editor, setEditor] = useState<EditorState | null>(null);
  const [opening, setOpening] = useState(false);
  const financialAccess =
    canViewFinances(user.role, adultAuthorized) && (scope.kind === "account" || adultAuthorized);
  const allowed = (id: WidgetId) => id !== "finance" || financialAccess;
  const open = async () => {
    setOpening(true);
    const fresh = await preference.reload();
    setOpening(false);
    if (fresh)
      setEditor({
        ...fresh,
        layout: {
          ...fresh.layout,
          widgets: fresh.layout.widgets.filter((widget) => allowed(widget.id)),
        },
        hidden: fresh.layout.widgets.filter((widget) => !allowed(widget.id)),
      });
  };
  const save = async () => {
    if (!editor) return;
    const saved = await preference.save(
      {
        ...editor.layout,
        widgets: [
          ...editor.layout.widgets,
          ...editor.hidden.filter(
            (hidden) => !editor.layout.widgets.some((widget) => widget.id === hidden.id),
          ),
        ],
      },
      editor.revision,
    );
    if (saved) {
      setEditor(null);
      toast.success(
        scope.kind === "account" ? "Tu inicio se guardó" : "Tu inicio se guardó en esta tablet",
      );
    }
  };
  const visible = preference.layout.widgets.filter((widget) => allowed(widget.id));
  const updateDraft = (layout: DashboardLayout) =>
    setEditor((current) => (current ? { ...current, layout } : null));
  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div className="min-w-0">
          <p className="mb-1 text-sm text-muted-foreground first-letter:uppercase">
            {now.toLocaleDateString("es", { weekday: "long", day: "numeric", month: "long" })}
          </p>
          <h2 className="break-words font-display text-3xl font-extrabold">Hola, {user.name}</h2>
        </div>
        <Button
          variant="outline"
          className="h-11 rounded-full bg-card"
          disabled={preference.loading || opening}
          onClick={() => void open()}
        >
          <SlidersHorizontal className="size-4" /> {opening ? "Abriendo…" : "Personalizar"}
        </Button>
      </div>
      {preference.error && !editor ? (
        <p
          role="alert"
          className="rounded-2xl border border-destructive/25 bg-card p-4 text-sm text-destructive"
        >
          {preference.error}{" "}
          <button type="button" className="underline" onClick={() => void preference.reload()}>
            Reintentar
          </button>
        </p>
      ) : null}
      {preference.loading ? (
        <div role="status" className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          <span className="sr-only">Cargando tu inicio…</span>
          {[0, 1, 2].map((id) => (
            <div
              key={id}
              className="h-64 animate-pulse rounded-3xl bg-muted motion-reduce:animate-none"
            />
          ))}
        </div>
      ) : visible.length ? (
        <div
          aria-label="Widgets de inicio"
          className={cn("grid items-start gap-4 sm:grid-cols-2", !compact && "xl:grid-cols-3")}
        >
          {visible.map((widget) => (
            <section
              key={widget.id}
              aria-label={widgets[widget.id].title}
              data-widget={widget.id}
              data-size={widget.size}
              className={cn(
                "min-w-0 rounded-3xl p-5 shadow-card",
                widgets[widget.id].tone,
                widget.size === "wide" && "sm:col-span-2",
              )}
            >
              <WidgetContent
                widget={widget}
                s={s}
                now={now}
                go={go}
                onCreate={onCreate}
                onOpenRecord={onOpenRecord ?? ((section) => go(section))}
              />
            </section>
          ))}
        </div>
      ) : (
        <div className="rounded-3xl border border-dashed bg-card px-6 py-14 text-center">
          <LayoutGrid className="mx-auto mb-4 size-9 text-muted-foreground" />
          <h3 className="font-display text-xl font-bold">Tu inicio, a tu manera</h3>
          <Button className="mt-5 rounded-full" onClick={() => void open()}>
            Añadir widgets
          </Button>
        </div>
      )}
      <Dialog
        open={!!editor}
        onOpenChange={(value) => {
          if (!value && !preference.saving) setEditor(null);
        }}
      >
        <DialogContent className="flex max-h-[90dvh] w-[calc(100%-2rem)] max-w-xl flex-col gap-0 overflow-hidden rounded-3xl p-0">
          <DialogHeader className="shrink-0 border-b px-5 pb-4 pt-6 text-left">
            <DialogTitle className="font-display text-2xl font-bold">
              Personalizar inicio
            </DialogTitle>
            <DialogDescription>Elige qué ver y en qué orden.</DialogDescription>
          </DialogHeader>
          {editor ? (
            <>
              <div className="space-y-5 overflow-y-auto px-5 py-4">
                <ol aria-label="Orden de widgets" className="space-y-3">
                  {editor.layout.widgets.map((widget, index) => {
                    const { title, Icon, tone } = widgets[widget.id];
                    return (
                      <li
                        key={widget.id}
                        className="rounded-2xl border bg-card p-3"
                        aria-label={title}
                      >
                        <div className="flex items-center gap-2">
                          <span
                            className={cn(
                              "grid size-10 shrink-0 place-items-center rounded-xl",
                              tone,
                            )}
                          >
                            <Icon className="size-5" />
                          </span>
                          <span className="min-w-0 flex-1 text-sm font-bold">{title}</span>
                          <Button
                            type="button"
                            variant="ghost"
                            size="icon"
                            className="size-10 shrink-0 rounded-full"
                            disabled={preference.saving}
                            aria-label={`Ocultar ${title.toLocaleLowerCase("es")}`}
                            onClick={() =>
                              updateDraft({
                                ...editor.layout,
                                widgets: editor.layout.widgets.filter(
                                  (entry) => entry.id !== widget.id,
                                ),
                              })
                            }
                          >
                            <X className="size-4" />
                          </Button>
                        </div>
                        <div className="mt-2 flex flex-wrap items-center justify-between gap-2">
                          <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            className="h-10 rounded-xl"
                            disabled={preference.saving}
                            aria-label={`${widget.size === "wide" ? "Compactar" : "Ampliar"} ${title.toLocaleLowerCase("es")}`}
                            aria-pressed={widget.size === "wide"}
                            onClick={() =>
                              updateDraft({
                                ...editor.layout,
                                widgets: editor.layout.widgets.map((entry) =>
                                  entry.id === widget.id
                                    ? { ...entry, size: entry.size === "wide" ? "compact" : "wide" }
                                    : entry,
                                ),
                              })
                            }
                          >
                            {widget.size === "wide" ? (
                              <Maximize2 className="size-4" />
                            ) : (
                              <Minimize2 className="size-4" />
                            )}{" "}
                            {widget.size === "wide" ? "Amplio" : "Compacto"}
                          </Button>
                          <span className="flex gap-1">
                            <Button
                              type="button"
                              variant="ghost"
                              size="icon"
                              className="size-10 rounded-xl"
                              disabled={index === 0 || preference.saving}
                              aria-label={`Subir ${title.toLocaleLowerCase("es")}`}
                              onClick={() =>
                                updateDraft(moveDashboardWidget(editor.layout, widget.id, -1))
                              }
                            >
                              <ArrowUp className="size-4" />
                            </Button>
                            <Button
                              type="button"
                              variant="ghost"
                              size="icon"
                              className="size-10 rounded-xl"
                              disabled={
                                index === editor.layout.widgets.length - 1 || preference.saving
                              }
                              aria-label={`Bajar ${title.toLocaleLowerCase("es")}`}
                              onClick={() =>
                                updateDraft(moveDashboardWidget(editor.layout, widget.id, 1))
                              }
                            >
                              <ArrowDown className="size-4" />
                            </Button>
                          </span>
                        </div>
                      </li>
                    );
                  })}
                </ol>
                {WIDGET_IDS.some(
                  (id) => allowed(id) && !editor.layout.widgets.some((widget) => widget.id === id),
                ) ? (
                  <div>
                    <h3 className="mb-3 text-sm font-bold">Añadir widgets</h3>
                    <div className="grid gap-2 sm:grid-cols-2">
                      {WIDGET_IDS.filter(
                        (id) =>
                          allowed(id) && !editor.layout.widgets.some((widget) => widget.id === id),
                      ).map((id) => {
                        const { title, Icon } = widgets[id];
                        return (
                          <Button
                            type="button"
                            key={id}
                            variant="outline"
                            className="h-12 justify-start rounded-xl bg-card"
                            disabled={preference.saving}
                            aria-label={`Añadir ${title.toLocaleLowerCase("es")}`}
                            onClick={() =>
                              updateDraft({
                                ...editor.layout,
                                widgets: [...editor.layout.widgets, { id, size: "compact" }],
                              })
                            }
                          >
                            <Icon className="size-4" />
                            <span className="min-w-0 flex-1 text-left">{title}</span>
                            <Plus className="size-4" />
                          </Button>
                        );
                      })}
                    </div>
                  </div>
                ) : null}
                <Button
                  type="button"
                  variant="ghost"
                  className="text-muted-foreground"
                  disabled={preference.saving}
                  onClick={() =>
                    updateDraft({
                      ...defaultDashboardLayout(),
                      widgets: defaultDashboardLayout().widgets.filter((widget) =>
                        allowed(widget.id),
                      ),
                    })
                  }
                >
                  <RotateCcw className="size-4" /> Restablecer diseño
                </Button>
                {preference.error ? (
                  <div
                    role="alert"
                    className="rounded-xl bg-destructive/10 p-3 text-sm text-destructive"
                  >
                    <p>{preference.error}</p>
                    <button
                      type="button"
                      className="mt-2 underline"
                      disabled={preference.saving}
                      onClick={() => void open()}
                    >
                      Cargar versión actual
                    </button>
                  </div>
                ) : null}
              </div>
              <div className="flex shrink-0 gap-3 border-t bg-background p-5">
                <Button
                  variant="outline"
                  className="h-12 flex-1 rounded-xl"
                  disabled={preference.saving}
                  onClick={() => setEditor(null)}
                >
                  Cancelar
                </Button>
                <Button
                  className="h-12 flex-1 rounded-xl"
                  disabled={preference.saving || opening}
                  onClick={() => void save()}
                >
                  {preference.saving ? "Guardando…" : "Guardar inicio"}
                </Button>
              </div>
            </>
          ) : null}
        </DialogContent>
      </Dialog>
    </div>
  );
}
