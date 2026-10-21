import { useEffect, useState } from "react";
import { CheckSquare, Home, LogOut, Monitor, Plus, ShoppingCart, Smartphone, Wallet } from "lucide-react";
import { cn } from "@/lib/utils";
import { Avatar, Kiosk, PinPad, useClock } from "./Kiosk";
import { Chores, Dashboard, Shopping, useHubState } from "./Screens";
import { Finance } from "./Finance";
import { MEMBERS, type Member } from "./data";

type Tab = "home" | "chores" | "shopping" | "finance";
const TABS: { id: Tab; label: string; icon: typeof Home }[] = [
  { id: "home", label: "Inicio", icon: Home },
  { id: "chores", label: "Tareas", icon: CheckSquare },
  { id: "shopping", label: "Compras", icon: ShoppingCart },
  { id: "finance", label: "Finanzas", icon: Wallet },
];

export function HubApp() {
  const [device, setDevice] = useState<"tablet" | "mobile">("tablet");
  const [user, setUser] = useState<Member | null>(null);
  const [tab, setTab] = useState<Tab>("home");
  const [financeUnlocked, setFinanceUnlocked] = useState(false);
  const [quick, setQuick] = useState(false);
  const [askAdmin, setAskAdmin] = useState<Member | null>(null);
  const s = useHubState();
  const now = useClock();

  useEffect(() => {
    if (window.innerWidth < 900) setDevice("mobile");
  }, []);

  const compact = device === "mobile";

  const go = (t: Tab) => {
    if (t === "finance" && user?.role !== "admin" && !financeUnlocked) {
      setAskAdmin(MEMBERS[0] ?? null);
      return;
    }
    setTab(t);
  };

  const logout = () => {
    setUser(null);
    setTab("home");
    setFinanceUnlocked(false);
  };

  return (
    <div className="flex min-h-screen flex-col items-center bg-background px-3 py-4 sm:px-6">
      <div className="mb-4 flex items-center gap-1 rounded-full bg-card p-1 shadow-card">
        {([["tablet", Monitor, "Tablet (kiosco)"], ["mobile", Smartphone, "Móvil personal"]] as const).map(([d, Icon, label]) => (
          <button
            key={d}
            onClick={() => setDevice(d)}
            className={cn("flex items-center gap-2 rounded-full px-4 py-2 text-sm font-semibold transition", device === d ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground")}
          >
            <Icon className="size-4" /> {label}
          </button>
        ))}
      </div>

      <div
        className={cn(
          "relative w-full overflow-hidden border bg-background shadow-card transition-all duration-500",
          compact ? "h-[800px] max-w-[400px] rounded-[2.5rem] border-[6px] border-foreground" : "aspect-[16/10] max-w-[1200px] rounded-[2rem] border-[12px] border-foreground",
        )}
      >
        {!user ? (
          <Kiosk compact={compact} onUnlock={setUser} />
        ) : (
          <div className="flex h-full flex-col">
            <header className={cn("flex items-center gap-3", compact ? "px-5 pb-2 pt-5" : "px-6 py-4")}>
              {compact ? (
                <>
                  <Avatar m={user} />
                  <div className="min-w-0 flex-1">
                    <p className="text-xs text-muted-foreground">Familia Pérez</p>
                    <p className="font-display text-lg font-bold leading-tight">{TABS.find((t) => t.id === tab)!.label}</p>
                  </div>
                  <button onClick={logout} aria-label="Bloquear" className="grid size-10 place-items-center rounded-full bg-card shadow-card"><LogOut className="size-4" /></button>
                </>
              ) : (
                <>
                  <span className="font-display text-xl font-extrabold tracking-tight">home<span className="text-muted-foreground">hub</span></span>
                  <nav className="mx-auto flex gap-1 rounded-full bg-card p-1.5 shadow-card">
                    {TABS.map(({ id, label, icon: Icon }) => (
                      <button key={id} onClick={() => go(id)} className={cn("flex items-center gap-2 rounded-full px-5 py-2.5 text-sm font-semibold transition", tab === id ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground")}>
                        <Icon className="size-4" /> {label}
                      </button>
                    ))}
                  </nav>
                  <span className="font-display text-lg font-bold tabular text-muted-foreground">{now?.toLocaleTimeString("es", { hour: "2-digit", minute: "2-digit" })}</span>
                  <button onClick={logout} aria-label="Bloquear" className="flex items-center gap-2 rounded-full bg-card p-1 pr-3 shadow-card">
                    <Avatar m={user} size="sm" /><LogOut className="size-4 text-muted-foreground" />
                  </button>
                </>
              )}
            </header>
            <main className={cn("min-h-0 flex-1 overflow-y-auto", compact ? "px-5 pb-28 pt-2" : "px-8 pb-8 pt-2")}>
              {tab !== "home" && !compact && <h1 className="mb-5 font-display text-5xl font-extrabold tracking-[-0.04em]">{TABS.find((t) => t.id === tab)!.label}</h1>}
              <div key={tab} className="animate-in fade-in slide-in-from-bottom-2 duration-300">
                {tab === "home" && <Dashboard s={s} user={user} compact={compact} go={go} />}
                {tab === "chores" && <Chores s={s} compact={compact} />}
                {tab === "shopping" && <Shopping s={s} compact={compact} />}
                {tab === "finance" && <Finance f={s} compact={compact} />}
              </div>
            </main>
            {compact && (
              <nav className="absolute inset-x-4 bottom-4 z-20 flex items-center justify-between rounded-[1.75rem] bg-card px-3 py-2 shadow-card">
                {TABS.slice(0, 2).map(({ id, label, icon: Icon }) => (
                  <DockBtn key={id} active={tab === id} label={label} Icon={Icon} onClick={() => go(id)} />
                ))}
                <button onClick={() => setQuick(true)} aria-label="Añadir" className="-mt-8 grid size-14 place-items-center rounded-full bg-primary text-primary-foreground shadow-glow ring-8 ring-background transition active:scale-95">
                  <Plus className="size-6" />
                </button>
                {TABS.slice(2).map(({ id, label, icon: Icon }) => (
                  <DockBtn key={id} active={tab === id} label={label} Icon={Icon} onClick={() => go(id)} />
                ))}
              </nav>
            )}
            {quick && (
              <div className="absolute inset-0 z-30 flex items-end bg-foreground/20 backdrop-blur-sm animate-in fade-in" onClick={() => setQuick(false)}>
                <div className="w-full rounded-t-[2rem] bg-card p-5 pb-8 animate-in slide-in-from-bottom" onClick={(e) => e.stopPropagation()}>
                  <p className="mb-4 font-display text-xl font-bold">¿Qué quieres añadir?</p>
                  <div className="grid grid-cols-3 gap-3">
                    {([["shopping", "Compra", "bg-accent", ShoppingCart], ["chores", "Tarea", "bg-success", CheckSquare], ["finance", "Bill", "bg-sky", Wallet]] as const).map(([t, l, tone, Icon]) => (
                      <button key={t} onClick={() => { setQuick(false); go(t); }} className={cn("flex aspect-square flex-col items-center justify-center gap-2 rounded-[1.5rem] font-semibold", tone)}>
                        <Icon className="size-7" /> {l}
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            )}
          </div>
        )}

        {askAdmin && (
          <PinPad
            member={askAdmin}
            title="Finanzas: PIN de un adulto"
            onCancel={() => setAskAdmin(null)}
            onSuccess={() => {
              setAskAdmin(null);
              setFinanceUnlocked(true);
              setTab("finance");
            }}
          />
        )}
      </div>
      <p className="mt-4 max-w-md text-center text-xs text-muted-foreground">
        Prototipo visual con datos de ejemplo. Entra como Lucas (PIN 1111) para ver cómo Finanzas pide el PIN de un adulto.
      </p>
    </div>
  );
}

function DockBtn({ active, label, Icon, onClick }: { active: boolean; label: string; Icon: typeof Home; onClick: () => void }) {
  return (
    <button onClick={onClick} className={cn("flex w-16 flex-col items-center gap-1 py-1 text-[11px] font-semibold transition", active ? "text-foreground" : "text-muted-foreground")}>
      <span className={cn("grid h-8 w-12 place-items-center rounded-full transition", active && "bg-success")}><Icon className="size-5" /></span>
      {label}
    </button>
  );
}
