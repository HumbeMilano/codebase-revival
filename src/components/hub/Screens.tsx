import { useMemo, useState } from "react";
import { ArrowUpRight, Check, ListChecks, Lock, PiggyBank, Plus, Receipt, ShoppingBasket, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { monthKey, monthSummary, type Contribution, type LedgerBill } from "@/lib/ledger";
import { Avatar } from "./Kiosk";
import {
  AISLES, BILLS, CHORES, CONTRIBUTIONS, EVENTS, MEMBERS, SHOPPING, memberBg,
  type Chore, type Member, type ShopItem,
} from "./data";

const money = (n: number) => n.toLocaleString("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 });
const byId = (id: string): Member => MEMBERS.find((m) => m.id === id) ?? MEMBERS[0]!;

export function Card({ title, action, children, className }: { title?: string; action?: React.ReactNode; children: React.ReactNode; className?: string }) {
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
  chores: Chore[];
  setChores: React.Dispatch<React.SetStateAction<Chore[]>>;
  items: ShopItem[];
  setItems: React.Dispatch<React.SetStateAction<ShopItem[]>>;
  bills: LedgerBill[];
  setBills: React.Dispatch<React.SetStateAction<LedgerBill[]>>;
  contributions: Contribution[];
  setContributions: React.Dispatch<React.SetStateAction<Contribution[]>>;
}

export function useHubState(): HubState {
  const [chores, setChores] = useState(CHORES);
  const [items, setItems] = useState(SHOPPING);
  const [bills, setBills] = useState(BILLS);
  const [contributions, setContributions] = useState(CONTRIBUTIONS);
  return { chores, setChores, items, setItems, bills, setBills, contributions, setContributions };
}

function ChoreRow({ c, onToggle }: { c: Chore; onToggle: () => void }) {
  const m = byId(c.memberId);
  return (
    <button onClick={onToggle} className="flex w-full items-center gap-3 rounded-2xl bg-secondary p-3 text-left transition hover:bg-secondary active:scale-[0.99]">
      <Avatar m={m} size="sm" />
      <div className="min-w-0 flex-1">
        <p className={cn("truncate text-sm font-semibold", c.done && "text-muted-foreground line-through")}>{c.title}</p>
        <p className="text-xs text-muted-foreground">{m.name} · {c.when}</p>
      </div>
      <span className={cn("grid size-7 place-items-center rounded-full border-2 transition", c.done ? "border-primary bg-primary text-primary-foreground" : "border-muted-foreground/40")}>
        {c.done && <Check className="size-4" />}
      </span>
    </button>
  );
}

const toggleChore = (s: HubState, id: string) =>
  s.setChores((cs) => cs.map((c) => (c.id === id ? { ...c, done: !c.done } : c)));

export function Ring({ pct, size = 64, stroke = 6, className, children }: { pct: number; size?: number; stroke?: number; className?: string; children?: React.ReactNode }) {
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  return (
    <div className={cn("relative grid shrink-0 place-items-center", className)} style={{ width: size, height: size }}>
      <svg className="absolute inset-0 -rotate-90" width={size} height={size}>
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="currentColor" strokeWidth={stroke} className="opacity-15" />
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="currentColor" strokeWidth={stroke} strokeLinecap="round" strokeDasharray={c} strokeDashoffset={c * (1 - Math.min(1, Math.max(0, pct)))} className="transition-all duration-700" />
      </svg>
      {children}
    </div>
  );
}

const AGENDA_TIMES: Record<string, string> = { c1: "08:00", c2: "13:30", c3: "18:00" };

export function Dashboard({ s, user, compact, go }: { s: HubState; user: Member; compact: boolean; go: (t: "chores" | "shopping" | "finance") => void }) {
  const today = s.chores.filter((c) => c.when === "Hoy");
  const pending = s.items.filter((i) => !i.done);
  const now = new Date();
  const sum = monthSummary(s.bills, s.contributions, monthKey(now.getFullYear(), now.getMonth()), now, MEMBERS.map((m) => m.id));
  const pct = sum.total ? sum.paid / sum.total : 0;
  const dateLabel = now.toLocaleDateString("es", { weekday: "long", day: "numeric", month: "long" });

  const agenda = [
    ...today.map((c) => ({ id: c.id, time: AGENDA_TIMES[c.id] ?? "—", title: c.title, m: byId(c.memberId), done: c.done, chore: true })),
    { id: "e0", time: "19:30", title: "Cena en familia", m: byId("mama"), done: false, chore: false },
  ].sort((a, b) => a.time.localeCompare(b.time));

  const quick = [
    { label: "Compra", icon: ShoppingBasket, tone: "bg-accent text-accent-foreground", t: "shopping" as const },
    { label: "Tarea", icon: ListChecks, tone: "bg-success text-success-foreground", t: "chores" as const },
    { label: "Bill", icon: Receipt, tone: "bg-sky", t: "finance" as const },
    { label: "Aporte", icon: PiggyBank, tone: "bg-lilac", t: "finance" as const },
  ];

  return (
    <div className={cn("grid gap-6", compact ? "grid-cols-1" : "grid-cols-[1fr_340px]")}>
      <div className="min-w-0 space-y-6">
        {/* Typographic hero — no card */}
        <div className="pt-1">
          <p className="text-sm font-semibold uppercase tracking-[0.18em] text-muted-foreground first-letter:uppercase">{dateLabel}</p>
          <h2 className={cn("mt-1 font-display font-extrabold leading-[0.9] tracking-[-0.04em]", compact ? "text-5xl" : "text-7xl")}>
            Hola {user.name},<br />
            <span className="text-muted-foreground">quedan </span>
            <button onClick={() => go("chores")} className="underline decoration-success-strong decoration-[6px] underline-offset-[6px]">{today.filter((c) => !c.done).length} tareas</button>
            <span className="text-muted-foreground"> y </span>
            <button onClick={() => go("shopping")} className="underline decoration-accent decoration-[6px] underline-offset-[6px]">{pending.length} compras</button>
          </h2>
        </div>

        {/* Family progress rings */}
        <section>
          <h3 className="mb-3 text-xs font-bold uppercase tracking-[0.18em] text-muted-foreground">La familia hoy</h3>
          <div className="-mx-1 flex gap-3 overflow-x-auto px-1 pb-1">
            {MEMBERS.map((m) => {
              const list = s.chores.filter((c) => c.memberId === m.id);
              const done = list.filter((c) => c.done).length;
              return (
                <button key={m.id} onClick={() => go("chores")} className="flex min-w-[132px] flex-1 flex-col items-center gap-2 rounded-[1.75rem] bg-card px-3 py-4 shadow-card transition hover:-translate-y-0.5">
                  <Ring pct={list.length ? done / list.length : 1} size={72} stroke={5} className="text-foreground">
                    <Avatar m={m} />
                  </Ring>
                  <span className="text-sm font-bold">{m.name}</span>
                  <span className="text-xs text-muted-foreground tabular">{done}/{list.length} hechas</span>
                </button>
              );
            })}
          </div>
        </section>

        {/* Timeline */}
        <section>
          <h3 className="mb-3 text-xs font-bold uppercase tracking-[0.18em] text-muted-foreground">Agenda de hoy</h3>
          <ol className="relative space-y-1 before:absolute before:bottom-3 before:left-[58px] before:top-3 before:w-px before:bg-border">
            {agenda.map((a) => (
              <li key={a.id}>
                <button
                  disabled={!a.chore}
                  onClick={() => a.chore && toggleChore(s, a.id)}
                  className="group flex w-full items-center gap-4 rounded-2xl py-2 pr-2 text-left transition hover:bg-card"
                >
                  <span className="w-11 text-right font-display text-sm font-bold tabular text-muted-foreground">{a.time}</span>
                  <span className={cn("relative z-10 size-3.5 shrink-0 rounded-full ring-4 ring-background", a.done ? "bg-success-strong" : memberBg[a.m.color])} />
                  <span className="min-w-0 flex-1">
                    <span className={cn("block truncate font-semibold", a.done && "text-muted-foreground line-through")}>{a.title}</span>
                    <span className="text-xs text-muted-foreground">{a.m.name}{a.chore ? " · toca para marcar" : " · evento"}</span>
                  </span>
                  {a.done && <Check className="size-4 text-success-foreground" />}
                </button>
              </li>
            ))}
          </ol>
        </section>
      </div>

      <aside className="space-y-4">
        {/* Money gauge */}
        <button onClick={() => go("finance")} className="relative w-full overflow-hidden rounded-[2rem] bg-primary p-6 text-left text-primary-foreground shadow-card transition active:scale-[0.99]">
          <div className="flex items-center justify-between text-xs font-bold uppercase tracking-[0.18em] opacity-60">
            <span>Bills de {now.toLocaleDateString("es", { month: "long" })}</span>
            {user.role !== "admin" && <Lock className="size-4" />}
          </div>
          <div className="mt-4 flex items-center gap-5">
            <Ring pct={pct} size={112} stroke={10} className="text-success">
              <span className="font-display text-2xl font-extrabold tabular">{Math.round(pct * 100)}%</span>
            </Ring>
            <div className="space-y-2">
              <div>
                <p className="text-xs opacity-60">Pagado</p>
                <p className="font-display text-2xl font-extrabold tabular">{money(sum.paid)}</p>
              </div>
              <div>
                <p className="text-xs opacity-60">Total del mes</p>
                <p className="font-display text-lg font-bold tabular opacity-80">{money(sum.total)}</p>
              </div>
            </div>
          </div>
          <div className="mt-5 flex items-center justify-between rounded-2xl bg-primary-foreground/10 px-4 py-3 text-sm">
            <span>{sum.pendingCount} pendientes</span>
            <span className="flex items-center gap-1 font-semibold">Ver <ArrowUpRight className="size-4" /></span>
          </div>
        </button>

        {/* Quick actions */}
        <div>
          <h3 className="mb-3 text-xs font-bold uppercase tracking-[0.18em] text-muted-foreground">Añadir rápido</h3>
          <div className="grid grid-cols-4 gap-2">
            {quick.map(({ label, icon: Icon, tone, t }) => (
              <button key={label} onClick={() => go(t)} className="flex flex-col items-center gap-1.5">
                <span className={cn("grid aspect-square w-full place-items-center rounded-[1.25rem] transition hover:scale-105", tone)}>
                  <Icon className="size-6" />
                </span>
                <span className="text-xs font-semibold">{label}</span>
              </button>
            ))}
          </div>
        </div>

        {/* Upcoming as stacked tickets */}
        <div>
          <h3 className="mb-3 text-xs font-bold uppercase tracking-[0.18em] text-muted-foreground">Esta semana</h3>
          <div className="space-y-2">
            {EVENTS.map((e) => {
              const m = byId(e.memberId);
              const [day, hour] = e.when.split(" · ");
              return (
                <div key={e.id} className="flex items-stretch overflow-hidden rounded-2xl bg-card shadow-card">
                  <span className={cn("grid w-16 place-items-center px-2 text-center font-display text-xs font-bold leading-tight", memberBg[m.color])}>{day}</span>
                  <div className="flex-1 px-4 py-3">
                    <p className="text-sm font-semibold">{e.title}</p>
                    <p className="text-xs text-muted-foreground">{hour ?? "Todo el día"} · {m.name}</p>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </aside>
    </div>
  );
}

export function Chores({ s, compact }: { s: HubState; compact: boolean }) {
  const [who, setWho] = useState<string>("all");
  const list = s.chores.filter((c) => who === "all" || c.memberId === who);
  const groups = ["Hoy", "Mañana"];
  return (
    <div className="space-y-5">
      <div className="-mx-1 flex gap-2 overflow-x-auto px-1">
        <button onClick={() => setWho("all")} className={cn("rounded-full px-4 py-2 text-sm font-semibold transition", who === "all" ? "bg-primary text-primary-foreground" : "bg-card shadow-card")}>Todos</button>
        {MEMBERS.map((m) => (
          <button key={m.id} onClick={() => setWho(m.id)} className={cn("flex items-center gap-2 rounded-full py-1.5 pl-1.5 pr-4 text-sm font-semibold transition", who === m.id ? "bg-primary text-primary-foreground" : "bg-card shadow-card")}>
            <Avatar m={m} size="sm" /> {m.name}
          </button>
        ))}
      </div>
      {groups.map((g) => {
        const items = list.filter((c) => c.when === g);
        if (!items.length) return null;
        return (
          <section key={g}>
            <h3 className="mb-3 font-display text-2xl font-extrabold tracking-tight">{g}</h3>
            <div className={cn("grid gap-3", compact ? "grid-cols-2" : "grid-cols-3")}>
              {items.map((c) => {
                const m = byId(c.memberId);
                return (
                  <button key={c.id} onClick={() => toggleChore(s, c.id)} className={cn("flex aspect-[4/3] flex-col justify-between rounded-[1.75rem] p-4 text-left shadow-card transition active:scale-[0.98]", c.done ? memberBg[m.color] : "bg-card")}>
                    <div className="flex items-start justify-between">
                      <Avatar m={m} size="sm" />
                      <span className={cn("grid size-8 place-items-center rounded-full border-2 transition", c.done ? "border-foreground bg-foreground text-background" : "border-foreground/20")}>
                        {c.done && <Check className="size-4" />}
                      </span>
                    </div>
                    <p className={cn("font-display text-lg font-bold leading-tight", c.done && "line-through opacity-60")}>{c.title}</p>
                  </button>
                );
              })}
            </div>
          </section>
        );
      })}
    </div>
  );
}

export function Shopping({ s, compact }: { s: HubState; compact: boolean }) {
  const [name, setName] = useState("");
  const [aisle, setAisle] = useState<string>(AISLES[0] ?? "Despensa");

  const add = (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;
    s.setItems((xs) => [...xs, { id: crypto.randomUUID(), name: name.trim(), aisle, done: false }]);
    setName("");
  };
  const remove = (item: ShopItem) => {
    s.setItems((xs) => xs.filter((x) => x.id !== item.id));
    toast(`"${item.name}" eliminado`, {
      action: { label: "Deshacer", onClick: () => s.setItems((xs) => [...xs, item]) },
    });
  };

  return (
    <div className="space-y-4">
      <form onSubmit={add} className="flex gap-2 rounded-[1.75rem] bg-card p-2 shadow-card">
        <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Añadir producto…" className="min-w-0 flex-1 bg-transparent px-3 text-sm outline-none placeholder:text-muted-foreground" />
        {!compact && (
          <select value={aisle} onChange={(e) => setAisle(e.target.value)} className="rounded-xl bg-secondary px-3 text-sm outline-none">
            {AISLES.map((a) => <option key={a}>{a}</option>)}
          </select>
        )}
        <button className="grid size-10 place-items-center rounded-2xl bg-primary text-primary-foreground transition active:scale-95" aria-label="Añadir">
          <Plus className="size-5" />
        </button>
      </form>
      <div className={cn("grid gap-4", compact ? "grid-cols-1" : "grid-cols-2")}>
        {AISLES.map((a) => {
          const list = s.items.filter((i) => i.aisle === a);
          if (!list.length) return null;
          return (
            <Card key={a} title={a}>
              <ul className="space-y-1">
                {list.map((i) => (
                  <li key={i.id} className="group flex items-center gap-3 rounded-xl px-2 py-2 hover:bg-secondary">
                    <button
                      onClick={() => s.setItems((xs) => xs.map((x) => (x.id === i.id ? { ...x, done: !x.done } : x)))}
                      className="flex flex-1 items-center gap-3 text-left text-sm"
                    >
                      <span className={cn("grid size-6 place-items-center rounded-lg border-2", i.done ? "border-primary bg-primary text-primary-foreground" : "border-muted-foreground/40")}>
                        {i.done && <Check className="size-3.5" />}
                      </span>
                      <span className={cn(i.done && "text-muted-foreground line-through")}>{i.name}</span>
                    </button>
                    <button onClick={() => remove(i)} aria-label={`Eliminar ${i.name}`} className="text-muted-foreground opacity-60 hover:text-destructive group-hover:opacity-100">
                      <Trash2 className="size-4" />
                    </button>
                  </li>
                ))}
              </ul>
            </Card>
          );
        })}
      </div>
    </div>
  );
}

