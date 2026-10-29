import { useCallback, useEffect, useState } from "react";
import { Copy, Home, KeyRound, Mail, Pencil, Tablet, Trash2, UserPlus, Users } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import {
  credentials,
  invitationCode,
  INVITATION_KEY,
  readPendingInvite,
} from "@/lib/account-validation";
import { Avatar } from "./Kiosk";
import { TabletPairingPane } from "./TabletPairing";
import { PinEditor } from "./PinEditor";
import { MEMBERS, setMembers as setHouseholdMembers } from "./data";
import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogCancel,
  AlertDialogAction,
} from "@/components/ui/alert-dialog";

const field =
  "mt-1 w-full rounded-xl border bg-background px-3 py-2.5 text-base outline-none focus:ring-2 focus:ring-ring";
const errMsg = (e: { message?: string } | null) => {
  const m = e?.message ?? "";
  if (m.includes("Household suspended"))
    return "Este hogar está suspendido. Consulta con quien administra el servicio.";
  if (m.includes("Device revoked"))
    return "Esta tablet ha sido desvinculada. Un adulto debe volver a emparejarla.";
  if (m.includes("Member has household history"))
    return "Esta persona tiene historial de tareas o finanzas y no se puede borrar. Conserva su historial.";
  if (m.includes("Cannot unlink the last adult account"))
    return "Debe quedar otra cuenta adulta vinculada antes de desvincular esta cuenta.";
  if (m.includes("Cannot unlink yourself")) return "Para desvincular tu cuenta utiliza Mi perfil.";
  if (m.includes("Failed to fetch") || m.includes("NetworkError") || m.includes("fetch failed"))
    return "No se pudo conectar. Revisa tu conexión y vuelve a intentarlo.";
  if (m.includes("Invalid login")) return "Correo o contraseña incorrectos";
  if (m.includes("Email not confirmed")) return "Confirma tu correo antes de entrar";
  if (m.includes("different verified email"))
    return "Esta invitación corresponde a otro correo. Entra con la dirección que recibió la invitación y confírmala.";
  if (m.includes("Already in household")) return "Esta cuenta ya pertenece a un hogar";
  if (m.includes("Name required")) return "Escribe un nombre válido";
  if (m.includes("PIN already")) return "Ese PIN ya lo usa otra persona del hogar";
  if (m.includes("PIN must be 4 digits")) return "El PIN debe tener 4 números";
  if (m.includes("Only adults")) return "Solo un adulto puede hacerlo";
  if (m.includes("Cannot remove the last adult"))
    return "Debe quedar al menos un adulto en el hogar";
  if (m.includes("Member has a linked account"))
    return "Esta persona tiene una cuenta vinculada y no se puede quitar";
  if (m.includes("Member not found")) return "No se encontró a esa persona";
  if (m.includes("Invalid role")) return "Rol no válido";
  if (m.includes("Invalid or expired")) return "Código no válido o caducado";
  if (m.includes("duplicate key") && m.includes("pin"))
    return "Ese PIN ya lo usa otra persona del hogar";
  return "No se pudo completar la acción. Comprueba la conexión y vuelve a intentarlo.";
};

function pendingInvitation() {
  const candidate = invitationCode.safeParse(
    new URLSearchParams(window.location.search).get("invite"),
  );
  if (candidate.success) {
    try {
      localStorage.setItem(INVITATION_KEY, candidate.data);
    } catch {
      /* The URL still preserves the invite for this session. */
    }
    return candidate.data;
  }
  try {
    return readPendingInvite();
  } catch {
    return "";
  }
}

function Shell({ children, compact }: { children: React.ReactNode; compact: boolean }) {
  return (
    <div className={cn("flex min-h-dvh w-full flex-col overflow-y-auto", compact ? "p-5" : "p-10")}>
      <span className="font-display text-xl font-extrabold tracking-tight">Skendal</span>
      <div className="mx-auto my-auto w-full max-w-sm py-6">{children}</div>
    </div>
  );
}

/** First screen for a browser with no account and no paired tablet. */
export function Welcome({ compact, onPaired }: { compact: boolean; onPaired: () => void }) {
  const [view, setView] = useState<"login" | "signup" | "pair">(() =>
    pendingInvitation() || new URLSearchParams(window.location.search).get("registro") === "1"
      ? "signup"
      : "login",
  );
  const [email, setEmail] = useState(() => {
    const parsed = credentials.shape.email.safeParse(
      new URLSearchParams(window.location.search).get("email"),
    );
    return parsed.success ? parsed.data : "";
  });
  const [busy, setBusy] = useState(false);
  const [sent, setSent] = useState(false);
  const [invitation, setInvitation] = useState("");
  useEffect(() => {
    setInvitation(pendingInvitation());
  }, []);

  const submit = async (e: React.FormEvent<HTMLFormElement>) => {
    try {
      e.preventDefault();
      if (busy) return;
      const values = new FormData(e.currentTarget);
      setBusy(true);
      const valid = credentials.safeParse({
        email: values.get("username"),
        password: values.get("password"),
      });
      if (!valid.success) {
        toast.error(valid.error.issues[0]?.message ?? "Revisa tus datos");
        setBusy(false);
        return;
      }
      if (invitation) {
        const parsed = invitationCode.safeParse(invitation);
        if (!parsed.success) {
          toast.error("Código de invitación no válido");
          setBusy(false);
          return;
        }
        localStorage.setItem(INVITATION_KEY, parsed.data);
      } else localStorage.removeItem(INVITATION_KEY);
      const { error, data } =
        view === "login"
          ? await supabase.auth.signInWithPassword(valid.data)
          : await supabase.auth.signUp({
              ...valid.data,
              options: {
                emailRedirectTo: invitation
                  ? `${window.location.origin}/?invite=${encodeURIComponent(invitation)}`
                  : window.location.origin,
              },
            });
      setBusy(false);
      if (error) {
        toast.error(errMsg(error));
        return;
      }
      if (view === "signup" && !data.session) {
        setEmail(valid.data.email);
        setSent(true);
      }
    } catch {
      toast.error("No se pudo conectar. Revisa la conexión y vuelve a intentarlo.");
    } finally {
      setBusy(false);
    }
  };

  if (view === "pair")
    return (
      <Shell compact={compact}>
        <TabletPairingPane onPaired={onPaired} onCancel={() => setView("login")} />
      </Shell>
    );

  if (sent)
    return (
      <Shell compact={compact}>
        <div className="space-y-4 text-center">
          <Mail className="mx-auto size-10" />
          <h1 className="font-display text-2xl font-bold">Revisa tu correo</h1>
          <p className="text-sm text-muted-foreground">
            {`Confirma tu cuenta con el enlace enviado a ${email}.`}
          </p>
          <Button
            variant="ghost"
            onClick={() => {
              setSent(false);
              setView("login");
            }}
          >
            Volver a entrar
          </Button>
        </div>
      </Shell>
    );

  return (
    <Shell compact={compact}>
      <h1 className="font-display text-4xl font-extrabold">
        {view === "signup" ? "Crea tu cuenta" : "Bienvenido"}
      </h1>
      <div className="my-5 grid grid-cols-3 gap-1 rounded-2xl bg-card p-1 shadow-card">
        {(
          [
            ["login", "Entrar"],
            ["signup", "Registro"],
            ["pair", "Tablet"],
          ] as const
        ).map(([v, l]) => (
          <Button
            variant="ghost"
            key={v}
            disabled={busy}
            onClick={() => setView(v)}
            className={cn(
              "rounded-xl py-2 text-sm font-semibold",
              view === v ? "bg-primary text-primary-foreground" : "text-muted-foreground",
            )}
          >
            {l}
          </Button>
        ))}
      </div>
      <form
        id={view === "signup" ? "account-signup" : "account-login"}
        method="post"
        onSubmit={submit}
        className="space-y-4 rounded-3xl bg-card p-5 shadow-card"
      >
        <label className="block text-sm font-semibold">
          Correo
          <input
            id="account-email"
            name="username"
            type="email"
            autoComplete="username"
            required
            defaultValue={email}
            className={field}
          />
        </label>
        <label className="block text-sm font-semibold">
          Contraseña
          <input
            id="account-password"
            name="password"
            type="password"
            required
            minLength={6}
            maxLength={128}
            autoComplete={view === "signup" ? "new-password" : "current-password"}
            className={field}
          />
        </label>
        {view === "signup" && (
          <label className="block text-sm font-semibold">
            Invitación (opcional)
            <input
              value={invitation}
              maxLength={32}
              onChange={(e) => setInvitation(e.target.value.toUpperCase())}
              className={field}
            />
          </label>
        )}
        <Button type="submit" disabled={busy} className="h-12 w-full rounded-xl">
          {busy ? "Un momento…" : view === "signup" ? "Crear cuenta" : "Entrar"}
        </Button>
        {view === "login" && (
          <a
            href="/reset-password"
            className="block rounded-xl py-3 text-center text-sm font-medium underline underline-offset-4"
          >
            Olvidé mi contraseña
          </a>
        )}
      </form>
    </Shell>
  );
}

/** Signed-in account without a household: create one or join with an invite. */
export function SetupHousehold({
  compact,
  email,
  onDone,
}: {
  compact: boolean;
  email: string;
  onDone: () => void;
}) {
  const [view, setView] = useState<"choose" | "create" | "join">("choose");
  const [home, setHome] = useState("");
  const [name, setName] = useState("");
  const [code, setCode] = useState("");
  const [pin, setPin] = useState("");
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    const pending = pendingInvitation();
    if (pending) {
      setCode(pending);
      setView("join");
    }
  }, []);
  const submit = async (e: React.FormEvent) => {
    try {
      e.preventDefault();
      if (busy || view === "choose") return;
      if (pin.length !== 4) {
        toast.error("El PIN debe tener 4 números");
        return;
      }
      setBusy(true);
      const { error } =
        view === "create"
          ? await supabase.rpc("create_household", { _name: home, _member_name: name, _pin: pin })
          : await supabase.rpc("redeem_invite", { _code: code, _pin: pin });
      setBusy(false);
      if (error) {
        toast.error(errMsg(error));
        return;
      }
      localStorage.removeItem(INVITATION_KEY);
      window.history.replaceState({}, "", window.location.pathname);
      onDone();
    } catch {
      toast.error("No se pudo conectar. Revisa la conexión y vuelve a intentarlo.");
    } finally {
      setBusy(false);
    }
  };
  const signOut = async () => {
    if (busy) return;
    setBusy(true);
    try {
      const { error } = await supabase.auth.signOut({ scope: "local" });
      if (error) throw error;
    } catch {
      toast.error("No se pudo cerrar sesión. Revisa la conexión y vuelve a intentarlo.");
    } finally {
      setBusy(false);
    }
  };
  if (view === "choose")
    return (
      <Shell compact={compact}>
        <section className="space-y-5 rounded-3xl bg-card p-6 shadow-card">
          <h1 className="font-display text-3xl font-extrabold tracking-[-0.04em]">Tu hogar</h1>
          <p className="break-words text-sm font-semibold">{email}</p>
          <Button className="w-full" onClick={() => setView("create")}>
            <Home /> Crear hogar
          </Button>
          <Button variant="outline" className="w-full" onClick={() => setView("join")}>
            <KeyRound /> Tengo una invitación
          </Button>
          <details className="text-sm text-muted-foreground">
            <summary className="cursor-pointer py-2 font-medium">
              ¿Ya pertenecías a un hogar?
            </summary>
            <p className="pt-2">
              Comprueba el correo con el que entraste. Si tu cuenta se desvinculó, pide a un adulto
              del hogar que revise tu acceso antes de crear otro.
            </p>
          </details>
          <button
            type="button"
            disabled={busy}
            onClick={() => void signOut()}
            className="w-full py-2 text-sm underline underline-offset-4"
          >
            Cerrar sesión
          </button>
        </section>
      </Shell>
    );
  return (
    <Shell compact={compact}>
      <button
        type="button"
        disabled={busy}
        onClick={() => setView("choose")}
        className="mb-4 py-2 text-sm underline underline-offset-4"
      >
        Volver a mi cuenta
      </button>
      <h1 className="font-display text-4xl font-extrabold tracking-[-0.04em]">Tu hogar</h1>
      <div className="my-5 grid grid-cols-2 gap-1 rounded-2xl bg-card p-1 shadow-card">
        {(
          [
            ["create", "Crear hogar", Home],
            ["join", "Tengo invitación", KeyRound],
          ] as const
        ).map(([v, l, Icon]) => (
          <button
            key={v}
            onClick={() => setView(v)}
            className={cn(
              "flex items-center justify-center gap-2 rounded-xl py-2 text-sm font-semibold",
              view === v ? "bg-primary text-primary-foreground" : "text-muted-foreground",
            )}
          >
            <Icon className="size-4" />
            {l}
          </button>
        ))}
      </div>
      <form onSubmit={submit} className="space-y-4 rounded-3xl bg-card p-5 shadow-card">
        {view === "create" ? (
          <>
            <label className="block text-sm font-semibold">
              Nombre del hogar
              <input
                required
                value={home}
                onChange={(e) => setHome(e.target.value)}
                placeholder="Familia García"
                className={field}
              />
            </label>
            <label className="block text-sm font-semibold">
              Tu nombre
              <input
                required
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Ana"
                className={field}
              />
            </label>
          </>
        ) : (
          <label className="block text-sm font-semibold">
            Código de invitación
            <input
              required
              value={code}
              onChange={(e) => setCode(e.target.value.toUpperCase())}
              className={cn(field, "font-display tracking-widest")}
            />
          </label>
        )}
        <PinEditor label="Tu PIN (4 números)" value={pin} onChange={setPin} disabled={busy} />
        <Button type="submit" disabled={busy} className="h-12 w-full rounded-xl">
          {view === "create" ? "Crear hogar" : "Unirme"}
        </Button>
        <button
          type="button"
          disabled={busy}
          onClick={() => void signOut()}
          className="w-full text-xs text-muted-foreground"
        >
          Cerrar sesión
        </button>
      </form>
    </Shell>
  );
}

/** Adults only: invite people, pair tablets and revoke devices. */
export function HouseholdSettings({
  onMembersChanged,
}: {
  onMembersChanged?: () => void | Promise<void>;
}) {
  const [inviteEmail, setInviteEmail] = useState("");
  const [name, setName] = useState("");
  const [role, setRole] = useState<"member" | "admin">("member");
  const [invite, setInvite] = useState<string | null>(null);
  const [devices, setDevices] = useState<
    { id: string; name: string; created_at: string; revoked: boolean }[]
  >([]);
  const [invites, setInvites] = useState<
    {
      code: string;
      member_name: string;
      role: string;
      expires_at: string;
      used_at: string | null;
      revoked_at: string | null;
      recipient_email: string | null;
      delivery_status: string;
    }[]
  >([]);
  const [busy, setBusy] = useState(false);
  const [members, setMembers] = useState<{ key: string; name: string; role: string }[]>([]);
  const [adding, setAdding] = useState<{
    name: string;
    role: "member" | "admin";
    pin: string;
  } | null>(null);
  const [editing, setEditing] = useState<{
    key: string;
    name: string;
    role: "member" | "admin";
    pin: string;
  } | null>(null);
  const [linkedMembers, setLinkedMembers] = useState<Set<string>>(new Set());
  const [currentKey, setCurrentKey] = useState<string | null>(null);
  const [memberAction, setMemberAction] = useState<{
    key: string;
    name: string;
    kind: "delete" | "unlink";
  } | null>(null);
  const loadDevices = useCallback(async () => {
    try {
      const { data, error } = await supabase.rpc("list_devices");
      if (error) throw error;
      setDevices(data ?? []);
    } catch {
      toast.error("No se pudieron cargar las tablets. Inténtalo de nuevo.");
    }
  }, []);
  const loadInvites = useCallback(async () => {
    try {
      const { data, error } = await supabase.rpc("list_email_invites");
      if (error) throw error;
      setInvites(data ?? []);
    } catch {
      toast.error("No se pudieron cargar las invitaciones.");
    }
  }, []);
  const loadMembers = useCallback(
    async (notify = false) => {
      try {
        const [{ data, error }, accounts, context] = await Promise.all([
          supabase.rpc("household_members"),
          supabase.rpc("list_member_accounts"),
          supabase.rpc("my_context"),
        ]);
        if (error || accounts.error || context.error)
          throw error ?? accounts.error ?? context.error;
        setMembers(data ?? []);
        if (!onMembersChanged) setHouseholdMembers(data ?? []);
        setLinkedMembers(
          new Set(
            (accounts.data ?? []).filter((member) => member.linked).map((member) => member.key),
          ),
        );
        setCurrentKey(context.data?.[0]?.member_key ?? null);
      } catch {
        toast.error("No se pudieron actualizar los miembros del hogar.");
      } finally {
        if (notify) await onMembersChanged?.();
      }
    },
    [onMembersChanged],
  );
  useEffect(() => {
    void loadDevices();
    void loadInvites();
    void loadMembers();
  }, [loadDevices, loadInvites, loadMembers]);

  const copy = async (text: string) => {
    try {
      if (!navigator.clipboard) throw new Error("Clipboard unavailable");
      await navigator.clipboard.writeText(text);
      toast.success("Copiado");
    } catch {
      toast.error("No se pudo copiar. Selecciona el código para copiarlo manualmente.");
    }
  };
  const sendInvite = async (recipient: {
    name: string;
    email: string;
    role: string;
    code?: string;
  }) => {
    if (busy) return;
    setBusy(true);
    try {
      const {
        data: { session },
      } = await supabase.auth.getSession();
      if (!session) throw new Error("Vuelve a entrar para invitar a otra persona.");
      const response = await fetch("/api/invitations", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${session.access_token}`,
        },
        body: JSON.stringify(recipient),
      });
      const result = (await response.json()) as {
        sent?: boolean;
        error?: string;
        warning?: string;
      };
      if (!response.ok || !result.sent)
        throw new Error(result.error ?? "No se pudo enviar la invitación.");
      setInvite(recipient.email);
      if (result.warning) toast(result.warning);
      else toast.success("Invitación enviada por correo");
      setName("");
      setInviteEmail("");
    } catch (reason) {
      toast.error(
        reason instanceof Error ? reason.message : "No se pudo conectar para enviar la invitación.",
      );
    } finally {
      setBusy(false);
      void loadInvites();
    }
  };
  const makeInvite = async (event: React.FormEvent) => {
    event.preventDefault();
    const valid = credentials.shape.email.safeParse(inviteEmail);
    if (!valid.success || !name.trim()) {
      toast.error("Escribe un nombre y correo válidos");
      return;
    }
    await sendInvite({ name: name.trim(), email: valid.data, role });
  };
  const revoke = async (id: string) => {
    if (busy) return;
    try {
      setBusy(true);
      const { error } = await supabase.rpc("revoke_device", { _id: id });
      if (error) {
        toast.error(errMsg(error));
        return;
      }
      await loadDevices();
      toast.success("Tablet desvinculada");
    } catch {
      toast.error("No se pudo conectar. Revisa la conexión y vuelve a intentarlo.");
    } finally {
      setBusy(false);
    }
  };
  const addMember = async (e: React.FormEvent) => {
    if (busy) return;
    try {
      e.preventDefault();
      if (!adding || adding.pin.length !== 4) {
        toast.error("El PIN debe tener 4 números");
        return;
      }
      setBusy(true);
      const { error } = await supabase.rpc("create_member", {
        _name: adding.name,
        _role: adding.role,
        _pin: adding.pin,
      });
      setBusy(false);
      if (error) {
        toast.error(errMsg(error));
        return;
      }
      setAdding(null);
      await loadMembers(true);
      toast.success("Miembro añadido");
    } catch {
      toast.error("No se pudo conectar. Revisa la conexión y vuelve a intentarlo.");
    } finally {
      setBusy(false);
    }
  };
  const saveMember = async (e: React.FormEvent) => {
    if (busy) return;
    try {
      e.preventDefault();
      if (!editing) return;
      if (editing.pin && editing.pin.length !== 4) {
        toast.error("El PIN debe tener 4 números");
        return;
      }
      setBusy(true);
      const { error } = await supabase.rpc("update_member", {
        _key: editing.key,
        _name: editing.name,
        _role: editing.role,
        _pin: editing.pin,
      });
      setBusy(false);
      if (error) {
        toast.error(errMsg(error));
        return;
      }
      setEditing(null);
      await loadMembers(true);
      toast.success("Cambios guardados");
    } catch {
      toast.error("No se pudo conectar. Revisa la conexión y vuelve a intentarlo.");
    } finally {
      setBusy(false);
    }
  };
  const performMemberAction = async () => {
    if (!memberAction || busy) return;
    setBusy(true);
    try {
      const { error } =
        memberAction.kind === "unlink"
          ? await supabase.rpc("unlink_member", { _key: memberAction.key })
          : await supabase.rpc("delete_member", { _key: memberAction.key });
      if (error) {
        toast.error(errMsg(error));
        return;
      }
      setMemberAction(null);
      await loadMembers(true);
      toast.success(
        memberAction.kind === "unlink"
          ? "Cuenta desvinculada; el historial se conserva"
          : "Miembro eliminado",
      );
    } catch {
      toast.error("No se pudo completar la acción. Revisa la conexión.");
    } finally {
      setBusy(false);
    }
  };
  const memberAvatar = (key: string, name: string, role: string) => {
    const known = MEMBERS.find((m) => m.id === key);
    return (
      <Avatar
        m={
          known ?? { id: key, name, role: role === "admin" ? "admin" : "member", color: "member-1" }
        }
        size="sm"
      />
    );
  };

  return (
    <div className="grid gap-4 md:grid-cols-2">
      <section className="rounded-[1.75rem] bg-lilac p-5">
        <h2 className="flex items-center gap-2 font-display text-xl font-bold">
          <UserPlus className="size-5" /> Invitar
        </h2>
        <form onSubmit={makeInvite} className="mt-4 space-y-3">
          <input
            required
            maxLength={100}
            aria-label="Nombre de la persona"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Nombre"
            className={field}
          />
          <label className="block text-sm font-semibold">
            Correo de la persona
            <input
              type="email"
              required
              maxLength={254}
              autoComplete="email"
              value={inviteEmail}
              onChange={(event) => setInviteEmail(event.target.value)}
              placeholder="persona@correo.com"
              className={field}
            />
          </label>
          <div className="grid grid-cols-2 gap-2">
            {(
              [
                ["member", "Hijo/a"],
                ["admin", "Adulto"],
              ] as const
            ).map(([r, l]) => (
              <button
                type="button"
                key={r}
                onClick={() => setRole(r)}
                className={cn(
                  "rounded-xl py-2 text-sm font-semibold",
                  role === r ? "bg-primary text-primary-foreground" : "bg-card",
                )}
              >
                {l}
              </button>
            ))}
          </div>
          <Button type="submit" disabled={busy} className="w-full rounded-xl">
            Enviar invitación por correo
          </Button>
        </form>
        {invite && (
          <p role="status" className="mt-3 rounded-2xl bg-card p-4 text-sm">
            Invitación enviada a {invite}. Al abrir el correo, la persona podrá registrarse o entrar
            con esa dirección.
          </p>
        )}
        <ul className="mt-4 divide-y divide-border">
          {invites.map((i) => {
            const status = i.used_at
              ? "Aceptada"
              : i.revoked_at
                ? "Cancelada"
                : new Date(i.expires_at) <= new Date()
                  ? "Caducada"
                  : "Pendiente";
            return (
              <li key={i.code} className="flex items-center gap-2 py-3">
                <div className="min-w-0 flex-1">
                  <p className="break-words text-sm font-semibold">
                    {i.member_name} · {i.role === "admin" ? "Adulto" : "Hijo/a"}
                  </p>
                  <p className="break-all text-xs text-muted-foreground">
                    {i.recipient_email ? `${i.recipient_email} · ` : ""}
                    {status}
                    {i.delivery_status === "pending" && status === "Pendiente"
                      ? " · Correo pendiente de envío"
                      : ""}
                  </p>
                </div>
                {status === "Pendiente" && (
                  <>
                    {i.recipient_email && (
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        disabled={busy}
                        aria-label={`Reenviar invitación de ${i.member_name}`}
                        onClick={() =>
                          void sendInvite({
                            name: i.member_name,
                            email: i.recipient_email!,
                            role: i.role,
                            code: i.code,
                          })
                        }
                      >
                        Reenviar
                      </Button>
                    )}
                    <Button
                      variant="ghost"
                      size="icon"
                      aria-label={`Cancelar invitación de ${i.member_name}`}
                      onClick={() =>
                        void supabase.rpc("revoke_invite", { _code: i.code }).then(({ error }) => {
                          if (error) toast.error("No se pudo cancelar");
                          else {
                            setInvite(null);
                            loadInvites();
                          }
                        })
                      }
                    >
                      <Trash2 />
                    </Button>
                  </>
                )}
              </li>
            );
          })}
        </ul>
      </section>
      <section className="rounded-[1.75rem] bg-sky p-5">
        <h2 className="flex items-center gap-2 font-display text-xl font-bold">
          <Tablet className="size-5" /> Tablets
        </h2>
        <p className="my-4 text-sm">
          En la tablet, abre{" "}
          <a href="/vincular" className="font-semibold underline">
            app.skendal.com/vincular
          </a>
          . Escanea el QR con tu teléfono y confirma.
        </p>
        <Button
          variant="outline"
          onClick={() => {
            if (!navigator.clipboard) {
              toast.error("Abre app.skendal.com/vincular en la tablet.");
              return;
            }
            void navigator.clipboard.writeText(`${window.location.origin}/vincular`).then(
              () => toast.success("Enlace copiado para abrir en la tablet"),
              () => toast.error("No se pudo copiar el enlace."),
            );
          }}
        >
          <Copy /> Copiar enlace para la tablet
        </Button>
        <ul className="mt-4 space-y-2">
          {devices.map((d) => (
            <li key={d.id} className="flex items-center gap-2 rounded-xl bg-card p-3 text-sm">
              <Tablet className="size-4" />
              <span className={cn("flex-1", d.revoked && "text-muted-foreground line-through")}>
                {d.name} · {new Date(d.created_at).toLocaleDateString("es")}
              </span>
              {!d.revoked && (
                <Button
                  variant="ghost"
                  size="icon"
                  aria-label={`Desvincular ${d.name}`}
                  onClick={() => void revoke(d.id)}
                >
                  <Trash2 />
                </Button>
              )}
            </li>
          ))}
        </ul>
      </section>
      <section className="rounded-[1.75rem] bg-accent p-5 md:col-span-2">
        <h2 className="flex items-center gap-2 font-display text-xl font-bold">
          <Users className="size-5" /> Miembros
        </h2>
        {!adding && (
          <Button
            onClick={() => setAdding({ name: "", role: "member", pin: "" })}
            className="mt-4 rounded-xl"
          >
            <UserPlus className="size-4" /> Añadir persona
          </Button>
        )}
        {adding && (
          <form onSubmit={addMember} className="mt-4 space-y-3">
            <input
              required
              maxLength={100}
              autoFocus
              aria-label="Nombre de nueva persona"
              placeholder="Nombre"
              value={adding.name}
              onChange={(e) => setAdding({ ...adding, name: e.target.value })}
              className={field}
            />
            <div className="grid grid-cols-2 gap-2">
              {(
                [
                  ["member", "Hijo/a"],
                  ["admin", "Adulto"],
                ] as const
              ).map(([r, l]) => (
                <button
                  type="button"
                  key={r}
                  onClick={() => setAdding({ ...adding, role: r })}
                  className={cn(
                    "rounded-xl py-2 text-sm font-semibold",
                    adding.role === r ? "bg-primary text-primary-foreground" : "bg-card",
                  )}
                >
                  {l}
                </button>
              ))}
            </div>
            <PinEditor
              label="PIN de 4 números"
              value={adding.pin}
              disabled={busy}
              onChange={(pin) => setAdding({ ...adding, pin })}
            />
            <div className="flex justify-end gap-2">
              <Button type="button" variant="ghost" onClick={() => setAdding(null)}>
                Cancelar
              </Button>
              <Button type="submit" disabled={busy}>
                Añadir
              </Button>
            </div>
          </form>
        )}
        <ul className="mt-4 space-y-2">
          {members.map((m) => (
            <li key={m.key} className="flex flex-wrap items-center gap-2 rounded-xl bg-card p-3">
              {memberAvatar(m.key, m.name, m.role)}
              {editing?.key === m.key ? (
                <form
                  onSubmit={saveMember}
                  className="flex min-w-0 flex-1 flex-wrap items-center gap-2"
                >
                  <input
                    required
                    maxLength={100}
                    aria-label={`Nombre de ${m.name}`}
                    value={editing.name}
                    onChange={(e) => setEditing({ ...editing, name: e.target.value })}
                    className={cn(field, "min-w-36 flex-1")}
                  />
                  {(["member", "admin"] as const).map((r) => (
                    <button
                      type="button"
                      key={r}
                      onClick={() => setEditing({ ...editing, role: r })}
                      className={cn(
                        "rounded-xl px-3 py-2 text-sm font-semibold",
                        editing.role === r ? "bg-primary text-primary-foreground" : "bg-secondary",
                      )}
                    >
                      {r === "admin" ? "Adulto" : "Hijo/a"}
                    </button>
                  ))}
                  <PinEditor
                    label="PIN nuevo (opcional)"
                    value={editing.pin}
                    disabled={busy}
                    optional
                    className="w-full"
                    onChange={(pin) => setEditing({ ...editing, pin })}
                  />
                  <Button type="button" variant="ghost" onClick={() => setEditing(null)}>
                    Cancelar
                  </Button>
                  <Button type="submit" disabled={busy} size="sm">
                    Guardar
                  </Button>
                </form>
              ) : (
                <>
                  <span className="min-w-0 flex-1 truncate text-sm font-semibold">{m.name}</span>
                  <span className="text-xs text-muted-foreground">
                    {m.role === "admin" ? "Adulto" : "Hijo/a"}
                  </span>
                  <Button
                    variant="ghost"
                    size="icon"
                    aria-label={`Editar a ${m.name}`}
                    onClick={() =>
                      setEditing({
                        key: m.key,
                        name: m.name,
                        role: m.role === "admin" ? "admin" : "member",
                        pin: "",
                      })
                    }
                  >
                    <Pencil />
                  </Button>
                  {linkedMembers.has(m.key) && currentKey !== m.key && (
                    <Button
                      variant="outline"
                      size="sm"
                      disabled={busy}
                      onClick={() => setMemberAction({ key: m.key, name: m.name, kind: "unlink" })}
                    >
                      Desvincular cuenta
                    </Button>
                  )}
                  <Button
                    variant="ghost"
                    size="icon"
                    aria-label={`Quitar a ${m.name}`}
                    onClick={() => setMemberAction({ key: m.key, name: m.name, kind: "delete" })}
                  >
                    <Trash2 />
                  </Button>
                </>
              )}
            </li>
          ))}
        </ul>
        <p className="mt-3 text-xs text-muted-foreground">
          El PIN es la llave de cada persona. Una cuenta puede desvincularse sin borrar el historial
          del hogar. Las personas con tareas o finanzas se conservan para mantener tus datos.
        </p>
      </section>
      <AlertDialog
        open={!!memberAction}
        onOpenChange={(open) => {
          if (!open && !busy) setMemberAction(null);
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {memberAction?.kind === "unlink" ? "Desvincular cuenta" : "Quitar persona"}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {memberAction?.kind === "unlink"
                ? `La cuenta de ${memberAction.name} perderá el acceso al hogar. Su historial se conserva.`
                : `¿Quitar a ${memberAction?.name ?? "esta persona"}? Solo se puede borrar si no tiene cuenta vinculada ni historial.`}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={busy}>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              disabled={busy}
              onClick={(event) => {
                event.preventDefault();
                void performMemberAction();
              }}
            >
              {busy ? "Guardando…" : "Confirmar"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
