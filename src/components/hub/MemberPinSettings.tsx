import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { db } from "@/lib/db";
import { PinEditor } from "./PinEditor";

export function MemberPinForm({ accountId, onSaved }: { accountId: string; onSaved: () => void }) {
  const [pin, setPin] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const active = useRef(true);
  useEffect(() => {
    active.current = true;
    return () => {
      active.current = false;
    };
  }, []);
  return (
    <form
      className="space-y-3"
      onSubmit={(event) => {
        event.preventDefault();
        if (busy || pin.length !== 4 || !accountId) return;
        const client = db();
        setBusy(true);
        setError("");
        void (async () => {
          try {
            const { error } = await client.rpc("set_my_pin", { _pin: pin, _account: accountId });
            if (error) throw error;
            if (active.current) {
              setPin("");
              onSaved();
            }
          } catch (reason: unknown) {
            if (!active.current) return;
            const message =
              reason && typeof reason === "object" && "message" in reason
                ? String(reason.message)
                : "";
            setError(
              message.includes("PIN already")
                ? "Ese PIN ya lo usa otra persona del hogar. Elige otro."
                : "No se pudo guardar el PIN. Comprueba la conexión y vuelve a intentarlo.",
            );
          } finally {
            if (active.current) setBusy(false);
          }
        })();
      }}
    >
      <PinEditor label="PIN de tablet" value={pin} onChange={setPin} disabled={busy} />
      {error && (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      )}
      <Button type="submit" disabled={busy || pin.length !== 4} className="w-full">
        {busy ? "Guardando…" : "Guardar PIN"}
      </Button>
    </form>
  );
}

export function MemberPinSettings({ accountId }: { accountId: string }) {
  const [configured, setConfigured] = useState<boolean | null>(null);
  const [editing, setEditing] = useState(false);
  const [error, setError] = useState(false);
  const [retry, setRetry] = useState(0);
  useEffect(() => {
    let active = true;
    setConfigured(null);
    setEditing(false);
    setError(false);
    if (accountId)
      void db()
        .rpc("my_pin_configured")
        .then(({ data, error }) => {
          if (!active) return;
          if (error || typeof data !== "boolean") setError(true);
          else setConfigured(data);
        });
    return () => {
      active = false;
    };
  }, [accountId, retry]);
  return (
    <section className="space-y-3 rounded-2xl border bg-card p-4">
      <h2 className="font-display font-semibold">Acceso a la tablet</h2>
      {error ? (
        <>
          <p role="alert" className="text-sm text-destructive">
            No se pudo consultar tu PIN.
          </p>
          <Button variant="outline" onClick={() => setRetry((value) => value + 1)}>
            Reintentar
          </Button>
        </>
      ) : configured === null ? (
        <p role="status">Comprobando acceso…</p>
      ) : editing ? (
        <MemberPinForm
          accountId={accountId}
          onSaved={() => {
            setConfigured(true);
            setEditing(false);
          }}
        />
      ) : (
        <Button variant="outline" onClick={() => setEditing(true)}>
          {configured ? "Cambiar mi PIN" : "Crear mi PIN"}
        </Button>
      )}
      {editing && (
        <Button variant="ghost" onClick={() => setEditing(false)}>
          Cancelar
        </Button>
      )}
    </section>
  );
}
