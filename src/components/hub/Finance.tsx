import { useMemo, useState } from "react";
import { ChevronLeft, ChevronRight, DollarSign, MinusCircle, Pencil, Plus, RotateCcw, Search, Trash2, X } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { splitBill, validateSplits, type Split } from "@/lib/split";
import { billAmount, billStatus, billsForMonth, monthKey, monthSummary, type Contribution, type LedgerBill } from "@/lib/ledger";
import { Avatar } from "./Kiosk";
import { CATEGORIES, MEMBERS, type Member } from "./data";

export const money = (n: number) => n.toLocaleString("en-US", { style: "currency", currency: "USD" });
const byId = (id: string): Member => MEMBERS.find((m) => m.id === id) ?? MEMBERS[0]!;
const names = (b: LedgerBill) => b.splits.map((s) => byId(s.personId).name).join(", ");

export interface FinanceState {
  bills: LedgerBill[];
  setBills: React.Dispatch<React.SetStateAction<LedgerBill[]>>;
  contributions: Contribution[];
  setContributions: React.Dispatch<React.SetStateAction<Contribution[]>>;
}

function Sheet({ title, subtitle, onClose, children }: { title: string; subtitle?: string; onClose: () => void; children: React.ReactNode }) {
  return (
    <div className="absolute inset-0 z-40 flex items-end justify-center bg-foreground/20 backdrop-blur-sm animate-in fade-in" onClick={onClose}>
      <div onClick={(e) => e.stopPropagation()} className="max-h-[88%] w-full max-w-xl overflow-y-auto rounded-t-[2rem] bg-card p-5 shadow-card animate-in slide-in-from-bottom-10 duration-300">
        <div className="mx-auto mb-4 h-1.5 w-12 rounded-full bg-muted" />
        <div className="mb-4 flex items-start justify-between gap-3">
          <div>
            <h3 className="font-display text-2xl font-bold">{title}</h3>
            {subtitle && <p className="text-sm text-muted-foreground">{subtitle}</p>}
          </div>
          <button onClick={onClose} aria-label="Cerrar" className="grid size-10 place-items-center rounded-2xl border hover:bg-secondary"><X className="size-4" /></button>
        </div>
        {children}
      </div>
    </div>
  );
}

function SheetAction({ icon: Icon, title, hint, danger, onClick }: { icon: typeof X; title: string; hint?: string; danger?: boolean; onClick: () => void }) {
  return (
    <button onClick={onClick} className={cn("flex w-full items-center gap-3 rounded-2xl border p-4 text-left transition active:scale-[0.99]", danger ? "border-destructive/40 bg-destructive/10 hover:bg-destructive/15" : "bg-secondary/70 hover:bg-secondary")}>
      <div className="flex-1">
        <p className={cn("font-semibold", danger && "text-destructive")}>{title}</p>
        {hint && <p className="text-sm text-muted-foreground">{hint}</p>}
      </div>
      <Icon className={cn("size-5", danger ? "text-destructive" : "text-muted-foreground")} />
    </button>
  );
}

function Donut({ paid, total }: { paid: number; total: number }) {
  const r = 42, c = 2 * Math.PI * r, pct = total ? paid / total : 0;
  return (
    <svg viewBox="0 0 100 100" className="size-32 shrink-0 -rotate-90">
      <circle cx="50" cy="50" r={r} fill="none" strokeWidth="14" className="stroke-accent" />
      <circle cx="50" cy="50" r={r} fill="none" strokeWidth="14" strokeDasharray={`${c * pct} ${c}`} className="stroke-success-strong transition-all duration-700" />
    </svg>
  );
}

function DayBadge({ day }: { day: number }) {
  return (
    <div className="w-12 shrink-0 overflow-hidden rounded-2xl bg-secondary text-center">
      <div className="h-1.5 bg-accent" />
      <p className="py-1 font-display text-lg font-bold tabular">{day}</p>
    </div>
  );
}

function BillRow({ b, mk, today, onClick }: { b: LedgerBill; mk: string; today: Date; onClick: () => void }) {
  const paid = billStatus(b, mk, today) === "paid";
  const explicit = b.overrides[mk]?.status;
  return (
    <button onClick={onClick} className="relative flex w-full items-center gap-3 overflow-hidden rounded-[1.25rem] bg-card py-3 pl-5 pr-4 text-left shadow-card transition hover:-translate-y-0.5">
      <span className={cn("absolute inset-y-0 left-0 w-1.5", paid ? "bg-success-strong" : "bg-accent")} />
      <DayBadge day={b.dueDay} />
      <div className="min-w-0 flex-1">
        <p className="truncate font-semibold">{b.name}</p>
        <div className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted-foreground">
          <span>{b.category}</span>
          <span className="flex -space-x-1.5">{b.splits.map((s) => <Avatar key={s.personId} m={byId(s.personId)} size="sm" />)}</span>
          <span className="truncate">{names(b)}</span>
          {b.autoPay && <span>· Automático</span>}
        </div>
      </div>
      <div className="shrink-0 text-right">
        <p className="font-display font-bold tabular">{money(billAmount(b, mk))}</p>
        <span className={cn("mt-1 inline-block rounded-full px-2.5 py-0.5 text-[11px] font-bold", paid ? "bg-success text-success-foreground" : "bg-destructive-soft text-destructive")}>
          {paid ? (b.autoPay && !explicit ? "Auto pagado" : "Pagado") : "Pendiente"}
        </span>
      </div>
    </button>
  );
}

type SplitMode = "one" | "equal" | "percent" | "amount";

function BillForm({ initial, onSave, onClose }: { initial?: LedgerBill | undefined; onSave: (b: LedgerBill) => void; onClose: () => void }) {
  const initMode: SplitMode = !initial ? "equal" : initial.splits.length === 1 ? "one" : (initial.splits[0]?.type as SplitMode) ?? "equal";
  const [name, setName] = useState(initial?.name ?? "");
  const [amount, setAmount] = useState(initial ? String(initial.base) : "");
  const [day, setDay] = useState(initial ? String(initial.dueDay) : "");
  const [category, setCategory] = useState(initial?.category ?? "Vivienda");
  const [autoPay, setAutoPay] = useState(initial?.autoPay ?? false);
  const [mode, setMode] = useState<SplitMode>(initMode);
  const [picked, setPicked] = useState<Record<string, number | null>>(() => {
    const o: Record<string, number | null> = {};
    for (const m of MEMBERS) o[m.id] = null;
    for (const s of initial?.splits ?? [{ personId: "papa", value: 0 }, { personId: "mama", value: 0 }]) o[s.personId] = s.value;
    return o;
  });

  const total = Number(amount) || 0;
  const selected = MEMBERS.filter((m) => picked[m.id] !== null);
  const splits: Split[] =
    mode === "one"
      ? selected.slice(0, 1).map((m) => ({ personId: m.id, type: "equal", value: 0 }))
      : selected.map((m) => ({ personId: m.id, type: mode === "equal" ? "equal" : mode, value: picked[m.id] ?? 0 }));
  const preview = splitBill(total, splits);
  const pctSum = splits.filter((s) => s.type === "percent").reduce((a, s) => a + s.value, 0);
  const amtSum = splits.filter((s) => s.type === "amount").reduce((a, s) => a + s.value, 0);

  const error =
    !name.trim() ? "Escribe un nombre"
    : validateSplits(total, splits)
    ?? (!(Number(day) >= 1 && Number(day) <= 31) ? "El día debe estar entre 1 y 31"
    : !splits.length ? "Elige al menos una persona"
    : mode === "percent" && Math.abs(pctSum - 100) > 0.01 ? `Los porcentajes suman ${pctSum}% (deben ser 100%)`
    : mode === "amount" && Math.abs(amtSum - total) > 0.01 ? `Los montos suman ${money(amtSum)} de ${money(total)}`
    : null);

  const toggle = (id: string) =>
    setPicked((p) => (mode === "one" ? Object.fromEntries(MEMBERS.map((m) => [m.id, m.id === id ? 0 : null])) : { ...p, [id]: p[id] === null ? 0 : null }));

  const field = "w-full rounded-2xl border bg-background px-4 py-3 outline-none focus:border-primary";
  return (
    <Sheet title={initial ? "Editar bill recurrente" : "Nuevo bill"} onClose={onClose}>
      <div className="space-y-3">
        <label className="block text-sm font-semibold">Nombre<input value={name} maxLength={60} onChange={(e) => setName(e.target.value)} placeholder="Ej. Renta" className={cn(field, "mt-1.5 font-normal")} /></label>
        <div className="grid grid-cols-2 gap-3">
          <label className="block text-sm font-semibold">Monto mensual<input value={amount} inputMode="decimal" onChange={(e) => setAmount(e.target.value.replace(/[^\d.]/g, ""))} placeholder="0.00" className={cn(field, "mt-1.5 font-normal")} /></label>
          <label className="block text-sm font-semibold">Día de vencimiento<input value={day} inputMode="numeric" onChange={(e) => setDay(e.target.value.replace(/\D/g, "").slice(0, 2))} placeholder="Ej. 15" className={cn(field, "mt-1.5 font-normal")} /></label>
        </div>
        <label className="block text-sm font-semibold">Categoría
          <select value={category} onChange={(e) => setCategory(e.target.value)} className={cn(field, "mt-1.5 font-normal")}>
            {Object.entries(CATEGORIES).map(([c, i]) => <option key={c} value={c}>{i} {c}</option>)}
          </select>
        </label>
        <label className="flex gap-3 rounded-2xl border p-4">
          <input type="checkbox" checked={autoPay} onChange={(e) => setAutoPay(e.target.checked)} className="mt-1 size-5 accent-primary" />
          <span><span className="font-semibold">Pago automático</span><br /><span className="text-sm text-muted-foreground">El día de vencimiento se marca como pagado. No mueve dinero ni conecta bancos.</span></span>
        </label>

        <p className="pt-1 text-sm font-semibold">¿Quién paga este bill?</p>
        <div className="grid grid-cols-4 gap-1 rounded-2xl border p-1">
          {([["one", "Una persona"], ["equal", "Iguales"], ["percent", "Porcentaje"], ["amount", "Por monto"]] as const).map(([k, l]) => (
            <button key={k} onClick={() => setMode(k)} className={cn("rounded-xl py-2 text-xs font-semibold sm:text-sm", mode === k ? "bg-secondary text-foreground" : "text-muted-foreground")}>{l}</button>
          ))}
        </div>
        <div className="space-y-2">
          {MEMBERS.map((m) => {
            const on = picked[m.id] !== null && (mode !== "one" || selected[0]?.id === m.id);
            return (
              <div key={m.id} className={cn("flex items-center gap-3 rounded-2xl border p-3", on && "border-primary/40")}>
                <button onClick={() => toggle(m.id)} className="flex flex-1 items-center gap-3 text-left">
                  <span className={cn("grid size-5 place-items-center rounded-md border-2", on ? "border-primary bg-primary" : "border-muted-foreground/40")} />
                  <Avatar m={m} size="sm" /><span className="font-semibold">{m.name}</span>
                </button>
                {on && (mode === "percent" || mode === "amount") ? (
                  <input value={picked[m.id] || ""} inputMode="decimal" placeholder={mode === "percent" ? "%" : "$"}
                    onChange={(e) => setPicked((p) => ({ ...p, [m.id]: Number(e.target.value.replace(/[^\d.]/g, "")) || 0 }))}
                    className="w-20 rounded-xl border bg-background px-2 py-1.5 text-right outline-none focus:border-primary" />
                ) : null}
                <span className="w-20 text-right text-sm text-muted-foreground tabular">{on ? money(preview[m.id] ?? 0) : "—"}</span>
              </div>
            );
          })}
        </div>
        {error && <p className="text-sm font-semibold text-destructive">{error}</p>}
        <div className="grid grid-cols-2 gap-3 pt-2">
          <button onClick={onClose} className="rounded-2xl border py-3.5 font-semibold hover:bg-secondary">Cancelar</button>
          <button disabled={!!error} onClick={() => onSave({ id: initial?.id ?? crypto.randomUUID(), name: name.trim(), base: total, dueDay: Number(day), category, autoPay, splits, overrides: initial?.overrides ?? {} })}
            className="rounded-2xl bg-primary py-3.5 font-semibold text-primary-foreground shadow-glow disabled:opacity-40 disabled:shadow-none">Guardar bill</button>
        </div>
      </div>
    </Sheet>
  );
}

export function Finance({ f, compact }: { f: FinanceState; compact: boolean }) {
  const today = useMemo(() => new Date(), []);
  const [cursor, setCursor] = useState({ y: today.getFullYear(), m: today.getMonth() });
  const [filter, setFilter] = useState<"all" | "pending" | "paid">("all");
  const [q, setQ] = useState("");
  const [selected, setSelected] = useState<LedgerBill | null>(null);
  const [editing, setEditing] = useState<LedgerBill | "new" | null>(null);
  const [newAmount, setNewAmount] = useState<string | null>(null);
  const [addingAporte, setAddingAporte] = useState(false);

  const mk = monthKey(cursor.y, cursor.m);
  const label = new Date(cursor.y, cursor.m, 1).toLocaleDateString("es", { month: "long", year: "numeric" });
  const shift = (d: number) => setCursor(({ y, m }) => { const t = new Date(y, m + d, 1); return { y: t.getFullYear(), m: t.getMonth() }; });
  const sum = monthSummary(f.bills, f.contributions, mk, today, MEMBERS.map((m) => m.id));
  const visible = billsForMonth(f.bills, mk);

  const patchMonth = (id: string, patch: Partial<LedgerBill["overrides"][string]>) =>
    f.setBills((bs) => bs.map((b) => (b.id === id ? { ...b, overrides: { ...b.overrides, [mk]: { ...b.overrides[mk], ...patch } } } : b)));

  const filtered = visible.filter((b) => {
    const st = billStatus(b, mk, today);
    if (filter === "pending" && st !== "pending") return false;
    if (filter === "paid" && st !== "paid") return false;
    const t = q.trim().toLowerCase();
    return !t || [b.name, b.category, names(b)].some((x) => x.toLowerCase().includes(t));
  });
  const groups = Object.keys(CATEGORIES).map((c) => ({ c, list: filtered.filter((b) => b.category === c) })).filter((g) => g.list.length);

  const sel = selected && f.bills.find((b) => b.id === selected.id);

  const isCurrent = mk === monthKey(today.getFullYear(), today.getMonth());
  const daysInMonth = new Date(cursor.y, cursor.m + 1, 0).getDate();
  const inPot = sum.contributed - sum.paid;
  const segTotal = Math.max(sum.contributed, sum.total) || 1;
  const monthLabel = (d: number) => new Date(cursor.y, cursor.m + d, 1).toLocaleDateString("es", { month: "short" });

  return (
    <div className="space-y-6 pb-4">
      {/* Month rail */}
      <div className="flex items-center gap-2">
        <button onClick={() => shift(-1)} aria-label="Mes anterior" className="grid size-10 shrink-0 place-items-center rounded-full bg-card shadow-card"><ChevronLeft className="size-4" /></button>
        <div className="flex flex-1 items-center justify-center gap-1 overflow-hidden">
          {[-2, -1, 0, 1, 2].filter((d) => !compact || Math.abs(d) < 2).map((d) => (
            <button key={d} onClick={() => d && shift(d)} className={cn("rounded-full px-4 py-2 font-display font-bold capitalize transition", d === 0 ? "bg-primary text-lg text-primary-foreground" : "text-sm text-muted-foreground hover:text-foreground")}>
              {d === 0 ? label : monthLabel(d)}
            </button>
          ))}
        </div>
        <button onClick={() => shift(1)} aria-label="Mes siguiente" className="grid size-10 shrink-0 place-items-center rounded-full bg-card shadow-card"><ChevronRight className="size-4" /></button>
        {!isCurrent && <button onClick={() => setCursor({ y: today.getFullYear(), m: today.getMonth() })} className="rounded-full bg-card px-4 py-2 text-sm font-semibold shadow-card">Hoy</button>}
      </div>

      <div className={cn("grid gap-6", compact ? "grid-cols-1" : "grid-cols-[1fr_1.15fr]")}>
        {/* LEFT: the pot */}
        <div className="space-y-6">
          <section>
            <p className="text-xs font-bold uppercase tracking-[0.18em] text-muted-foreground">En el fondo común</p>
            <p className={cn("font-display font-extrabold leading-none tracking-[-0.05em] tabular", compact ? "text-6xl" : "text-7xl", inPot < 0 && "text-destructive")}>{money(inPot)}</p>
            <div className="mt-4 flex h-4 overflow-hidden rounded-full bg-muted">
              <span className="bg-success-strong transition-all" style={{ width: `${(sum.paid / segTotal) * 100}%` }} />
              <span className="bg-accent transition-all" style={{ width: `${(sum.pending / segTotal) * 100}%` }} />
            </div>
            <div className="mt-3 grid grid-cols-3 gap-2 text-sm">
              {([["Aportado", sum.contributed, "bg-foreground"], ["Pagado", sum.paid, "bg-success-strong"], ["Pendiente", sum.pending, "bg-accent"]] as const).map(([l, v, dot]) => (
                <div key={l}>
                  <p className="flex items-center gap-1.5 text-xs text-muted-foreground"><span className={cn("size-2 rounded-full", dot)} />{l}</p>
                  <p className="font-display text-lg font-bold tabular">{money(v)}</p>
                </div>
              ))}
            </div>
          </section>

          {/* People ledger */}
          <section>
            <div className="mb-3 flex items-center justify-between">
              <h3 className="text-xs font-bold uppercase tracking-[0.18em] text-muted-foreground">Quién pone qué</h3>
              <button onClick={() => setAddingAporte(true)} className="flex items-center gap-1 rounded-full bg-primary px-3.5 py-1.5 text-xs font-bold text-primary-foreground"><Plus className="size-3.5" />Aporte</button>
            </div>
            <div className="space-y-2">
              {sum.persons.filter((p) => p.billCount || p.contributed).map((p) => {
                const m = byId(p.personId);
                const fill = p.assigned ? Math.min(1, p.contributed / p.assigned) : 1;
                return (
                  <div key={p.personId} className="rounded-[1.5rem] bg-card p-4 shadow-card">
                    <div className="flex items-center gap-3">
                      <Avatar m={m} />
                      <div className="min-w-0 flex-1">
                        <p className="font-bold">{m.name}</p>
                        <p className="text-xs text-muted-foreground tabular">{p.billCount} bills · asignado {money(p.assigned)}</p>
                      </div>
                      <span className={cn("rounded-full px-3 py-1 text-xs font-bold tabular", p.stillOwes > 0 ? "bg-destructive-soft text-destructive" : "bg-success text-success-foreground")}>
                        {p.stillOwes > 0 ? `Debe ${money(p.stillOwes)}` : "Al día ✓"}
                      </span>
                    </div>
                    <div className="mt-3 h-2 overflow-hidden rounded-full bg-muted"><div className="h-full rounded-full bg-foreground transition-all" style={{ width: `${fill * 100}%` }} /></div>
                    <div className="mt-2 flex justify-between text-xs text-muted-foreground tabular">
                      <span>Aportó <b className="text-foreground">{money(p.contributed)}</b></span>
                      <span>Pagado {money(p.paid)} · Pend. {money(p.pending)}</span>
                      <span>Disponible <b className={p.available < 0 ? "text-destructive" : "text-success-foreground"}>{money(p.available)}</b></span>
                    </div>
                  </div>
                );
              })}
            </div>
          </section>

          {/* Contribution feed */}
          <section>
            <h3 className="mb-3 text-xs font-bold uppercase tracking-[0.18em] text-muted-foreground">Aportes del mes</h3>
            <div className="flex flex-wrap gap-2">
              {f.contributions.filter((c) => c.month === mk).map((c) => (
                <div key={c.id} className="flex items-center gap-2 rounded-full bg-card py-1 pl-1 pr-2 shadow-card">
                  <Avatar m={byId(c.personId)} size="sm" />
                  <span className="text-sm font-bold tabular">{money(c.amount)}</span>
                  {c.note && <span className="max-w-[120px] truncate text-xs text-muted-foreground">{c.note}</span>}
                  <button aria-label="Eliminar aporte" onClick={() => {
                    f.setContributions((cs) => cs.filter((x) => x.id !== c.id));
                    toast("Aporte eliminado", { action: { label: "Deshacer", onClick: () => f.setContributions((cs) => [...cs, c]) } });
                  }} className="grid size-6 place-items-center rounded-full text-muted-foreground hover:bg-destructive-soft hover:text-destructive"><X className="size-3.5" /></button>
                </div>
              ))}
              {!f.contributions.some((c) => c.month === mk) && <p className="text-sm text-muted-foreground">Aún no hay aportes este mes.</p>}
            </div>
          </section>
        </div>

        {/* RIGHT: bills calendar + list */}
        <div className="space-y-4">
          <section className="rounded-[2rem] bg-card p-4 shadow-card">
            <div className="mb-3 flex items-center justify-between">
              <h3 className="text-xs font-bold uppercase tracking-[0.18em] text-muted-foreground">Calendario de bills</h3>
              <button onClick={() => setEditing("new")} className="flex items-center gap-1 rounded-full bg-primary px-3.5 py-1.5 text-xs font-bold text-primary-foreground"><Plus className="size-3.5" />Nuevo bill</button>
            </div>
            <div className="grid grid-cols-7 gap-1">
              {Array.from({ length: daysInMonth }, (_, i) => i + 1).map((d) => {
                const due = visible.filter((b) => b.dueDay === d);
                const anyPending = due.some((b) => billStatus(b, mk, today) === "pending");
                return (
                  <button key={d} disabled={!due.length} onClick={() => due[0] && setSelected(due[0])}
                    className={cn("relative grid aspect-square place-items-center rounded-xl text-xs font-bold tabular transition",
                      due.length ? (anyPending ? "bg-accent text-accent-foreground hover:scale-105" : "bg-success text-success-foreground hover:scale-105") : "text-muted-foreground/60",
                      isCurrent && d === today.getDate() && "ring-2 ring-foreground")}>
                    {d}
                    {due.length > 1 && <span className="absolute right-1 top-1 size-1.5 rounded-full bg-foreground" />}
                  </button>
                );
              })}
            </div>
          </section>

          <div className="flex gap-2">
            <label className="flex flex-1 items-center gap-2 rounded-full bg-card px-4 py-2.5 shadow-card">
              <Search className="size-4 text-muted-foreground" />
              <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Buscar" className="min-w-0 flex-1 bg-transparent text-sm outline-none placeholder:text-muted-foreground" />
            </label>
            <div className="flex rounded-full bg-card p-1 shadow-card">
              {([["all", "Todos"], ["pending", "Pend."], ["paid", "Pagados"]] as const).map(([k, l]) => (
                <button key={k} onClick={() => setFilter(k)} className={cn("rounded-full px-3 py-1.5 text-xs font-bold transition", filter === k ? "bg-primary text-primary-foreground" : "text-muted-foreground")}>{l}</button>
              ))}
            </div>
          </div>

          {groups.map(({ c, list }) => (
            <section key={c}>
              <div className="mb-1.5 flex justify-between px-2 text-xs font-bold uppercase tracking-[0.14em] text-muted-foreground">
                <span>{CATEGORIES[c]} {c}</span><span className="tabular">{money(list.reduce((a, b) => a + billAmount(b, mk), 0))}</span>
              </div>
              <div className="space-y-2">
                {list.map((b) => <BillRow key={b.id} b={b} mk={mk} today={today} onClick={() => setSelected(b)} />)}
              </div>
            </section>
          ))}
          {!groups.length && <p className="py-8 text-center text-sm text-muted-foreground">No hay bills con ese filtro.</p>}
        </div>
      </div>

      {sel && (
        <Sheet title={sel.name} subtitle={`${money(billAmount(sel, mk))} · vence ${sel.dueDay} · ${Object.entries(splitBill(billAmount(sel, mk), sel.splits)).map(([p, v]) => `${byId(p).name} ${money(v)}`).join(" · ")}${sel.autoPay ? " · pago automático" : ""}`} onClose={() => { setSelected(null); setNewAmount(null); }}>
          <div className="space-y-2.5">
            {billStatus(sel, mk, today) === "paid"
              ? <SheetAction icon={RotateCcw} title="Marcar como pendiente" onClick={() => { patchMonth(sel.id, { status: "pending" }); setSelected(null); }} />
              : <SheetAction icon={RotateCcw} title="Marcar como pagado" onClick={() => { patchMonth(sel.id, { status: "paid" }); setSelected(null); }} />}
            {newAmount === null ? (
              <SheetAction icon={DollarSign} title="Cambiar monto de este mes" hint="No modifica el monto base" onClick={() => setNewAmount(String(billAmount(sel, mk)))} />
            ) : (
              <div className="flex gap-2 rounded-2xl border border-primary/40 p-2">
                <input autoFocus value={newAmount} inputMode="decimal" onChange={(e) => setNewAmount(e.target.value.replace(/[^\d.]/g, ""))} className="min-w-0 flex-1 bg-transparent px-3 outline-none" />
                <button disabled={!(Number(newAmount) > 0)} onClick={() => { patchMonth(sel.id, { amount: Number(newAmount) }); setNewAmount(null); toast.success("Monto de este mes actualizado"); }} className="rounded-xl bg-primary px-4 py-2 text-sm font-bold text-primary-foreground disabled:opacity-40">Guardar</button>
              </div>
            )}
            <SheetAction icon={Pencil} title="Editar bill recurrente" hint="Nombre, monto base, fecha o reparto" onClick={() => { setEditing(sel); setSelected(null); }} />
            <SheetAction icon={MinusCircle} title="Omitir este mes" hint="Volverá a aparecer el próximo mes" onClick={() => {
              patchMonth(sel.id, { hidden: true }); setSelected(null);
              toast(`${sel.name} omitido este mes`, { action: { label: "Deshacer", onClick: () => patchMonth(sel.id, { hidden: false }) } });
            }} />
            <SheetAction danger icon={Trash2} title="Eliminar de todos los meses" hint="Podrás deshacerlo unos segundos" onClick={() => {
              const copy = sel; f.setBills((bs) => bs.filter((b) => b.id !== copy.id)); setSelected(null);
              toast(`${copy.name} eliminado`, { action: { label: "Deshacer", onClick: () => f.setBills((bs) => [...bs, copy]) } });
            }} />
          </div>
        </Sheet>
      )}

      {editing && (
        <BillForm initial={editing === "new" ? undefined : editing} onClose={() => setEditing(null)} onSave={(b) => {
          f.setBills((bs) => (bs.some((x) => x.id === b.id) ? bs.map((x) => (x.id === b.id ? b : x)) : [...bs, b]));
          setEditing(null); toast.success("Bill guardado");
        }} />
      )}

      {addingAporte && <AporteForm mk={mk} onClose={() => setAddingAporte(false)} onSave={(c) => { f.setContributions((cs) => [...cs, c]); setAddingAporte(false); toast.success("Aporte registrado"); }} />}
    </div>
  );
}

function AporteForm({ mk, onSave, onClose }: { mk: string; onSave: (c: Contribution) => void; onClose: () => void }) {
  const [personId, setPersonId] = useState("papa");
  const [amount, setAmount] = useState("");
  const [note, setNote] = useState("");
  const ok = Number(amount) > 0;
  return (
    <Sheet title="Nuevo aporte" subtitle="Dinero que entra al fondo común" onClose={onClose}>
      <div className="space-y-3">
        <div className="grid grid-cols-4 gap-2">
          {MEMBERS.map((m) => (
            <button key={m.id} onClick={() => setPersonId(m.id)} className={cn("flex flex-col items-center gap-1.5 rounded-2xl border p-3", personId === m.id && "border-primary bg-primary/10")}>
              <Avatar m={m} /><span className="text-xs font-semibold">{m.name}</span>
            </button>
          ))}
        </div>
        <input value={amount} inputMode="decimal" onChange={(e) => setAmount(e.target.value.replace(/[^\d.]/g, ""))} placeholder="Monto 0.00" className="w-full rounded-2xl border bg-background px-4 py-3 font-display text-xl outline-none focus:border-primary" />
        <input value={note} maxLength={60} onChange={(e) => setNote(e.target.value)} placeholder="Nota (opcional)" className="w-full rounded-2xl border bg-background px-4 py-3 outline-none focus:border-primary" />
        <button disabled={!ok} onClick={() => onSave({ id: crypto.randomUUID(), personId, amount: Number(amount), month: mk, note: note.trim() })} className="w-full rounded-2xl bg-primary py-3.5 font-bold text-primary-foreground shadow-glow disabled:opacity-40 disabled:shadow-none">Guardar aporte</button>
      </div>
    </Sheet>
  );
}
