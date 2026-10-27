import { useEffect, useRef, useState } from "react";
import { z } from "zod";
import { supabase } from "@/integrations/supabase/client";
import { createAdminClient } from "@/lib/admin-client";
import { Button } from "@/components/ui/button";
const schema = z.array(
  z.object({
    id: z.string(),
    kind: z.string(),
    status: z.string(),
    resolution: z.string(),
    created_at: z.string(),
  }),
);
const kinds: Record<string, string> = {
  access: "Acceso y copia",
  correction: "Corrección",
  deletion: "Eliminación de cuenta",
};
const statuses: Record<string, string> = {
  received: "Recibida",
  reviewing: "En revisión",
  completed: "Completada",
  declined: "No procede",
};
export function PrivacyRequests() {
  const [open, setOpen] = useState(false);
  const [kind, setKind] = useState("access");
  const [detail, setDetail] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [rows, setRows] = useState<z.infer<typeof schema>>([]);
  const sequence = useRef(0);
  useEffect(() => {
    let active = true;
    const invalidateRequests = () => {
      sequence.current++;
    };
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((event) => {
      if (active && (event === "SIGNED_OUT" || event === "SIGNED_IN")) {
        invalidateRequests();
        setBusy(false);
        setRows([]);
        setOpen(false);
        setError("");
      }
    });
    return () => {
      active = false;
      invalidateRequests();
      subscription.unsubscribe();
    };
  }, []);
  const operation = async (send = false) => {
    if (busy) return;
    const request = ++sequence.current;
    setBusy(true);
    setError("");
    try {
      const user = await supabase.auth.getUser();
      const session = await supabase.auth.getSession();
      if (!user.data.user || user.error || !session.data.session)
        throw new Error("Vuelve a iniciar sesión.");
      const userId = user.data.user.id;
      const client = createAdminClient(
        session.data.session.access_token,
        () => request === sequence.current,
      );
      if (send) {
        const created = await client.rpc("create_privacy_request", {
          _kind: kind,
          _detail: detail,
        });
        if (created.error) throw new Error("No se pudo enviar la solicitud.");
        if (request !== sequence.current) return;
        setDetail("");
      }
      const result = await client.rpc("my_privacy_requests");
      if (result.error) throw result.error;
      const current = await supabase.auth.getSession();
      if (current.data.session?.user.id !== userId) return;
      if (request !== sequence.current) return;
      setRows(schema.parse(result.data));
      setOpen(true);
    } catch (reason) {
      if (request === sequence.current)
        setError(reason instanceof Error ? reason.message : "No se pudo cargar.");
    } finally {
      if (request === sequence.current) setBusy(false);
    }
  };
  return (
    <section className="space-y-3 rounded-2xl border p-4">
      <h2 className="font-display text-lg font-bold">Privacidad de mi cuenta</h2>
      {!open && (
        <Button disabled={busy} variant="outline" onClick={() => void operation()}>
          Gestionar mis datos
        </Button>
      )}
      {error && (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      )}
      {open && (
        <>
          <p className="text-sm text-muted-foreground">
            Envía una solicitud al administrador del servicio. Salir del hogar no elimina tu cuenta.
          </p>
          <form
            className="space-y-3"
            onSubmit={(e) => {
              e.preventDefault();
              void operation(true);
            }}
          >
            <label className="block text-sm font-semibold">
              Solicitud
              <select
                value={kind}
                onChange={(e) => setKind(e.target.value)}
                className="mt-1 w-full rounded-xl border bg-background p-3"
              >
                {Object.entries(kinds).map(([value, label]) => (
                  <option key={value} value={value}>
                    {label}
                  </option>
                ))}
              </select>
            </label>
            <label className="block text-sm font-semibold">
              Detalles
              <textarea
                value={detail}
                onChange={(e) => setDetail(e.target.value)}
                maxLength={2000}
                className="mt-1 min-h-24 w-full rounded-xl border bg-background p-3"
              />
            </label>
            <Button disabled={busy}>Enviar solicitud</Button>
          </form>
          {rows.map((row) => (
            <div key={row.id} className="rounded-xl bg-background p-3 text-sm">
              <p className="font-semibold">
                {kinds[row.kind]} · {statuses[row.status]}
              </p>
              {row.resolution && <p className="mt-1 whitespace-pre-wrap">{row.resolution}</p>}
            </div>
          ))}
        </>
      )}
    </section>
  );
}
