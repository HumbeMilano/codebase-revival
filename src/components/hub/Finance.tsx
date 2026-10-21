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
    <button onClick={onClick} className="flex w-full items-center gap-3 border-t px-4 py-3.5 text-left transition first:border-t-0 hover:bg-secondary/70">
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
  const [view, setView] = useState<"resumen" | "bills" | "aportes">("resumen");
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

  return (
    <div className="space-y-5 pb-4">
      <div className="flex items-center justify-between gap-2">
        <h2 className="font-display text-2xl font-bold capitalize">{label}</h2>
        <div className="flex gap-2">
          <button onClick={() => setCursor({ y: today.getFullYear(), m: today.getMonth() })} className="rounded-2xl border px-4 py-2 text-sm font-semibold hover:bg-secondary">Hoy</button>
          <button onClick={() => shift(-1)} aria-label="Mes anterior" className="grid size-10 place-items-center rounded-2xl border hover:bg-secondary"><ChevronLeft className="size-4" /></button>
          <button onClick={() => shift(1)} aria-label="Mes siguiente" className="grid size-10 place-items-center rounded-2xl border hover:bg-secondary"><ChevronRight className="size-4" /></button>
        </div>
      </div>

      <div className="flex gap-1 rounded-full bg-card p-1 shadow-card">
        {(["resumen", "bills", "aportes"] as const).map((v) => (
          <button key={v} onClick={() => setView(v)} className={cn("flex-1 rounded-full py-2 text-sm font-semibold capitalize transition", view === v ? "bg-primary text-primary-foreground" : "text-muted-foreground")}>{v}</button>
        ))}
      </div>

      {view === "resumen" && (
        <>
          <section className="rounded-[1.75rem] bg-card bg-glow p-5 shadow-card">
            <div className="flex items-center gap-5">
              <Donut paid={sum.paid} total={sum.total} />
              <div>
                <p className="text-sm text-muted-foreground">Bills del mes</p>
                <p className="font-display text-4xl font-extrabold tracking-tight tabular">{money(sum.total)}</p>
                <p className="mt-1 flex items-center gap-2 text-sm text-muted-foreground"><span className="size-2.5 rounded-full bg-destructive" />{sum.pendingCount} pendientes</p>
              </div>
            </div>
            <div className="mt-5 grid grid-cols-3 divide-x border-t pt-4">
              {[["Aportado", sum.contributed, "text-foreground"], ["Pagado", sum.paid, "text-success-foreground"], ["Pendiente", sum.pending, "text-destructive"]].map(([l, v, c]) => (
                <div key={l as string} className="px-3 first:pl-0">
                  <p className="text-xs text-muted-foreground">{l}</p>
                  <p className={cn("font-display text-lg font-bold tabular", c as string)}>{money(v as number)}</p>
                </div>
              ))}
            </div>
          </section>

          <div>
            <div className="mb-3 flex items-center justify-between">
              <h3 className="font-display text-lg font-bold">Aportes y bills por persona</h3>
              <button onClick={() => setView("aportes")} className="text-sm font-semibold text-primary">Administrar</button>
            </div>
            <div className={cn("gap-3", compact ? "-mx-4 flex snap-x overflow-x-auto px-4 pb-2" : "grid grid-cols-3")}>
              {sum.persons.filter((p) => p.billCount).map((p) => {
                const m = byId(p.personId);
                return (
                  <div key={p.personId} className={cn("rounded-[1.75rem] bg-card p-4 shadow-card", compact && "w-[85%] shrink-0 snap-start")}>
                    <div className="flex items-center gap-3"><Avatar m={m} /><span className="flex-1 font-semibold">{m.name}</span><span className="rounded-full bg-destructive/15 px-2 py-0.5 text-[11px] font-bold text-destructive">{p.billCount} bills</span></div>
                    <p className="mt-3 font-display text-2xl font-bold tabular">{money(p.assigned)} <span className="text-xs font-medium text-muted-foreground">asignado</span></p>
                    <div className="mt-2 h-2 overflow-hidden rounded-full bg-muted"><div className="h-full rounded-full bg-success-strong" style={{ width: `${p.assigned ? (p.paid / p.assigned) * 100 : 0}%` }} /></div>
                    <div className="mt-1.5 flex justify-between text-xs text-muted-foreground tabular"><span>Pagado {money(p.paid)}</span><span>Pendiente {money(p.pending)}</span></div>
                    <div className="mt-3 grid grid-cols-2 gap-2">
                      <div className="rounded-2xl border p-2.5"><p className="text-[11px] text-muted-foreground">Aportó</p><p className="font-bold text-foreground tabular">{money(p.contributed)}</p></div>
                      <div className="rounded-2xl border p-2.5"><p className="text-[11px] text-muted-foreground">Disponible</p><p className={cn("font-bold tabular", p.available < 0 ? "text-destructive" : "text-success-foreground")}>{money(p.available)}</p></div>
                    </div>
                    <div className="mt-2 flex items-center justify-between rounded-2xl border p-2.5 text-sm">
                      <span className="text-muted-foreground">Aún debe aportar</span>
                      <span className={cn("font-bold tabular", p.stillOwes > 0 ? "text-destructive" : "text-success-foreground")}>{p.stillOwes > 0 ? money(p.stillOwes) : "Al día ✓"}</span>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          <div>
            <div className="mb-3 flex items-center justify-between">
              <h3 className="font-display text-lg font-bold">Bills del mes</h3>
              <button onClick={() => setView("bills")} className="text-sm font-semibold text-primary">Ver todos</button>
            </div>
            <div className="overflow-hidden rounded-[1.75rem] bg-card shadow-card">
              {visible.filter((b) => b.dueDay >= (mk === monthKey(today.getFullYear(), today.getMonth()) ? today.getDate() : 0)).slice(0, 5)
                .map((b) => <BillRow key={b.id} b={b} mk={mk} today={today} onClick={() => setSelected(b)} />)}
            </div>
          </div>
        </>
      )}

      {view === "bills" && (
        <>
          <div className="flex items-center justify-between gap-3">
            <p className="text-sm text-muted-foreground">Obligaciones recurrentes y quién cubre cada una.</p>
            <button onClick={() => setEditing("new")} className="flex shrink-0 items-center gap-1.5 rounded-2xl bg-primary px-4 py-2.5 text-sm font-bold text-primary-foreground shadow-glow"><Plus className="size-4" />Nuevo</button>
          </div>
          <label className="flex items-center gap-2 rounded-2xl border bg-card px-4 py-3">
            <Search className="size-4 text-muted-foreground" />
            <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Buscar bill, categoría o persona" className="flex-1 bg-transparent outline-none placeholder:text-muted-foreground" />
          </label>
          <div className="flex gap-2">
            {([["all", "Todos"], ["pending", "Pendientes"], ["paid", "Pagados"]] as const).map(([k, l]) => (
              <button key={k} onClick={() => setFilter(k)} className={cn("rounded-full border px-4 py-1.5 text-sm font-semibold", filter === k ? "border-primary bg-success text-success-foreground" : "text-muted-foreground")}>{l}</button>
            ))}
          </div>
          {groups.map(({ c, list }) => (
            <div key={c} className="overflow-hidden rounded-[1.75rem] bg-card shadow-card">
              <div className="flex justify-between bg-secondary/70 px-4 py-2.5 text-sm font-semibold text-muted-foreground">
                <span>{CATEGORIES[c]} {c}</span><span className="tabular">{money(list.reduce((a, b) => a + billAmount(b, mk), 0))}</span>
              </div>
              {list.map((b) => <BillRow key={b.id} b={b} mk={mk} today={today} onClick={() => setSelected(b)} />)}
            </div>
          ))}
          {!groups.length && <p className="py-8 text-center text-sm text-muted-foreground">No hay bills con ese filtro.</p>}
        </>
      )}

      {view === "aportes" && (
        <>
          <div className="flex items-center justify-between gap-3">
            <p className="text-sm text-muted-foreground">Dinero que cada persona pone en el fondo común este mes.</p>
            <button onClick={() => setAddingAporte(true)} className="flex shrink-0 items-center gap-1.5 rounded-2xl bg-primary px-4 py-2.5 text-sm font-bold text-primary-foreground shadow-glow"><Plus className="size-4" />Aporte</button>
          </div>
          <div className="overflow-hidden rounded-[1.75rem] bg-card shadow-card">
            {f.contributions.filter((c) => c.month === mk).map((c) => (
              <div key={c.id} className="flex items-center gap-3 border-t px-4 py-3 first:border-t-0">
                <Avatar m={byId(c.personId)} />
                <div className="flex-1"><p className="font-semibold">{byId(c.personId).name}</p><p className="text-xs text-muted-foreground">{c.note || "Aporte"}</p></div>
                <span className="font-display font-bold text-foreground tabular">{money(c.amount)}</span>
                <button aria-label="Eliminar aporte" onClick={() => {
                  f.setContributions((cs) => cs.filter((x) => x.id !== c.id));
                  toast("Aporte eliminado", { action: { label: "Deshacer", onClick: () => f.setContributions((cs) => [...cs, c]) } });
                }} className="text-muted-foreground hover:text-destructive"><Trash2 className="size-4" /></button>
              </div>
            ))}
            {!f.contributions.some((c) => c.month === mk) && <p className="p-6 text-center text-sm text-muted-foreground">Aún no hay aportes este mes.</p>}
          </div>
        </>
      )}

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
