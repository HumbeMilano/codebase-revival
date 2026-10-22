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
import {
  ACTIVE_SHOPPING_ACCOUNT,
  rememberShoppingContext,
  readShoppingContext,
  type ShoppingContext,
} from "@/lib/offline-shopping";
import { OfflineShopping } from "./OfflineShopping";

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
  | { status: "offline"; context: ShoppingContext }
  | { status: "loading" | "welcome" | "setup" }
  | { status: "error"; message: string }
  | {
      status: "ready";
      mode: "account" | "device";
      member: Member | null;
      identity: string;
      shoppingContext: ShoppingContext | null;
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
    let requestedAccountId: string | null = null;
    try {
      if (navigator.onLine === false) {
        const accountId = localStorage.getItem(ACTIVE_SHOPPING_ACCOUNT);
        const cached = accountId ? await readShoppingContext(accountId) : null;
        if (revision !== sequence.current) return;
        if (cached && Date.now() - cached.verifiedAt < 14 * 24 * 60 * 60 * 1000) {
          invalidateDbContext();
          setGate({ status: "offline", context: cached });
          return;
        }
        setGate({
          status: "error",
          message:
            "Abre las compras con conexión al menos una vez en este dispositivo antes de utilizarlas sin internet.",
        });
        return;
      }
      const {
        data: { session },
        error: sessionError,
      } = await supabase.auth.getSession();
      requestedAccountId = session?.user.id ?? null;
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
        localStorage.removeItem(ACTIVE_SHOPPING_ACCOUNT);
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
      const shoppingContext: ShoppingContext | null =
        userId && context.member_key
          ? {
              accountId: userId,
              householdId: context.household_id,
              householdName: context.household_name,
              memberKey: context.member_key,
              verifiedAt: Date.now(),
            }
          : null;
      if (shoppingContext) {
        try {
          await rememberShoppingContext(shoppingContext);
        } catch {
          /* Local caching does not block online household access. */
        }
      }
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
      if (shoppingContext) localStorage.setItem(ACTIVE_SHOPPING_ACCOUNT, userId!);
      setGate({ status: "ready", mode: candidate.mode, member, identity, shoppingContext });
      setMembersVersion((v) => v + 1);
      if (userId) void loadPreferences();
    } catch (error) {
      candidate?.discard();
      if (revision === sequence.current) {
        invalidateDbContext();
        setHouseholdId("");
        setMembers([]);
        const message =
          error && typeof error === "object" && "message" in error
            ? String(error.message)
            : String(error);
        if (navigator.onLine === false || /fetch|network|timeout|timed out/i.test(message)) {
          try {
            const accountId = localStorage.getItem(ACTIVE_SHOPPING_ACCOUNT);
            const cached =
              accountId && (!requestedAccountId || accountId === requestedAccountId)
                ? await readShoppingContext(accountId)
                : null;
            if (revision !== sequence.current) return;
            if (cached && Date.now() - cached.verifiedAt < 14 * 24 * 60 * 60 * 1000) {
              setGate({ status: "offline", context: cached });
              return;
            }
          } catch {
            /* Keep the connection error if there is no usable local list. */
          }
        } else localStorage.removeItem(ACTIVE_SHOPPING_ACCOUNT);
        setGate({ status: "error", message: gateError(error) });
      }
    }
  }, [loadPreferences]);
  useEffect(() => {
    const media = window.matchMedia("(max-width: 899px)");
    const resize = () => setCompact(media.matches);
    const network = () => {
      setOnline(navigator.onLine);
      if (navigator.onLine && !currentDbIdentity()) void reload();
    };
    resize();
    setOnline(navigator.onLine);
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
      if (
        event === "SIGNED_IN" &&
        session &&
        localStorage.getItem(ACTIVE_SHOPPING_ACCOUNT) !== session.user.id
      )
        localStorage.removeItem(ACTIVE_SHOPPING_ACCOUNT);
      if (event === "SIGNED_OUT") {
        localStorage.removeItem(ACTIVE_SHOPPING_ACCOUNT);
        invalidateDbContext();
      }
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
          : {
              ...old,
              member: MEMBERS.find((m) => m.id === context.data?.[0]?.member_key) ?? null,
              shoppingContext: old.shoppingContext
                ? { ...old.shoppingContext, memberKey: context.data?.[0]?.member_key ?? "" }
                : null,
            },
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
          Sin conexión. Las compras se guardan en este dispositivo; las otras secciones necesitan
          internet para guardar.
        </p>
      )}
      <div className="relative flex min-h-0 flex-1 flex-col">
        {gate.status === "offline" && (
          <OfflineShopping context={gate.context} onReconnect={() => void reload()} />
        )}
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
            shoppingContext={gate.shoppingContext}
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
  shoppingContext,
}: {
  compact: boolean;
  mode: "account" | "device";
  accountMember: Member | null;
  timeFormat: "12" | "24";
  membersVersion: number;
  onContextRefresh: () => Promise<void>;
  onProfileSaved: () => void;
  onReload: () => void;
  shoppingContext: ShoppingContext | null;
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
  const s = useHubState({ includeFinances: financialAccess, onContextRefresh, shoppingContext });
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
              {s.shoppingSync?.pending
                ? `${s.shoppingSync.pending} cambios de compras guardados en este dispositivo, pendientes de sincronizar`
                : s.saving
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
