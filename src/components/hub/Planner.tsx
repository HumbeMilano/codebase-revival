import { lazy, Suspense, useEffect, useRef, useState } from "react";
import { ChevronLeft, ChevronRight, Check, Pencil, Pin, Plus, Trash2, X } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { NativeInputShortcut } from "./NativeInputShortcut";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import type { PersistedSetter } from "@/lib/persisted-collection";
import { cn } from "@/lib/utils";
import { Avatar } from "./Kiosk";
import { MEMBERS, type Member } from "./data";
import { useToday } from "@/hooks/use-today";
import { calendarBills, calendarDateFromId, type CalendarItem } from "@/lib/calendar";
import type { LedgerBill } from "@/lib/ledger";
const money = (n: number) => n.toLocaleString("en-US", { style: "currency", currency: "USD" });
const BillForm = lazy(() => import("./Finance").then((m) => ({ default: m.BillForm })));
import { dateKey, parseDate, type FamilyEvent, type FamilyNote } from "./planner-data";

const field =
  "planner-field block w-full min-w-0 rounded-xl border border-border bg-secondary/60 px-3 py-3 text-base font-normal text-foreground outline-none focus:border-primary focus:ring-2 focus:ring-ring";
type Setter<T> = PersistedSetter<T[]>;

function Editor({
  title,
  close,
  children,
}: {
  title: string;
  close: () => void;
  children: React.ReactNode;
}) {
  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open) close();
      }}
    >
      <DialogContent
        aria-describedby={undefined}
        className="planner-dialog left-4 top-[5dvh] flex max-h-[90dvh] flex-col w-[calc(100dvw_-_2rem)] max-w-lg translate-none overflow-hidden rounded-3xl bg-card p-5 pt-7 sm:left-[50%] sm:top-[50%] sm:translate-x-[-50%] sm:translate-y-[-50%]"
      >
        <DialogTitle className="shrink-0 pr-8 font-display text-xl font-bold">{title}</DialogTitle>
        <div className="min-h-0 overflow-y-auto overscroll-contain">{children}</div>
      </DialogContent>
    </Dialog>
  );
}

export function FamilyCalendar({
  events,
  setEvents,
  user,
  compact,
  createRequest,
  initialEventId,
  bills = [],
  setBills,
  financialAccess = false,
  dayDialog = false,
  onDayClose,
}: {
  events: FamilyEvent[];
  setEvents: Setter<FamilyEvent>;
  user: Member;
  compact: boolean;
  createRequest?: number;
  initialEventId?: string | undefined;
  bills?: LedgerBill[];
  setBills?: PersistedSetter<LedgerBill[]>;
  financialAccess?: boolean;
  dayDialog?: boolean;
  onDayClose?: () => void;
}) {
  const now = useToday();
  const visibleBills = financialAccess ? bills : [];
  const initialDate = calendarDateFromId(initialEventId, events, visibleBills, now);
  const [month, setMonth] = useState(() => {
    const date = parseDate(initialDate);
    return new Date(date.getFullYear(), date.getMonth(), 1);
  });
  const [selected, setSelected] = useState(initialDate);
  const [who, setWho] = useState("all");
  const [type, setType] = useState("all");
  const [draft, setDraft] = useState<FamilyEvent | null>(() => {
    const e = events.find((e) => e.id === initialEventId);
    return e ? { ...e } : null;
  });
  const [billDetail, setBillDetail] = useState<string | null>(() =>
    initialEventId?.startsWith("bill:") && financialAccess ? initialEventId : null,
  );
  const [billEditor, setBillEditor] = useState<LedgerBill | "new" | null>(null);
  useEffect(() => {
    if (!financialAccess) {
      setBillDetail(null);
      setBillEditor(null);
    }
  }, [financialAccess]);
  const [allDay, setAllDay] = useState(() => !events.find((e) => e.id === initialEventId)?.time);
  const [saving, setSaving] = useState(false);
  const openedRequest = useRef(0);
  const newEntry = () => {
    setAllDay(true);
    setDraft({
      id: "",
      title: "",
      date: selected,
      time: "",
      memberId: user.id,
      note: "",
      kind: "event",
      completed: false,
      endTime: "",
    });
  };
  useEffect(() => {
    if (createRequest && createRequest !== openedRequest.current) {
      openedRequest.current = createRequest;
      setAllDay(true);
      setDraft({
        id: "",
        title: "",
        date: selected,
        time: "",
        memberId: user.id,
        note: "",
        kind: "event",
        completed: false,
        endTime: "",
      });
    }
  }, [createRequest, selected, user.id]);
  const mk = dateKey(month).slice(0, 7);
  const entries: CalendarItem[] = [...events, ...calendarBills(visibleBills, mk, now)];
  const filtered = entries.filter(
    (e) =>
      (type === "all" || (e.kind ?? "event") === type) &&
      (who === "all" || (e.kind === "bill" ? e.memberIds.includes(who) : e.memberId === who)),
  );
  const list = filtered
    .filter((e) => e.date === selected)
    .sort((a, b) => a.time.localeCompare(b.time) || a.title.localeCompare(b.title));
  const days = new Date(month.getFullYear(), month.getMonth() + 1, 0).getDate(),
    offset = (month.getDay() + 6) % 7;
  const move = (delta: number) => {
    const date = new Date(month.getFullYear(), month.getMonth() + delta, 1);
    setMonth(date);
    setSelected(dateKey(date));
  };
  const complete = async (e: FamilyEvent) => {
    if (saving) return;
    setSaving(true);
    try {
      await setEvents((xs) =>
        xs.map((row) => (row.id === e.id ? { ...row, completed: !row.completed } : row)),
      );
    } finally {
      setSaving(false);
    }
  };
  const remove = async (e: FamilyEvent) => {
    if (await setEvents((xs) => xs.filter((row) => row.id !== e.id)))
      toast(e.kind === "reminder" ? "Recordatorio eliminado" : "Evento eliminado", {
        action: { label: "Deshacer", onClick: () => setEvents((xs) => [...xs, e]) },
      });
  };
  const detail = calendarBills(visibleBills, billDetail?.slice(-7) ?? mk, now).find(
    (b) => b.id === billDetail,
  );
  const tones = {
    event: "bg-lilac text-foreground",
    reminder: "bg-success text-success-foreground",
    bill: "bg-accent text-accent-foreground",
  };
  const labels = { event: "Evento", reminder: "Recordatorio", bill: "Factura" };
  const agenda = (
    <section className="min-w-0">
      <h3 className={cn("mb-4 font-display text-lg font-bold capitalize", dayDialog && "sr-only")}>
        {parseDate(selected).toLocaleDateString("es", {
          weekday: "long",
          day: "numeric",
          month: "short",
        })}
      </h3>
      {!list.length && <p className="py-6 text-sm text-muted-foreground">Sin entradas</p>}
      <div className="space-y-3">
        {list.map((entry) => {
          const kind = entry.kind ?? "event";
          const person =
            entry.kind !== "bill" ? MEMBERS.find((m) => m.id === entry.memberId) : undefined;
          return (
            <article
              key={entry.id}
              className={cn(
                "rounded-2xl bg-card p-4 shadow-card",
                entry.kind !== "bill" && entry.completed && "opacity-60",
              )}
              data-calendar-kind={kind}
            >
              <div className="mb-3 flex items-center gap-2">
                <span className={cn("rounded-full px-2.5 py-1 text-xs font-bold", tones[kind])}>
                  {labels[kind]}
                </span>
                <span className="min-w-0 flex-1 text-right text-xs text-muted-foreground">
                  {entry.time
                    ? `${entry.time}${entry.kind !== "bill" && entry.endTime ? ` – ${entry.endTime}` : ""}`
                    : "Todo el día"}
                </span>
              </div>
              {entry.kind === "bill" ? (
                <button className="w-full text-left" onClick={() => setBillDetail(entry.id)}>
                  <span className="flex justify-between gap-3 font-display text-lg font-bold">
                    <span className="break-words">{entry.title}</span>
                    <span>{money(entry.amount)}</span>
                  </span>
                  <span className="mt-2 block text-sm text-muted-foreground">
                    {entry.status === "paid" ? "Pagada" : "Pendiente"}
                  </span>
                </button>
              ) : (
                <>
                  <div className="flex items-start gap-2">
                    {entry.kind === "reminder" && (
                      <button
                        type="button"
                        disabled={saving}
                        aria-label={`Completar ${entry.title}`}
                        aria-pressed={entry.completed ?? false}
                        onClick={() => void complete(entry)}
                        className="mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-xl border-2 border-current"
                      >
                        <Check className={cn("size-5", !entry.completed && "invisible")} />
                      </button>
                    )}
                    <h4
                      className={cn(
                        "min-w-0 flex-1 break-words font-display text-lg font-bold",
                        entry.completed && "line-through",
                      )}
                    >
                      {entry.title}
                    </h4>
                    <Button
                      variant="ghost"
                      size="icon"
                      aria-label={`Editar ${entry.title}`}
                      onClick={() => {
                        setAllDay(!entry.time);
                        setDraft({ ...entry });
                      }}
                    >
                      <Pencil className="size-4" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      aria-label={`Eliminar ${entry.title}`}
                      onClick={() => void remove(entry)}
                    >
                      <Trash2 className="size-4" />
                    </Button>
                  </div>
                  {entry.note && (
                    <p className="mt-2 whitespace-pre-wrap break-words text-sm text-muted-foreground">
                      {entry.note}
                    </p>
                  )}
                  {person && (
                    <div className="mt-3 flex items-center gap-2 text-xs text-muted-foreground">
                      <Avatar m={person} size="sm" />
                      {person.name}
                    </div>
                  )}
                </>
              )}
            </article>
          );
        })}
      </div>
    </section>
  );
  return (
    <div className="space-y-5">
      {!dayDialog && (
        <>
          <div className="flex flex-wrap items-center gap-2">
            <select
              aria-label="Filtrar por persona"
              value={who}
              onChange={(e) => setWho(e.target.value)}
              className={cn(field, "w-auto flex-1")}
            >
              <option value="all">Toda la familia</option>
              {MEMBERS.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.name}
                </option>
              ))}
            </select>
            <select
              aria-label="Tipo de calendario"
              value={type}
              onChange={(e) => setType(e.target.value)}
              className={cn(field, "w-auto flex-1")}
            >
              <option value="all">Todos</option>
              <option value="event">Eventos</option>
              <option value="reminder">Recordatorios</option>
              {financialAccess && <option value="bill">Facturas</option>}
            </select>
            <Button aria-label="Añadir al calendario" onClick={newEntry} className="rounded-full">
              <Plus className="size-4" />
              Añadir
            </Button>
          </div>
          <div
            className={cn(
              "grid gap-6",
              compact ? "grid-cols-1" : "grid-cols-[minmax(0,1.25fr)_minmax(0,1fr)]",
            )}
          >
            <section className="min-w-0 rounded-3xl bg-card p-3 shadow-card sm:p-5">
              <header className="mb-3 flex items-center justify-between gap-1">
                <Button
                  size="icon"
                  variant="ghost"
                  aria-label="Mes anterior"
                  onClick={() => move(-1)}
                >
                  <ChevronLeft />
                </Button>
                <h2 className="font-display text-xl font-bold capitalize">
                  {month.toLocaleDateString("es", { month: "long", year: "numeric" })}
                </h2>
                <Button
                  size="icon"
                  variant="ghost"
                  aria-label="Mes siguiente"
                  onClick={() => move(1)}
                >
                  <ChevronRight />
                </Button>
              </header>
              <div className="grid grid-cols-7 gap-1">
                {["L", "M", "X", "J", "V", "S", "D"].map((d, i) => (
                  <span
                    key={i}
                    className="py-2 text-center text-xs font-bold text-muted-foreground"
                  >
                    {d}
                  </span>
                ))}
                {Array.from({ length: offset }, (_, i) => (
                  <span key={`blank${i}`} />
                ))}
                {Array.from({ length: days }, (_, i) => {
                  const key = dateKey(new Date(month.getFullYear(), month.getMonth(), i + 1));
                  const kinds = new Set(
                    filtered.filter((e) => e.date === key).map((e) => e.kind ?? "event"),
                  );
                  return (
                    <button
                      type="button"
                      key={key}
                      aria-label={`Día ${i + 1}`}
                      aria-pressed={key === selected}
                      aria-current={key === dateKey(now) ? "date" : undefined}
                      onClick={() => setSelected(key)}
                      className={cn(
                        "relative flex aspect-square min-h-10 min-w-0 flex-col items-center justify-center gap-1 rounded-xl border border-transparent text-sm font-semibold",
                        key === selected
                          ? "bg-primary text-primary-foreground"
                          : key === dateKey(now)
                            ? "border-primary bg-secondary"
                            : "hover:bg-secondary",
                      )}
                    >
                      <span>{i + 1}</span>
                      <span className="absolute bottom-1 flex gap-0.5" aria-hidden="true">
                        {kinds.has("event") && (
                          <i className="size-1.5 rounded-full bg-violet-500" />
                        )}
                        {kinds.has("reminder") && (
                          <i className="size-1.5 rounded-full bg-emerald-500" />
                        )}
                        {kinds.has("bill") && <i className="size-1.5 rounded-full bg-amber-500" />}
                      </span>
                    </button>
                  );
                })}
              </div>
            </section>
            {agenda}
          </div>
        </>
      )}
      {dayDialog && !draft && !(financialAccess && (detail || billEditor)) && (
        <Editor
          title={`Agenda · ${parseDate(selected).toLocaleDateString("es", { weekday: "long", day: "numeric", month: "long", year: "numeric" })}`}
          close={() => onDayClose?.()}
        >
          <Button
            aria-label="Añadir al calendario"
            onClick={newEntry}
            className="mb-4 rounded-full"
          >
            <Plus className="size-4" />
            Añadir
          </Button>
          {agenda}
        </Editor>
      )}
      {draft && (
        <Editor
          title={
            draft.id
              ? draft.kind === "reminder"
                ? "Editar recordatorio"
                : "Editar evento"
              : draft.kind === "reminder"
                ? "Nuevo recordatorio"
                : "Nuevo evento"
          }
          close={() => {
            if (!saving) setDraft(null);
          }}
        >
          <form
            className="planner-form space-y-3"
            onSubmit={async (e) => {
              e.preventDefault();
              if (!draft.title.trim() || saving) return;
              if (!MEMBERS.some((m) => m.id === draft.memberId)) {
                toast.error("Elige una persona del hogar");
                return;
              }
              if (draft.endTime && draft.endTime <= draft.time) {
                toast.error("La hora de fin debe ser posterior al inicio");
                return;
              }
              setSaving(true);
              try {
                const value = {
                  ...draft,
                  id: draft.id || crypto.randomUUID(),
                  title: draft.title.trim(),
                  kind: draft.kind ?? "event",
                  time: allDay ? "" : draft.time,
                  endTime: allDay ? "" : (draft.endTime ?? ""),
                };
                const confirmed = await setEvents((xs) =>
                  draft.id ? xs.map((x) => (x.id === draft.id ? value : x)) : [...xs, value],
                );
                if (confirmed) {
                  setSelected(value.date);
                  const d = parseDate(value.date);
                  setMonth(new Date(d.getFullYear(), d.getMonth(), 1));
                  setDraft(null);
                }
              } finally {
                setSaving(false);
              }
            }}
          >
            <div
              className="grid grid-cols-3 gap-1 rounded-2xl bg-secondary p-1"
              aria-label="Clase de entrada"
            >
              {(["event", "reminder", "bill"] as const)
                .filter((k) => k !== "bill" || financialAccess)
                .map((kind) => (
                  <button
                    type="button"
                    key={kind}
                    disabled={saving}
                    aria-pressed={(draft.kind ?? "event") === kind}
                    onClick={() => {
                      if (kind === "bill") {
                        setDraft(null);
                        setBillEditor("new");
                      } else setDraft({ ...draft, kind, completed: false, endTime: "" });
                    }}
                    className={cn(
                      "min-h-11 rounded-xl px-2 text-sm font-bold",
                      (draft.kind ?? "event") === kind && "bg-card shadow-sm",
                    )}
                  >
                    {labels[kind]}
                  </button>
                ))}
            </div>
            <div className="space-y-2">
              <div className="flex items-center justify-between gap-2">
                <label htmlFor="draft-title" className="text-sm font-bold">
                  Título
                </label>
                <NativeInputShortcut targetId="draft-title" />
              </div>
              <input
                id="draft-title"
                autoFocus
                required
                maxLength={200}
                value={draft.title}
                onChange={(e) => setDraft({ ...draft, title: e.target.value })}
                className={field}
              />
            </div>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <label className="block min-w-0 space-y-2 text-sm font-bold">
                <span>Fecha</span>
                <input
                  type="date"
                  required
                  value={draft.date}
                  onChange={(e) => setDraft({ ...draft, date: e.target.value })}
                  className={field}
                />
              </label>
              <label className="block min-w-0 space-y-2 text-sm font-bold">
                <span>Persona</span>
                <select
                  value={draft.memberId}
                  onChange={(e) => setDraft({ ...draft, memberId: e.target.value })}
                  className={field}
                >
                  {MEMBERS.map((m) => (
                    <option key={m.id} value={m.id}>
                      {m.name}
                    </option>
                  ))}
                </select>
              </label>
            </div>
            <label className="flex min-h-11 items-center gap-3 text-sm font-semibold">
              <input
                type="checkbox"
                checked={allDay}
                onChange={(e) => {
                  setAllDay(e.target.checked);
                  setDraft({
                    ...draft,
                    time: e.target.checked ? "" : new Date().toTimeString().slice(0, 5),
                    endTime: "",
                  });
                }}
                className="size-5 accent-primary"
              />
              Todo el día
            </label>
            {!allDay && (
              <div className="grid grid-cols-2 gap-3">
                <label className="block min-w-0 space-y-2 text-sm font-bold">
                  <span>Hora</span>
                  <input
                    type="time"
                    required
                    value={draft.time}
                    onChange={(e) => setDraft({ ...draft, time: e.target.value })}
                    className={field}
                  />
                </label>
                {draft.kind !== "reminder" && (
                  <label className="block min-w-0 space-y-2 text-sm font-bold">
                    <span>Fin (opcional)</span>
                    <input
                      type="time"
                      value={draft.endTime ?? ""}
                      onChange={(e) => setDraft({ ...draft, endTime: e.target.value })}
                      className={field}
                    />
                  </label>
                )}
              </div>
            )}
            <div className="space-y-2">
              <div className="flex items-center justify-between gap-2">
                <label htmlFor="event-note" className="text-sm font-bold">
                  Nota
                </label>
                <NativeInputShortcut targetId="event-note" />
              </div>
              <textarea
                id="event-note"
                rows={3}
                maxLength={20000}
                value={draft.note}
                onChange={(e) => setDraft({ ...draft, note: e.target.value })}
                className={field}
              />
            </div>
            <div className="planner-actions flex justify-end gap-2 border-t pt-3">
              <Button
                type="button"
                variant="ghost"
                disabled={saving}
                onClick={() => setDraft(null)}
              >
                Cancelar
              </Button>
              <Button type="submit" disabled={saving}>
                {saving ? "Guardando…" : "Guardar"}
              </Button>
            </div>
          </form>
        </Editor>
      )}
      {detail && financialAccess && setBills && (
        <Editor
          title={detail.title}
          close={() => {
            if (!saving) setBillDetail(null);
          }}
        >
          <div className="space-y-5">
            <span className="inline-block rounded-full bg-accent px-3 py-1 text-sm font-bold">
              Factura · {detail.status === "paid" ? "Pagada" : "Pendiente"}
            </span>
            <p className="font-display text-3xl font-bold">{money(detail.amount)}</p>
            <p>
              {parseDate(detail.date).toLocaleDateString("es", {
                day: "numeric",
                month: "long",
                year: "numeric",
              })}
            </p>
            <div className="flex flex-wrap gap-2">
              <Button
                disabled={saving}
                onClick={async () => {
                  setSaving(true);
                  try {
                    await setBills((xs) =>
                      xs.map((b) =>
                        b.id === detail.billId
                          ? {
                              ...b,
                              overrides: {
                                ...b.overrides,
                                [detail.month]: {
                                  ...b.overrides[detail.month],
                                  status: detail.status === "paid" ? "pending" : "paid",
                                },
                              },
                            }
                          : b,
                      ),
                    );
                  } finally {
                    setSaving(false);
                  }
                }}
              >
                {detail.status === "paid" ? "Marcar pendiente" : "Marcar pagada"}
              </Button>
              <Button
                variant="outline"
                disabled={saving}
                onClick={() => {
                  const bill = bills.find((b) => b.id === detail.billId);
                  if (bill) {
                    setBillDetail(null);
                    setBillEditor(bill);
                  }
                }}
              >
                Editar factura
              </Button>
            </div>
          </div>
        </Editor>
      )}
      {billEditor && financialAccess && setBills && (
        <Suspense fallback={<p role="status">Abriendo factura…</p>}>
          <BillForm
            initial={billEditor === "new" ? undefined : billEditor}
            defaultDay={parseDate(selected).getDate()}
            onClose={() => {
              if (!saving) setBillEditor(null);
            }}
            onSave={async (bill) => {
              setSaving(true);
              try {
                const saved = await setBills((xs) =>
                  xs.some((b) => b.id === bill.id)
                    ? xs.map((b) => (b.id === bill.id ? bill : b))
                    : [...xs, bill],
                );
                if (saved) {
                  setBillEditor(null);
                  setSelected(`${mk}-${String(Math.min(bill.dueDay, days)).padStart(2, "0")}`);
                }
                return saved;
              } finally {
                setSaving(false);
              }
            }}
          />
        </Suspense>
      )}
    </div>
  );
}

export function FamilyNotes({
  notes,
  setNotes,
  user,
  compact,
  createRequest,
  initialNoteId,
}: {
  notes: FamilyNote[];
  setNotes: Setter<FamilyNote>;
  user: Member;
  compact: boolean;
  createRequest?: number;
  initialNoteId?: string | undefined;
}) {
  const [draft, setDraft] = useState<FamilyNote | null>(() => {
    const note = notes.find((entry) => entry.id === initialNoteId);
    return note ? { ...note } : null;
  });
  const [saving, setSaving] = useState(false);
  const openedRequest = useRef(0);
  useEffect(() => {
    if (!createRequest || createRequest === openedRequest.current) return;
    openedRequest.current = createRequest;
    setDraft({ id: "", title: "", body: "", memberId: user.id, pinned: false });
  }, [createRequest, user.id]);
  const [search, setSearch] = useState("");
  const list = notes
    .filter((n) => `${n.title} ${n.body}`.toLocaleLowerCase().includes(search.toLocaleLowerCase()))
    .sort((a, b) => Number(b.pinned) - Number(a.pinned));
  const remove = async (note: FamilyNote) => {
    if (!(await setNotes((xs) => xs.filter((n) => n.id !== note.id)))) return;
    toast("Nota eliminada", {
      action: { label: "Deshacer", onClick: () => setNotes((xs) => [...xs, note]) },
    });
  };
  return (
    <div className="space-y-4">
      <div className="flex gap-2">
        <input
          aria-label="Buscar notas"
          placeholder="Buscar notas"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className={cn(field, "flex-1")}
        />
        <Button
          aria-label="Nueva nota"
          onClick={() =>
            setDraft({ id: "", title: "", body: "", memberId: user.id, pinned: false })
          }
          className="rounded-full"
        >
          <Plus /> Nota
        </Button>
      </div>
      {!list.length && (
        <div className="py-16 text-center">
          <h2 className="font-display text-2xl font-bold">
            {notes.length ? "Sin resultados" : "Notas del hogar"}
          </h2>
          <Button
            variant="link"
            onClick={() =>
              setDraft({ id: "", title: "", body: "", memberId: user.id, pinned: false })
            }
          >
            Crear nota
          </Button>
        </div>
      )}
      <div className={cn("grid gap-3", compact ? "grid-cols-1" : "grid-cols-3")}>
        {list.map((note) => (
          <article
            key={note.id}
            className={cn(
              "min-w-0 rounded-2xl p-4 shadow-card",
              note.pinned ? "bg-accent text-accent-foreground" : "bg-card",
            )}
          >
            <header className="flex items-center justify-between gap-2">
              <span className="text-xs text-muted-foreground">
                {MEMBERS.find((m) => m.id === note.memberId)?.name}
              </span>
              <div className="flex">
                <Button
                  variant="ghost"
                  size="icon"
                  aria-label={`Fijar ${note.title}`}
                  aria-pressed={note.pinned}
                  onClick={() =>
                    setNotes((xs) =>
                      xs.map((n) => (n.id === note.id ? { ...n, pinned: !n.pinned } : n)),
                    )
                  }
                >
                  <Pin className={cn(note.pinned && "fill-current")} />
                </Button>
                <Button
                  variant="ghost"
                  size="icon"
                  aria-label={`Editar ${note.title}`}
                  onClick={() => setDraft({ ...note })}
                >
                  <Pencil />
                </Button>
                <Button
                  variant="ghost"
                  size="icon"
                  aria-label={`Eliminar ${note.title}`}
                  onClick={() => remove(note)}
                >
                  <Trash2 />
                </Button>
              </div>
            </header>
            <h3 className="mt-2 break-words font-display text-xl font-bold">{note.title}</h3>
            <p className="mt-2 whitespace-pre-wrap break-words text-sm">{note.body}</p>
          </article>
        ))}
      </div>
      {draft && (
        <Editor title={draft.id ? "Editar nota" : "Nueva nota"} close={() => setDraft(null)}>
          <form
            className="space-y-3"
            onSubmit={async (e) => {
              e.preventDefault();
              if (!draft.title.trim() || saving) return;
              if (!MEMBERS.some((member) => member.id === draft.memberId)) {
                toast.error("Elige una persona del hogar");
                return;
              }
              setSaving(true);
              const saved = {
                ...draft,
                id: draft.id || crypto.randomUUID(),
                title: draft.title.trim(),
              };
              const confirmed = await setNotes((xs) =>
                draft.id ? xs.map((n) => (n.id === draft.id ? saved : n)) : [...xs, saved],
              );
              setSaving(false);
              if (confirmed) setDraft(null);
            }}
          >
            <div>
              <label className="block text-sm font-semibold" htmlFor="draft-title">
                Título
              </label>
              <div className="flex items-center gap-1">
                <input
                  id="draft-title"
                  autoFocus
                  required
                  maxLength={200}
                  value={draft.title}
                  onChange={(e) => setDraft({ ...draft, title: e.target.value })}
                  className={cn(field, "min-w-0 flex-1")}
                />
                <NativeInputShortcut targetId="draft-title" />
              </div>
            </div>
            <div>
              <div className="flex items-center justify-between">
                <label htmlFor="note-body" className="text-sm font-semibold">
                  Contenido
                </label>
                <NativeInputShortcut targetId="note-body" />
              </div>
              <textarea
                id="note-body"
                aria-label="Contenido"
                rows={6}
                maxLength={20000}
                value={draft.body}
                onChange={(e) => setDraft({ ...draft, body: e.target.value })}
                className={field}
              />
            </div>
            <div className="flex justify-end gap-2">
              <Button type="button" variant="ghost" onClick={() => setDraft(null)}>
                Cancelar
              </Button>
              <Button type="submit" disabled={saving}>
                {saving ? "Guardando…" : "Guardar"}
              </Button>
            </div>
          </form>
        </Editor>
      )}
    </div>
  );
}
