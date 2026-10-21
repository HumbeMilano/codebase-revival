import { useMemo, useState } from "react";
import { ArrowUpRight, Check, ListChecks, PiggyBank, Plus, Receipt, ShoppingBasket, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { VoiceInput } from "./VoiceInput";
import { appendDictation } from "@/lib/dictation";
import { canViewFinances } from "@/lib/finance-visibility";
import { monthKey, monthSummary, type Contribution, type LedgerBill } from "@/lib/ledger";
import { Avatar } from "./Kiosk";
import { DEMO_EVENTS, eventWhen, type FamilyEvent, type FamilyNote } from "./planner-data";
import {
  BILLS, CHORES, CONTRIBUTIONS, MEMBERS, SHOPPING, memberBg,
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
  events: FamilyEvent[];
  setEvents: React.Dispatch<React.SetStateAction<FamilyEvent[]>>;
  notes: FamilyNote[];
  setNotes: React.Dispatch<React.SetStateAction<FamilyNote[]>>;
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
  const [events, setEvents] = useState(DEMO_EVENTS);
  const [notes, setNotes] = useState<FamilyNote[]>([]);
  const [chores, setChores] = useState(CHORES);
  const [items, setItems] = useState(SHOPPING);
  const [bills, setBills] = useState(BILLS);
  const [contributions, setContributions] = useState(CONTRIBUTIONS);
  return { events, setEvents, notes, setNotes, chores, setChores, items, setItems, bills, setBills, contributions, setContributions };
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
      <svg className="absolute inset-0 size-full! -rotate-90" width={size} height={size}>
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
              {s.events.slice().sort((a, b) => `${a.date}${a.time}`.localeCompare(`${b.date}${b.time}`)).slice(0, 3).map((e) => <div key={e.id} className="flex items-center gap-3 rounded-2xl bg-card p-3 shadow-card">
                <Avatar m={byId(e.memberId)} size="sm" />
                <div className="min-w-0 flex-1"><p className="text-sm font-semibold">{e.title}</p><p className="text-xs text-muted-foreground">{eventWhen(e)}</p></div>
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

export function Shopping({ s }: { s: HubState; compact: boolean }) {
  const [name, setName] = useState("");
  const add = (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;
    s.setItems((xs) => [...xs, { id: crypto.randomUUID(), name: name.trim(), done: false }]);
    setName("");
  };
  const remove = (item: ShopItem) => {
    const position = s.items.findIndex((x) => x.id === item.id);
    s.setItems((xs) => xs.filter((x) => x.id !== item.id));
    toast(`"${item.name}" eliminado`, {
      action: { label: "Deshacer", onClick: () => s.setItems((xs) => [...xs.slice(0, position), item, ...xs.slice(position)]) },
    });
  };
  const toggle = (id: string) => s.setItems((xs) => xs.map((x) => x.id === id ? { ...x, done: !x.done } : x));
  return <div className="mx-auto max-w-2xl space-y-4">
    <form onSubmit={add} className="flex items-center gap-2 rounded-2xl bg-card p-2 pl-4 shadow-card">
      <input aria-label="Producto" value={name} onChange={(e) => setName(e.target.value)} placeholder="Añadir producto" className="min-w-0 flex-1 bg-transparent text-base outline-none placeholder:text-muted-foreground" />
      <VoiceInput label="producto" onText={(text) => setName((current) => appendDictation(current, text))} />
      <Button type="submit" size="icon" aria-label="Añadir producto" className="size-11 shrink-0 rounded-xl"><Plus /></Button>
    </form>
    <ul className="divide-y divide-border">
      {s.items.map((item) => <li key={item.id} className="flex items-center gap-2 py-1">
        <Button variant="ghost" aria-label={item.name} aria-pressed={item.done} onClick={() => toggle(item.id)} className="h-auto min-w-0 flex-1 justify-start gap-3 whitespace-normal rounded-xl px-2 py-3 text-left">
          <span className={cn("grid size-6 shrink-0 place-items-center rounded-full border-2", item.done ? "border-success-strong bg-success text-success-foreground" : "border-foreground/25")}>{item.done && <Check />}</span>
          <span className={cn("min-w-0 break-words text-base", item.done && "text-muted-foreground line-through")}>{item.name}</span>
        </Button>
        <Button variant="ghost" size="icon" aria-label={`Eliminar ${item.name}`} onClick={() => remove(item)} className="shrink-0 text-muted-foreground hover:bg-destructive-soft hover:text-destructive"><Trash2 /></Button>
      </li>)}
    </ul>
    {!s.items.length && <p className="py-8 text-center text-sm text-muted-foreground">La lista está vacía</p>}
  </div>;
}
