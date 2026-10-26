import { useCallback, useEffect, useRef, useState } from "react";
import { Link } from "@tanstack/react-router";
import { ArrowLeft, CreditCard, RefreshCw, ShieldCheck } from "lucide-react";
import { z } from "zod";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { createAdminClient, requestSubscriptionApi } from "@/lib/admin-client";
const limitsSchema = z.object({
  members: z.number(),
  lists: z.number(),
  devices: z.number(),
  photos: z.number(),
  widgets: z.number(),
});
const schema = z.object({
  plan: z.enum(["free", "pro"]),
  limits: limitsSchema,
  usage: z.record(z.string(), z.number()),
  commercial_launch: z.literal(false),
  limits_enabled: z.boolean(),
  can_test: z.boolean(),
  can_manage_subscription: z.boolean().nullable(),
  refreshing: z.boolean(),
  mode: z.literal("sandbox"),
  sandbox: z
    .object({
      status: z.string(),
      interval: z.string(),
      amount: z.number(),
      currency: z.string(),
      cancel_at_period_end: z.boolean(),
      period_end: z.number(),
      simulated_plan: z.string(),
      revision: z.number(),
    })
    .nullable(),
  pending_checkout: z
    .object({ request_id: z.string(), interval: z.enum(["month", "year"]) })
    .nullable(),
  catalog: z.object({
    plans: z.array(
      z.object({
        id: z.enum(["free", "pro"]),
        name: z.string(),
        amount_cents: z.number().nullable(),
        annual_amount_cents: z.number().nullable(),
        currency: z.string().nullable(),
        limits: limitsSchema,
      }),
    ),
  }),
});
const labels = {
  members: "Miembros",
  lists: "Listas activas",
  devices: "Tablets vinculadas",
  photos: "Fotos de bloqueo",
  widgets: "Widgets por inicio",
};
const states: Record<string, string> = {
  active: "Activa",
  trialing: "En prueba",
  past_due: "Pago pendiente",
  canceled: "Cancelada",
  unpaid: "Impagada",
  incomplete: "Pendiente de completar",
  incomplete_expired: "Prueba caducada",
  paused: "Pausada",
};
const money = (amount: number, currency: string) =>
  new Intl.NumberFormat("es", { style: "currency", currency }).format(amount / 100);
export function SubscriptionPage() {
  const [data, setData] = useState<z.infer<typeof schema> | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(true);
  const [signedOut, setSignedOut] = useState(false);
  const [ack, setAck] = useState(false);
  const actor = useRef<{ active: boolean; client: ReturnType<typeof createAdminClient> } | null>(
    null,
  );
  const sequence = useRef(0);
  const attempt = useRef<{ id: string; interval: "month" | "year" } | null>(null);
  const load = useCallback(async () => {
    const request = ++sequence.current;
    const current = () => request === sequence.current;
    setLoading(true);
    setError("");
    setData(null);
    if (actor.current) actor.current.active = false;
    actor.current = null;
    attempt.current = null;
    setAck(false);
    try {
      const user = await supabase.auth.getUser();
      if (!current()) return;
      if (!user.data.user) {
        setSignedOut(true);
        return;
      }
      setSignedOut(false);
      if (user.error) throw user.error;
      const session = await supabase.auth.getSession();
      if (!current()) return;
      if (!session.data.session) throw new Error("Vuelve a iniciar sesión.");
      const operation = {
        active: true,
        client: null as unknown as ReturnType<typeof createAdminClient>,
      };
      operation.client = createAdminClient(
        session.data.session.access_token,
        () => operation.active && current(),
      );
      actor.current = operation;
      const result = schema.parse(await requestSubscriptionApi(operation.client, "status"));
      if (!current()) return;
      setData(result);
      attempt.current = result.pending_checkout
        ? { id: result.pending_checkout.request_id, interval: result.pending_checkout.interval }
        : null;
    } catch (reason) {
      if (current())
        setError(reason instanceof Error ? reason.message : "No se pudo cargar el plan.");
    } finally {
      if (current()) setLoading(false);
    }
  }, []);
  useEffect(() => {
    void load();
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((event) => {
      if (event === "SIGNED_OUT" || event === "SIGNED_IN" || event === "TOKEN_REFRESHED")
        void load();
    });
    return () => {
      sequence.current++;
      if (actor.current) actor.current.active = false;
      subscription.unsubscribe();
    };
  }, [load]);
  const refresh = async () => {
    const operation = actor.current;
    if (!operation?.active || busy) return;
    setBusy(true);
    setError("");
    try {
      const result = schema.parse(await requestSubscriptionApi(operation.client, "status"));
      if (operation.active) {
        setData(result);
        attempt.current = result.pending_checkout
          ? { id: result.pending_checkout.request_id, interval: result.pending_checkout.interval }
          : null;
      }
    } catch (reason) {
      if (operation.active)
        setError(reason instanceof Error ? reason.message : "No se pudo actualizar.");
    } finally {
      if (operation.active) setBusy(false);
    }
  };
  const open = async (interval?: "month" | "year") => {
    const operation = actor.current;
    if (!operation?.active || busy || !ack) return;
    setBusy(true);
    setError("");
    try {
      if (interval) {
        if (attempt.current && attempt.current.interval !== interval)
          throw new Error(
            "Ya hay un checkout pendiente para otra periodicidad. Complétalo o espera a que caduque.",
          );
        attempt.current ??= { id: crypto.randomUUID(), interval };
      }
      const result = z
        .object({ url: z.string().url(), mode: z.literal("sandbox") })
        .parse(
          await requestSubscriptionApi(
            operation.client,
            interval ? "checkout" : "portal",
            interval
              ? { interval, request_id: attempt.current!.id, acknowledge_sandbox: true }
              : { acknowledge_sandbox: true },
          ),
        );
      if (!operation.active) return;
      const url = new URL(result.url);
      if (url.origin !== (interval ? "https://checkout.stripe.com" : "https://billing.stripe.com"))
        throw new Error("La dirección de Stripe no es válida.");
      window.location.assign(url.href);
    } catch (reason) {
      if (operation.active)
        setError(reason instanceof Error ? reason.message : "No se pudo abrir Stripe.");
    } finally {
      if (operation.active) setBusy(false);
    }
  };
  return (
    <main className="mx-auto min-h-dvh max-w-4xl space-y-6 px-5 py-8">
      <Link to="/" className="inline-flex items-center gap-2 text-sm">
        <ArrowLeft className="size-4" />
        Volver al hogar
      </Link>
      <header>
        <h1 className="font-display text-3xl font-bold">Mi plan · Skendal</h1>
        <p className="mt-2 text-muted-foreground">Una suscripción por hogar.</p>
      </header>
      <div className="rounded-3xl bg-lilac p-5">
        <ShieldCheck className="mb-2 size-6" />
        <h2 className="font-bold">En preparación</h2>
        <p className="mt-2 text-sm">
          La empresa todavía no está constituida. Los precios y límites son una propuesta; los
          cobros reales y los límites están desactivados durante esta etapa.
        </p>
      </div>
      {loading && <p role="status">Cargando plan…</p>}
      {signedOut && (
        <div className="rounded-2xl bg-card p-5">
          <p>Inicia sesión con tu cuenta personal para consultar el plan del hogar.</p>
          <Link to="/" className="mt-3 inline-block underline">
            Iniciar sesión
          </Link>
        </div>
      )}
      {error && (
        <p role="alert" className="rounded-2xl border border-destructive/30 p-4 text-destructive">
          {error}
        </p>
      )}
      {!loading && !signedOut && (
        <Button variant="outline" disabled={busy} onClick={() => void (data ? refresh() : load())}>
          <RefreshCw className="size-4" />
          Actualizar estado
        </Button>
      )}
      {data && (
        <>
          <p className="text-sm">
            Plan del hogar: <strong>{data.plan === "pro" ? "Pro" : "Free"}</strong>
          </p>
          <div className="grid gap-4 sm:grid-cols-2">
            {data.catalog.plans.map((plan) => (
              <article
                key={plan.id}
                className={`rounded-3xl p-6 ${plan.id === "pro" ? "bg-lilac" : "bg-card"}`}
              >
                <h2 className="font-display text-xl font-bold">{plan.name}</h2>
                <p className="my-3 font-semibold">
                  {plan.id === "free"
                    ? "$0"
                    : plan.amount_cents && plan.currency
                      ? `${money(plan.amount_cents, plan.currency)} / mes`
                      : "Precio por definir"}
                </p>
                {plan.id === "pro" && plan.annual_amount_cents && plan.currency && (
                  <p className="mb-4 text-sm">
                    o {money(plan.annual_amount_cents, plan.currency)} / año
                  </p>
                )}
                <ul className="space-y-2 text-sm">
                  {Object.entries(plan.limits).map(([key, value]) => (
                    <li key={key}>
                      <strong>
                        {key === "widgets" && plan.id === "pro" ? "Catálogo completo" : value}
                      </strong>{" "}
                      {key === "widgets" && plan.id === "pro"
                        ? "de widgets"
                        : labels[key as keyof typeof labels]}
                    </li>
                  ))}
                </ul>
                <p className="mt-4 text-sm">
                  Tareas, compras sin conexión, calendario, notas y finanzas.
                </p>
              </article>
            ))}
          </div>
          {data.can_test && (
            <section className="space-y-4 rounded-3xl border-2 border-dashed border-primary/30 p-6">
              <h2 className="flex items-center gap-2 font-display text-xl font-bold">
                <CreditCard className="size-5" />
                Stripe sandbox
              </h2>
              <p className="text-sm">
                Prueba interna: usa únicamente tarjetas de prueba de Stripe. No se mueve dinero y el
                plan real del hogar no cambia.
              </p>
              {data.refreshing && (
                <p role="status" className="text-sm">
                  Stripe está actualizando el estado. Vuelve a actualizar en unos segundos.
                </p>
              )}
              {data.sandbox && (
                <div className="rounded-xl bg-card p-4">
                  <p className="font-semibold">
                    {states[data.sandbox.status] ?? data.sandbox.status} ·{" "}
                    {money(data.sandbox.amount, data.sandbox.currency)} /{" "}
                    {data.sandbox.interval === "year" ? "año" : "mes"}
                  </p>
                  <p className="mt-1 text-sm">
                    Plan simulado: {data.sandbox.simulated_plan}.{" "}
                    {data.sandbox.cancel_at_period_end
                      ? "Cancelación programada para"
                      : "Fin del período:"}{" "}
                    {new Date(data.sandbox.period_end * 1000).toLocaleDateString("es")}
                  </p>
                </div>
              )}
              <label className="flex items-start gap-3 text-sm">
                <input
                  type="checkbox"
                  checked={ack}
                  onChange={(e) => setAck(e.target.checked)}
                  className="mt-1"
                />
                Entiendo que es una prueba sin cargos reales.
              </label>
              <div className="flex flex-wrap gap-3">
                {(!data.sandbox ||
                  ["canceled", "incomplete_expired"].includes(data.sandbox.status)) && (
                  <>
                    <Button
                      disabled={
                        busy || !ack || (!!attempt.current && attempt.current.interval !== "month")
                      }
                      onClick={() => void open("month")}
                    >
                      Probar mensual
                    </Button>
                    <Button
                      variant="outline"
                      disabled={
                        busy || !ack || (!!attempt.current && attempt.current.interval !== "year")
                      }
                      onClick={() => void open("year")}
                    >
                      Probar anual
                    </Button>
                  </>
                )}
                {data.can_manage_subscription && (
                  <Button disabled={busy || !ack} variant="outline" onClick={() => void open()}>
                    Gestionar en Stripe
                  </Button>
                )}
              </div>
            </section>
          )}
        </>
      )}
    </main>
  );
}
