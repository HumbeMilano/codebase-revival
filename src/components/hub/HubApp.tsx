import { useCallback, useEffect, useState } from "react";
import { CalendarDays, CheckSquare, Home, LogOut, Monitor, MoreHorizontal, Plus, ShieldCheck, ShoppingCart, Smartphone, StickyNote, Users, Wallet, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { canViewFinances } from "@/lib/finance-visibility";
import { Avatar, Kiosk, PinPad, useClock } from "./Kiosk";
import { Chores, Dashboard, Shopping, useHubState } from "./Screens";
import { Finance } from "./Finance";
import { FamilyCalendar, FamilyNotes } from "./Planner";
import { HOUSEHOLD, MEMBERS, setMembers, type Member } from "./data";
import { HouseholdSettings, SetupHousehold, Welcome } from "./Onboarding";
import { supabase } from "@/integrations/supabase/client";
import { db, forgetDevice, getDeviceToken, setDeviceMode } from "@/lib/db";
import { setHouseholdId } from "@/lib/hub-db";

type Tab = "home" | "chores" | "shopping" | "finance" | "calendar" | "notes" | "household";
const TABS: { id: Tab; label: string; icon: typeof Home }[] = [
  { id: "home", label: "Inicio", icon: Home },
  { id: "chores", label: "Tareas", icon: CheckSquare },
  { id: "shopping", label: "Compras", icon: ShoppingCart },
  { id: "finance", label: "Finanzas", icon: Wallet },
  { id: "calendar", label: "Calendario", icon: CalendarDays },
  { id: "notes", label: "Notas", icon: StickyNote },
  { id: "household", label: "Hogar", icon: Users },
];

type Gate = { status: "loading" | "welcome" | "setup" } | { status: "ready"; mode: "account" | "device"; member: Member | null };

/** Resolves who this browser is: a signed-in account, a paired tablet, or nobody yet. */
async function resolveGate(): Promise<Gate> {
  const { data: { session } } = await supabase.auth.getSession();
  const token = getDeviceToken();
  setDeviceMode(session ? null : token);
  if (!session && !token) return { status: "welcome" };
  const { data: ctx } = await db().rpc("my_context");
  const c = ctx?.[0];
  if (!c) {
    if (session) return { status: "setup" };
    forgetDevice();
    return { status: "welcome" };
  }
  setHouseholdId(c.household_id);
  HOUSEHOLD.id = c.household_id;
  HOUSEHOLD.name = c.household_name;
  const { data: members } = await db().rpc("household_members");
  setMembers(members ?? []);
  const member = c.member_key ? MEMBERS.find((m) => m.id === c.member_key) ?? null : null;
  return { status: "ready", mode: c.mode === "device" ? "device" : "account", member };
}

export function HubApp() {
  const [device, setDevice] = useState<"tablet" | "mobile">("tablet");
  const [gate, setGate] = useState<Gate>({ status: "loading" });
  const reload = useCallback(() => void resolveGate().then(setGate).catch(() => setGate({ status: "welcome" })), []);
  useEffect(() => {
    if (window.innerWidth < 900) setDevice("mobile");
    reload();
    const { data } = supabase.auth.onAuthStateChange((event) => {
      if (event === "SIGNED_IN" || event === "SIGNED_OUT") reload();
    });
    return () => data.subscription.unsubscribe();
  }, [reload]);
  const compact = device === "mobile";

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
        {gate.status === "loading" && <div className="grid h-full place-items-center text-muted-foreground">Cargando…</div>}
        {gate.status === "welcome" && <Welcome compact={compact} onPaired={reload} />}
        {gate.status === "setup" && <SetupHousehold compact={compact} onDone={reload} />}
        {gate.status === "ready" && <HubShell key={gate.mode + (gate.member?.id ?? "")} compact={compact} mode={gate.mode} accountMember={gate.member} />}
      </div>
      <p className="mt-4 max-w-md text-center text-xs text-muted-foreground">
        Demo: empareja la tablet con el código PEREZ1 y entra con PIN Papá 1111 · Mamá 2222 · Lucas 3333 · Sofía 4444.
      </p>
    </div>
  );
}

function HubShell({ compact, mode, accountMember }: { compact: boolean; mode: "account" | "device"; accountMember: Member | null }) {
  const [user, setUser] = useState<Member | null>(accountMember);
  const [tab, setTab] = useState<Tab>("home");
  const [financeUnlocked, setFinanceUnlocked] = useState(false);
  const [quick, setQuick] = useState(false);
  const [askAdmin, setAskAdmin] = useState(false);
  const [more, setMore] = useState(false);
  const s = useHubState();
  const now = useClock();
  const financialAccess = canViewFinances(user?.role, financeUnlocked);
  const canManage = mode === "account" && user?.role === "admin";
  const visibleTabs = TABS.filter((t) => (t.id !== "finance" || financialAccess) && (t.id !== "household" || canManage));

  const go = (t: Tab) => {
    if (t === "finance" && !financialAccess) {
      setAskAdmin(true);
      return;
    }
    setTab(t);
  };

  const logout = () => {
    if (mode === "account") {
      void supabase.auth.signOut();
      return;
    }
    setUser(null);
    setTab("home");
    setFinanceUnlocked(false);
    setQuick(false);
    setMore(false);
    setAskAdmin(false);
  };

  return (
      <>
        {!user ? (
          <Kiosk compact={compact} onUnlock={setUser} />
        ) : (
          <div className="flex h-full flex-col">
            <header className={cn("flex items-center gap-3", compact ? "px-5 pb-2 pt-5" : "px-6 py-4")}>
              {compact ? (
                <>
                  <Avatar m={user} />
                  <div className="min-w-0 flex-1">
                    <p className="text-xs text-muted-foreground">{HOUSEHOLD.name}</p>
                    <p className="font-display text-lg font-bold leading-tight">{TABS.find((t) => t.id === tab)?.label}</p>
                  </div>
                  <button onClick={logout} aria-label="Bloquear" className="grid size-10 place-items-center rounded-full bg-card shadow-card"><LogOut className="size-4" /></button>
                </>
              ) : (
                <>
                  <span className="font-display text-xl font-extrabold tracking-tight">home<span className="text-muted-foreground">hub</span></span>
                  <nav className="mx-auto flex flex-wrap justify-center gap-1 rounded-2xl bg-card p-1 shadow-card">
                    {visibleTabs.map(({ id, label, icon: Icon }) => (
                      <Button variant="ghost" key={id} onClick={() => go(id)} className={cn("flex items-center gap-1.5 rounded-full px-3 py-2 text-sm font-semibold transition", tab === id ? "bg-primary text-primary-foreground hover:bg-primary/90" : "text-muted-foreground hover:text-foreground")}>
                        <Icon className="size-4" /> {label}
                      </Button>
                    ))}
                  </nav>
                  <span className="font-display text-lg font-bold tabular text-muted-foreground">{now?.toLocaleTimeString("es", { hour: "2-digit", minute: "2-digit" })}</span>
                  <button onClick={logout} aria-label="Bloquear" className="flex items-center gap-2 rounded-full bg-card p-1 pr-3 shadow-card">
                    <Avatar m={user} size="sm" /><LogOut className="size-4 text-muted-foreground" />
                  </button>
                </>
              )}
              {!financialAccess && <Button variant="ghost" size="icon" onClick={() => setAskAdmin(true)} aria-label="Autorización de un adulto" title="Autorización de un adulto" className="shrink-0 rounded-full bg-card"><ShieldCheck /></Button>}
            </header>
            <main className={cn("min-h-0 flex-1 overflow-y-auto", compact ? "px-5 pb-28 pt-2" : "px-8 pb-8 pt-2")}>
              {tab !== "home" && !compact && <h1 className="mb-5 font-display text-5xl font-extrabold tracking-[-0.04em]">{TABS.find((t) => t.id === tab)?.label}</h1>}
              <div key={tab} className="animate-in fade-in slide-in-from-bottom-2 duration-300">
                {tab === "home" && <Dashboard s={s} user={user} compact={compact} go={go} adultAuthorized={financeUnlocked} />}
                {tab === "chores" && <Chores s={s} compact={compact} />}
                {tab === "shopping" && <Shopping s={s} compact={compact} />}
                {tab === "finance" && financialAccess && <Finance f={s} compact={compact} />}
                {tab === "calendar" && <FamilyCalendar events={s.events} setEvents={s.setEvents} user={user} compact={compact} />}
                {tab === "notes" && <FamilyNotes notes={s.notes} setNotes={s.setNotes} user={user} compact={compact} />}
                {tab === "household" && canManage && <HouseholdSettings />}
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
                {TABS.filter((t) => t.id === "shopping").map(({ id, label, icon: Icon }) => (
                  <DockBtn key={id} active={tab === id} label={label} Icon={Icon} onClick={() => go(id)} />
                ))}
                <DockBtn active={tab === "calendar" || tab === "notes" || tab === "finance" || tab === "household"} label="Más" Icon={MoreHorizontal} onClick={() => setMore(true)} />
              </nav>
            )}
            {quick && (
              <div className="absolute inset-0 z-30 flex items-end bg-foreground/20 backdrop-blur-sm animate-in fade-in" onClick={() => setQuick(false)}>
                <div className="w-full rounded-t-[2rem] bg-card p-5 pb-8 animate-in slide-in-from-bottom" onClick={(e) => e.stopPropagation()}>
                  <p className="mb-4 font-display text-xl font-bold">¿Qué quieres añadir?</p>
                  <div className="grid grid-cols-2 gap-3">
                    {([["shopping", "Compra", "bg-accent", ShoppingCart], ["chores", "Tarea", "bg-success", CheckSquare], ["calendar", "Evento", "bg-sky", CalendarDays], ["notes", "Nota", "bg-lilac", StickyNote], ["finance", "Bill", "bg-sky", Wallet]] as const).filter(([t]) => t !== "finance" || financialAccess).map(([t, l, tone, Icon]) => (
                      <button key={t} onClick={() => { setQuick(false); go(t); }} className={cn("flex aspect-square flex-col items-center justify-center gap-2 rounded-[1.5rem] font-semibold", tone)}>
                        <Icon className="size-7" /> {l}
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            )}
            {more && <div className="absolute inset-0 z-30 flex items-end bg-foreground/20 backdrop-blur-sm" onClick={() => setMore(false)}>
              <section role="dialog" aria-label="Más secciones" className="w-full rounded-t-3xl bg-card p-5 pb-8" onClick={(e) => e.stopPropagation()}>
                <header className="mb-3 flex items-center justify-between"><h2 className="font-display text-xl font-bold">Más</h2><Button variant="ghost" size="icon" aria-label="Cerrar" onClick={() => setMore(false)}><X /></Button></header>
                <div className="space-y-1">{visibleTabs.filter((t) => ["calendar", "notes", "finance", "household"].includes(t.id)).map(({ id, label, icon: Icon }) => <Button key={id} variant="ghost" className="h-14 w-full justify-start rounded-xl" onClick={() => { setMore(false); go(id); }}><Icon />{label}</Button>)}</div>
              </section>
            </div>}
          </div>
        )}

        {askAdmin && (
          <PinPad
            adminOnly
            title="Finanzas: PIN de un adulto"
            onCancel={() => setAskAdmin(false)}
            onSuccess={() => {
              setAskAdmin(false);
              setFinanceUnlocked(true);
              setTab("finance");
            }}
          />
        )}
      </>
  );
}

function DockBtn({ active, label, Icon, onClick }: { active: boolean; label: string; Icon: typeof Home; onClick: () => void }) {
  return (
    <Button variant="ghost" onClick={onClick} className={cn("h-auto w-14 flex-col gap-1 px-0 py-1 text-[11px] font-semibold transition", active ? "text-foreground" : "text-muted-foreground")}>
      <span className={cn("grid h-8 w-12 place-items-center rounded-full transition", active && "bg-success")}><Icon className="size-5" /></span>
      {label}
    </Button>
  );
}
