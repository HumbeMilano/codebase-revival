import { useMemo, useState } from "react";
import { ArrowUpRight, Check, ListChecks, PiggyBank, Plus, Receipt, ShoppingBasket, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { canViewFinances } from "@/lib/finance-visibility";
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

export function Dashboard({ s, user, compact, go, adultAuthorized = false }: { s: HubState; user: Member; compact: boolean; go: (t: "chores" | "shopping" | "finance") => void; adultAuthorized?: boolean }) {
  const today = s.chores.filter((c) => c.when === "Hoy");
  const remaining = today.filter((c) => !c.done).length;
  const pending = s.items.filter((i) => !i.done).length;
  const now = new Date();
  const financialAccess = canViewFinances(user.role, adultAuthorized);
  const sum = financialAccess ? monthSummary(s.bills, s.contributions, monthKey(now.getFullYear(), now.getMonth()), now, MEMBERS.map((m) => m.id)) : null;
  const agenda = today.map((c) => ({ ...c, time: AGENDA_TIMES[c.id] ?? "—", m: byId(c.memberId) }));

  return (
    <div className="space-y-5">
      <div className="flex items-end justify-between gap-3">
        <h2 className="font-display text-3xl font-extrabold">Hola, {user.name}</h2>
        <span className="shrink-0 text-sm font-semibold capitalize text-muted-foreground">{now.toLocaleDateString("es", { day: "numeric", month: "short" })}</span>
      </div>

      <div className="grid grid-cols-2 gap-3">
        {[{ label: "Tareas", n: remaining, Icon: ListChecks, tone: "bg-success text-success-foreground", tab: "chores" as const, done: today.filter((c) => c.done).length, total: today.length },
          { label: "Compras", n: pending, Icon: ShoppingBasket, tone: "bg-accent text-accent-foreground", tab: "shopping" as const, done: s.items.filter((i) => i.done).length, total: s.items.length }].map(({ label, n, Icon, tone, tab, done, total }) => (
          <Button key={label} variant="ghost" onClick={() => go(tab)} className={cn("h-auto min-w-0 flex-col items-stretch gap-2 rounded-3xl p-4 shadow-card hover:opacity-90", tone)}>
            <span className="flex items-center justify-between"><Icon className="size-5" /><ArrowUpRight className="size-4 opacity-50" /></span>
            <span className="text-left font-display text-6xl font-extrabold tabular">{n}</span>
            <span className="flex items-center justify-between text-sm font-bold"><span>{label}</span><span className="text-xs opacity-60">{done}/{total} ✓</span></span>
            <span className="flex h-1.5 gap-1" aria-hidden="true">{Array.from({ length: total }, (_, i) => <span key={i} className={cn("flex-1 rounded-full bg-foreground", i >= done && "opacity-15")} />)}</span>
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
                return <Button key={m.id} variant="ghost" onClick={() => go("chores")} className="h-auto min-w-0 flex-col gap-1 rounded-2xl px-0 py-2">
                  <Ring pct={list.length ? done / list.length : 1} size={compact ? 52 : 64} stroke={4} className="text-success-strong"><Avatar m={m} /></Ring>
                  <span className="text-xs font-semibold">{m.name}</span>
                </Button>;
              })}
            </div>
          </section>

          <section>
            <h3 className="mb-2 font-display text-lg font-bold">Hoy</h3>
            <div className="divide-y divide-border">
              {agenda.map((c) => <Button key={c.id} variant="ghost" aria-label={c.title} onClick={() => toggleChore(s, c.id)} className="h-auto w-full justify-start gap-3 whitespace-normal rounded-xl px-1 py-3 text-left">
                <span className="w-10 shrink-0 text-xs tabular text-muted-foreground">{c.time}</span>
                <Avatar m={c.m} size="sm" />
                <span className={cn("min-w-0 flex-1 text-sm font-semibold", c.done && "text-muted-foreground line-through")}>{c.title}</span>
                <span className={cn("grid size-6 shrink-0 place-items-center rounded-full border", c.done ? "border-success-strong bg-success text-success-foreground" : "border-foreground/25")}>{c.done && <Check />}</span>
              </Button>)}
            </div>
          </section>
        </div>

        <aside className="space-y-5">
          {sum && <Button variant="ghost" onClick={() => go("finance")} className="h-auto w-full justify-between gap-4 rounded-3xl bg-primary p-5 text-primary-foreground shadow-card hover:bg-primary/90">
            <span className="min-w-0 space-y-1 text-left">
              <span className="block text-xs font-semibold opacity-70">Fondo común <ArrowUpRight className="inline size-3" /></span>
              <span className="block font-display text-3xl font-extrabold tabular">{money(sum.contributed - sum.paid)}</span>
              <span className="block text-xs opacity-70">{sum.pendingCount} bills pendientes</span>
            </span>
            <Ring pct={sum.total ? sum.paid / sum.total : 0} size={72} stroke={6} className="text-success"><span className="text-sm font-bold tabular">{Math.round(sum.total ? sum.paid / sum.total * 100 : 0)}%</span></Ring>
          </Button>}

          <section>
            <h3 className="mb-2 font-display text-lg font-bold">Próximos</h3>
            <div className="space-y-2">
              {EVENTS.map((e) => <div key={e.id} className="flex items-center gap-3 rounded-2xl bg-card p-3 shadow-card">
                <Avatar m={byId(e.memberId)} size="sm" />
                <div className="min-w-0 flex-1"><p className="text-sm font-semibold">{e.title}</p><p className="text-xs text-muted-foreground">{e.when}</p></div>
              </div>)}
            </div>
          </section>
        </aside>
      </div>
    </div>
  );
}

export function Chores({ s, compact }: { s: HubState; compact: boolean }) {
  const [who, setWho] = useState<string>("all");
  const list = s.chores.filter((c) => who === "all" || c.memberId === who);
  const groups = ["Hoy", "Mañana"];
  return (
    <div className="space-y-5">
      <div className="flex flex-wrap gap-2">
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

const AISLE_TONE: Record<string, string> = {
  "Frutas y verduras": "bg-success",
  "Lácteos y nevera": "bg-sky",
  Despensa: "bg-accent",
  Limpieza: "bg-lilac",
};

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
  const toggle = (id: string) => s.setItems((xs) => xs.map((x) => (x.id === id ? { ...x, done: !x.done } : x)));
  const inCart = s.items.filter((i) => i.done);
  const pct = s.items.length ? inCart.length / s.items.length : 0;

  return (
    <div className="space-y-6">
      {/* Progress hero + composer */}
      <div className={cn("grid gap-3", compact ? "grid-cols-1" : "grid-cols-[1fr_1.4fr]")}>
        <div className="rounded-[2rem] bg-primary p-6 text-primary-foreground shadow-card">
          <p className="text-xs font-bold uppercase tracking-[0.18em] opacity-60">En el carrito</p>
          <p className="mt-2 font-display text-6xl font-extrabold tracking-tight tabular">{inCart.length}<span className="text-3xl opacity-50">/{s.items.length}</span></p>
          <div className="mt-4 flex h-3 gap-1">
            {s.items.map((i) => <span key={i.id} className={cn("flex-1 rounded-full transition", i.done ? "bg-success" : "bg-primary-foreground/15")} />)}
          </div>
          <p className="mt-2 text-sm opacity-70">{pct === 1 ? "¡Todo listo! 🎉" : `Faltan ${s.items.length - inCart.length} productos`}</p>
        </div>
        <form onSubmit={add} className="flex flex-col justify-between gap-3 rounded-[2rem] bg-card p-4 shadow-card">
          <div className="flex items-center gap-2 rounded-2xl bg-secondary p-1.5 pl-4">
            <input value={name} onChange={(e) => setName(e.target.value)} placeholder="¿Qué falta en casa?" className="min-w-0 flex-1 bg-transparent font-display text-lg font-semibold outline-none placeholder:text-muted-foreground" />
            <button className="grid size-11 place-items-center rounded-xl bg-primary text-primary-foreground transition active:scale-95" aria-label="Añadir"><Plus className="size-5" /></button>
          </div>
          <div className="flex flex-wrap gap-2">
            {AISLES.map((a) => (
              <button type="button" key={a} onClick={() => setAisle(a)} className={cn("rounded-full px-3.5 py-1.5 text-xs font-bold transition", aisle === a ? "bg-primary text-primary-foreground" : cn(AISLE_TONE[a], "opacity-80 hover:opacity-100"))}>{a}</button>
            ))}
          </div>
        </form>
      </div>

      {/* Aisle columns */}
      <div className={cn("gap-3", compact ? "space-y-5" : "grid grid-cols-4")}>
        {AISLES.map((a) => {
          const list = s.items.filter((i) => i.aisle === a && !i.done);
          return (
            <section key={a} className={cn(!compact && "rounded-[1.75rem] bg-card/60 p-2")}>
              <div className="mb-2 flex items-center gap-2 px-2 pt-1">
                <span className={cn("size-3 rounded-full", AISLE_TONE[a])} />
                <h3 className="flex-1 text-xs font-bold uppercase tracking-[0.14em] text-muted-foreground">{a}</h3>
                <span className="text-xs font-bold tabular text-muted-foreground">{list.length}</span>
              </div>
              <div className={cn(compact ? "flex flex-wrap gap-2" : "space-y-2")}>
                {list.map((i) => (
                  <div key={i.id} className={cn("group flex items-center gap-1 rounded-2xl bg-card shadow-card", compact ? "pl-1" : "p-1")}>
                    <button onClick={() => toggle(i.id)} className="flex flex-1 items-center gap-2.5 px-2 py-2.5 text-left text-sm font-semibold">
                      <span className={cn("size-5 shrink-0 rounded-full border-2 border-foreground/25 transition group-hover:border-foreground")} />
                      {i.name}
                    </button>
                    <button onClick={() => remove(i)} aria-label={`Eliminar ${i.name}`} className="grid size-8 place-items-center rounded-xl text-muted-foreground opacity-50 hover:bg-destructive-soft hover:text-destructive group-hover:opacity-100">
                      <Trash2 className="size-3.5" />
                    </button>
                  </div>
                ))}
                {!list.length && <p className="px-2 py-3 text-xs text-muted-foreground">Nada pendiente</p>}
              </div>
            </section>
          );
        })}
      </div>

      {/* Cart tray */}
      {inCart.length > 0 && (
        <section className="rounded-[1.75rem] border-2 border-dashed border-foreground/10 p-4">
          <h3 className="mb-3 flex items-center gap-2 text-xs font-bold uppercase tracking-[0.14em] text-muted-foreground"><Check className="size-4" /> Ya en el carrito · toca para devolver</h3>
          <div className="flex flex-wrap gap-2">
            {inCart.map((i) => (
              <button key={i.id} onClick={() => toggle(i.id)} className={cn("rounded-full px-3.5 py-1.5 text-sm font-semibold line-through opacity-70 transition hover:opacity-100", AISLE_TONE[i.aisle])}>{i.name}</button>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}
