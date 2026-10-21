import { useMemo, useState } from "react";
import { Check, Lock, Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { monthKey, monthSummary, type Contribution, type LedgerBill } from "@/lib/ledger";
import { Avatar } from "./Kiosk";
import {
  AISLES, BILLS, CHORES, CONTRIBUTIONS, EVENTS, MEMBERS, SHOPPING, memberBg, memberText,
  type Chore, type Member, type ShopItem,
} from "./data";

const money = (n: number) => n.toLocaleString("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 });
const byId = (id: string): Member => MEMBERS.find((m) => m.id === id) ?? MEMBERS[0]!;

export function Card({ title, action, children, className }: { title?: string; action?: React.ReactNode; children: React.ReactNode; className?: string }) {
  return (
    <section className={cn("rounded-3xl border bg-card p-5 shadow-card", className)}>
      {title && (
        <header className="mb-4 flex items-center justify-between">
          <h3 className="text-xs font-bold uppercase tracking-[0.14em] text-muted-foreground">{title}</h3>
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

  return (
    <div className={cn("grid gap-4", compact ? "grid-cols-1" : "grid-cols-3")}>
      <div className={cn("rounded-3xl border bg-card bg-glow p-6 shadow-card", !compact && "col-span-3")}>
        <p className="text-sm text-muted-foreground">Buenas tardes</p>
        <h2 className="font-display text-3xl font-bold">Hola, {user.name} 👋</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Tienes <span className="font-semibold text-primary">{mine.length} tareas</span> pendientes y faltan{" "}
          <span className="font-semibold text-accent">{pending.length} cosas</span> por comprar.
        </p>
      </div>

      <Card title="Tareas de hoy">
        <div className="space-y-2">{today.map((c) => <ChoreRow key={c.id} c={c} onToggle={() => toggleChore(s, c.id)} />)}</div>
      </Card>

      <Card title={`Compras · ${pending.length} pendientes`}>
        <ul className="space-y-2">
          {pending.slice(0, 5).map((i) => (
            <li key={i.id} className="flex items-center gap-3 text-sm">
              <span className="size-2 rounded-full bg-accent" /> {i.name}
              <span className="ml-auto text-xs text-muted-foreground">{i.aisle.split(" ")[0]}</span>
            </li>
          ))}
        </ul>
      </Card>

      <Card title="Próximos días">
        <ul className="space-y-3">
          {EVENTS.map((e) => {
            const m = byId(e.memberId);
            return (
              <li key={e.id} className="flex gap-3">
                <span className={cn("w-1 rounded-full", memberBg[m.color])} />
                <div>
                  <p className="text-sm font-semibold">{e.title}</p>
                  <p className={cn("text-xs", memberText[m.color])}>{e.when}</p>
                </div>
              </li>
            );
          })}
        </ul>
      </Card>

      <button onClick={openFinance} className={cn("text-left", !compact && "col-span-3")}>
        <Card title="Finanzas del mes" action={user.role !== "admin" && <Lock className="size-4 text-muted-foreground" />}>
          <div className="flex items-end justify-between gap-4">
            <div>
              <p className="font-display text-3xl font-bold tabular">{money(paid)} <span className="text-base font-medium text-muted-foreground">/ {money(total)}</span></p>
              <p className="text-xs text-muted-foreground">pagado este mes · {sum.pendingCount} bills pendientes · aportado {money(sum.contributed)}</p>
            </div>
          </div>
          <div className="mt-4 h-2 overflow-hidden rounded-full bg-muted">
            <div className="h-full rounded-full bg-success-strong transition-all" style={{ width: `${total ? (paid / total) * 100 : 0}%` }} />
          </div>
        </Card>
      </button>
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
      <form onSubmit={add} className="flex gap-2 rounded-3xl border bg-card p-2 shadow-card">
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

