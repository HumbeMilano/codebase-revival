import { createFileRoute, Link } from "@tanstack/react-router";
import { useCallback, useEffect, useState } from "react";
import { Building2, Users, Tablet, Crown, Ban, ShieldCheck, LogOut, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";

export const Route = createFileRoute("/admin")({
  head: () => ({ meta: [
    { title: "Administración del servicio — HomeHub" },
    { name: "description", content: "Panel de administración de la plataforma HomeHub: hogares, cuentas, planes y accesos." },
    { property: "og:title", content: "Administración del servicio — HomeHub" },
    { property: "og:description", content: "Gestiona hogares, cuentas y planes de HomeHub." },
    { property: "og:type", content: "website" },
    { name: "twitter:card", content: "summary" },
    { name: "robots", content: "noindex" },
  ] }),
  component: AdminPage,
});

type Stats = { households: number; suspended: number; pro: number; accounts: number; members: number; devices: number; new_households_30d: number; new_accounts_30d: number };
type Household = { id: string; name: string; plan: string; suspended: boolean; created_at: string; members: number; accounts: number; devices: number };
type Account = { user_id: string; email: string; created_at: string; last_sign_in_at: string | null; confirmed: boolean; household_name: string | null; is_admin: boolean };
type Status = "loading" | "signed_out" | "forbidden" | "claimable" | "ok";

const fmt = (d: string | null) => (d ? new Date(d).toLocaleDateString("es", { day: "numeric", month: "short", year: "numeric" }) : "—");

function AdminPage() {
  const [status, setStatus] = useState<Status>("loading");
  const [tab, setTab] = useState<"hogares" | "cuentas">("hogares");
  const [stats, setStats] = useState<Stats | null>(null);
  const [households, setHouseholds] = useState<Household[]>([]);
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [me, setMe] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    setError("");
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) { setStatus("signed_out"); return; }
    setMe(user.id);
    const { data: isAdmin } = await supabase.rpc("am_platform_admin");
    if (!isAdmin) {
      const { data: exists } = await supabase.rpc("platform_admin_exists");
      setStatus(exists ? "forbidden" : "claimable");
      return;
    }
    const [s, h, a] = await Promise.all([supabase.rpc("admin_stats"), supabase.rpc("admin_list_households"), supabase.rpc("admin_list_accounts")]);
    if (s.error || h.error || a.error) setError("No se pudieron cargar los datos. Inténtalo de nuevo.");
    setStats((s.data?.[0] as Stats) ?? null);
    setHouseholds((h.data as Household[]) ?? []);
    setAccounts((a.data as Account[]) ?? []);
    setStatus("ok");
  }, []);

  useEffect(() => {
    void load();
    const { data } = supabase.auth.onAuthStateChange((event) => {
      if (event === "SIGNED_IN" || event === "SIGNED_OUT") void load();
    });
    return () => data.subscription.unsubscribe();
  }, [load]);

  const run = async (p: PromiseLike<{ error: unknown }>) => {
    const { error } = await p;
    if (error) setError("La acción no se pudo completar.");
    await load();
  };

  if (status === "loading") return <Shell><p className="text-muted-foreground">Cargando…</p></Shell>;
  if (status === "signed_out") return <Shell><SignIn /></Shell>;
  if (status === "forbidden") return <Shell><Message title="Sin acceso" text="Esta cuenta no administra el servicio." /></Shell>;
  if (status === "claimable") return <Shell>
    <Message title="Activar administración" text="Aún no hay administrador del servicio. Esta cuenta será la primera." />
    <Button className="mt-4 w-full" onClick={() => void run(supabase.rpc("claim_platform_admin"))}><Crown className="mr-2 h-4 w-4" />Ser administrador</Button>
  </Shell>;

  const q = query.trim().toLowerCase();
  const hs = households.filter((h) => h.name.toLowerCase().includes(q));
  const as = accounts.filter((a) => a.email.toLowerCase().includes(q) || (a.household_name ?? "").toLowerCase().includes(q));

  return <main className="min-h-screen bg-background px-4 py-6 md:px-10">
    <header className="mb-6 flex items-center justify-between gap-3">
      <div>
        <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">HomeHub · Plataforma</p>
        <h1 className="font-display text-3xl font-bold md:text-4xl">Administración</h1>
      </div>
      <div className="flex gap-2">
        <Button variant="outline" size="icon" aria-label="Actualizar" onClick={() => void load()}><RefreshCw className="h-4 w-4" /></Button>
        <Button variant="outline" size="icon" aria-label="Cerrar sesión" onClick={() => void supabase.auth.signOut()}><LogOut className="h-4 w-4" /></Button>
      </div>
    </header>

    {error && <p role="alert" className="mb-4 rounded-2xl bg-destructive/10 px-4 py-3 text-sm text-destructive">{error}</p>}

    {stats && <section className="mb-6 grid grid-cols-2 gap-3 md:grid-cols-4">
      <Tile icon={<Building2 />} label="Hogares" value={stats.households} sub={`+${stats.new_households_30d} en 30 días`} />
      <Tile icon={<Users />} label="Cuentas" value={stats.accounts} sub={`+${stats.new_accounts_30d} en 30 días`} />
      <Tile icon={<Crown />} label="Family Pro" value={stats.pro} sub={`${stats.households - stats.pro} gratis`} />
      <Tile icon={<Tablet />} label="Tablets" value={stats.devices} sub={`${stats.suspended} hogares suspendidos`} />
    </section>}

    <div className="mb-4 flex flex-wrap items-center gap-2">
      {(["hogares", "cuentas"] as const).map((t) => <button key={t} onClick={() => setTab(t)} className={`rounded-full px-4 py-2 text-sm font-semibold capitalize ${tab === t ? "bg-primary text-primary-foreground" : "bg-card"}`}>{t}</button>)}
      <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Buscar" aria-label="Buscar" className="ml-auto w-full rounded-full border bg-card px-4 py-2 text-sm md:w-64" />
    </div>

    {tab === "hogares" ? <section className="grid gap-3 md:grid-cols-2">
      {hs.length === 0 && <p className="text-muted-foreground">Sin hogares.</p>}
      {hs.map((h) => <article key={h.id} className="rounded-3xl bg-card p-5">
        <div className="flex items-start justify-between gap-2">
          <div>
            <h2 className="font-display text-xl font-bold">{h.name}</h2>
            <p className="text-xs text-muted-foreground">Desde {fmt(h.created_at)}</p>
          </div>
          <div className="flex gap-1">
            <span className="rounded-full bg-secondary px-3 py-1 text-xs font-semibold">{h.plan === "pro" ? "Pro" : "Gratis"}</span>
            {h.suspended && <span className="rounded-full bg-destructive/15 px-3 py-1 text-xs font-semibold text-destructive">Suspendido</span>}
          </div>
        </div>
        <div className="my-4 grid grid-cols-3 gap-2 text-center">
          <Mini label="Personas" value={h.members} /><Mini label="Cuentas" value={h.accounts} /><Mini label="Tablets" value={h.devices} />
        </div>
        <div className="flex flex-wrap gap-2">
          <Button size="sm" variant="outline" onClick={() => void run(supabase.rpc("admin_set_household", { _id: h.id, _plan: h.plan === "pro" ? "free" : "pro", _suspended: h.suspended }))}>{h.plan === "pro" ? "Pasar a Gratis" : "Pasar a Pro"}</Button>
          <Button size="sm" variant={h.suspended ? "default" : "outline"} onClick={() => { if (h.suspended || confirm(`¿Suspender ${h.name}? Nadie del hogar podrá ver sus datos.`)) void run(supabase.rpc("admin_set_household", { _id: h.id, _plan: h.plan, _suspended: !h.suspended })); }}>
            {h.suspended ? <><ShieldCheck className="mr-1 h-4 w-4" />Reactivar</> : <><Ban className="mr-1 h-4 w-4" />Suspender</>}
          </Button>
          {h.devices > 0 && <Button size="sm" variant="outline" onClick={() => { if (confirm("¿Desvincular todas las tablets de este hogar?")) void run(supabase.rpc("admin_revoke_household_devices", { _id: h.id })); }}><Tablet className="mr-1 h-4 w-4" />Desvincular tablets</Button>}
        </div>
      </article>)}
    </section> : <section className="space-y-2">
      {as.length === 0 && <p className="text-muted-foreground">Sin cuentas.</p>}
      {as.map((a) => <article key={a.user_id} className="flex flex-wrap items-center gap-3 rounded-3xl bg-card p-4">
        <div className="min-w-0 flex-1">
          <p className="truncate font-semibold">{a.email}</p>
          <p className="text-xs text-muted-foreground">{a.household_name ?? "Sin hogar"} · alta {fmt(a.created_at)} · último acceso {fmt(a.last_sign_in_at)}</p>
        </div>
        {!a.confirmed && <span className="rounded-full bg-secondary px-3 py-1 text-xs font-semibold">Sin confirmar</span>}
        {a.is_admin && <span className="rounded-full bg-primary px-3 py-1 text-xs font-semibold text-primary-foreground">Admin</span>}
        {a.user_id !== me && <Button size="sm" variant="outline" onClick={() => void run(supabase.rpc("admin_set_platform_admin", { _user: a.user_id, _grant: !a.is_admin }))}>{a.is_admin ? "Quitar admin" : "Hacer admin"}</Button>}
      </article>)}
    </section>}
  </main>;
}

function Shell({ children }: { children: React.ReactNode }) {
  return <main className="grid min-h-screen place-items-center bg-background px-5"><section className="w-full max-w-sm">{children}<Link to="/" className="mt-6 block text-center text-sm underline">Volver a HomeHub</Link></section></main>;
}
function Message({ title, text }: { title: string; text: string }) {
  return <><h1 className="font-display text-3xl font-bold">{title}</h1><p className="mt-2 text-muted-foreground">{text}</p></>;
}
function Tile({ icon, label, value, sub }: { icon: React.ReactNode; label: string; value: number; sub: string }) {
  return <div className="rounded-3xl bg-card p-5"><div className="mb-3 text-muted-foreground [&>svg]:h-5 [&>svg]:w-5">{icon}</div><p className="font-display text-4xl font-bold">{value}</p><p className="text-sm font-semibold">{label}</p><p className="text-xs text-muted-foreground">{sub}</p></div>;
}
function Mini({ label, value }: { label: string; value: number }) {
  return <div className="rounded-2xl bg-secondary py-2"><p className="font-display text-2xl font-bold">{value}</p><p className="text-[11px] text-muted-foreground">{label}</p></div>;
}
function SignIn() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const submit = async (e: React.FormEvent) => {
    e.preventDefault(); setBusy(true); setError("");
    const { error } = await supabase.auth.signInWithPassword({ email: email.trim(), password });
    setBusy(false);
    if (error) setError("Correo o contraseña incorrectos.");
  };
  return <form onSubmit={submit} className="space-y-4">
    <h1 className="font-display text-3xl font-bold">Administración</h1>
    <input type="email" required autoComplete="email" placeholder="Correo" value={email} onChange={(e) => setEmail(e.target.value)} className="w-full rounded-xl border bg-card px-3 py-3" />
    <input type="password" required autoComplete="current-password" placeholder="Contraseña" value={password} onChange={(e) => setPassword(e.target.value)} className="w-full rounded-xl border bg-card px-3 py-3" />
    {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
    <Button disabled={busy} type="submit" className="w-full">Entrar</Button>
  </form>;
}
