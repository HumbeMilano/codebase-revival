import { lazy, Suspense, useCallback, useEffect, useRef, useState } from "react";
import {
  CalendarDays,
  CheckSquare,
  Home,
  LogOut,
  MoreHorizontal,
  Plus,
  RefreshCw,
  ShieldCheck,
  ShoppingCart,
  StickyNote,
  UserRound,
  Users,
  Wallet,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { canViewFinances } from "@/lib/finance-visibility";
import { Avatar, Kiosk, PinPad, useClock } from "./Kiosk";
import { Chores, Dashboard, Shopping, useHubState } from "./Screens";
import { HOUSEHOLD, MEMBERS, setMembers, type Member } from "./data";
import { HouseholdSettings, SetupHousehold, Welcome } from "./Onboarding";
import { supabase } from "@/integrations/supabase/client";
import {
  clearFinanceAccess,
  currentDbIdentity,
  db,
  forgetDevice,
  getDeviceToken,
  hasFinanceToken,
  invalidateDbContext,
  prepareDbContext,
  updateAccountToken,
} from "@/lib/db";
import { toast } from "sonner";
import { setHouseholdId } from "@/lib/hub-db";
import { sessionIdentity } from "@/lib/session-identity";
import { personalPreferences } from "@/lib/account-validation";

const Finance = lazy(() => import("./Finance").then((m) => ({ default: m.Finance })));
const FamilyCalendar = lazy(() => import("./Planner").then((m) => ({ default: m.FamilyCalendar })));
const FamilyNotes = lazy(() => import("./Planner").then((m) => ({ default: m.FamilyNotes })));
const PersonalProfile = lazy(() =>
  import("./PersonalProfile").then((m) => ({ default: m.PersonalProfile })),
);
type Tab =
  "home" | "chores" | "shopping" | "finance" | "calendar" | "notes" | "household" | "profile";
const TABS: { id: Tab; label: string; icon: typeof Home }[] = [
  { id: "home", label: "Inicio", icon: Home },
  { id: "chores", label: "Tareas", icon: CheckSquare },
  { id: "shopping", label: "Compras", icon: ShoppingCart },
  { id: "finance", label: "Finanzas", icon: Wallet },
  { id: "calendar", label: "Calendario", icon: CalendarDays },
  { id: "notes", label: "Notas", icon: StickyNote },
  { id: "household", label: "Hogar", icon: Users },
  { id: "profile", label: "Mi perfil", icon: UserRound },
];
type Gate =
  | { status: "loading" | "welcome" | "setup" }
  | { status: "error"; message: string }
  | {
      status: "ready";
      mode: "account" | "device";
      member: Member | null;
      identity: string;
    };
type MemberRow = { key: string; name: string; role: string };
const gateError = (error: unknown) => {
  const message =
    error && typeof error === "object" && "message" in error ? String(error.message) : "";
  if (/suspend/i.test(message))
    return "Este hogar está suspendido. Contacta con la administración del servicio.";
  if (/revoked|invalid device|device.*invalid/i.test(message))
    return "Esta tablet ha sido desvinculada. Empareja el dispositivo de nuevo.";
  return "No se pudo abrir tu hogar. Comprueba la conexión y vuelve a intentarlo.";
};

/** Only the latest resolved snapshot is allowed to change shared household state. */
export function HubApp() {
  const [gate, setGate] = useState<Gate>({ status: "loading" });
  const [compact, setCompact] = useState(false);
  const [online, setOnline] = useState(true);
  const [timeFormat, setTimeFormat] = useState<"12" | "24">("24");
  const [membersVersion, setMembersVersion] = useState(0);
  const sequence = useRef(0);
  const contextRevision = useRef(0);
  const preferencesRevision = useRef(0);
  const loadPreferences = useCallback(async () => {
    const revision = ++preferencesRevision.current;
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return;
    const { data } = await supabase
      .from("profiles")
      .select("preferred_view,time_format")
      .eq("id", user.id)
      .single();
    const parsed = personalPreferences.safeParse(data);
    if (revision !== preferencesRevision.current || !parsed.success) return;
    setTimeFormat(parsed.data.time_format);
    // A personal preference can simplify desktop navigation without constraining the viewport.
    setCompact(window.innerWidth < 900 || parsed.data.preferred_view === "mobile");
  }, []);
  const reload = useCallback(async () => {
    const revision = ++sequence.current;
    setGate({ status: "loading" });
    let candidate: ReturnType<typeof prepareDbContext> | undefined;
    try {
      const {
        data: { session },
        error: sessionError,
      } = await supabase.auth.getSession();
      if (sessionError) throw sessionError;
      const token = getDeviceToken();
      if (!session && !token) {
        if (revision === sequence.current) {
          invalidateDbContext();
          setHouseholdId("");
          setMembers([]);
          setGate({ status: "welcome" });
        }
        return;
      }
      let userId: string | null = null;
      if (session) {
        const {
          data: { user },
          error,
        } = await supabase.auth.getUser();
        if (error || !user) throw error ?? new Error("Sesión no válida");
        userId = user.id;
      }
      const identity =
        userId && session ? sessionIdentity(userId, session.access_token) : `device:${token}`;
      candidate = prepareDbContext({
        accessToken: session?.access_token ?? null,
        deviceToken: userId ? null : token,
        identity,
      });
      const { data, error } = await candidate.client.rpc("my_context");
      if (error) throw error;
      const context = data?.[0];
      if (!context) {
        if (revision !== sequence.current) {
          candidate.discard();
          return;
        }
        candidate.discard();
        invalidateDbContext();
        setMembers([]);
        setHouseholdId("");
        if (userId) setGate({ status: "setup" });
        else {
          forgetDevice();
          setGate({ status: "welcome" });
        }
        return;
      }
      const { data: rows, error: memberError } = await candidate.client.rpc("household_members");
      if (memberError) throw memberError;
      if (revision !== sequence.current) {
        candidate.discard();
        return;
      }
      candidate.activate();
      setHouseholdId(context.household_id);
      HOUSEHOLD.id = context.household_id;
      HOUSEHOLD.name = context.household_name;
      setMembers(rows ?? []);
      const member = MEMBERS.find((m) => m.id === context.member_key) ?? null;
      setGate({ status: "ready", mode: candidate.mode, member, identity });
      setMembersVersion((v) => v + 1);
      if (userId) void loadPreferences();
    } catch (error) {
      candidate?.discard();
      if (revision === sequence.current) {
        invalidateDbContext();
        setHouseholdId("");
        setMembers([]);
        setGate({ status: "error", message: gateError(error) });
      }
    }
  }, [loadPreferences]);
  useEffect(() => {
    const media = window.matchMedia("(max-width: 899px)");
    const resize = () => setCompact(media.matches);
    const network = () => setOnline(navigator.onLine);
    resize();
    network();
    void reload();
    media.addEventListener("change", resize);
    window.addEventListener("online", network);
    window.addEventListener("offline", network);
    const { data } = supabase.auth.onAuthStateChange((event, session) => {
      if (event === "TOKEN_REFRESHED" && session) {
        if (currentDbIdentity() === sessionIdentity(session.user.id, session.access_token))
          updateAccountToken(session.access_token);
        else setTimeout(() => void reload(), 0);
        return;
      }
      if (
        event === "SIGNED_IN" &&
        session &&
        currentDbIdentity() === sessionIdentity(session.user.id, session.access_token)
      ) {
        updateAccountToken(session.access_token);
        return;
      }
      if (event === "SIGNED_OUT") invalidateDbContext();
      if (event === "SIGNED_IN" || event === "SIGNED_OUT") setTimeout(() => void reload(), 0);
    });
    return () => {
      sequence.current++;
      preferencesRevision.current++;
      media.removeEventListener("change", resize);
      window.removeEventListener("online", network);
      window.removeEventListener("offline", network);
      data.subscription.unsubscribe();
    };
  }, [reload]);
  const refreshContext = useCallback(async () => {
    const revision = sequence.current;
    const request = ++contextRevision.current;
    const [context, members] = await Promise.all([
      db().rpc("my_context"),
      db().rpc("household_members"),
    ]);
    if (revision !== sequence.current || request !== contextRevision.current) return;
    if (
      context.error ||
      !context.data?.[0] ||
      context.data[0].household_id !== HOUSEHOLD.id ||
      members.error
    ) {
      void reload();
      return;
    }
    const rows: MemberRow[] = members.data ?? [];
    if (
      JSON.stringify(rows) !==
      JSON.stringify(MEMBERS.map((m) => ({ key: m.id, name: m.name, role: m.role })))
    ) {
      setMembers(rows);
      setMembersVersion((v) => v + 1);
      setGate((old) =>
        old.status !== "ready"
          ? old
          : { ...old, member: MEMBERS.find((m) => m.id === context.data?.[0]?.member_key) ?? null },
      );
    }
  }, [reload]);
  const exit = async () => {
    try {
      await clearFinanceAccess();
      if (getDeviceToken()) forgetDevice();
      const { error } = await supabase.auth.signOut();
      if (error) throw error;
      await reload();
    } catch {
      toast.error("No se pudo cerrar sesión. Reintenta con conexión.");
    }
  };
  return (
    <div className="flex min-h-dvh flex-col bg-background text-foreground">
      {!online && (
        <p role="status" className="z-40 bg-accent px-4 py-2 text-center text-sm">
          Sin conexión. Necesitas internet para guardar; los cambios fallidos se revertirán.
        </p>
      )}
      <div className="relative flex min-h-0 flex-1 flex-col">
        {gate.status === "loading" && (
          <div className="grid min-h-dvh place-items-center text-muted-foreground">
            Abriendo tu hogar…
          </div>
        )}
        {gate.status === "welcome" && (
          <div className="min-h-dvh">
            <Welcome compact={compact} onPaired={() => void reload()} />
          </div>
        )}
        {gate.status === "setup" && (
          <div className="min-h-dvh">
            <SetupHousehold compact={compact} onDone={() => void reload()} />
          </div>
        )}
        {gate.status === "error" && (
          <main className="grid min-h-dvh place-items-center p-6">
            <section className="max-w-md space-y-5 text-center">
              <h1 className="font-display text-3xl font-bold">No pudimos abrir tu hogar</h1>
              <p role="alert" className="text-muted-foreground">
                {gate.message}
              </p>
              <div className="flex flex-wrap justify-center gap-3">
                <Button onClick={() => void reload()}>
                  <RefreshCw /> Reintentar
                </Button>
                <Button variant="outline" onClick={() => void exit()}>
                  Volver al acceso
                </Button>
              </div>
            </section>
          </main>
        )}
        {gate.status === "ready" && (
          <HubShell
            key={gate.identity + HOUSEHOLD.id}
            compact={compact}
            mode={gate.mode}
            accountMember={gate.member}
            timeFormat={timeFormat}
            membersVersion={membersVersion}
            onContextRefresh={refreshContext}
            onProfileSaved={() => void loadPreferences()}
            onReload={() => void reload()}
          />
        )}
      </div>
    </div>
  );
}

function HubShell({
  compact,
  mode,
  accountMember,
  timeFormat,
  membersVersion,
  onContextRefresh,
  onProfileSaved,
  onReload,
}: {
  compact: boolean;
  mode: "account" | "device";
  accountMember: Member | null;
  timeFormat: "12" | "24";
  membersVersion: number;
  onContextRefresh: () => Promise<void>;
  onProfileSaved: () => void;
  onReload: () => void;
}) {
  const [user, setUser] = useState<Member | null>(accountMember);
  const [tab, setTab] = useState<Tab>("home");
  const [financeUnlocked, setFinanceUnlocked] = useState(hasFinanceToken);
  const [quick, setQuick] = useState(false);
  const [askAdmin, setAskAdmin] = useState(false);
  const [more, setMore] = useState(false);
  const [create, setCreate] = useState<{ tab: Tab; id: number } | null>(null);
  const now = useClock();
  useEffect(() => {
    setUser((previous) =>
      mode === "account"
        ? accountMember
        : previous
          ? (MEMBERS.find((m) => m.id === previous.id) ?? null)
          : null,
    );
  }, [accountMember, membersVersion, mode]);
  useEffect(() => {
    const changed = () => setFinanceUnlocked(hasFinanceToken());
    window.addEventListener("homehub-finance-access", changed);
    return () => window.removeEventListener("homehub-finance-access", changed);
  }, []);
  const financialAccess =
    canViewFinances(user?.role, financeUnlocked) && (mode === "account" || financeUnlocked);
  const canManage = mode === "account" && user?.role === "admin";
  const s = useHubState({ includeFinances: financialAccess, onContextRefresh });
  const visibleTabs = TABS.filter(
    (t) => (t.id !== "household" || canManage) && (t.id !== "profile" || mode === "account"),
  );
  useEffect(() => {
    if ((tab === "finance" && !financialAccess) || (tab === "household" && !canManage))
      setTab("home");
  }, [tab, financialAccess, canManage]);
  const go = (next: Tab) => {
    setMore(false);
    setCreate(null);
    if (next === "finance" && !financialAccess) {
      setAskAdmin(true);
      return;
    }
    setTab(next);
  };
  const quickAdd = (next: Tab) => {
    setQuick(false);
    go(next);
    setCreate({ tab: next, id: Date.now() });
  };
  const logout = async () => {
    try {
      await clearFinanceAccess();
      if (mode === "account") {
        const { error } = await supabase.auth.signOut();
        if (error) throw error;
      } else {
        setUser(null);
        setTab("home");
        setQuick(false);
        setMore(false);
      }
    } catch {
      toast.error("No se pudo cerrar la autorización. Reintenta con conexión.");
    }
  };
  return (
    <>
      {!user ? (
        <div className="h-dvh">
          <Kiosk
            compact={compact}
            onUnlock={setUser}
            events={s.events}
            chores={s.chores}
            timeFormat={timeFormat}
          />
        </div>
      ) : (
        <div className="flex min-h-dvh flex-col">
          <header className="sticky top-0 z-30 border-b bg-background/95 px-4 py-3 backdrop-blur-sm sm:px-6">
            <div className="mx-auto flex max-w-7xl items-center gap-3">
              <Avatar m={user} />
              <div className="min-w-0 flex-1">
                <p className="truncate text-xs text-muted-foreground">{HOUSEHOLD.name}</p>
                <p className="truncate font-display text-lg font-bold">
                  {compact ? TABS.find((t) => t.id === tab)?.label : `Hola, ${user.name}`}
                </p>
              </div>
              {!compact && (
                <span className="text-sm tabular-nums text-muted-foreground">
                  {now?.toLocaleTimeString("es", {
                    hour: "2-digit",
                    minute: "2-digit",
                    hour12: timeFormat === "12",
                  })}
                </span>
              )}
              <Button
                variant="ghost"
                size="icon"
                onClick={() => void logout()}
                aria-label={mode === "device" ? "Bloquear tablet" : "Cerrar sesión"}
              >
                <LogOut />
              </Button>
            </div>
            {!compact && (
              <nav
                aria-label="Secciones del hogar"
                className="mx-auto mt-3 flex max-w-7xl flex-wrap gap-1"
              >
                {visibleTabs.map(({ id, label, icon: Icon }) => (
                  <Button
                    key={id}
                    variant={id === tab ? "default" : "ghost"}
                    className="rounded-full"
                    aria-current={id === tab ? "page" : undefined}
                    onClick={() => go(id)}
                  >
                    <Icon className="size-4" />
                    {label}
                    {id === "finance" && !financialAccess && <ShieldCheck className="size-3" />}
                  </Button>
                ))}
              </nav>
            )}
          </header>
          <main
            id="main-content"
            className={cn("mx-auto w-full max-w-7xl flex-1 px-4 py-6 sm:px-6", compact && "pb-28")}
          >
            {tab !== "home" && !compact && (
              <h1 className="mb-6 font-display text-4xl font-bold">
                {TABS.find((t) => t.id === tab)?.label}
              </h1>
            )}
            {s.error && (
              <div
                role="alert"
                className="mb-4 flex flex-wrap items-center justify-between gap-2 rounded-2xl bg-destructive/10 p-4 text-sm"
              >
                <p>{s.error}</p>
                <Button variant="outline" size="sm" onClick={() => void s.refresh()}>
                  Reintentar
                </Button>
              </div>
            )}
            {s.loading ? (
              <p role="status" className="py-16 text-center text-muted-foreground">
                Cargando datos del hogar…
              </p>
            ) : (
              <Suspense fallback={<p role="status">Abriendo sección…</p>}>
                {tab === "home" && (
                  <Dashboard
                    s={s}
                    user={user}
                    compact={compact}
                    go={go}
                    adultAuthorized={financialAccess}
                  />
                )}
                {tab === "chores" && (
                  <Chores
                    s={s}
                    compact={compact}
                    createRequest={create?.tab === "chores" ? create.id : 0}
                  />
                )}
                {tab === "shopping" && (
                  <Shopping
                    s={s}
                    compact={compact}
                    createRequest={create?.tab === "shopping" ? create.id : 0}
                  />
                )}
                {tab === "finance" && financialAccess && (
                  <Finance
                    f={s}
                    compact={compact}
                    createRequest={create?.tab === "finance" ? create.id : 0}
                  />
                )}
                {tab === "calendar" && (
                  <FamilyCalendar
                    events={s.events}
                    setEvents={s.setEvents}
                    user={user}
                    compact={compact}
                    createRequest={create?.tab === "calendar" ? create.id : 0}
                  />
                )}
                {tab === "notes" && (
                  <FamilyNotes
                    notes={s.notes}
                    setNotes={s.setNotes}
                    user={user}
                    compact={compact}
                    createRequest={create?.tab === "notes" ? create.id : 0}
                  />
                )}
                {tab === "household" && canManage && (
                  <HouseholdSettings onMembersChanged={onContextRefresh} />
                )}
                {tab === "profile" && mode === "account" && (
                  <PersonalProfile onSaved={onProfileSaved} onHouseholdLeft={onReload} />
                )}
              </Suspense>
            )}
            <p
              role="status"
              aria-live="polite"
              className="mt-6 text-right text-xs text-muted-foreground"
            >
              {s.saving
                ? "Guardando cambios…"
                : s.error
                  ? "Hay cambios que no se guardaron"
                  : s.lastSavedAt
                    ? "Cambios guardados"
                    : ""}
            </p>
          </main>
          {compact && (
            <nav
              aria-label="Navegación principal"
              className="fixed inset-x-0 bottom-0 z-30 flex items-center justify-around border-t bg-card px-2 pb-[max(0.75rem,env(safe-area-inset-bottom))] pt-2"
            >
              <DockBtn
                active={tab === "home"}
                label="Inicio"
                Icon={Home}
                onClick={() => go("home")}
              />
              <DockBtn
                active={tab === "chores"}
                label="Tareas"
                Icon={CheckSquare}
                onClick={() => go("chores")}
              />
              <Button
                size="icon"
                className="size-12 rounded-full"
                onClick={() => setQuick(true)}
                aria-label="Añadir"
              >
                <Plus />
              </Button>
              <DockBtn
                active={tab === "shopping"}
                label="Compras"
                Icon={ShoppingCart}
                onClick={() => go("shopping")}
              />
              <DockBtn
                active={["calendar", "notes", "finance", "household", "profile"].includes(tab)}
                label="Más"
                Icon={MoreHorizontal}
                onClick={() => setMore(true)}
              />
            </nav>
          )}
        </div>
      )}
      <Dialog open={quick} onOpenChange={setQuick}>
        <DialogContent className="max-h-[85dvh] w-[calc(100%-2rem)] overflow-y-auto rounded-3xl">
          <DialogHeader>
            <DialogTitle>¿Qué quieres añadir?</DialogTitle>
            <DialogDescription>Elige una sección para crear un registro.</DialogDescription>
          </DialogHeader>
          <div className="grid grid-cols-2 gap-3">
            {TABS.filter(
              (t) =>
                ["chores", "shopping", "calendar", "notes", "finance"].includes(t.id) &&
                (t.id !== "finance" || financialAccess),
            ).map(({ id, label, icon: Icon }) => (
              <Button
                key={id}
                variant="outline"
                className="h-20 flex-col rounded-2xl"
                onClick={() => quickAdd(id)}
              >
                <Icon />
                {label}
              </Button>
            ))}
          </div>
        </DialogContent>
      </Dialog>
      <Dialog open={more} onOpenChange={setMore}>
        <DialogContent className="w-[calc(100%-2rem)] rounded-3xl">
          <DialogHeader>
            <DialogTitle>Tu hogar</DialogTitle>
            <DialogDescription>Calendario, notas y preferencias.</DialogDescription>
          </DialogHeader>
          <div className="space-y-1">
            {visibleTabs
              .filter((t) =>
                ["calendar", "notes", "finance", "household", "profile"].includes(t.id),
              )
              .map(({ id, label, icon: Icon }) => (
                <Button
                  key={id}
                  variant="ghost"
                  className="h-12 w-full justify-start"
                  onClick={() => go(id)}
                >
                  <Icon />
                  {label}
                </Button>
              ))}
          </div>
        </DialogContent>
      </Dialog>
      {askAdmin && (
        <PinPad
          adminOnly
          title="Finanzas: PIN de un adulto"
          onCancel={() => setAskAdmin(false)}
          onSuccess={() => {
            setAskAdmin(false);
            setFinanceUnlocked(hasFinanceToken());
            setTab("finance");
          }}
        />
      )}
    </>
  );
}
function DockBtn({
  active,
  label,
  Icon,
  onClick,
}: {
  active: boolean;
  label: string;
  Icon: typeof Home;
  onClick: () => void;
}) {
  return (
    <Button
      variant="ghost"
      onClick={onClick}
      aria-current={active ? "page" : undefined}
      className={cn(
        "h-auto min-w-14 flex-col gap-1 rounded-xl px-2 py-1 text-xs",
        active ? "bg-secondary text-foreground" : "text-muted-foreground",
      )}
    >
      <Icon className="size-5" />
      {label}
    </Button>
  );
}
