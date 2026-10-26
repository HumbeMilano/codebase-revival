import { Link } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { CreditCard, RefreshCw } from "lucide-react";
import { z } from "zod";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";
import { requestAdminApi } from "@/lib/admin-client";
import { Button } from "@/components/ui/button";
const schema = z.object({
  configured: z.boolean(),
  account_id: z.string().nullable(),
  webhook_id: z.string().nullable(),
  mode: z.literal("sandbox"),
  automatic_billing: z.literal(false),
  events: z.array(
    z.object({
      event_id: z.string(),
      event_type: z.string(),
      object_id: z.string(),
      received_at: z.string(),
      summary: z.record(z.string(), z.unknown()),
    }),
  ),
});
const runtimeSchema = z.object({
  provider: z.literal("stripe"),
  mode: z.literal("sandbox"),
  key_configured: z.boolean(),
  gateway_configured: z.boolean(),
  live_payments: z.literal(false),
});
const labels: Record<string, string> = {
  "checkout.session.completed": "Checkout de prueba completado",
  "checkout.session.expired": "Checkout de prueba caducado",
  "customer.subscription.created": "Suscripción de prueba creada",
  "customer.subscription.updated": "Suscripción de prueba actualizada",
  "customer.subscription.deleted": "Suscripción de prueba cancelada",
  "invoice.paid": "Pago de prueba confirmado",
  "invoice.payment_failed": "Pago de prueba fallido",
};
export function StripeSandbox({ client }: { client: SupabaseClient<Database> }) {
  const [data, setData] = useState<z.infer<typeof schema> | null>(null);
  const [runtime, setRuntime] = useState<z.infer<typeof runtimeSchema> | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [refresh, setRefresh] = useState(0);
  const binding = useRef({ active: true });
  const attempt = useRef<{ interval: "month" | "year"; id: string } | null>(null);
  useEffect(() => {
    const operation = { active: true };
    binding.current = operation;
    setBusy(false);
    void Promise.all([client.rpc("admin_stripe_sandbox_status"), requestAdminApi(client, "status")])
      .then(([result, configuration]) => {
        if (!operation.active) return;
        if (result.error) throw result.error;
        setData(schema.parse(result.data));
        setRuntime(runtimeSchema.parse(configuration));
        setError("");
      })
      .catch(() => {
        if (operation.active) setError("No se pudo comprobar la conexión con Stripe.");
      });
    return () => {
      operation.active = false;
    };
  }, [client, refresh]);
  const connected = data?.configured && runtime?.key_configured && runtime.gateway_configured;
  return (
    <section className="rounded-3xl border bg-card p-5 sm:p-6" aria-label="Stripe sandbox">
      <header className="flex flex-wrap items-center gap-3">
        <span className="grid size-11 place-items-center rounded-2xl bg-lilac">
          <CreditCard className="size-5" />
        </span>
        <div className="min-w-0 flex-1">
          <h3 className="font-display text-lg font-bold">Stripe · Sandbox</h3>
          <p className="text-xs text-muted-foreground">
            {connected
              ? "Conectado para pruebas. Sin cargos reales."
              : "Preparando la conexión de pruebas."}
          </p>
        </div>
        <Button
          variant="ghost"
          size="icon"
          aria-label="Actualizar Stripe"
          disabled={busy}
          onClick={() => setRefresh((value) => value + 1)}
        >
          <RefreshCw className="size-4" />
        </Button>
      </header>
      {connected && (
        <Link
          to="/subscription"
          className="mt-4 inline-block rounded-xl border px-4 py-3 text-sm font-semibold"
        >
          Abrir prueba de suscripción del hogar
        </Link>
      )}
      {error && (
        <p role="alert" className="mt-4 text-sm text-destructive">
          {error}
        </p>
      )}
      {!!data?.events.length && (
        <ol className="mt-5 divide-y">
          {data.events.map((event) => (
            <li key={event.event_id} className="py-3">
              <p className="text-sm font-semibold">
                {labels[event.event_type] ?? event.event_type}
              </p>
              <p className="mt-1 break-all text-xs text-muted-foreground">
                {new Date(event.received_at).toLocaleString("es")} · {event.object_id}
              </p>
            </li>
          ))}
        </ol>
      )}
      {connected && !data?.events.length && (
        <p className="mt-4 text-xs text-muted-foreground">
          Los eventos de las pruebas aparecerán aquí.
        </p>
      )}
    </section>
  );
}
