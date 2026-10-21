import { useEffect, useState } from "react";
import { CheckSquare, Home, LogOut, Monitor, ShoppingCart, Smartphone, Wallet } from "lucide-react";
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
          <div className={cn("flex h-full", compact ? "flex-col" : "flex-row")}>
            {!compact && (
              <nav className="m-3 mr-0 flex w-20 flex-col items-center gap-2 rounded-[1.75rem] bg-sidebar py-5 shadow-card">
                <span className="mb-4 font-display text-lg font-bold text-primary">HH</span>
                {TABS.map(({ id, label, icon: Icon }) => (
                  <button key={id} onClick={() => go(id)} aria-label={label} className={cn("grid size-12 place-items-center rounded-2xl transition", tab === id ? "bg-primary text-primary-foreground shadow-glow" : "text-muted-foreground hover:bg-secondary hover:text-foreground")}>
                    <Icon className="size-5" />
                  </button>
                ))}
                <button onClick={logout} aria-label="Bloquear" className="mt-auto grid size-12 place-items-center rounded-2xl text-muted-foreground hover:bg-secondary">
                  <LogOut className="size-5" />
                </button>
              </nav>
            )}

            <div className="flex min-h-0 flex-1 flex-col">
              <header className="flex items-center justify-between px-5 pb-1 pt-4">
                <div>
                  <p className="text-xs text-muted-foreground">Familia Pérez</p>
                  <h1 className="font-display text-3xl font-extrabold tracking-tight">{TABS.find((t) => t.id === tab)!.label}</h1>
                </div>
                <div className="flex items-center gap-3">
                  {!compact && <span className="font-display text-lg font-semibold tabular text-muted-foreground">{now?.toLocaleTimeString("es", { hour: "2-digit", minute: "2-digit" })}</span>}
                  <button onClick={compact ? logout : undefined} aria-label="Perfil"><Avatar m={user} /></button>
                </div>
              </header>
              <main className="min-h-0 flex-1 overflow-y-auto p-4 sm:p-5">
                <div key={tab} className="animate-in fade-in slide-in-from-bottom-2 duration-300">
                  {tab === "home" && <Dashboard s={s} user={user} compact={compact} openFinance={() => go("finance")} />}
                  {tab === "chores" && <Chores s={s} compact={compact} />}
                  {tab === "shopping" && <Shopping s={s} compact={compact} />}
                  {tab === "finance" && <Finance f={s} compact={compact} />}
                </div>
              </main>
              {compact && (
                <nav className="mx-3 mb-3 grid grid-cols-4 rounded-full bg-primary p-1.5 shadow-glow">
                  {TABS.map(({ id, label, icon: Icon }) => (
                    <button key={id} onClick={() => go(id)} className={cn("flex flex-col items-center gap-0.5 rounded-full py-2 text-[11px] font-semibold transition", tab === id ? "bg-primary-foreground text-primary" : "text-primary-foreground/60")}>
                      <Icon className="size-5" /> {label}
                    </button>
                  ))}
                </nav>
              )}
            </div>
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
