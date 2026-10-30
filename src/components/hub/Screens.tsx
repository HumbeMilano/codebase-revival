import { useCallback, useEffect, useRef, useState } from "react";
import { Check, Pencil, PiggyBank, Plus, Receipt, Trash2, X } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { NativeInputShortcut } from "./NativeInputShortcut";
import type { Contribution, LedgerBill } from "@/lib/ledger";
import { Avatar } from "./Kiosk";
import type { FamilyEvent, FamilyNote } from "./planner-data";
import {
  MEMBERS,
  memberBg,
  type Chore,
  type Member,
  type ShopItem,
  type ShoppingList,
} from "./data";
import { bindHubPersistence, HOUSEHOLD_ID } from "@/lib/hub-db";
import { supabase } from "@/integrations/supabase/client";
import { hasFinanceToken, isDeviceMode } from "@/lib/db";
import {
  usePersistedCollection,
  type PersistedSetter,
  type SyncGuard,
} from "@/lib/persisted-collection";
import { persistenceErrorMessage } from "@/lib/persistence-errors";
import { dateKey, parseDate } from "./planner-data";
import { useToday } from "@/hooks/use-today";
import { isChoreArchived } from "@/lib/chore-archive";
import { useClock } from "./Kiosk";
import { useOfflineShopping } from "@/hooks/use-offline-shopping";
import type { ShoppingContext } from "@/lib/offline-shopping";
import { db } from "@/lib/db";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

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
  financesLoading?: boolean;
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
  shoppingLists?: ShoppingList[];
  setShoppingLists?: PersistedSetter<ShoppingList[]>;
  shoppingSync?: ReturnType<typeof useOfflineShopping>;
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
  shoppingContext = null,
}: {
  includeFinances?: boolean;
  onContextRefresh?: () => Promise<void>;
  shoppingContext?: ShoppingContext | null;
} = {}): HubState {
  const shopping = useOfflineShopping(shoppingContext, db());
  const { replace: replaceOfflineShopping, snapshotRevision } = shopping;
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
  const [shoppingLists, setShoppingLists, setShoppingListsRaw, listStatus] = usePersistedCollection<
    ShoppingList[]
  >([], binding.syncLists, guard, saveError);
  const [bills, setBills, setBillsRaw, billStatus] = usePersistedCollection<LedgerBill[]>(
    [],
    binding.syncBills,
    guard,
    saveError,
  );
  const [contributions, setContributions, setContributionsRaw, contributionStatus] =
    usePersistedCollection<Contribution[]>([], binding.syncContributions, guard, saveError);
  const [loading, setLoading] = useState(true);
  const [financialLoaded, setFinancialLoaded] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const finances = useRef(includeFinances);
  const previousFinanceAccess = useRef(includeFinances);
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
        withFinances = finances.current && (!isDeviceMode() || hasFinanceToken());
      const currentRequest = () =>
        active &&
        !guard.pending &&
        revision === guard.revision &&
        id === request &&
        withFinances === finances.current &&
        (!withFinances || !isDeviceMode() || hasFinanceToken());
      try {
        const shoppingRevision = shoppingContext ? await snapshotRevision() : undefined;
        if (!currentRequest()) return;
        const data = await binding.load({ includeFinances: withFinances });
        if (!currentRequest()) return;
        setEventsRaw(data.events);
        setNotesRaw(data.notes);
        setChoresRaw(data.chores);
        if (shoppingContext)
          await replaceOfflineShopping(data.items, data.shoppingLists, shoppingRevision);
        else setItemsRaw(data.items);
        if (!currentRequest()) return;
        setShoppingListsRaw(data.shoppingLists);
        setBillsRaw(data.bills);
        setContributionsRaw(data.contributions);
        if (withFinances) setFinancialLoaded(true);
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
              table: "shopping_lists",
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
    setShoppingListsRaw,
    setBillsRaw,
    setContributionsRaw,
    shoppingContext,
    replaceOfflineShopping,
    snapshotRevision,
  ]);
  useEffect(() => {
    if (!includeFinances) {
      setFinancialLoaded(false);
      setBillsRaw([]);
      setContributionsRaw([]);
    }
    if (previousFinanceAccess.current !== includeFinances) {
      previousFinanceAccess.current = includeFinances;
      void guard.queue.then(refresh);
    }
  }, [includeFinances, guard, refresh, setBillsRaw, setContributionsRaw]);
  const statuses = [
    eventStatus,
    noteStatus,
    choreStatus,
    itemStatus,
    listStatus,
    billStatus,
    contributionStatus,
  ];
  const lastSavedAt = Math.max(...statuses.map((status) => status.lastSavedAt ?? 0)) || null;
  const writeError = statuses.find((status) => status.error)?.error;
  return {
    loading,
    financesLoading: includeFinances && !financialLoaded,
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
    items: shoppingContext ? shopping.items : items,
    setItems: shoppingContext ? shopping.setItems : setItems,
    shoppingLists: shoppingContext ? shopping.lists : shoppingLists,
    setShoppingLists: shoppingContext ? shopping.setLists : setShoppingLists,
    ...(shoppingContext ? { shoppingSync: shopping } : {}),
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
  const [taskView, setTaskView] = useState<"active" | "archived">("active");
  const now = useClock();
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
  const list = s.chores.filter(
    (c) =>
      (who === "all" || c.memberId === who) &&
      isChoreArchived(c, now ?? Date.now()) === (taskView === "archived"),
  );
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
      <div className="flex flex-wrap items-center gap-2" aria-label="Vista de tareas">
        <Button
          variant={taskView === "active" ? "default" : "outline"}
          onClick={() => setTaskView("active")}
          className="rounded-full"
        >
          Actuales
        </Button>
        <Button
          variant={taskView === "archived" ? "default" : "outline"}
          onClick={() => setTaskView("archived")}
          className="rounded-full"
        >
          Archivadas
        </Button>
      </div>
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
          {taskView === "archived"
            ? "No hay tareas archivadas."
            : "No hay tareas. Añade la primera para organizar el hogar."}
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
            <DialogDescription className="sr-only">
              Asigna una persona y una fecha real.
            </DialogDescription>
          </DialogHeader>
          {draft && (
            <form onSubmit={(event) => void save(event)} className="space-y-4">
              <div className="block text-sm font-semibold">
                <label htmlFor="chore-title">Tarea</label>
                <div className="flex items-center gap-2">
                  <input
                    required
                    maxLength={200}
                    id="chore-title"
                    aria-label="Título de la tarea"
                    value={draft.title}
                    onChange={(event) => setDraft({ ...draft, title: event.target.value })}
                    className={cn(field, "min-w-0 flex-1")}
                  />
                  <NativeInputShortcut targetId="chore-title" />
                </div>
              </div>
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

export { Shopping } from "./ShoppingLists";
