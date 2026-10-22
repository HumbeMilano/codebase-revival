import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";

export const Route = createFileRoute("/reset-password")({
  head: () => ({
    meta: [
      { title: "Recuperar contraseña — HomeHub" },
      {
        name: "description",
        content: "Establece una nueva contraseña para tu cuenta personal de HomeHub.",
      },
      { property: "og:title", content: "Recuperar contraseña — HomeHub" },
      { property: "og:description", content: "Recupera el acceso seguro a tu hogar en HomeHub." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: ResetPassword,
});
function ResetPassword() {
  const [ready, setReady] = useState(false);
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState("");
  useEffect(() => {
    const recovery = new URLSearchParams(window.location.hash.slice(1)).get("type") === "recovery";
    const { data } = supabase.auth.onAuthStateChange((event) => {
      if (event === "PASSWORD_RECOVERY") setReady(true);
    });
    void supabase.auth.getUser().then(({ data: { user } }) => {
      if (recovery && user) setReady(true);
    });
    return () => data.subscription.unsubscribe();
  }, []);
  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!ready || busy) return;
    if (password !== confirm) {
      setError("Las contraseñas no coinciden");
      return;
    }
    setBusy(true);
    setError("");
    const { error } = await supabase.auth.updateUser({ password });
    setBusy(false);
    if (error)
      setError("No se pudo actualizar la contraseña. Solicita otro enlace si ha caducado.");
    else setDone(true);
  };
  return (
    <main className="grid min-h-screen place-items-center bg-background px-5">
      <section className="w-full max-w-sm space-y-5">
        <h1 className="font-display text-3xl font-bold">Nueva contraseña</h1>
        {done ? (
          <>
            <p>Contraseña actualizada.</p>
            <Link to="/" className="text-sm underline">
              Volver a HomeHub
            </Link>
          </>
        ) : ready ? (
          <form onSubmit={submit} className="space-y-4">
            <label className="block text-sm font-semibold">
              Contraseña
              <input
                type="password"
                required
                minLength={6}
                maxLength={128}
                autoComplete="new-password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="mt-1 w-full rounded-xl border bg-card px-3 py-3"
              />
            </label>
            <label className="block text-sm font-semibold">
              Repetir contraseña
              <input
                type="password"
                required
                autoComplete="new-password"
                value={confirm}
                onChange={(e) => setConfirm(e.target.value)}
                className="mt-1 w-full rounded-xl border bg-card px-3 py-3"
              />
            </label>
            {error && (
              <p role="alert" className="text-sm text-destructive">
                {error}
              </p>
            )}
            <Button disabled={busy} type="submit" className="w-full">
              Guardar contraseña
            </Button>
          </form>
        ) : (
          <>
            <p className="text-muted-foreground">
              Abre el enlace de recuperación que recibiste por correo.
            </p>
            <Link to="/" className="text-sm underline">
              Volver al acceso
            </Link>
          </>
        )}
      </section>
    </main>
  );
}
