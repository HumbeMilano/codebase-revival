import { useCallback, useEffect, useRef, useState } from "react";
import {
  ArrowUpRight,
  Check,
  ListChecks,
  Pencil,
  PiggyBank,
  Plus,
  Receipt,
  ShoppingBasket,
  Trash2,
  X,
} from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { VoiceInput } from "./VoiceInput";
import { appendDictation } from "@/lib/dictation";
import { canViewFinances } from "@/lib/finance-visibility";
import { monthKey, monthSummary, type Contribution, type LedgerBill } from "@/lib/ledger";
import { Avatar } from "./Kiosk";
import { eventWhen, type FamilyEvent, type FamilyNote } from "./planner-data";
import { MEMBERS, memberBg, type Chore, type Member, type ShopItem } from "./data";
import { bindHubPersistence, HOUSEHOLD_ID } from "@/lib/hub-db";
import { supabase } from "@/integrations/supabase/client";
import { isDeviceMode } from "@/lib/db";
import {
  usePersistedCollection,
  type PersistedSetter,
  type SyncGuard,
} from "@/lib/persisted-collection";
import { addShoppingItem } from "@/lib/shopping";
import { persistenceErrorMessage } from "@/lib/persistence-errors";
import { dateKey, parseDate, upcomingEvents } from "./planner-data";
import { useToday } from "@/hooks/use-today";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

const money = (n: number) =>
  n.toLocaleString("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 });
const byId = (id: string): Member =>
  MEMBERS.find((m) => m.id === id) ?? {
    id,
    name: "Miembro no disponible",
    role: "member",
    color: "member-1",
  };

export function Card({
  title,
  action,
  children,
  className,
}: {
  title?: string;
  action?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <section className={cn("rounded-[1.75rem] bg-card p-5 shadow-card", className)}>
      {title && (
        <header className="mb-4 flex items-center justify-between">
          <h3 className="font-display text-base font-bold">{title}</h3>
          {action}
        </header>
      )}
      {children}
    </section>
  );
}

export interface HubState {
  loading: boolean;
  error: string | null;
  saving: boolean;
  lastSavedAt: number | null;
  refresh: () => Promise<void>;
  events: FamilyEvent[];
  setEvents: PersistedSetter<FamilyEvent[]>;
  notes: FamilyNote[];
  setNotes: PersistedSetter<FamilyNote[]>;
  chores: Chore[];
  setChores: PersistedSetter<Chore[]>;
  items: ShopItem[];
  setItems: PersistedSetter<ShopItem[]>;
  bills: LedgerBill[];
  setBills: PersistedSetter<LedgerBill[]>;
  contributions: Contribution[];
  setContributions: PersistedSetter<Contribution[]>;
}

const saveError = (error: unknown) => {
  toast.error(persistenceErrorMessage(error));
};

export function useHubState({
  includeFinances = false,
  onContextRefresh,
}: { includeFinances?: boolean; onContextRefresh?: () => Promise<void> } = {}): HubState {
  const [binding] = useState(() => bindHubPersistence());
  const guard = useRef<SyncGuard>({ revision: 0, pending: 0, queue: Promise.resolve() }).current;
  const [events, setEvents, setEventsRaw, eventStatus] = usePersistedCollection<FamilyEvent[]>(
    [],
    binding.syncEvents,
    guard,
    saveError,
  );
  const [notes, setNotes, setNotesRaw, noteStatus] = usePersistedCollection<FamilyNote[]>(
    [],
    binding.syncNotes,
    guard,
    saveError,
  );
  const [chores, setChores, setChoresRaw, choreStatus] = usePersistedCollection<Chore[]>(
    [],
    binding.syncChores,
    guard,
    saveError,
  );
  const [items, setItems, setItemsRaw, itemStatus] = usePersistedCollection<ShopItem[]>(
    [],
    binding.syncItems,
    guard,
    saveError,
  );
  const [bills, setBills, setBillsRaw, billStatus] = usePersistedCollection<LedgerBill[]>(
    [],
    binding.syncBills,
    guard,
    saveError,
  );
  const [contributions, setContributions, setContributionsRaw, contributionStatus] =
    usePersistedCollection<Contribution[]>([], binding.syncContributions, guard, saveError);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const finances = useRef(includeFinances);
  const validate = useRef(onContextRefresh);
  const refreshRef = useRef<() => Promise<void>>(async () => {});
  finances.current = includeFinances;
  validate.current = onContextRefresh;
  const refresh = useCallback(() => refreshRef.current(), []);
  useEffect(() => {
    binding.activate();
    let active = true,
      request = 0,
      failures = 0;
    let debounce: ReturnType<typeof setTimeout> | undefined;
    let poll: ReturnType<typeof setTimeout> | undefined;
    const load = async () => {
      if (!active || guard.pending || navigator.onLine === false) return;
      const revision = guard.revision,
        id = ++request,
        withFinances = finances.current;
      try {
        const data = await binding.load({ includeFinances: withFinances });
        if (
          !active ||
          guard.pending ||
          revision !== guard.revision ||
          id !== request ||
          withFinances !== finances.current
        )
          return;
        setEventsRaw(data.events);
        setNotesRaw(data.notes);
        setChoresRaw(data.chores);
        setItemsRaw(data.items);
        setBillsRaw(data.bills);
        setContributionsRaw(data.contributions);
        failures = 0;
        setError(null);
      } catch {
        failures++;
        if (active)
          setError("No se pudo actualizar el hogar. Se mantienen los últimos datos confirmados.");
      } finally {
        if (active) setLoading(false);
      }
    };
    refreshRef.current = load;
    const requestRefresh = () => {
      if (document.visibilityState === "hidden") return;
      if (debounce) clearTimeout(debounce);
      debounce = setTimeout(() => {
        void guard.queue.then(load);
      }, 300);
    };
    const revalidate = async () => {
      if (active && document.visibilityState !== "hidden" && navigator.onLine !== false) {
        await load();
        try {
          await validate.current?.();
        } catch {
          if (active) setError("No se pudo verificar el acceso al hogar. Revisa la conexión.");
        }
      }
      if (active)
        poll = setTimeout(
          () => void revalidate(),
          Math.min(120000, (isDeviceMode() ? 20000 : 60000) * 2 ** failures),
        );
    };
    void load();
    poll = setTimeout(() => void revalidate(), isDeviceMode() ? 20000 : 60000);
    // Devices have no Auth JWT and use bounded polling; accounts also use realtime.
    const channel = !isDeviceMode()
      ? supabase
          .channel(`hub:${HOUSEHOLD_ID}`)
          .on(
            "postgres_changes",
            {
              event: "*",
              schema: "public",
              table: "chores",
              filter: `household_id=eq.${HOUSEHOLD_ID}`,
            },
            requestRefresh,
          )
          .on(
            "postgres_changes",
            {
              event: "*",
              schema: "public",
              table: "shopping_items",
              filter: `household_id=eq.${HOUSEHOLD_ID}`,
            },
            requestRefresh,
          )
          .on(
            "postgres_changes",
            {
              event: "*",
              schema: "public",
              table: "events",
              filter: `household_id=eq.${HOUSEHOLD_ID}`,
            },
            requestRefresh,
          )
          .on(
            "postgres_changes",
            {
              event: "*",
              schema: "public",
              table: "notes",
              filter: `household_id=eq.${HOUSEHOLD_ID}`,
            },
            requestRefresh,
          )
          .on(
            "postgres_changes",
            {
              event: "*",
              schema: "public",
              table: "bills",
              filter: `household_id=eq.${HOUSEHOLD_ID}`,
            },
            requestRefresh,
          )
          .on(
            "postgres_changes",
            {
              event: "*",
              schema: "public",
              table: "contributions",
              filter: `household_id=eq.${HOUSEHOLD_ID}`,
            },
            requestRefresh,
          )
          .subscribe()
      : null;
    window.addEventListener("online", requestRefresh);
    window.addEventListener("focus", requestRefresh);
    document.addEventListener("visibilitychange", requestRefresh);
    return () => {
      active = false;
      binding.dispose();
      request++;
      if (poll) clearTimeout(poll);
      if (debounce) clearTimeout(debounce);
      window.removeEventListener("online", requestRefresh);
      window.removeEventListener("focus", requestRefresh);
      document.removeEventListener("visibilitychange", requestRefresh);
      if (channel) void supabase.removeChannel(channel);
    };
  }, [
    binding,
    guard,
    setEventsRaw,
    setNotesRaw,
    setChoresRaw,
    setItemsRaw,
    setBillsRaw,
    setContributionsRaw,
  ]);
  useEffect(() => {
    if (!includeFinances) {
      setBillsRaw([]);
      setContributionsRaw([]);
    }
    void guard.queue.then(refresh);
  }, [includeFinances, guard, refresh, setBillsRaw, setContributionsRaw]);
  const statuses = [
    eventStatus,
    noteStatus,
    choreStatus,
    itemStatus,
    billStatus,
    contributionStatus,
  ];
  const lastSavedAt = Math.max(...statuses.map((status) => status.lastSavedAt ?? 0)) || null;
  const writeError = statuses.find((status) => status.error)?.error;
  return {
    loading,
    error: error ?? (writeError ? persistenceErrorMessage(writeError) : null),
    saving: statuses.some((status) => status.pending > 0),
    lastSavedAt,
    refresh,
    events,
    setEvents,
    notes,
    setNotes,
    chores,
    setChores,
    items,
    setItems,
    bills,
    setBills,
    contributions,
    setContributions,
  };
}

function ChoreRow({ c, onToggle }: { c: Chore; onToggle: () => void }) {
  const m = byId(c.memberId);
  return (
    <button
      onClick={onToggle}
      className="flex w-full items-center gap-3 rounded-2xl bg-secondary p-3 text-left transition hover:bg-secondary active:scale-[0.99]"
    >
      <Avatar m={m} size="sm" />
      <div className="min-w-0 flex-1">
        <p
          className={cn(
            "truncate text-sm font-semibold",
            c.done && "text-muted-foreground line-through",
          )}
        >
          {c.title}
        </p>
        <p className="text-xs text-muted-foreground">
          {m.name} · {c.when}
        </p>
      </div>
      <span
        className={cn(
          "grid size-7 place-items-center rounded-full border-2 transition",
          c.done
            ? "border-primary bg-primary text-primary-foreground"
            : "border-muted-foreground/40",
        )}
      >
        {c.done && <Check className="size-4" />}
      </span>
    </button>
  );
}

const toggleChore = (s: HubState, id: string) =>
  s.setChores((cs) => cs.map((c) => (c.id === id ? { ...c, done: !c.done } : c)));

export function Ring({
  pct,
  size = 64,
  stroke = 6,
  className,
  children,
}: {
  pct: number;
  size?: number;
  stroke?: number;
  className?: string;
  children?: React.ReactNode;
}) {
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  return (
    <div
      className={cn("relative grid shrink-0 place-items-center", className)}
      style={{ width: size, height: size }}
    >
      <svg className="absolute inset-0 size-full! -rotate-90" width={size} height={size}>
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          stroke="currentColor"
          strokeWidth={stroke}
          className="opacity-15"
        />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          stroke="currentColor"
          strokeWidth={stroke}
          strokeLinecap="round"
          strokeDasharray={c}
          strokeDashoffset={c * (1 - Math.min(1, Math.max(0, pct)))}
          className="transition-all duration-700"
        />
      </svg>
      {children}
    </div>
  );
}

const choreDate = (chore: Chore) => chore.dueDate ?? null;
const whenLabel = (chore: Chore, today: Date) => {
  const date = choreDate(chore);
  if (!date) return "Sin fecha";
  const key = dateKey(today);
  const tomorrow = dateKey(new Date(today.getFullYear(), today.getMonth(), today.getDate() + 1));
  return date < key
    ? "Atrasadas"
    : date === key
      ? "Hoy"
      : date === tomorrow
        ? "Mañana"
        : "Próximas";
};

export function Dashboard({
  s,
  user,
  compact,
  go,
  adultAuthorized = false,
}: {
  s: HubState;
  user: Member;
  compact: boolean;
  go: (t: "chores" | "shopping" | "finance") => void;
  adultAuthorized?: boolean;
}) {
  const now = useToday();
  const today = s.chores.filter(
    (c) => c.dueDate === dateKey(now) || (!c.done && !!c.dueDate && c.dueDate < dateKey(now)),
  );
  const remaining = today.filter((c) => !c.done).length;
  const pending = s.items.filter((i) => !i.done).length;
  const financialAccess = canViewFinances(user.role, adultAuthorized);
  const sum = financialAccess
    ? monthSummary(
        s.bills,
        s.contributions,
        monthKey(now.getFullYear(), now.getMonth()),
        now,
        MEMBERS.map((m) => m.id),
      )
    : null;
  const agenda = today.map((c) => ({
    ...c,
    time: c.dueDate && c.dueDate < dateKey(now) ? "Antes" : "Hoy",
    m: byId(c.memberId),
  }));

  return (
    <div className="space-y-5">
      <div className="flex items-end justify-between gap-3">
        <h2 className="font-display text-3xl font-extrabold">Hola, {user.name}</h2>
        <span className="shrink-0 text-sm font-semibold capitalize text-muted-foreground">
          {now.toLocaleDateString("es", { day: "numeric", month: "short" })}
        </span>
      </div>

      <div className="grid grid-cols-2 gap-3">
        {[
          {
            label: "Tareas",
            n: remaining,
            Icon: ListChecks,
            tone: "bg-success text-success-foreground",
            tab: "chores" as const,
            done: today.filter((c) => c.done).length,
            total: today.length,
          },
          {
            label: "Compras",
            n: pending,
            Icon: ShoppingBasket,
            tone: "bg-accent text-accent-foreground",
            tab: "shopping" as const,
            done: s.items.filter((i) => i.done).length,
            total: s.items.length,
          },
        ].map(({ label, n, Icon, tone, tab, done, total }) => (
          <Button
            key={label}
            variant="ghost"
            onClick={() => go(tab)}
            className={cn(
              "h-auto min-w-0 flex-col items-stretch gap-2 rounded-3xl p-4 shadow-card hover:opacity-90",
              tone,
            )}
          >
            <span className="flex items-center justify-between">
              <Icon className="size-5" />
              <ArrowUpRight className="size-4 opacity-50" />
            </span>
            <span className="text-left font-display text-6xl font-extrabold tabular">{n}</span>
            <span className="flex items-center justify-between text-sm font-bold">
              <span>{label}</span>
              <span className="text-xs opacity-60">
                {done}/{total} ✓
              </span>
            </span>
            <span className="flex h-1.5 gap-1" aria-hidden="true">
              {Array.from({ length: total }, (_, i) => (
                <span
                  key={i}
                  className={cn("flex-1 rounded-full bg-foreground", i >= done && "opacity-15")}
                />
              ))}
            </span>
          </Button>
        ))}
      </div>

      <div className={cn("grid gap-5", compact ? "grid-cols-1" : "grid-cols-[1.2fr_1fr]")}>
        <div className="space-y-5">
          <section aria-label="La familia hoy">
            <div className="grid grid-cols-4 gap-2">
              {MEMBERS.map((m) => {
                const list = s.chores.filter((c) => c.memberId === m.id);
                const done = list.filter((c) => c.done).length;
                return (
                  <Button
                    key={m.id}
                    variant="ghost"
                    onClick={() => go("chores")}
                    className="h-auto min-w-0 flex-col gap-1 rounded-2xl px-0 py-2"
                  >
                    <Ring
                      pct={list.length ? done / list.length : 1}
                      size={compact ? 52 : 64}
                      stroke={4}
                      className="text-success-strong"
                    >
                      <Avatar m={m} />
                    </Ring>
                    <span className="text-xs font-semibold">{m.name}</span>
                  </Button>
                );
              })}
            </div>
          </section>

          <section>
            <h3 className="mb-2 font-display text-lg font-bold">Hoy</h3>
            <div className="divide-y divide-border">
              {agenda.map((c) => (
                <Button
                  key={c.id}
                  variant="ghost"
                  aria-label={c.title}
                  onClick={() => toggleChore(s, c.id)}
                  className="h-auto w-full justify-start gap-3 whitespace-normal rounded-xl px-1 py-3 text-left"
                >
                  <span className="w-10 shrink-0 text-xs tabular text-muted-foreground">
                    {c.time}
                  </span>
                  <Avatar m={c.m} size="sm" />
                  <span
                    className={cn(
                      "min-w-0 flex-1 text-sm font-semibold",
                      c.done && "text-muted-foreground line-through",
                    )}
                  >
                    {c.title}
                  </span>
                  <span
                    className={cn(
                      "grid size-6 shrink-0 place-items-center rounded-full border",
                      c.done
                        ? "border-success-strong bg-success text-success-foreground"
                        : "border-foreground/25",
                    )}
                  >
                    {c.done && <Check />}
                  </span>
                </Button>
              ))}
            </div>
          </section>
        </div>

        <aside className="space-y-5">
          {sum && (
            <Button
              variant="ghost"
              onClick={() => go("finance")}
              className="h-auto w-full justify-between gap-4 rounded-3xl bg-primary p-5 text-primary-foreground shadow-card hover:bg-primary/90"
            >
              <span className="min-w-0 space-y-1 text-left">
                <span className="block text-xs font-semibold opacity-70">
                  Fondo común <ArrowUpRight className="inline size-3" />
                </span>
                <span className="block font-display text-3xl font-extrabold tabular">
                  {money(sum.contributed - sum.paid)}
                </span>
                <span className="block text-xs opacity-70">
                  {sum.pendingCount} bills pendientes
                </span>
              </span>
              <Ring
                pct={sum.total ? sum.paid / sum.total : 0}
                size={72}
                stroke={6}
                className="text-success"
              >
                <span className="text-sm font-bold tabular">
                  {Math.round(sum.total ? (sum.paid / sum.total) * 100 : 0)}%
                </span>
              </Ring>
            </Button>
          )}

          <section>
            <h3 className="mb-2 font-display text-lg font-bold">Próximos</h3>
            <div className="space-y-2">
              {upcomingEvents(s.events, now).map((e) => (
                <div
                  key={e.id}
                  className="flex items-center gap-3 rounded-2xl bg-card p-3 shadow-card"
                >
                  <Avatar m={byId(e.memberId)} size="sm" />
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-semibold">{e.title}</p>
                    <p className="text-xs text-muted-foreground">{eventWhen(e)}</p>
                  </div>
                </div>
              ))}
            </div>
          </section>
        </aside>
      </div>
    </div>
  );
}

const CHORE_GROUPS = ["Atrasadas", "Hoy", "Mañana", "Próximas", "Sin fecha"];
export function Chores({
  s,
  compact,
  createRequest = 0,
}: {
  s: HubState;
  compact: boolean;
  createRequest?: number;
}) {
  const today = useToday();
  const [who, setWho] = useState("all");
  const [draft, setDraft] = useState<Chore | null>(null);
  const [busy, setBusy] = useState(false);
  const fresh = useCallback(
    (): Chore => ({
      id: crypto.randomUUID(),
      title: "",
      memberId: MEMBERS[0]?.id ?? "",
      done: false,
      when: "Hoy",
      dueDate: dateKey(new Date()),
    }),
    [],
  );
  useEffect(() => {
    if (createRequest) setDraft(fresh());
  }, [createRequest, fresh]);
  const list = s.chores.filter((c) => who === "all" || c.memberId === who);
  const isNew = draft ? !s.chores.some((c) => c.id === draft.id) : false;
  const save = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!draft || busy || !draft.title.trim() || !MEMBERS.some((m) => m.id === draft.memberId))
      return;
    setBusy(true);
    const clean = { ...draft, title: draft.title.trim(), when: whenLabel(draft, today) };
    const saved = await s.setChores((rows) =>
      isNew ? [...rows, clean] : rows.map((row) => (row.id === clean.id ? clean : row)),
    );
    setBusy(false);
    if (saved) setDraft(null);
  };
  const remove = async (chore: Chore) => {
    if (busy) return;
    setBusy(true);
    const position = s.chores.findIndex((c) => c.id === chore.id);
    const removed = await s.setChores((rows) => rows.filter((c) => c.id !== chore.id));
    setBusy(false);
    if (!removed) return;
    setDraft(null);
    toast(`"${chore.title}" eliminada`, {
      action: {
        label: "Deshacer",
        onClick: () => {
          void s.setChores((rows) => [
            ...rows.slice(0, position),
            (({ revision: _revision, ...rest }) => rest)(chore),
            ...rows.slice(position),
          ]);
        },
      },
    });
  };
  const field =
    "mt-1 w-full rounded-xl border bg-background px-3 py-2.5 text-base outline-none focus:ring-2 focus:ring-ring";
  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center gap-2">
        <Button
          variant={who === "all" ? "default" : "outline"}
          className="rounded-full"
          onClick={() => setWho("all")}
        >
          Todos
        </Button>
        {MEMBERS.map((member) => (
          <Button
            key={member.id}
            variant={who === member.id ? "default" : "outline"}
            onClick={() => setWho(member.id)}
            className="rounded-full"
          >
            <Avatar m={member} size="sm" />
            {member.name}
          </Button>
        ))}
        <Button
          onClick={() =>
            setDraft({ ...fresh(), memberId: who === "all" ? (MEMBERS[0]?.id ?? "") : who })
          }
          className="ml-auto rounded-full"
        >
          <Plus /> Nueva tarea
        </Button>
      </div>
      {!list.length && (
        <p className="rounded-2xl bg-card py-12 text-center text-muted-foreground">
          No hay tareas. Añade la primera para organizar el hogar.
        </p>
      )}
      {CHORE_GROUPS.map((group) => {
        const rows = list.filter((c) => whenLabel(c, today) === group);
        if (!rows.length) return null;
        return (
          <section key={group}>
            <h2 className="mb-3 font-display text-2xl font-bold">{group}</h2>
            <div
              className={cn(
                "grid gap-3",
                compact ? "grid-cols-1 min-[480px]:grid-cols-2" : "grid-cols-2 lg:grid-cols-3",
              )}
            >
              {rows.map((chore) => {
                const member = byId(chore.memberId);
                return (
                  <article
                    key={chore.id}
                    className={cn(
                      "flex min-h-36 flex-col justify-between rounded-3xl p-4 shadow-card",
                      chore.done ? memberBg[member.color] : "bg-card",
                    )}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className="flex min-w-0 items-center gap-2 text-xs">
                        <Avatar m={member} size="sm" />
                        <span className="truncate">{member.name}</span>
                      </span>
                      <div className="flex">
                        <Button
                          variant="ghost"
                          size="icon"
                          aria-label={`Editar ${chore.title}`}
                          onClick={() => setDraft({ ...chore })}
                        >
                          <Pencil className="size-4" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          aria-label={`Completar ${chore.title}`}
                          aria-pressed={chore.done}
                          onClick={() => void toggleChore(s, chore.id)}
                        >
                          {chore.done ? (
                            <Check />
                          ) : (
                            <span className="size-5 rounded-full border-2" />
                          )}
                        </Button>
                      </div>
                    </div>
                    <button
                      className={cn(
                        "my-3 text-left font-display text-lg font-bold break-words",
                        chore.done && "line-through opacity-60",
                      )}
                      onClick={() => void toggleChore(s, chore.id)}
                    >
                      {chore.title}
                    </button>
                    {chore.dueDate && (
                      <time className="text-xs text-muted-foreground" dateTime={chore.dueDate}>
                        {parseDate(chore.dueDate).toLocaleDateString("es", {
                          day: "numeric",
                          month: "short",
                        })}
                      </time>
                    )}
                  </article>
                );
              })}
            </div>
          </section>
        );
      })}
      <Dialog
        open={!!draft}
        onOpenChange={(open) => {
          if (!open && !busy) setDraft(null);
        }}
      >
        <DialogContent className="max-h-[90dvh] w-[calc(100%-2rem)] overflow-y-auto rounded-3xl">
          <DialogHeader>
            <DialogTitle>{isNew ? "Nueva tarea" : "Editar tarea"}</DialogTitle>
            <DialogDescription>Asigna una persona y una fecha real.</DialogDescription>
          </DialogHeader>
          {draft && (
            <form onSubmit={(event) => void save(event)} className="space-y-4">
              <label className="block text-sm font-semibold">
                Tarea
                <div className="flex items-center gap-2">
                  <input
                    required
                    maxLength={200}
                    aria-label="Título de la tarea"
                    value={draft.title}
                    onChange={(event) => setDraft({ ...draft, title: event.target.value })}
                    className={field}
                  />
                  <VoiceInput
                    label="tarea"
                    onText={(text) =>
                      setDraft((old) =>
                        old ? { ...old, title: appendDictation(old.title, text) } : old,
                      )
                    }
                  />
                </div>
              </label>
              <label className="block text-sm font-semibold">
                Persona
                <select
                  required
                  value={draft.memberId}
                  onChange={(event) => setDraft({ ...draft, memberId: event.target.value })}
                  className={field}
                >
                  {MEMBERS.map((member) => (
                    <option key={member.id} value={member.id}>
                      {member.name}
                    </option>
                  ))}
                </select>
              </label>
              <label className="block text-sm font-semibold">
                Fecha
                <input
                  type="date"
                  value={draft.dueDate ?? ""}
                  onChange={(event) => setDraft({ ...draft, dueDate: event.target.value || null })}
                  className={field}
                />
              </label>
              <div className="flex gap-2">
                {!isNew && (
                  <Button
                    type="button"
                    variant="ghost"
                    disabled={busy}
                    className="text-destructive"
                    onClick={() => void remove(draft)}
                  >
                    <Trash2 /> Eliminar
                  </Button>
                )}
                <Button
                  type="submit"
                  disabled={busy || !draft.title.trim() || !draft.memberId}
                  className="ml-auto"
                >
                  {busy ? "Guardando…" : "Guardar"}
                </Button>
              </div>
            </form>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}

export function Shopping({
  s,
  createRequest = 0,
}: {
  s: HubState;
  compact: boolean;
  createRequest?: number;
}) {
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);
  const input = useRef<HTMLInputElement>(null);
  useEffect(() => {
    if (createRequest) input.current?.focus();
  }, [createRequest]);
  const add = async (event: React.FormEvent) => {
    event.preventDefault();
    if (busy || !name.trim()) return;
    const item = { id: crypto.randomUUID(), name: name.trim(), done: false };
    if (
      s.items.some((row) => row.name.trim().toLocaleLowerCase() === item.name.toLocaleLowerCase())
    ) {
      toast.info("Ese producto ya está en la lista.");
      return;
    }
    setBusy(true);
    const saved = await s.setItems((rows) => addShoppingItem(rows, item));
    setBusy(false);
    if (saved) {
      setName("");
      input.current?.focus();
    }
  };
  const remove = async (item: ShopItem) => {
    const position = s.items.findIndex((row) => row.id === item.id);
    if (!(await s.setItems((rows) => rows.filter((row) => row.id !== item.id)))) return;
    toast(`"${item.name}" eliminado`, {
      action: {
        label: "Deshacer",
        onClick: () => {
          void s.setItems((rows) => [
            ...rows.slice(0, position),
            { id: item.id, name: item.name, done: item.done },
            ...rows.slice(position),
          ]);
        },
      },
    });
  };
  const toggle = (id: string) => {
    void s.setItems((rows) =>
      rows.map((row) => (row.id === id ? { ...row, done: !row.done } : row)),
    );
  };
  return (
    <div className="mx-auto max-w-2xl space-y-4">
      <form
        onSubmit={(event) => void add(event)}
        className="flex items-center gap-2 rounded-2xl bg-card p-2 pl-4 shadow-card"
      >
        <input
          ref={input}
          maxLength={150}
          aria-label="Producto"
          value={name}
          onChange={(event) => setName(event.target.value)}
          placeholder="Añadir producto"
          className="min-w-0 flex-1 bg-transparent text-base outline-none"
        />
        <VoiceInput
          label="producto"
          onText={(text) => setName((old) => appendDictation(old, text))}
        />
        <Button
          type="submit"
          size="icon"
          disabled={busy || !name.trim()}
          aria-label="Añadir producto"
          className="size-11 shrink-0 rounded-xl"
        >
          <Plus />
        </Button>
      </form>
      <ul className="divide-y divide-border">
        {s.items.map((item) => (
          <li key={item.id} className="flex items-center gap-2 py-1">
            <Button
              variant="ghost"
              aria-label={item.name}
              aria-pressed={item.done}
              onClick={() => toggle(item.id)}
              className="h-auto min-w-0 flex-1 justify-start gap-3 whitespace-normal rounded-xl px-2 py-3 text-left"
            >
              <span
                className={cn(
                  "grid size-6 shrink-0 place-items-center rounded-full border-2",
                  item.done ? "border-success-strong bg-success" : "border-foreground/25",
                )}
              >
                {item.done && <Check />}
              </span>
              <span
                className={cn(
                  "min-w-0 break-words text-base",
                  item.done && "text-muted-foreground line-through",
                )}
              >
                {item.name}
              </span>
            </Button>
            <Button
              variant="ghost"
              size="icon"
              aria-label={`Eliminar ${item.name}`}
              onClick={() => void remove(item)}
            >
              <Trash2 />
            </Button>
          </li>
        ))}
      </ul>
      {!s.items.length && (
        <p className="rounded-2xl bg-card py-12 text-center text-muted-foreground">
          Tu lista de compras está vacía.
        </p>
      )}
    </div>
  );
}
