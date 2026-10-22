import { useEffect, useState } from "react";
import { Copy, Home, KeyRound, Mail, Tablet, Trash2, UserPlus } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { DEVICE_KEY } from "@/lib/db";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

const field = "mt-1 w-full rounded-xl border bg-background px-3 py-2.5 text-base outline-none focus:ring-2 focus:ring-ring";
const pinField = (v: string) => v.replace(/\D/g, "").slice(0, 4);
const errMsg = (e: { message?: string } | null) => {
  const m = e?.message ?? "";
  if (m.includes("Invalid login")) return "Correo o contraseña incorrectos";
  if (m.includes("PIN already")) return "Ese PIN ya lo usa otra persona del hogar";
  if (m.includes("Invalid or expired")) return "Código no válido o caducado";
  if (m.includes("duplicate key") && m.includes("pin")) return "Ese PIN ya lo usa otra persona del hogar";
  return m || "Algo salió mal";
};

function Shell({ children, compact }: { children: React.ReactNode; compact: boolean }) {
  return (
    <div className={cn("flex h-full flex-col overflow-y-auto", compact ? "p-5" : "p-10")}>
      <span className="font-display text-xl font-extrabold tracking-tight">home<span className="text-muted-foreground">hub</span></span>
      <div className="mx-auto my-auto w-full max-w-sm py-6">{children}</div>
    </div>
  );
}

/** First screen for a browser with no account and no paired tablet. */
export function Welcome({ compact, onPaired }: { compact: boolean; onPaired: (token: string) => void }) {
  const [view, setView] = useState<"login" | "signup" | "pair">("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [sent, setSent] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    if (view === "pair") {
      const { data, error } = await supabase.rpc("pair_device", { _code: code, _name: "Tablet de casa" });
      setBusy(false);
      if (error || !data) { toast.error(errMsg(error)); return; }
      localStorage.setItem(DEVICE_KEY, data);
      onPaired(data);
      return;
    }
    const { error, data } = view === "login"
      ? await supabase.auth.signInWithPassword({ email, password })
      : await supabase.auth.signUp({ email, password, options: { emailRedirectTo: window.location.origin } });
    setBusy(false);
    if (error) { toast.error(errMsg(error)); return; }
    if (view === "signup" && !data.session) setSent(true);
  };

  if (sent) return <Shell compact={compact}><div className="rounded-3xl bg-card p-6 text-center shadow-card"><Mail className="mx-auto size-10" /><h1 className="mt-3 font-display text-2xl font-bold">Revisa tu correo</h1><p className="mt-2 text-sm text-muted-foreground">Confirma tu cuenta con el enlace que enviamos a {email}.</p><Button variant="ghost" className="mt-4" onClick={() => { setSent(false); setView("login"); }}>Ya confirmé</Button></div></Shell>;

  return (
    <Shell compact={compact}>
      <h1 className="font-display text-4xl font-extrabold tracking-[-0.04em]">{view === "pair" ? "Emparejar tablet" : view === "signup" ? "Crea tu cuenta" : "Bienvenido"}</h1>
      <div className="my-5 grid grid-cols-3 gap-1 rounded-2xl bg-card p-1 shadow-card">
        {([["login", "Entrar"], ["signup", "Registro"], ["pair", "Tablet"]] as const).map(([v, l]) => (
          <button key={v} onClick={() => setView(v)} className={cn("rounded-xl py-2 text-sm font-semibold", view === v ? "bg-primary text-primary-foreground" : "text-muted-foreground")}>{l}</button>
        ))}
      </div>
      <form onSubmit={submit} className="space-y-4 rounded-3xl bg-card p-5 shadow-card">
        {view === "pair" ? (
          <label className="block text-sm font-semibold">Código de emparejamiento
            <input value={code} onChange={(e) => setCode(e.target.value.toUpperCase())} placeholder="123456" className={cn(field, "text-center font-display text-2xl tracking-[0.3em]")} />
            <span className="mt-2 block text-xs font-normal text-muted-foreground">Un adulto lo genera en su móvil, en Hogar. Demo: PEREZ1</span>
          </label>
        ) : (
          <>
            <label className="block text-sm font-semibold">Correo<input type="email" required value={email} onChange={(e) => setEmail(e.target.value)} className={field} /></label>
            <label className="block text-sm font-semibold">Contraseña<input type="password" required minLength={6} value={password} onChange={(e) => setPassword(e.target.value)} className={field} /></label>
          </>
        )}
        <Button type="submit" disabled={busy} className="h-12 w-full rounded-xl">{view === "pair" ? <><Tablet /> Emparejar</> : view === "signup" ? "Crear cuenta" : "Entrar"}</Button>
      </form>
    </Shell>
  );
}

/** Signed-in account without a household: create one or join with an invite. */
export function SetupHousehold({ compact, onDone }: { compact: boolean; onDone: () => void }) {
  const [view, setView] = useState<"create" | "join">("create");
  const [home, setHome] = useState("");
  const [name, setName] = useState("");
  const [code, setCode] = useState("");
  const [pin, setPin] = useState("");
  const [busy, setBusy] = useState(false);
  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (pin.length !== 4) { toast.error("El PIN debe tener 4 números"); return; }
    setBusy(true);
    const { error } = view === "create"
      ? await supabase.rpc("create_household", { _name: home, _member_name: name, _pin: pin })
      : await supabase.rpc("redeem_invite", { _code: code, _pin: pin });
    setBusy(false);
    if (error) { toast.error(errMsg(error)); return; }
    onDone();
  };
  return (
    <Shell compact={compact}>
      <h1 className="font-display text-4xl font-extrabold tracking-[-0.04em]">Tu hogar</h1>
      <div className="my-5 grid grid-cols-2 gap-1 rounded-2xl bg-card p-1 shadow-card">
        {([["create", "Crear hogar", Home], ["join", "Tengo invitación", KeyRound]] as const).map(([v, l, Icon]) => (
          <button key={v} onClick={() => setView(v)} className={cn("flex items-center justify-center gap-2 rounded-xl py-2 text-sm font-semibold", view === v ? "bg-primary text-primary-foreground" : "text-muted-foreground")}><Icon className="size-4" />{l}</button>
        ))}
      </div>
      <form onSubmit={submit} className="space-y-4 rounded-3xl bg-card p-5 shadow-card">
        {view === "create" ? (
          <>
            <label className="block text-sm font-semibold">Nombre del hogar<input required value={home} onChange={(e) => setHome(e.target.value)} placeholder="Familia García" className={field} /></label>
            <label className="block text-sm font-semibold">Tu nombre<input required value={name} onChange={(e) => setName(e.target.value)} placeholder="Ana" className={field} /></label>
          </>
        ) : (
          <label className="block text-sm font-semibold">Código de invitación<input required value={code} onChange={(e) => setCode(e.target.value.toUpperCase())} className={cn(field, "font-display tracking-widest")} /></label>
        )}
        <label className="block text-sm font-semibold">Tu PIN (4 números)<input inputMode="numeric" value={pin} onChange={(e) => setPin(pinField(e.target.value))} className={cn(field, "font-display tracking-[0.5em]")} /></label>
        <Button type="submit" disabled={busy} className="h-12 w-full rounded-xl">{view === "create" ? "Crear hogar" : "Unirme"}</Button>
        <button type="button" onClick={() => void supabase.auth.signOut()} className="w-full text-xs text-muted-foreground">Cerrar sesión</button>
      </form>
    </Shell>
  );
}

/** Adults only: invite people, pair tablets and revoke devices. */
export function HouseholdSettings() {
  const [name, setName] = useState("");
  const [role, setRole] = useState<"member" | "admin">("member");
  const [invite, setInvite] = useState<string | null>(null);
  const [pair, setPair] = useState<string | null>(null);
  const [devices, setDevices] = useState<{ id: string; name: string; created_at: string; revoked: boolean }[]>([]);
  const loadDevices = () => void supabase.rpc("list_devices").then(({ data }) => setDevices(data ?? []));
  useEffect(loadDevices, []);

  const copy = (t: string) => void navigator.clipboard?.writeText(t).then(() => toast.success("Copiado"));
  const makeInvite = async (e: React.FormEvent) => {
    e.preventDefault();
    const { data, error } = await supabase.rpc("create_invite", { _member_name: name, _role: role });
    if (error) { toast.error(errMsg(error)); return; }
    setInvite(data); setName("");
  };
  const makePair = async () => {
    const { data, error } = await supabase.rpc("create_pairing_code");
    if (error) { toast.error(errMsg(error)); return; }
    setPair(data);
  };
  const revoke = async (id: string) => {
    await supabase.rpc("revoke_device", { _id: id });
    loadDevices();
  };

  return (
    <div className="grid gap-4 md:grid-cols-2">
      <section className="rounded-[1.75rem] bg-lilac p-5">
        <h2 className="flex items-center gap-2 font-display text-xl font-bold"><UserPlus className="size-5" /> Invitar</h2>
        <form onSubmit={makeInvite} className="mt-4 space-y-3">
          <input required aria-label="Nombre de la persona" value={name} onChange={(e) => setName(e.target.value)} placeholder="Nombre" className={field} />
          <div className="grid grid-cols-2 gap-2">
            {([["member", "Hijo/a"], ["admin", "Adulto"]] as const).map(([r, l]) => <button type="button" key={r} onClick={() => setRole(r)} className={cn("rounded-xl py-2 text-sm font-semibold", role === r ? "bg-primary text-primary-foreground" : "bg-card")}>{l}</button>)}
          </div>
          <Button type="submit" className="w-full rounded-xl">Crear invitación</Button>
        </form>
        {invite && <button onClick={() => copy(invite)} className="mt-3 flex w-full items-center justify-between rounded-2xl bg-card p-4"><span className="font-display text-3xl font-extrabold tracking-widest">{invite}</span><Copy className="size-5" /></button>}
        {invite && <p className="mt-2 text-xs text-muted-foreground">Válida 7 días. Se usa al crear cuenta → “Tengo invitación”.</p>}
      </section>
      <section className="rounded-[1.75rem] bg-sky p-5">
        <h2 className="flex items-center gap-2 font-display text-xl font-bold"><Tablet className="size-5" /> Tablets</h2>
        <Button onClick={() => void makePair()} className="mt-4 w-full rounded-xl">Generar código</Button>
        {pair && <p className="mt-3 rounded-2xl bg-card p-4 text-center font-display text-5xl font-extrabold tabular tracking-[0.2em]">{pair}</p>}
        {pair && <p className="mt-2 text-xs text-muted-foreground">Válido 10 minutos. En la tablet: Tablet → código.</p>}
        <ul className="mt-4 space-y-2">
          {devices.map((d) => (
            <li key={d.id} className="flex items-center gap-2 rounded-xl bg-card p-3 text-sm">
              <Tablet className="size-4" /><span className={cn("flex-1", d.revoked && "text-muted-foreground line-through")}>{d.name} · {new Date(d.created_at).toLocaleDateString("es")}</span>
              {!d.revoked && <Button variant="ghost" size="icon" aria-label={`Desvincular ${d.name}`} onClick={() => void revoke(d.id)}><Trash2 /></Button>}
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}
