import { useMemo, useState } from "react";
import { Check, ChevronLeft, ChevronRight, Lock, Plus, Trash2, Zap } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { splitBill } from "@/lib/split";
import { Avatar } from "./Kiosk";
import {
  AISLES, BILLS, CHORES, EVENTS, MEMBERS, SHOPPING, memberBg, memberText,
  type Bill, type Chore, type Member, type ShopItem,
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
  bills: Bill[];
  setBills: React.Dispatch<React.SetStateAction<Bill[]>>;
}

export function useHubState(): HubState {
  const [chores, setChores] = useState(CHORES);
  const [items, setItems] = useState(SHOPPING);
  const [bills, setBills] = useState(BILLS);
  return { chores, setChores, items, setItems, bills, setBills };
}

function ChoreRow({ c, onToggle }: { c: Chore; onToggle: () => void }) {
  const m = byId(c.memberId);
  return (
    <button onClick={onToggle} className="flex w-full items-center gap-3 rounded-2xl bg-secondary/60 p-3 text-left transition hover:bg-secondary active:scale-[0.99]">
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
  const total = s.bills.reduce((a, b) => a + (b.override ?? b.base), 0);
  const paid = s.bills.filter((b) => b.paid).reduce((a, b) => a + (b.override ?? b.base), 0);
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
        <Card title="Finanzas · octubre" action={user.role !== "admin" && <Lock className="size-4 text-muted-foreground" />}>
          <div className="flex items-end justify-between gap-4">
            <div>
              <p className="font-display text-3xl font-bold tabular">{money(paid)} <span className="text-base font-medium text-muted-foreground">/ {money(total)}</span></p>
              <p className="text-xs text-muted-foreground">pagado este mes · {s.bills.filter((b) => !b.paid).length} facturas pendientes</p>
            </div>
          </div>
          <div className="mt-4 h-2 overflow-hidden rounded-full bg-muted">
            <div className="h-full rounded-full bg-primary transition-all" style={{ width: `${(paid / total) * 100}%` }} />
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
                  <li key={i.id} className="group flex items-center gap-3 rounded-xl px-2 py-2 hover:bg-secondary/60">
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

export function Finance({ s, compact }: { s: HubState; compact: boolean }) {
  const [month, setMonth] = useState(9); // octubre (0-index)
  const monthName = new Date(2026, month, 1).toLocaleDateString("es", { month: "long", year: "numeric" });

  const settlement = useMemo(() => {
    const owed: Record<string, number> = {};
    const paid: Record<string, number> = {};
    for (const b of s.bills) {
      const amt = b.override ?? b.base;
      const shares = splitBill(amt, b.splits);
      for (const [p, v] of Object.entries(shares)) owed[p] = (owed[p] ?? 0) + v;
      if (b.paid && b.paidBy) paid[b.paidBy] = (paid[b.paidBy] ?? 0) + amt;
    }
    return MEMBERS.filter((m) => owed[m.id] || paid[m.id]).map((m) => ({
      m, owed: owed[m.id] ?? 0, paid: paid[m.id] ?? 0, net: (paid[m.id] ?? 0) - (owed[m.id] ?? 0),
    }));
  }, [s.bills]);

  const togglePaid = (b: Bill) =>
    s.setBills((bs) => bs.map((x) => (x.id === b.id ? (x.paid ? { ...x, paid: false, paidBy: "" } : { ...x, paid: true, paidBy: "papa" }) : x)));

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between rounded-3xl border bg-card p-3 shadow-card">
        <button onClick={() => setMonth((m) => m - 1)} aria-label="Mes anterior" className="grid size-10 place-items-center rounded-2xl hover:bg-secondary"><ChevronLeft className="size-5" /></button>
        <p className="font-display text-lg font-semibold capitalize">{monthName}</p>
        <button onClick={() => setMonth((m) => m + 1)} aria-label="Mes siguiente" className="grid size-10 place-items-center rounded-2xl hover:bg-secondary"><ChevronRight className="size-5" /></button>
      </div>

      <div className={cn("grid gap-4", compact ? "grid-cols-1" : "grid-cols-[1.4fr_1fr]")}>
        <Card title="Facturas del mes">
          <div className="space-y-3">
            {s.bills.map((b) => {
              const amt = b.override ?? b.base;
              const shares = splitBill(amt, b.splits);
              return (
                <div key={b.id} className="rounded-2xl bg-secondary/60 p-4">
                  <div className="flex items-start gap-3">
                    <span className="text-2xl">{b.icon}</span>
                    <div className="min-w-0 flex-1">
                      <p className="font-semibold">{b.name}</p>
                      <p className="text-xs text-muted-foreground">
                        Vence el {b.dueDay} {b.autoPay && <span className="ml-1 inline-flex items-center gap-0.5 text-accent"><Zap className="size-3" />auto</span>}
                        {b.override !== undefined && <span className="ml-1">· base {money(b.base)} → este mes {money(b.override)}</span>}
                      </p>
                    </div>
                    <div className="text-right">
                      <p className="font-display text-lg font-bold tabular">{money(amt)}</p>
                      <button onClick={() => togglePaid(b)} className={cn("mt-1 rounded-full px-2.5 py-0.5 text-[11px] font-bold", b.paid ? "bg-primary/15 text-primary" : "bg-accent/15 text-accent")}>
                        {b.paid ? "Pagado ✓" : "Pendiente"}
                      </button>
                    </div>
                  </div>
                  <div className="mt-3 flex flex-wrap gap-2">
                    {b.splits.map((sp) => {
                      const m = byId(sp.personId);
                      return (
                        <span key={sp.personId} className="flex items-center gap-1.5 rounded-full bg-background/60 py-1 pl-1 pr-2.5 text-xs">
                          <Avatar m={m} size="sm" />
                          <span className="font-semibold tabular">{money(shares[sp.personId] ?? 0)}</span>
                          <span className="text-muted-foreground">{sp.type === "amount" ? "fijo" : sp.type === "percent" ? `${sp.value}%` : "igual"}</span>
                        </span>
                      );
                    })}
                  </div>
                </div>
              );
            })}
          </div>
        </Card>

        <Card title="Liquidación · quién debe a quién">
          <div className="space-y-3">
            {settlement.map(({ m, owed, paid, net }) => (
              <div key={m.id} className="flex items-center gap-3 rounded-2xl bg-secondary/60 p-3">
                <Avatar m={m} />
                <div className="flex-1">
                  <p className="text-sm font-semibold">{m.name}</p>
                  <p className="text-xs text-muted-foreground tabular">Le toca {money(owed)} · pagó {money(paid)}</p>
                </div>
                <span className={cn("font-display font-bold tabular", net >= 0 ? "text-primary" : "text-destructive")}>
                  {net >= 0 ? "+" : ""}{money(net)}
                </span>
              </div>
            ))}
            <p className="pt-1 text-xs text-muted-foreground">
              Reparto: primero montos fijos, luego porcentajes sobre el resto y lo que queda se divide en partes iguales.
            </p>
          </div>
        </Card>
      </div>
    </div>
  );
}
