import { useEffect, useRef, useState } from "react";
import { ChevronLeft, ChevronRight, Pencil, Pin, Plus, Trash2, X } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import type { PersistedSetter } from "@/lib/persisted-collection";
import { cn } from "@/lib/utils";
import { Avatar } from "./Kiosk";
import { MEMBERS, type Member } from "./data";
import { dateKey, parseDate, type FamilyEvent, type FamilyNote } from "./planner-data";

const field =
  "w-full min-w-0 rounded-xl border border-border bg-background px-3 py-2.5 text-sm outline-none focus:ring-2 focus:ring-ring";
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
      <DialogContent className="max-h-[90dvh] w-[calc(100%-2rem)] max-w-md overflow-y-auto rounded-3xl bg-card p-5">
        <DialogTitle className="pr-8 font-display text-xl font-bold">{title}</DialogTitle>
        <DialogDescription className="sr-only">
          Edita los datos y guarda para sincronizarlos con tu hogar.
        </DialogDescription>
        {children}
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
}: {
  events: FamilyEvent[];
  setEvents: Setter<FamilyEvent>;
  user: Member;
  compact: boolean;
  createRequest?: number;
}) {
  const [month, setMonth] = useState(() => {
    const now = new Date();
    return new Date(now.getFullYear(), now.getMonth(), 1);
  });
  const [selected, setSelected] = useState(() => dateKey(new Date()));
  const [who, setWho] = useState("all");
  const [draft, setDraft] = useState<FamilyEvent | null>(null);
  const [saving, setSaving] = useState(false);
  const openedRequest = useRef(0);
  useEffect(() => {
    if (!createRequest || createRequest === openedRequest.current) return;
    openedRequest.current = createRequest;
    setDraft({ id: "", title: "", date: selected, time: "", memberId: user.id, note: "" });
  }, [createRequest, selected, user.id]);
  const days = new Date(month.getFullYear(), month.getMonth() + 1, 0).getDate();
  const offset = (month.getDay() + 6) % 7;
  const filtered = events.filter((e) => who === "all" || e.memberId === who);
  const list = filtered
    .filter((e) => e.date === selected)
    .sort((a, b) => a.time.localeCompare(b.time));
  const move = (delta: number) => {
    const next = new Date(month.getFullYear(), month.getMonth() + delta, 1);
    setMonth(next);
    setSelected(dateKey(next));
  };
  const remove = async (event: FamilyEvent) => {
    if (!(await setEvents((xs) => xs.filter((e) => e.id !== event.id)))) return;
    toast("Evento eliminado", {
      action: { label: "Deshacer", onClick: () => setEvents((xs) => [...xs, event]) },
    });
  };
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <select
          aria-label="Filtrar por persona"
          value={who}
          onChange={(e) => setWho(e.target.value)}
          className={cn(field, "w-auto")}
        >
          <option value="all">Toda la familia</option>
          {MEMBERS.map((m) => (
            <option key={m.id} value={m.id}>
              {m.name}
            </option>
          ))}
        </select>
        <Button
          data-tour="calendar"
          onClick={() =>
            setDraft({ id: "", title: "", date: selected, time: "", memberId: user.id, note: "" })
          }
          className="rounded-full"
        >
          <Plus /> Evento
        </Button>
      </div>
      <div className={cn("grid gap-5", compact ? "grid-cols-1" : "grid-cols-[1.3fr_1fr]")}>
        <section>
          <header className="mb-3 flex items-center justify-between">
            <Button size="icon" variant="ghost" aria-label="Mes anterior" onClick={() => move(-1)}>
              <ChevronLeft />
            </Button>
            <h2 className="font-display text-xl font-bold capitalize">
              {month.toLocaleDateString("es", { month: "long", year: "numeric" })}
            </h2>
            <Button size="icon" variant="ghost" aria-label="Mes siguiente" onClick={() => move(1)}>
              <ChevronRight />
            </Button>
          </header>
          <div className="grid grid-cols-7 gap-1">
            {["L", "M", "X", "J", "V", "S", "D"].map((d) => (
              <span
                key={d}
                className="py-2 text-center text-xs font-semibold text-muted-foreground"
              >
                {d}
              </span>
            ))}
            {Array.from({ length: offset }, (_, i) => (
              <span key={`blank-${i}`} />
            ))}
            {Array.from({ length: days }, (_, i) => {
              const key = dateKey(new Date(month.getFullYear(), month.getMonth(), i + 1));
              const count = filtered.filter((e) => e.date === key).length;
              return (
                <Button
                  key={key}
                  variant="ghost"
                  aria-label={`Día ${i + 1}`}
                  aria-pressed={key === selected}
                  onClick={() => setSelected(key)}
                  className={cn(
                    "relative h-auto aspect-square min-w-0 flex-col gap-0 rounded-xl p-0",
                    key === selected
                      ? "bg-primary text-primary-foreground hover:bg-primary/90"
                      : "bg-card",
                  )}
                >
                  <span>{i + 1}</span>
                  <span className="absolute bottom-1 flex h-1 gap-0.5" aria-hidden="true">
                    {Array.from({ length: Math.min(3, count) }, (_, n) => (
                      <span key={n} className="size-1 rounded-full bg-success-strong" />
                    ))}
                  </span>
                </Button>
              );
            })}
          </div>
        </section>
        <section>
          <h3 className="mb-3 font-display text-lg font-bold capitalize">
            {parseDate(selected).toLocaleDateString("es", {
              weekday: "long",
              day: "numeric",
              month: "short",
            })}
          </h3>
          {!list.length && <p className="py-6 text-sm text-muted-foreground">Sin eventos</p>}
          <div className="space-y-3">
            {list.map((event) => {
              const member = MEMBERS.find((m) => m.id === event.memberId);
              return (
                <article key={event.id} className="rounded-2xl bg-card p-4 shadow-card">
                  <div className="flex items-center gap-2">
                    {member && <Avatar m={member} size="sm" />}
                    <span className="flex-1 text-xs text-muted-foreground">
                      {event.time || "Todo el día"}
                    </span>
                    <Button
                      variant="ghost"
                      size="icon"
                      aria-label={`Editar ${event.title}`}
                      onClick={() => setDraft({ ...event })}
                    >
                      <Pencil />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      aria-label={`Eliminar ${event.title}`}
                      onClick={() => remove(event)}
                    >
                      <Trash2 />
                    </Button>
                  </div>
                  <h4 className="mt-1 font-display text-lg font-bold break-words">{event.title}</h4>
                  {event.note && (
                    <p className="mt-2 whitespace-pre-wrap break-words text-sm text-muted-foreground">
                      {event.note}
                    </p>
                  )}
                </article>
              );
            })}
          </div>
        </section>
      </div>
      {draft && (
        <Editor title={draft.id ? "Editar evento" : "Nuevo evento"} close={() => setDraft(null)}>
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
              const confirmed = await setEvents((xs) =>
                draft.id ? xs.map((x) => (x.id === draft.id ? saved : x)) : [...xs, saved],
              );
              setSaving(false);
              if (!confirmed) return;
              setSelected(saved.date);
              const d = parseDate(saved.date);
              setMonth(new Date(d.getFullYear(), d.getMonth(), 1));
              setDraft(null);
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
                  className={field}
                />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <label className="min-w-0 text-sm font-semibold">
                Fecha
                <input
                  type="date"
                  required
                  value={draft.date}
                  onChange={(e) => setDraft({ ...draft, date: e.target.value })}
                  className={field}
                />
              </label>
              <label className="min-w-0 text-sm font-semibold">
                Hora
                <input
                  type="time"
                  value={draft.time}
                  onChange={(e) => setDraft({ ...draft, time: e.target.value })}
                  className={field}
                />
              </label>
            </div>
            <label className="block text-sm font-semibold">
              Persona
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
            <div>
              <div className="flex items-center justify-between">
                <label htmlFor="event-note" className="text-sm font-semibold">
                  Nota
                </label>
              </div>
              <textarea
                id="event-note"
                aria-label="Nota"
                value={draft.note}
                onChange={(e) => setDraft({ ...draft, note: e.target.value })}
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

export function FamilyNotes({
  notes,
  setNotes,
  user,
  compact,
  createRequest,
}: {
  notes: FamilyNote[];
  setNotes: Setter<FamilyNote>;
  user: Member;
  compact: boolean;
  createRequest?: number;
}) {
  const [draft, setDraft] = useState<FamilyNote | null>(null);
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
          data-tour="notes"
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
                  className={field}
                />
              </div>
            </div>
            <div>
              <div className="flex items-center justify-between">
                <label htmlFor="note-body" className="text-sm font-semibold">
                  Contenido
                </label>
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
