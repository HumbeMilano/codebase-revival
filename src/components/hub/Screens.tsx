import { useMemo, useState } from "react";
import { Check, Lock, Plus, Trash2 } from "lucide-react";
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

export function Dashboard({ s, user, compact, openFinance }: { s: HubState; user: Member; compact: boolean; openFinance: () => void }) {
  const today = s.chores.filter((c) => c.when === "Hoy");
  const pending = s.items.filter((i) => !i.done);
  const now = new Date();
  const sum = monthSummary(s.bills, s.contributions, monthKey(now.getFullYear(), now.getMonth()), now, MEMBERS.map((m) => m.id));
  const { total, paid } = sum;
  const mine = s.chores.filter((c) => c.memberId === user.id && !c.done);

  const doneToday = today.filter((c) => c.done).length;
  const pct = total ? Math.round((paid / total) * 100) : 0;

  return (
    <div className={cn("grid gap-3", compact ? "grid-cols-2" : "grid-cols-4 auto-rows-[minmax(0,auto)]")}>
      <div className={cn("relative overflow-hidden rounded-[1.75rem] bg-card bg-glow p-6 shadow-card", compact ? "col-span-2" : "col-span-2 row-span-2 flex flex-col justify-between")}>
        <div>
          <p className="text-sm font-medium text-muted-foreground">Buenas tardes</p>
          <h2 className={cn("font-display font-extrabold leading-none tracking-tight", compact ? "text-4xl" : "text-6xl")}>Hola, {user.name}</h2>
        </div>
        <p className={cn("mt-4 font-medium text-foreground/70", compact ? "text-base" : "text-xl")}>
          Hoy te {mine.length === 1 ? "toca" : "tocan"} <b className="text-foreground">{mine.length} {mine.length === 1 ? "tarea" : "tareas"}</b> y faltan <b className="text-foreground">{pending.length} cosas</b> en la lista.
        </p>
      </div>

      <div className="flex flex-col justify-between rounded-[1.75rem] bg-success p-5 text-success-foreground shadow-card">
        <p className="text-sm font-semibold">Tareas de hoy</p>
        <p className="font-display text-5xl font-extrabold tabular">{doneToday}<span className="text-2xl opacity-60">/{today.length}</span></p>
      </div>

      <div className="flex flex-col justify-between rounded-[1.75rem] bg-accent p-5 text-accent-foreground shadow-card">
        <p className="text-sm font-semibold">Por comprar</p>
        <p className="font-display text-5xl font-extrabold tabular">{pending.length}</p>
      </div>

      <button onClick={openFinance} className={cn("rounded-[1.75rem] bg-primary p-5 text-left text-primary-foreground shadow-card transition active:scale-[0.99]", "col-span-2")}>
        <div className="flex items-center justify-between text-sm font-semibold opacity-80">
          <span>Bills del mes</span>{user.role !== "admin" && <Lock className="size-4" />}
        </div>
        <div className="mt-2 flex items-end justify-between gap-3">
          <p className="font-display text-4xl font-extrabold tabular">{money(paid)}</p>
          <p className="pb-1 text-sm opacity-70 tabular">de {money(total)}</p>
        </div>
        <div className="mt-3 h-2.5 overflow-hidden rounded-full bg-primary-foreground/15">
          <div className="h-full rounded-full bg-success transition-all" style={{ width: `${pct}%` }} />
        </div>
        <p className="mt-2 text-xs opacity-70">{pct}% pagado · {sum.pendingCount} pendientes · aportado {money(sum.contributed)}</p>
      </button>

      <Card title="Tareas de hoy" className={compact ? "col-span-2" : "col-span-2"}>
        <div className="space-y-2">{today.map((c) => <ChoreRow key={c.id} c={c} onToggle={() => toggleChore(s, c.id)} />)}</div>
      </Card>

      <Card title="Próximos días" className={cn("bg-sky", compact ? "col-span-2" : "col-span-1")}>
        <ul className="space-y-3">
          {EVENTS.map((e) => {
            const m = byId(e.memberId);
            return (
              <li key={e.id} className="flex gap-3">
                <span className={cn("w-1.5 rounded-full", memberBg[m.color])} />
                <div>
                  <p className="text-sm font-semibold">{e.title}</p>
                  <p className="text-xs text-muted-foreground">{e.when}</p>
                </div>
              </li>
            );
          })}
        </ul>
      </Card>

      <Card title="Lista de compras" className={cn("bg-lilac", compact ? "col-span-2" : "col-span-1")}>
        <ul className="space-y-2">
          {pending.slice(0, 5).map((i) => (
            <li key={i.id} className="flex items-center gap-2.5 text-sm font-medium">
              <span className="size-1.5 rounded-full bg-foreground/40" /> {i.name}
            </li>
          ))}
        </ul>
      </Card>
    </div>
  );
}

export function Chores({ s, compact }: { s: HubState; compact: boolean }) {
  return (
    <div className={cn("grid gap-4", compact ? "grid-cols-1" : "grid-cols-2")}>
      {MEMBERS.map((m) => {
        const list = s.chores.filter((c) => c.memberId === m.id);
        const done = list.filter((c) => c.done).length;
        return (
          <Card key={m.id} title={m.name} action={<span className="text-xs text-muted-foreground tabular">{done}/{list.length}</span>}>
            <div className="space-y-2">
              {list.length ? list.map((c) => <ChoreRow key={c.id} c={c} onToggle={() => toggleChore(s, c.id)} />) : <p className="text-sm text-muted-foreground">Sin tareas 🎉</p>}
            </div>
          </Card>
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

