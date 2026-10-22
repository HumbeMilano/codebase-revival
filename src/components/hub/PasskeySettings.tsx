import { useCallback, useEffect, useState } from "react";
import { Fingerprint, Trash2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { supportsPasskeys, passkeyError } from "@/lib/passkeys";
import { Button } from "@/components/ui/button";

type Passkey = { id: string; friendly_name?: string; created_at: string };
export function PasskeySettings() {
  const [keys, setKeys] = useState<Passkey[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const load = useCallback(async () => {
    try {
      const result = await supabase.auth.passkey.list();
      if (result.error) throw result.error;
      setKeys(result.data ?? []);
    } catch (reason) {
      setError(passkeyError(reason));
    }
  }, []);
  useEffect(() => {
    void load();
  }, [load]);
  const add = async () => {
    if (busy) return;
    setBusy(true);
    setError("");
    try {
      const result = await supabase.auth.registerPasskey();
      if (result.error) throw result.error;
      await load();
    } catch (reason) {
      setError(passkeyError(reason));
    } finally {
      setBusy(false);
    }
  };
  const remove = async (id: string) => {
    if (busy) return;
    setBusy(true);
    setError("");
    try {
      const result = await supabase.auth.passkey.delete({ passkeyId: id });
      if (result.error) throw result.error;
      await load();
    } catch (reason) {
      setError(passkeyError(reason));
    } finally {
      setBusy(false);
    }
  };
  return (
    <section className="space-y-3 rounded-3xl bg-card p-5 shadow-card">
      <h2 className="flex items-center gap-2 font-display text-xl font-bold">
        <Fingerprint /> Passkeys
      </h2>
      <p className="text-sm text-muted-foreground">
        Añade una passkey en tu móvil. Después, en la tablet, elige «Vincular con passkey» y «Usar
        otro dispositivo». El sistema mostrará el QR y comprobará la cercanía por Bluetooth cuando
        use ese método.
      </p>
      {error && (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      )}
      <Button
        type="button"
        disabled={busy || !supportsPasskeys()}
        onClick={() => void add()}
        className="rounded-xl"
      >
        Añadir passkey
      </Button>
      {!supportsPasskeys() && (
        <p className="text-sm">Este navegador necesita una actualización para usar passkeys.</p>
      )}
      <ul className="divide-y divide-border">
        {keys.map((key) => (
          <li key={key.id} className="flex items-center justify-between gap-3 py-3">
            <span className="text-sm">
              {key.friendly_name || "Passkey"} · {new Date(key.created_at).toLocaleDateString("es")}
            </span>
            <Button
              type="button"
              variant="ghost"
              size="icon"
              disabled={busy}
              aria-label={`Eliminar ${key.friendly_name || "passkey"}`}
              onClick={() => void remove(key.id)}
            >
              <Trash2 />
            </Button>
          </li>
        ))}
      </ul>
    </section>
  );
}
