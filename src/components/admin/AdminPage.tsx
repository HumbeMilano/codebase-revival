import { Link } from "@tanstack/react-router";
import { useCallback, useEffect, useRef, useState } from "react";
import { Building2, Users, Tablet, Crown, Ban, ShieldCheck, LogOut, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { createAdminClient } from "@/lib/admin-client";
import { clearFinanceAccess, invalidateDbContext } from "@/lib/db";
import { ACTIVE_SHOPPING_ACCOUNT } from "@/lib/offline-shopping";
import { BusinessConsole, type BusinessTab } from "./BusinessConsole";

type Stats = {
  households: number;
  suspended: number;
  pro: number;
  accounts: number;
  members: number;
  devices: number;
  new_households_30d: number;
  new_accounts_30d: number;
};
type Household = {
  id: string;
  name: string;
  plan: string;
  suspended: boolean;
  created_at: string;
  members: number;
  accounts: number;
  devices: number;
};
type Account = {
  user_id: string;
  email: string;
  created_at: string;
  last_sign_in_at: string | null;
  confirmed: boolean;
  household_name: string | null;
  is_admin: boolean;
};
type Status = "loading" | "signed_out" | "forbidden" | "error" | "ok";

const fmt = (d: string | null) =>
  d
    ? new Date(d).toLocaleDateString("es", { day: "numeric", month: "short", year: "numeric" })
    : "—";

export function AdminPage() {
  const [status, setStatus] = useState<Status>("loading");
  const [tab, setTab] = useState<BusinessTab | "hogares" | "cuentas">("resumen");
  const [stats, setStats] = useState<Stats | null>(null);
  const [households, setHouseholds] = useState<Household[]>([]);
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [me, setMe] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [error, setError] = useState("");

  const [busy, setBusy] = useState(false);
  const sequence = useRef(0);
  const actor = useRef<{ valid: boolean; client: ReturnType<typeof createAdminClient> } | null>(
    null,
  );
  const [refreshKey, setRefreshKey] = useState(0);
  const [canDelegate, setCanDelegate] = useState(false);

  const load = useCallback(async () => {
    const request = ++sequence.current;
    const current = () => request === sequence.current;
    try {
      const {
        data: { user },
        error: authError,
      } = await supabase.auth.getUser();
      if (!current()) return;
      if (!user) {
        setMe(null);
        setStats(null);
        setHouseholds([]);
        setAccounts([]);
        if (authError && authError.name !== "AuthSessionMissingError") throw authError;
        setStatus("signed_out");
        return;
      }
      setMe(user.id);
      const { data: sessionData, error: sessionError } = await supabase.auth.getSession();
      if (!current()) return;
      if (sessionError || !sessionData.session || sessionData.session.user.id !== user.id)
        throw sessionError ?? new Error("Session changed");
      if (actor.current) actor.current.valid = false;
      const binding = {
        valid: true,
        client: null as unknown as ReturnType<typeof createAdminClient>,
      };
      binding.client = createAdminClient(sessionData.session.access_token, () => binding.valid);
      actor.current = binding;
      const { data: isAdmin, error: roleError } = await binding.client.rpc("am_platform_admin");
      if (!current()) return;
      if (roleError) throw roleError;
      if (!isAdmin) {
        setStats(null);
        setHouseholds([]);
        setAccounts([]);
        setStatus("forbidden");
        return;
      }
      const [s, h, a] = await Promise.all([
        binding.client.rpc("admin_stats"),
        binding.client.rpc("admin_list_households"),
        binding.client.rpc("admin_list_accounts"),
      ]);
      if (!current()) return;
      if (s.error || h.error || a.error) throw s.error ?? h.error ?? a.error;
      setStats((s.data?.[0] as Stats) ?? null);
      setHouseholds((h.data as Household[]) ?? []);
      setAccounts((a.data as Account[]) ?? []);
      setStatus("ok");
      setRefreshKey((value) => value + 1);
    } catch {
      if (!current()) return;
      setError("No se pudieron cargar los datos. Revisa la conexión e inténtalo de nuevo.");
      setStatus("error");
    }
  }, []);

  useEffect(() => {
    void load();
    let timer: ReturnType<typeof setTimeout> | undefined;
    const { data } = supabase.auth.onAuthStateChange((event, session) => {
      if (event === "SIGNED_IN" || event === "SIGNED_OUT" || event === "TOKEN_REFRESHED") {
        if (
          event === "SIGNED_OUT" ||
          (event === "SIGNED_IN" &&
            session &&
            localStorage.getItem(ACTIVE_SHOPPING_ACCOUNT) !== session.user.id)
        )
          localStorage.removeItem(ACTIVE_SHOPPING_ACCOUNT);
        if (event === "SIGNED_OUT") invalidateDbContext();
        sequence.current += 1;
        if (actor.current) actor.current.valid = false;
        setStatus("loading");
        if (timer) clearTimeout(timer);
        timer = setTimeout(() => {
          setError("");
          void load();
        }, 0);
      }
    });
    return () => {
      sequence.current += 1;
      if (actor.current) actor.current.valid = false;
      if (timer) clearTimeout(timer);
      data.subscription.unsubscribe();
    };
  }, [load]);

  const run = async (action: () => PromiseLike<{ error: unknown }>) => {
    if (busy) return;
    setBusy(true);
    setError("");
    try {
      const { error: actionError } = await action();
      if (actionError) {
        setError("La acción no se pudo completar. Revisa la conexión y vuelve a intentarlo.");
        return;
      }
      await load();
    } catch {
      setError("La acción no se pudo completar. Revisa la conexión y vuelve a intentarlo.");
    } finally {
      setBusy(false);
    }
  };

  if (status === "loading")
    return (
      <Shell>
        <p className="text-muted-foreground">Cargando…</p>
      </Shell>
    );
  if (status === "signed_out")
    return (
      <Shell>
        <SignIn />
      </Shell>
    );
  if (status === "forbidden")
    return (
      <Shell>
        <Message
          title="Sin acceso"
          text="Esta cuenta no administra el servicio. Pide al propietario que te conceda acceso."
        />
      </Shell>
    );
  if (status === "error")
    return (
      <Shell>
        <p role="alert" className="text-destructive">
          {error}
        </p>
        <Button
          className="mt-4"
          onClick={() => {
            setError("");
            setStatus("loading");
            void load();
          }}
        >
          Reintentar
        </Button>
      </Shell>
    );

  const q = query.trim().toLowerCase();
  const client = actor.current!.client;
  const hs = households.filter((h) => h.name.toLowerCase().includes(q));
  const as = accounts.filter(
    (a) => a.email.toLowerCase().includes(q) || (a.household_name ?? "").toLowerCase().includes(q),
  );

  return (
    <main className="min-h-screen bg-background px-4 py-6 md:px-10">
      <header className="mb-6 flex items-center justify-between gap-3">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            Skendal · Consola del negocio
          </p>
          <h1 className="font-display text-3xl font-bold md:text-4xl">Administración</h1>
          <a
            href="https://skendal.com"
            target="_blank"
            rel="noreferrer"
            className="text-xs text-muted-foreground underline"
          >
            Ver web pública ↗
          </a>
        </div>
        <div className="flex gap-2">
          <Button
            variant="outline"
            size="icon"
            aria-label="Actualizar"
            disabled={busy}
            onClick={() => {
              setError("");
              void load();
            }}
          >
            <RefreshCw className="h-4 w-4" />
          </Button>
          <Button
            variant="outline"
            size="icon"
            aria-label="Cerrar sesión"
            disabled={busy}
            onClick={() =>
              void run(async () => {
                await clearFinanceAccess();
                return supabase.auth.signOut();
              })
            }
          >
            <LogOut className="h-4 w-4" />
          </Button>
        </div>
      </header>

      {error && (
        <p
          role="alert"
          className="mb-4 rounded-2xl bg-destructive/10 px-4 py-3 text-sm text-destructive"
        >
          {error}
        </p>
      )}

      {stats && (
        <section className="mb-6 grid grid-cols-2 gap-3 md:grid-cols-4">
          <Tile
            icon={<Building2 />}
            label="Hogares"
            value={stats.households}
            sub={`+${stats.new_households_30d} en 30 días`}
          />
          <Tile
            icon={<Users />}
            label="Cuentas"
            value={stats.accounts}
            sub={`+${stats.new_accounts_30d} en 30 días`}
          />
          <Tile
            icon={<Crown />}
            label="Family Pro"
            value={stats.pro}
            sub={`${stats.households - stats.pro} gratis`}
          />
          <Tile
            icon={<Tablet />}
            label="Tablets"
            value={stats.devices}
            sub={`${stats.suspended} hogares suspendidos`}
          />
        </section>
      )}

      <div className="mb-4 flex flex-wrap items-center gap-2">
        {(
          [
            "resumen",
            "hogares",
            "cuentas",
            "pagos",
            "planes",
            "actividad",
            "configuracion",
            "legal",
          ] as const
        ).map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            aria-current={tab === t ? "page" : undefined}
            className={`rounded-full px-4 py-2 text-sm font-semibold capitalize ${tab === t ? "bg-primary text-primary-foreground" : "bg-card"}`}
          >
            {t === "configuracion" ? "Configuración" : t}
          </button>
        ))}
        {(tab === "hogares" || tab === "cuentas" || tab === "resumen") && (
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Buscar"
            aria-label="Buscar"
            className="ml-auto w-full rounded-full border bg-card px-4 py-2 text-sm md:w-64"
          />
        )}
      </div>

      <BusinessConsole
        key={me}
        client={client}
        tab={tab}
        refreshKey={refreshKey}
        households={households}
        onCapabilities={setCanDelegate}
      />

      {tab === "hogares" || tab === "resumen" ? (
        <section className="grid gap-3 md:grid-cols-2">
          {hs.length === 0 && <p className="text-muted-foreground">Sin hogares.</p>}
          {hs.map((h) => (
            <article key={h.id} className="rounded-3xl bg-card p-5">
              <div className="flex items-start justify-between gap-2">
                <div>
                  <h2 className="font-display text-xl font-bold">{h.name}</h2>
                  <p className="text-xs text-muted-foreground">Desde {fmt(h.created_at)}</p>
                </div>
                <div className="flex gap-1">
                  <span className="rounded-full bg-secondary px-3 py-1 text-xs font-semibold">
                    {h.plan === "pro" ? "Pro" : "Gratis"}
                  </span>
                  {h.suspended && (
                    <span className="rounded-full bg-destructive/15 px-3 py-1 text-xs font-semibold text-destructive">
                      Suspendido
                    </span>
                  )}
                </div>
              </div>
              <div className="my-4 grid grid-cols-3 gap-2 text-center">
                <Mini label="Personas" value={h.members} />
                <Mini label="Cuentas" value={h.accounts} />
                <Mini label="Tablets" value={h.devices} />
              </div>
              <div className="flex flex-wrap gap-2">
                <Button
                  disabled={busy}
                  size="sm"
                  variant="outline"
                  onClick={() =>
                    void run(() =>
                      client.rpc("admin_set_household", {
                        _id: h.id,
                        _plan: h.plan === "pro" ? "free" : "pro",
                        _suspended: h.suspended,
                      }),
                    )
                  }
                >
                  {h.plan === "pro" ? "Pasar a Gratis" : "Pasar a Pro"}
                </Button>
                <Button
                  disabled={busy}
                  size="sm"
                  variant={h.suspended ? "default" : "outline"}
                  onClick={() => {
                    if (
                      h.suspended ||
                      confirm(`¿Suspender ${h.name}? Nadie del hogar podrá ver sus datos.`)
                    )
                      void run(() =>
                        client.rpc("admin_set_household", {
                          _id: h.id,
                          _plan: h.plan,
                          _suspended: !h.suspended,
                        }),
                      );
                  }}
                >
                  {h.suspended ? (
                    <>
                      <ShieldCheck className="mr-1 h-4 w-4" />
                      Reactivar
                    </>
                  ) : (
                    <>
                      <Ban className="mr-1 h-4 w-4" />
                      Suspender
                    </>
                  )}
                </Button>
                {h.devices > 0 && (
                  <Button
                    disabled={busy}
                    size="sm"
                    variant="outline"
                    onClick={() => {
                      if (confirm("¿Desvincular todas las tablets de este hogar?"))
                        void run(() => client.rpc("admin_revoke_household_devices", { _id: h.id }));
                    }}
                  >
                    <Tablet className="mr-1 h-4 w-4" />
                    Desvincular tablets
                  </Button>
                )}
              </div>
            </article>
          ))}
        </section>
      ) : tab === "cuentas" ? (
        <section className="space-y-2">
          {as.length === 0 && <p className="text-muted-foreground">Sin cuentas.</p>}
          {as.map((a) => (
            <article
              key={a.user_id}
              className="flex flex-wrap items-center gap-3 rounded-3xl bg-card p-4"
            >
              <div className="min-w-0 flex-1">
                <p className="truncate font-semibold">{a.email}</p>
                <p className="text-xs text-muted-foreground">
                  {a.household_name ?? "Sin hogar"} · alta {fmt(a.created_at)} · último acceso{" "}
                  {fmt(a.last_sign_in_at)}
                </p>
              </div>
              {!a.confirmed && (
                <span className="rounded-full bg-secondary px-3 py-1 text-xs font-semibold">
                  Sin confirmar
                </span>
              )}
              {a.is_admin && (
                <span className="rounded-full bg-primary px-3 py-1 text-xs font-semibold text-primary-foreground">
                  Admin
                </span>
              )}
              {a.user_id !== me && a.confirmed && canDelegate && (
                <Button
                  disabled={busy}
                  size="sm"
                  variant="outline"
                  onClick={() =>
                    void run(() =>
                      client.rpc("admin_set_platform_admin", {
                        _user: a.user_id,
                        _grant: !a.is_admin,
                      }),
                    )
                  }
                >
                  {a.is_admin ? "Quitar admin" : "Hacer admin"}
                </Button>
              )}
            </article>
          ))}
        </section>
      ) : null}
    </main>
  );
}

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <main className="grid min-h-screen place-items-center bg-background px-5">
      <section className="w-full max-w-sm">
        {children}
        <Link to="/" className="mt-6 block text-center text-sm underline">
          Volver a HomeHub
        </Link>
      </section>
    </main>
  );
}
function Message({ title, text }: { title: string; text: string }) {
  return (
    <>
      <h1 className="font-display text-3xl font-bold">{title}</h1>
      <p className="mt-2 text-muted-foreground">{text}</p>
    </>
  );
}
function Tile({
  icon,
  label,
  value,
  sub,
}: {
  icon: React.ReactNode;
  label: string;
  value: number;
  sub: string;
}) {
  return (
    <div className="rounded-3xl bg-card p-5">
      <div className="mb-3 text-muted-foreground [&>svg]:h-5 [&>svg]:w-5">{icon}</div>
      <p className="font-display text-4xl font-bold">{value}</p>
      <p className="text-sm font-semibold">{label}</p>
      <p className="text-xs text-muted-foreground">{sub}</p>
    </div>
  );
}
function Mini({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-2xl bg-secondary py-2">
      <p className="font-display text-2xl font-bold">{value}</p>
      <p className="text-[11px] text-muted-foreground">{label}</p>
    </div>
  );
}
function SignIn() {
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const submit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (busy) return;
    const values = new FormData(e.currentTarget);
    const email = values.get("username");
    const password = values.get("password");
    setBusy(true);
    setError("");
    try {
      const { error: signInError } = await supabase.auth.signInWithPassword({
        email: typeof email === "string" ? email.trim() : "",
        password: typeof password === "string" ? password : "",
      });
      if (signInError) setError("Correo o contraseña incorrectos.");
    } catch {
      setError("No se pudo conectar. Revisa tu conexión e inténtalo de nuevo.");
    } finally {
      setBusy(false);
    }
  };
  return (
    <form id="admin-login" method="post" onSubmit={submit} className="space-y-4">
      <h1 className="font-display text-3xl font-bold">Administración</h1>
      <input
        aria-label="Correo"
        id="admin-email"
        name="username"
        type="email"
        required
        autoComplete="username"
        placeholder="Correo"
        className="w-full rounded-xl border bg-card px-3 py-3"
      />
      <input
        aria-label="Contraseña"
        id="admin-password"
        name="password"
        type="password"
        required
        autoComplete="current-password"
        placeholder="Contraseña"
        className="w-full rounded-xl border bg-card px-3 py-3"
      />
      {error && (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      )}
      <Button disabled={busy} type="submit" className="w-full">
        Entrar
      </Button>
    </form>
  );
}
