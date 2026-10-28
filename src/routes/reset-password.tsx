import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import type { Session } from "@supabase/supabase-js";
import { Eye, EyeOff, Mail, CheckCircle2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  createRecoveryClient,
  passwordRecoveryArrival,
  supabase,
} from "@/integrations/supabase/client";
import { credentials } from "@/lib/account-validation";
import { sessionIdentity } from "@/lib/session-identity";
import {
  canResumePasswordRecovery,
  forgetPasswordRecovery,
  recoveryArrival,
  passwordRecoveryError,
  rememberPasswordRecovery,
} from "@/lib/password-recovery";

export const Route = createFileRoute("/reset-password")({
  head: () => ({
    meta: [
      { title: "Recuperar contraseña — Skendal" },
      { name: "description", content: "Recupera el acceso a tu cuenta de Skendal." },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: ResetPassword,
});
const field =
  "mt-2 w-full rounded-xl border bg-card px-3 py-3 text-base outline-none focus:ring-2 focus:ring-ring";
const expired = "El enlace ya no es válido o ya se utilizó. Solicita uno nuevo aquí.";

function clearArrival() {
  passwordRecoveryArrival.recovery = false;
  passwordRecoveryArrival.token = null;
  passwordRecoveryArrival.error = false;
  window.history.replaceState(window.history.state, "", window.location.pathname);
}
const sameSession = (a: Session, b: Session) =>
  sessionIdentity(a.user.id, a.access_token) === sessionIdentity(b.user.id, b.access_token);

function ResetPassword() {
  const [mode, setMode] = useState<"loading" | "request" | "sent" | "password" | "done">("loading");
  const [email, setEmail] = useState("");
  const [accountEmail, setAccountEmail] = useState("");
  const passwordForm = useRef<HTMLFormElement>(null);
  const [visible, setVisible] = useState(false);
  const [busy, setBusy] = useState(false);
  const [cooldown, setCooldown] = useState(0);
  const [error, setError] = useState("");
  const arrival = useRef({ ...passwordRecoveryArrival });
  const verified = useRef<Session | null>(null);
  const active = useRef(true);
  const checks = useRef({ value: 0 });
  const working = useRef(false);

  useEffect(() => {
    if (!cooldown) return;
    const timer = window.setTimeout(() => setCooldown((value) => Math.max(0, value - 1)), 1000);
    return () => window.clearTimeout(timer);
  }, [cooldown]);

  useEffect(() => {
    active.current = true;
    const counter = checks.current;
    const newLink = () => {
      const incoming = recoveryArrival(new URL(window.location.href));
      // A second link to this same pathname is a same-document navigation.
      // Restart Auth's supported callback handling once with the new fragment.
      if (incoming.recovery || incoming.error) window.location.reload();
    };
    window.addEventListener("hashchange", newLink);
    const verify = async (fromLink: boolean, token: string | null) => {
      const check = ++counter.value;
      const current = () => active.current && check === counter.value;
      try {
        const result = await supabase.auth.getSession();
        if (!current()) return;
        if (result.error) throw result.error;
        const session = result.data.session;
        if (!session || (fromLink && token && session.access_token !== token)) {
          if (fromLink) setError(expired);
          forgetPasswordRecovery();
          setMode("request");
          clearArrival();
          return;
        }
        if (!fromLink && !canResumePasswordRecovery(session)) {
          forgetPasswordRecovery();
          setMode("request");
          return;
        }
        const user = await supabase.auth.getUser();
        if (!current()) return;
        if (user.error) throw user.error;
        if (!user.data.user || user.data.user.id !== session.user.id)
          throw new Error("Invalid session");
        const latest = await supabase.auth.getSession();
        if (!current()) return;
        if (latest.error || !latest.data.session || !sameSession(session, latest.data.session))
          throw new Error("Invalid session");
        if (verified.current && !sameSession(verified.current, latest.data.session))
          passwordForm.current?.reset();
        verified.current = latest.data.session;
        setAccountEmail(user.data.user.email ?? "");
        if (fromLink) rememberPasswordRecovery(latest.data.session);
        setError("");
        setMode("password");
        clearArrival();
      } catch (reason) {
        if (!current()) return;
        forgetPasswordRecovery();
        verified.current = null;
        setError(passwordRecoveryError(reason));
        setMode("request");
        clearArrival();
      }
    };
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((event, session) => {
      // Defer SDK calls until Auth releases its session lock.
      if (event === "PASSWORD_RECOVERY" && !arrival.current.error) {
        window.setTimeout(() => {
          if (active.current) void verify(true, null);
        }, 0);
      } else if (
        event === "SIGNED_OUT" ||
        (event === "SIGNED_IN" &&
          verified.current &&
          session &&
          !sameSession(verified.current, session))
      ) {
        counter.value++;
        if (verified.current) {
          setError("La sesión cambió. Solicita un nuevo enlace para recuperar tu contraseña.");
          setMode("request");
        }
        verified.current = null;
        passwordForm.current?.reset();
        forgetPasswordRecovery();
      }
    });
    if (arrival.current.error || (arrival.current.recovery && !arrival.current.token)) {
      forgetPasswordRecovery();
      setError(expired);
      setMode("request");
      void supabase.auth
        .getSession()
        .then(() => {
          if (active.current) clearArrival();
        })
        .catch(() => {});
    } else void verify(arrival.current.recovery, arrival.current.token);
    return () => {
      active.current = false;
      counter.value++;
      window.removeEventListener("hashchange", newLink);
      subscription.unsubscribe();
    };
  }, []);

  const request = async (address = email) => {
    if (working.current || cooldown) return;
    const parsed = credentials.shape.email.safeParse(address);
    if (!parsed.success) {
      setError("Escribe un correo válido.");
      return;
    }
    working.current = true;
    setBusy(true);
    setError("");
    try {
      const result = await supabase.auth.resetPasswordForEmail(parsed.data, {
        redirectTo: `${window.location.origin}/reset-password`,
      });
      if (!active.current) return;
      if (result.error) throw result.error;
      setEmail(parsed.data);
      setMode("sent");
      setCooldown(60);
    } catch (reason) {
      if (active.current) setError(passwordRecoveryError(reason));
    } finally {
      working.current = false;
      if (active.current) setBusy(false);
    }
  };
  const save = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const bound = verified.current;
    if (working.current || !bound) return;
    // Read native values at submission. A password provider need not dispatch
    // React's change event, and rerenders must never overwrite its generated value.
    const values = new FormData(event.currentTarget);
    const parsed = credentials.shape.password.safeParse(values.get("new-password"));
    if (!parsed.success) {
      setError("Usa al menos 6 caracteres y un máximo de 128.");
      return;
    }
    if (parsed.data !== values.get("confirm-password")) {
      setError("Las contraseñas no coinciden.");
      return;
    }
    working.current = true;
    setBusy(true);
    setError("");
    try {
      const current = await supabase.auth.getSession();
      if (current.error) throw current.error;
      if (
        !current.data.session ||
        !sameSession(bound, current.data.session) ||
        verified.current !== bound
      )
        throw new Error("Invalid session");
      // A login in another tab must not redirect this write to another account.
      const client = createRecoveryClient();
      const authorized = await client.auth.setSession({
        access_token: current.data.session.access_token,
        refresh_token: current.data.session.refresh_token,
      });
      if (authorized.error) throw authorized.error;
      if (!active.current || verified.current !== bound) return;
      if (authorized.data.user?.id !== bound.user.id) throw new Error("Invalid session");
      const result = await client.auth.updateUser({ password: parsed.data });
      if (!active.current) return;
      if (result.error) throw result.error;
      forgetPasswordRecovery();
      verified.current = null;
      passwordForm.current?.reset();
      setMode("done");
    } catch (reason) {
      if (active.current) setError(passwordRecoveryError(reason));
    } finally {
      working.current = false;
      if (active.current) setBusy(false);
    }
  };
  const leaveRecovery = async (requestAnother: boolean) => {
    if (working.current) return;
    working.current = true;
    setBusy(true);
    setError("");
    const bound = verified.current;
    try {
      if (bound) {
        const { data, error: sessionError } = await supabase.auth.getSession();
        if (sessionError) throw sessionError;
        if (!data.session || !sameSession(bound, data.session)) throw new Error("Invalid session");
        // Leaving an unfinished recovery must not leave its temporary login at
        // the household entry point. This only signs out this browser session.
        const { error: signOutError } = await supabase.auth.signOut({ scope: "local" });
        if (signOutError) throw signOutError;
      }
      if (!active.current) return;
      checks.current.value++;
      verified.current = null;
      forgetPasswordRecovery();
      clearArrival();
      passwordForm.current?.reset();
      setAccountEmail("");
      setError("");
      if (requestAnother) setMode("request");
      else window.location.assign("/");
    } catch (reason) {
      if (active.current) setError(passwordRecoveryError(reason));
    } finally {
      working.current = false;
      if (active.current) setBusy(false);
    }
  };

  return (
    <main className="grid min-h-dvh place-items-center bg-background px-5 py-8">
      <section className="w-full max-w-sm space-y-6">
        <span className="font-display text-xl font-extrabold tracking-tight">Skendal</span>
        <h1 className="font-display text-3xl font-bold">
          {mode === "password"
            ? "Nueva contraseña"
            : mode === "done"
              ? "Contraseña actualizada"
              : "Recuperar contraseña"}
        </h1>
        {error && (
          <p role="alert" className="rounded-xl bg-destructive/10 p-3 text-sm text-destructive">
            {error}
          </p>
        )}
        {mode === "loading" ? (
          <p role="status" className="text-muted-foreground">
            Comprobando enlace…
          </p>
        ) : mode === "done" ? (
          <>
            <CheckCircle2 className="size-10 text-primary" />
            <p>Tu nueva contraseña ya está guardada.</p>
            <Button asChild className="w-full">
              <Link to="/">Continuar a Skendal</Link>
            </Button>
          </>
        ) : mode === "sent" ? (
          <>
            <Mail className="size-10" />
            <h2 className="font-display text-xl font-bold">Revisa tu correo</h2>
            <p className="text-sm text-muted-foreground">
              Si hay una cuenta con {email}, recibirás un enlace para elegir una contraseña nueva.
              Revisa también la carpeta de spam.
            </p>
            <Button
              className="w-full"
              variant="outline"
              disabled={busy || cooldown > 0}
              onClick={() => void request()}
            >
              {cooldown ? `Reenviar en ${cooldown} s` : "Reenviar enlace"}
            </Button>
            <button
              type="button"
              className="w-full py-2 text-sm underline"
              disabled={busy}
              onClick={() => {
                setError("");
                setMode("request");
              }}
            >
              Cambiar correo
            </button>
          </>
        ) : mode === "password" ? (
          <form
            ref={passwordForm}
            id="reset-password-form"
            method="post"
            onSubmit={save}
            className="space-y-4"
          >
            <label className="block text-sm font-semibold">
              Correo de la cuenta
              <input
                id="recovery-email"
                name="username"
                type="email"
                autoComplete="username"
                readOnly
                value={accountEmail}
                className={field}
              />
            </label>
            <label className="block text-sm font-semibold">
              Nueva contraseña
              <input
                id="new-password"
                name="new-password"
                type={visible ? "text" : "password"}
                autoComplete="new-password"
                required
                minLength={6}
                maxLength={128}
                disabled={busy}
                className={field}
              />
            </label>
            <label className="block text-sm font-semibold">
              Repetir contraseña
              <input
                id="confirm-password"
                name="confirm-password"
                type={visible ? "text" : "password"}
                autoComplete="new-password"
                required
                minLength={6}
                maxLength={128}
                disabled={busy}
                className={field}
              />
            </label>
            <button
              type="button"
              disabled={busy}
              aria-pressed={visible}
              aria-controls="new-password confirm-password"
              className="flex items-center gap-2 py-1 text-sm"
              onClick={() => setVisible((value) => !value)}
            >
              {visible ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
              {visible ? "Ocultar contraseñas" : "Mostrar contraseñas"}
            </button>
            <Button disabled={busy} type="submit" className="h-12 w-full">
              {busy ? "Guardando…" : "Guardar contraseña"}
            </Button>
            <button
              type="button"
              className="w-full py-2 text-sm underline"
              disabled={busy}
              onClick={() => void leaveRecovery(true)}
            >
              Solicitar otro enlace
            </button>
          </form>
        ) : (
          <form
            id="request-password-reset"
            method="post"
            onSubmit={(event) => {
              event.preventDefault();
              const value = new FormData(event.currentTarget).get("email");
              void request(typeof value === "string" ? value : "");
            }}
            className="space-y-4"
          >
            <p className="text-sm text-muted-foreground">
              Escribe el correo de tu cuenta y te enviaremos un enlace para elegir una contraseña
              nueva.
            </p>
            <label className="block text-sm font-semibold">
              Correo
              <input
                type="email"
                id="recovery-request-email"
                name="email"
                autoComplete="email"
                required
                maxLength={255}
                defaultValue={email}
                className={field}
              />
            </label>
            <Button type="submit" disabled={busy || cooldown > 0} className="h-12 w-full">
              {busy ? "Enviando…" : cooldown ? `Enviar en ${cooldown} s` : "Enviar enlace"}
            </Button>
          </form>
        )}
        {mode !== "done" && (
          <button
            type="button"
            disabled={busy || mode === "loading"}
            onClick={() => void leaveRecovery(false)}
            className="block w-full py-2 text-center text-sm underline"
          >
            Volver al acceso
          </button>
        )}
      </section>
    </main>
  );
}
