import { useEffect, useState } from "react";
import { Copy, Home, KeyRound, Mail, Pencil, Tablet, Trash2, UserPlus, Users } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { DEVICE_KEY } from "@/lib/db";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { credentials, invitationCode, INVITATION_KEY, readPendingInvite } from "@/lib/account-validation";
import { Avatar } from "./Kiosk";
import { MEMBERS, type Role } from "./data";

const field = "mt-1 w-full rounded-xl border bg-background px-3 py-2.5 text-base outline-none focus:ring-2 focus:ring-ring";
const pinField = (v: string) => v.replace(/\D/g, "").slice(0, 4);
const errMsg = (e: { message?: string } | null) => {
  const m = e?.message ?? "";
  if (m.includes("Invalid login")) return "Correo o contraseña incorrectos";
  if (m.includes("Email not confirmed")) return "Confirma tu correo antes de entrar";
  if (m.includes("Already in household")) return "Esta cuenta ya pertenece a un hogar";
  if (m.includes("Name required")) return "Escribe un nombre válido";
  if (m.includes("PIN already")) return "Ese PIN ya lo usa otra persona del hogar";
  if (m.includes("PIN must be 4 digits")) return "El PIN debe tener 4 números";
  if (m.includes("Only adults")) return "Solo un adulto puede hacerlo";
  if (m.includes("Cannot remove the last adult")) return "Debe quedar al menos un adulto en el hogar";
  if (m.includes("Member has a linked account")) return "Esta persona tiene una cuenta vinculada y no se puede quitar";
  if (m.includes("Member not found")) return "No se encontró a esa persona";
  if (m.includes("Invalid role")) return "Rol no válido";
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
  const [view, setView] = useState<"login" | "signup" | "pair" | "forgot">("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [sent, setSent] = useState(false);
  const [invitation, setInvitation] = useState("");
  useEffect(() => {
    const candidate = new URLSearchParams(window.location.search).get("invite");
    const parsed = invitationCode.safeParse(candidate);
    if (parsed.success) localStorage.setItem(INVITATION_KEY, parsed.data);
    setInvitation(readPendingInvite());
  }, []);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (busy) return;
    setBusy(true);
    if (view === "pair") {
      const { data, error } = await supabase.rpc("pair_device", { _code: code, _name: "Tablet de casa" });
      setBusy(false);
      if (error || !data) { toast.error(errMsg(error)); return; }
      localStorage.setItem(DEVICE_KEY, data);
      onPaired(data);
      return;
    }
    if (view === "forgot") {
      const valid = credentials.shape.email.safeParse(email);
      if (!valid.success) { toast.error("Escribe un correo válido"); setBusy(false); return; }
      const { error } = await supabase.auth.resetPasswordForEmail(valid.data, { redirectTo: `${window.location.origin}/reset-password` });
      setBusy(false);
      if (error) toast.error("No se pudo enviar el enlace. Intenta de nuevo más tarde.");
      else setSent(true);
      return;
    }
    const valid = credentials.safeParse({ email, password });
    if (!valid.success) { toast.error(valid.error.issues[0]?.message ?? "Revisa tus datos"); setBusy(false); return; }
    if (invitation) {
      const parsed = invitationCode.safeParse(invitation);
      if (!parsed.success) { toast.error("Código de invitación no válido"); setBusy(false); return; }
      localStorage.setItem(INVITATION_KEY, parsed.data);
    } else localStorage.removeItem(INVITATION_KEY);
    const { error, data } = view === "login"
      ? await supabase.auth.signInWithPassword(valid.data)
      : await supabase.auth.signUp({ ...valid.data, options: { emailRedirectTo: invitation ? `${window.location.origin}/?invite=${encodeURIComponent(invitation)}` : window.location.origin } });
    setBusy(false);
    if (error) { toast.error(errMsg(error)); return; }
    if (view === "signup" && !data.session) setSent(true);
  };

  if (sent) return <Shell compact={compact}><div className="space-y-4 text-center"><Mail className="mx-auto size-10" /><h1 className="font-display text-2xl font-bold">Revisa tu correo</h1><p className="text-sm text-muted-foreground">{view === "forgot" ? "Si el correo tiene una cuenta, recibirás un enlace para recuperar tu contraseña." : `Confirma tu cuenta con el enlace enviado a ${email}.`}</p><Button variant="ghost" onClick={() => { setSent(false); setView("login"); }}>Volver a entrar</Button></div></Shell>;

  return (
    <Shell compact={compact}>
      <h1 className="font-display text-4xl font-extrabold">{view === "pair" ? "Emparejar tablet" : view === "signup" ? "Crea tu cuenta" : view === "forgot" ? "Recuperar acceso" : "Bienvenido"}</h1>
      <div className="my-5 grid grid-cols-3 gap-1 rounded-2xl bg-card p-1 shadow-card">
        {([["login", "Entrar"], ["signup", "Registro"], ["pair", "Tablet"]] as const).map(([v, l]) => (
          <Button variant="ghost" key={v} disabled={busy} onClick={() => setView(v)} className={cn("rounded-xl py-2 text-sm font-semibold", view === v ? "bg-primary text-primary-foreground" : "text-muted-foreground")}>{l}</Button>
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
            {view !== "forgot" && <label className="block text-sm font-semibold">Contraseña<input type="password" required minLength={6} maxLength={128} autoComplete={view === "signup" ? "new-password" : "current-password"} value={password} onChange={(e) => setPassword(e.target.value)} className={field} /></label>}
            {view === "signup" && <label className="block text-sm font-semibold">Invitación (opcional)<input value={invitation} maxLength={16} onChange={(e) => setInvitation(e.target.value.toUpperCase())} className={field} /></label>}
          </>
        )}
        <Button type="submit" disabled={busy} className="h-12 w-full rounded-xl">{busy ? "Un momento…" : view === "pair" ? <><Tablet /> Emparejar</> : view === "signup" ? "Crear cuenta" : view === "forgot" ? "Enviar enlace" : "Entrar"}</Button>
        {view === "login" && <Button type="button" variant="ghost" className="w-full" onClick={() => setView("forgot")}>Olvidé mi contraseña</Button>}
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
  useEffect(() => { const pending = readPendingInvite(); if (pending) { setCode(pending); setView("join"); } }, []);
  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (busy) return;
    if (pin.length !== 4) { toast.error("El PIN debe tener 4 números"); return; }
    setBusy(true);
    const { error } = view === "create"
      ? await supabase.rpc("create_household", { _name: home, _member_name: name, _pin: pin })
      : await supabase.rpc("redeem_invite", { _code: code, _pin: pin });
    setBusy(false);
    if (error) { toast.error(errMsg(error)); return; }
    localStorage.removeItem(INVITATION_KEY);
    window.history.replaceState({}, "", window.location.pathname);
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
  const [invites, setInvites] = useState<{ code: string; member_name: string; role: string; expires_at: string; used_at: string | null; revoked_at: string | null }[]>([]);
  const [busy, setBusy] = useState(false);
  const [members, setMembers] = useState<{ key: string; name: string; role: string }[]>([]);
  const [adding, setAdding] = useState<{ name: string; role: "member" | "admin"; pin: string } | null>(null);
  const [editing, setEditing] = useState<{ key: string; name: string; role: "member" | "admin"; pin: string } | null>(null);
  const loadDevices = () => void supabase.rpc("list_devices").then(({ data }) => setDevices(data ?? []));
  const loadInvites = () => void supabase.rpc("list_invites").then(({ data, error }) => { if (error) toast.error("No se pudieron cargar las invitaciones"); else setInvites(data ?? []); });
  const loadMembers = () => void supabase.rpc("household_members").then(({ data, error }) => { if (error) toast.error("No se pudieron cargar los miembros"); else setMembers(data ?? []); });
  useEffect(() => { loadDevices(); loadInvites(); loadMembers(); }, []);

  const copy = (t: string) => void navigator.clipboard?.writeText(t).then(() => toast.success("Copiado"));
  const makeInvite = async (e: React.FormEvent) => {
    e.preventDefault();
    if (busy || !name.trim()) return;
    setBusy(true);
    const { data, error } = await supabase.rpc("create_invite", { _member_name: name, _role: role });
    setBusy(false);
    if (error) { toast.error(errMsg(error)); return; }
    setInvite(data); setName(""); loadInvites();
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
  const addMember = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!adding || adding.pin.length !== 4) { toast.error("El PIN debe tener 4 números"); return; }
    setBusy(true);
    const { error } = await supabase.rpc("create_member", { _name: adding.name, _role: adding.role, _pin: adding.pin });
    setBusy(false);
    if (error) { toast.error(errMsg(error)); return; }
    setAdding(null);
    loadMembers();
    toast.success("Miembro añadido");
  };
  const saveMember = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editing) return;
    if (editing.pin && editing.pin.length !== 4) { toast.error("El PIN debe tener 4 números"); return; }
    setBusy(true);
    const { error } = await supabase.rpc("update_member", { _key: editing.key, _name: editing.name, _role: editing.role, _pin: editing.pin || null });
    setBusy(false);
    if (error) { toast.error(errMsg(error)); return; }
    setEditing(null);
    loadMembers();
    toast.success("Cambios guardados");
  };
  const removeMember = async (key: string, name: string) => {
    if (!window.confirm(`¿Quitar a ${name} del hogar?`)) return;
    const { error } = await supabase.rpc("delete_member", { _key: key });
    if (error) { toast.error(errMsg(error)); return; }
    loadMembers();
    toast.success("Miembro eliminado");
  };
  const memberAvatar = (key: string, name: string, role: string) => {
    const known = MEMBERS.find((m) => m.id === key);
    return <Avatar m={known ?? { id: key, name, role: role === "admin" ? "admin" : "member", color: "member-1" }} size="sm" />;
  };

  return (
    <div className="grid gap-4 md:grid-cols-2">
      <section className="rounded-[1.75rem] bg-lilac p-5">
        <h2 className="flex items-center gap-2 font-display text-xl font-bold"><UserPlus className="size-5" /> Invitar</h2>
        <form onSubmit={makeInvite} className="mt-4 space-y-3">
          <input required maxLength={100} aria-label="Nombre de la persona" value={name} onChange={(e) => setName(e.target.value)} placeholder="Nombre" className={field} />
          <div className="grid grid-cols-2 gap-2">
            {([["member", "Hijo/a"], ["admin", "Adulto"]] as const).map(([r, l]) => <button type="button" key={r} onClick={() => setRole(r)} className={cn("rounded-xl py-2 text-sm font-semibold", role === r ? "bg-primary text-primary-foreground" : "bg-card")}>{l}</button>)}
          </div>
          <Button type="submit" disabled={busy} className="w-full rounded-xl">Crear invitación</Button>
        </form>
        {invite && <Button variant="ghost" onClick={() => copy(`${window.location.origin}/?invite=${invite}`)} className="mt-3 h-auto w-full gap-2 whitespace-normal bg-card p-4"><span className="break-all font-mono text-lg font-bold">{invite}</span><Copy className="size-5 shrink-0" /></Button>}
        {invite && <p className="mt-2 text-xs text-muted-foreground">Válida 7 días. Se usa al crear cuenta → “Tengo invitación”.</p>}
        <ul className="mt-4 divide-y divide-border">{invites.map((i) => {
          const status = i.used_at ? "Aceptada" : i.revoked_at ? "Cancelada" : new Date(i.expires_at) <= new Date() ? "Caducada" : "Pendiente";
          return <li key={i.code} className="flex items-center gap-2 py-3"><div className="min-w-0 flex-1"><p className="break-words text-sm font-semibold">{i.member_name} · {i.role === "admin" ? "Adulto" : "Hijo/a"}</p><p className="text-xs text-muted-foreground">{status}</p></div>{status === "Pendiente" && <><Button variant="ghost" size="icon" aria-label={`Copiar invitación de ${i.member_name}`} onClick={() => copy(`${window.location.origin}/?invite=${i.code}`)}><Copy /></Button><Button variant="ghost" size="icon" aria-label={`Cancelar invitación de ${i.member_name}`} onClick={() => void supabase.rpc("revoke_invite", { _code: i.code }).then(({ error }) => { if (error) toast.error("No se pudo cancelar"); else { if (invite === i.code) setInvite(null); loadInvites(); } })}><Trash2 /></Button></>}</li>;
        })}</ul>
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
      <section className="rounded-[1.75rem] bg-accent p-5 md:col-span-2">
        <h2 className="flex items-center gap-2 font-display text-xl font-bold"><Users className="size-5" /> Miembros</h2>
        {!adding && <Button onClick={() => setAdding({ name: "", role: "member", pin: "" })} className="mt-4 rounded-xl"><UserPlus className="size-4" /> Añadir persona</Button>}
        {adding && <form onSubmit={addMember} className="mt-4 space-y-3">
          <input required maxLength={100} autoFocus aria-label="Nombre de la persona" placeholder="Nombre" value={adding.name} onChange={(e) => setAdding({ ...adding, name: e.target.value })} className={field} />
          <div className="grid grid-cols-2 gap-2">
            {([["member", "Hijo/a"], ["admin", "Adulto"]] as const).map(([r, l]) => <button type="button" key={r} onClick={() => setAdding({ ...adding, role: r })} className={cn("rounded-xl py-2 text-sm font-semibold", adding.role === r ? "bg-primary text-primary-foreground" : "bg-card")}>{l}</button>)}
          </div>
          <input inputMode="numeric" required maxLength={4} aria-label="PIN de 4 números" placeholder="PIN (4 números)" value={adding.pin} onChange={(e) => setAdding({ ...adding, pin: pinField(e.target.value) })} className={cn(field, "font-display tracking-[0.5em]")} />
          <div className="flex justify-end gap-2"><Button type="button" variant="ghost" onClick={() => setAdding(null)}>Cancelar</Button><Button type="submit" disabled={busy}>Añadir</Button></div>
        </form>}
        <ul className="mt-4 space-y-2">
          {members.map((m) => (
            <li key={m.key} className="flex flex-wrap items-center gap-2 rounded-xl bg-card p-3">
              {memberAvatar(m.key, m.name, m.role)}
              {editing?.key === m.key ? (
                <form onSubmit={saveMember} className="flex min-w-0 flex-1 flex-wrap items-center gap-2">
                  <input required maxLength={100} aria-label={`Nombre de ${m.name}`} value={editing.name} onChange={(e) => setEditing({ ...editing, name: e.target.value })} className={cn(field, "min-w-36 flex-1")} />
                  {(["member", "admin"] as const).map((r) => <button type="button" key={r} onClick={() => setEditing({ ...editing, role: r })} className={cn("rounded-xl px-3 py-2 text-sm font-semibold", editing.role === r ? "bg-primary text-primary-foreground" : "bg-secondary")}>{r === "admin" ? "Adulto" : "Hijo/a"}</button>)}
                  <input inputMode="numeric" maxLength={4} aria-label="PIN nuevo (opcional)" placeholder="PIN nuevo" value={editing.pin} onChange={(e) => setEditing({ ...editing, pin: pinField(e.target.value) })} className={cn(field, "w-36 font-display tracking-[0.3em]")} />
                  <Button type="button" variant="ghost" onClick={() => setEditing(null)}>Cancelar</Button>
                  <Button type="submit" disabled={busy} size="sm">Guardar</Button>
                </form>
              ) : (
                <>
                  <span className="min-w-0 flex-1 truncate text-sm font-semibold">{m.name}</span>
                  <span className="text-xs text-muted-foreground">{m.role === "admin" ? "Adulto" : "Hijo/a"}</span>
                  <Button variant="ghost" size="icon" aria-label={`Editar a ${m.name}`} onClick={() => setEditing({ key: m.key, name: m.name, role: m.role === "admin" ? "admin" : "member", pin: "" })}><Pencil /></Button>
                  <Button variant="ghost" size="icon" aria-label={`Quitar a ${m.name}`} onClick={() => void removeMember(m.key, m.name)}><Trash2 /></Button>
                </>
              )}
            </li>
          ))}
        </ul>
        <p className="mt-3 text-xs text-muted-foreground">El PIN es la llave de cada persona. Quien tiene cuenta propia se vincula al aceptar su invitación y no se puede quitar desde aquí.</p>
      </section>
    </div>
  );
}
