import { useEffect, useRef, useState } from "react";
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  Activity,
  ArrowDownToLine,
  FileClock,
  Settings2,
  ShieldCheck,
  SlidersHorizontal,
} from "lucide-react";
import { z } from "zod";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import type { Database } from "@/integrations/supabase/types";

import { LegalConsole } from "./LegalConsole";
import { StripeSandbox } from "./StripeSandbox";

export type BusinessTab = "resumen" | "pagos" | "planes" | "actividad" | "configuracion" | "legal";
const settingsSchema = z.object({
  business_name: z.string().nullable(),
  country: z.string().nullable(),
  currency: z.string().nullable(),
  support_email: z.string().nullable(),
  revision: z.number(),
});
const planSchema = z.object({
  id: z.enum(["free", "pro"]),
  name: z.string(),
  amount_cents: z.number().nullable(),
  annual_amount_cents: z.number().nullable(),
  currency: z.string().nullable(),
  billing_interval: z.enum(["month", "year", "none"]),
  revision: z.number(),
  limits: z
    .object({
      members: z.number().int().min(1).max(50),
      lists: z.number().int().min(1).max(20),
      devices: z.number().int().min(1).max(20),
      photos: z.number().int().min(1).max(30),
      widgets: z.number().int().min(1).max(64),
    })
    .optional(),
});
const paymentSchema = z.object({
  id: z.string(),
  sequence: z.number(),
  household_id: z.string().nullable(),
  household_label: z.string(),
  amount_cents: z.number(),
  currency: z.string(),
  status: z.enum(["pending", "received", "canceled"]),
  source: z.literal("manual"),
  reference: z.string(),
  note: z.string(),
  created_at: z.string(),
  revision: z.number(),
});
const auditSchema = z.object({
  sequence: z.number(),
  actor_email: z.string().nullable(),
  action: z.string(),
  target_id: z.string(),
  created_at: z.string(),
  details: z.record(z.string(), z.unknown()),
});
const overviewSchema = z.object({
  settings: settingsSchema,
  plans: z.array(planSchema),
  payments: z.array(paymentSchema),
  audit: z.array(auditSchema),
  totals: z.array(
    z.object({
      currency: z.string(),
      status: z.string(),
      count: z.number(),
      amount_cents: z.number(),
    }),
  ),
  unconfirmed_accounts: z.number(),
  recent_accounts: z.number(),
  automatic_billing: z.literal(false),
  can_delegate: z.boolean(),
});
type Overview = z.infer<typeof overviewSchema>;
type Payment = z.infer<typeof paymentSchema>;
type Plan = z.infer<typeof planSchema>;
type Form =
  | { kind: "settings"; value: Overview["settings"] }
  | { kind: "plan"; value: Plan; amount: string; annualAmount: string }
  | {
      kind: "new-payment";
      id: string;
      household: string;
      amount: string;
      currency: string;
      reference: string;
      note: string;
    }
  | {
      kind: "payment";
      value: Payment;
      status: "received" | "canceled";
      reference: string;
      confirmed: boolean;
    };
const currencies = [
  "USD",
  "EUR",
  "GBP",
  "CAD",
  "MXN",
  "COP",
  "DOP",
  "ARS",
  "PEN",
  "BRL",
  "AUD",
  "CHF",
];
const labels: Record<string, string> = {
  "business.settings": "Configuración del negocio actualizada",
  "business.plan": "Plan actualizado",
  "payment.created": "Registro de pago creado",
  "payment.received": "Cobro externo registrado",
  "payment.canceled": "Registro de pago cancelado",
  "household.updated": "Acceso o plan del hogar actualizado",
  "devices.revoked": "Tablets desvinculadas",
  "admin.granted": "Acceso de administrador concedido",
  "admin.revoked": "Acceso de administrador retirado",
};
const statusLabel = { pending: "Pendiente", received: "Recibido", canceled: "Cancelado" };
const money = (cents: number, currency: string) =>
  new Intl.NumberFormat("es", {
    style: "currency",
    currency,
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(cents / 100);
const when = (date: string) =>
  new Date(date).toLocaleString("es", { dateStyle: "medium", timeStyle: "short" });
const inputClass = "mt-2 w-full rounded-xl border bg-background px-3 py-3 text-base font-normal";
function amountCents(text: string) {
  const value = text.trim().replace(",", ".");
  if (!/^\d{1,7}(\.\d{1,2})?$/.test(value))
    throw new Error("Introduce un importe con un máximo de dos decimales.");
  const [whole, fraction = ""] = value.split(".");
  const result = Number(whole) * 100 + Number(fraction.padEnd(2, "0"));
  if (result > 100000000) throw new Error("El importe supera el máximo permitido.");
  return result;
}
function exportCsv(rows: Payment[]) {
  const safe = (value: unknown) => {
    const text = String(value ?? "");
    return '"' + (/^[\s]*[=+@-]/.test(text) ? "'" : "") + text.replaceAll('"', '""') + '"';
  };
  const data = [
    ["ID", "Hogar", "Importe", "Moneda", "Estado", "Origen", "Referencia", "Fecha"],
    ...rows.map((row) => [
      row.id,
      row.household_label,
      (row.amount_cents / 100).toFixed(2),
      row.currency,
      statusLabel[row.status],
      "Manual",
      row.reference,
      row.created_at,
    ]),
  ]
    .map((row) => row.map(safe).join(","))
    .join("\r\n");
  const url = URL.createObjectURL(new Blob(["\uFEFF" + data], { type: "text/csv;charset=utf-8" }));
  const link = document.createElement("a");
  link.href = url;
  link.download = "skendal-pagos.csv";
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
export function BusinessConsole({
  client,
  tab,
  refreshKey,
  households,
  onCapabilities,
}: {
  client: SupabaseClient<Database>;
  tab: BusinessTab | "hogares" | "cuentas";
  refreshKey: number;
  households: { id: string; name: string }[];
  onCapabilities: (canDelegate: boolean) => void;
}) {
  const [data, setData] = useState<Overview | null>(null);
  const [error, setError] = useState("");
  const [formError, setFormError] = useState("");
  const [busy, setBusy] = useState(false);
  const [form, setForm] = useState<Form | null>(null);
  const [filter, setFilter] = useState<"all" | Payment["status"]>("all");
  const [query, setQuery] = useState("");
  const [more, setMore] = useState({ payments: true, audit: true });
  const binding = useRef({ active: true, request: 0 });
  const loadRef = useRef<() => Promise<void>>(async () => {});
  useEffect(() => {
    const operation = { active: true, request: 0 };
    binding.current = operation;
    const load = async () => {
      const request = ++operation.request;
      try {
        const result = await client.rpc("admin_business_overview");
        if (!operation.active || request !== operation.request) return;
        if (result.error) throw result.error;
        const next = overviewSchema.parse(result.data);
        setData(next);
        onCapabilities(next.can_delegate);
        setError("");
        setMore({ payments: next.payments.length === 50, audit: next.audit.length === 50 });
      } catch {
        if (operation.active && request === operation.request)
          setError("No se pudieron cargar los datos del negocio.");
      }
    };
    loadRef.current = load;
    void load();
    return () => {
      operation.active = false;
      operation.request++;
    };
  }, [client, refreshKey, onCapabilities]);
  useEffect(() => {
    setForm(null);
    setFormError("");
    setBusy(false);
  }, [client]);
  const open = (next: Form) => {
    setFormError("");
    setForm(next);
  };
  const save = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!form || busy) return;
    const operation = binding.current;
    setBusy(true);
    setFormError("");
    try {
      let result;
      if (form.kind === "settings") {
        const { revision, ...settings } = form.value;
        result = await client.rpc("admin_save_business_settings", {
          _settings: settings,
          _expected_revision: revision,
        });
      } else if (form.kind === "plan") {
        const { revision, ...plan } = form.value;
        const amount = form.amount.trim() ? amountCents(form.amount) : null;
        const annualAmount = form.annualAmount.trim() ? amountCents(form.annualAmount) : null;
        if ((amount !== null || annualAmount !== null) && !plan.currency)
          throw new Error("Selecciona la moneda del plan.");
        result = await client.rpc("admin_save_business_plan", {
          _plan: { ...plan, amount_cents: amount, annual_amount_cents: annualAmount },
          _expected_revision: revision,
        });
      } else if (form.kind === "new-payment") {
        const cents = amountCents(form.amount);
        if (!cents) throw new Error("El importe debe ser mayor que cero.");
        result = await client.rpc("admin_create_business_payment", {
          _id: form.id,
          _household: form.household,
          _amount_cents: cents,
          _currency: form.currency,
          _reference: form.reference,
          _note: form.note,
        });
      } else {
        if (form.status === "received" && (!form.confirmed || !form.reference.trim()))
          throw new Error(
            "Confirma que recibiste el dinero e indica la referencia del cobro externo.",
          );
        result = await client.rpc("admin_update_business_payment", {
          _id: form.value.id,
          _expected_revision: form.value.revision,
          _status: form.status,
          _reference: form.reference,
        });
      }
      if (!operation.active) return;
      if (result.error) throw result.error;
      if (!result.data) throw new Error("No se pudo confirmar el guardado.");
      setForm(null);
      await loadRef.current();
    } catch (reason) {
      if (operation.active)
        setFormError(
          reason && typeof reason === "object" && "code" in reason && reason.code === "40001"
            ? "Este registro cambió. Cierra el formulario y actualiza antes de continuar."
            : reason instanceof Error
              ? reason.message
              : "No se pudo guardar. Revisa la conexión y vuelve a intentarlo.",
        );
    } finally {
      if (operation.active) setBusy(false);
    }
  };
  const loadMore = async (section: "payments" | "audit") => {
    if (!data || busy) return;
    const operation = binding.current;
    const rows = data[section];
    setBusy(true);
    try {
      const result = await client.rpc("admin_business_page", {
        _section: section,
        _before: rows.at(-1)?.sequence ?? 0,
      });
      if (!operation.active) return;
      if (result.error) throw result.error;
      const parsed =
        section === "payments"
          ? z.array(paymentSchema).parse(result.data)
          : z.array(auditSchema).parse(result.data);
      setData((value) =>
        value
          ? {
              ...value,
              [section]: [
                ...value[section],
                ...parsed.filter(
                  (row) => !value[section].some((old) => old.sequence === row.sequence),
                ),
              ],
            }
          : value,
      );
      setMore((value) => ({ ...value, [section]: parsed.length === 50 }));
    } catch {
      if (operation.active) setError("No se pudo cargar la siguiente página.");
    } finally {
      if (operation.active) setBusy(false);
    }
  };
  if (!data)
    return (
      <div className="mb-5 rounded-2xl bg-card p-5">
        {error ? (
          <>
            <p role="alert">{error}</p>
            <Button variant="outline" className="mt-3" onClick={() => void loadRef.current()}>
              Reintentar datos del negocio
            </Button>
          </>
        ) : (
          <p role="status" className="text-sm text-muted-foreground">
            Cargando negocio…
          </p>
        )}
      </div>
    );
  const payments = data.payments.filter(
    (payment) =>
      (filter === "all" || payment.status === filter) &&
      `${payment.household_label} ${payment.reference}`
        .toLocaleLowerCase()
        .includes(query.toLocaleLowerCase()),
  );
  return (
    <div className="mb-6 space-y-5">
      {(["pagos", "planes", "configuracion"] as const).some((section) => section === tab) && (
        <StripeSandbox
          key={data.plans.find((plan) => plan.id === "pro")?.revision}
          client={client}
        />
      )}
      {error && (
        <p role="alert" className="rounded-2xl bg-destructive/10 p-4 text-sm text-destructive">
          {error}
          <button className="ml-3 underline" onClick={() => void loadRef.current()}>
            Actualizar
          </button>
        </p>
      )}
      {tab === "resumen" && (
        <section className="grid gap-3 md:grid-cols-3">
          <div className="rounded-3xl bg-success p-5">
            <Activity className="mb-3 size-5" />
            <p className="font-display text-3xl font-bold">{data.recent_accounts}</p>
            <p className="text-sm font-semibold">Cuentas con acceso en 30 días</p>
          </div>
          <div className="rounded-3xl bg-lilac p-5">
            <FileClock className="mb-3 size-5" />
            <p className="font-display text-3xl font-bold">{data.unconfirmed_accounts}</p>
            <p className="text-sm font-semibold">Correos pendientes de confirmar</p>
          </div>
          <div className="rounded-3xl bg-accent p-5">
            <ShieldCheck className="mb-3 size-5" />
            <p className="font-display text-xl font-bold">Cobro automático desactivado</p>
            <p className="mt-2 text-sm">
              Prepara los planes y consulta los pagos externos desde la consola.
            </p>
          </div>
        </section>
      )}
      {tab === "legal" && <LegalConsole client={client} />}
      {tab === "pagos" && (
        <>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h2 className="font-display text-2xl font-bold">Pagos del negocio</h2>
              <p className="mt-1 text-sm text-muted-foreground">
                Registros de cobros realizados fuera de HomeHub.
              </p>
            </div>
            <div className="flex gap-2">
              <Button
                variant="outline"
                disabled={!payments.length}
                onClick={() => exportCsv(payments)}
              >
                <ArrowDownToLine className="size-4" />
                Exportar
              </Button>
              <Button
                disabled={!households.length}
                onClick={() =>
                  open({
                    kind: "new-payment",
                    id: crypto.randomUUID(),
                    household: households[0]?.id ?? "",
                    amount: "",
                    currency: data.settings.currency ?? "",
                    reference: "",
                    note: "",
                  })
                }
              >
                Anotar pago
              </Button>
            </div>
          </div>
          <div className="grid gap-3 sm:grid-cols-3">
            {data.totals
              .filter((total) => total.status !== "canceled")
              .map((total) => (
                <div key={`${total.currency}:${total.status}`} className="rounded-2xl bg-card p-4">
                  <p className="text-xs text-muted-foreground">
                    {total.status === "received" ? "Recibido" : "Pendiente"} · {total.currency}
                  </p>
                  <p className="mt-1 font-display text-2xl font-bold">
                    {money(total.amount_cents, total.currency)}
                  </p>
                  <p className="text-xs text-muted-foreground">{total.count} registros</p>
                </div>
              ))}
          </div>
          <div className="flex flex-wrap gap-2">
            <select
              aria-label="Estado de pagos"
              className="rounded-xl border bg-card px-3 py-2"
              value={filter}
              onChange={(event) => setFilter(event.target.value as typeof filter)}
            >
              <option value="all">Todos los estados</option>
              {Object.entries(statusLabel).map(([key, value]) => (
                <option key={key} value={key}>
                  {value}
                </option>
              ))}
            </select>
            <input
              className="min-w-0 flex-1 rounded-xl border bg-card px-3 py-2"
              aria-label="Buscar pagos"
              placeholder="Buscar por hogar o referencia"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
            />
          </div>
          <div className="space-y-3">
            {payments.map((payment) => (
              <article
                key={payment.id}
                className="flex flex-wrap items-center gap-4 rounded-3xl bg-card p-5"
              >
                <div className="min-w-0 flex-1">
                  <p className="font-bold">{payment.household_label}</p>
                  <p className="mt-1 break-words text-xs text-muted-foreground">
                    {when(payment.created_at)} · Manual
                    {payment.reference ? ` · ${payment.reference}` : ""}
                  </p>
                  {payment.note && (
                    <p className="mt-2 break-words text-sm text-muted-foreground">{payment.note}</p>
                  )}
                </div>
                <div className="text-right">
                  <p className="font-display text-xl font-bold">
                    {money(payment.amount_cents, payment.currency)}
                  </p>
                  <p className="text-xs text-muted-foreground">{statusLabel[payment.status]}</p>
                </div>
                {payment.status === "pending" && (
                  <div className="flex gap-2">
                    <Button
                      size="sm"
                      onClick={() =>
                        open({
                          kind: "payment",
                          value: payment,
                          status: "received",
                          reference: payment.reference,
                          confirmed: false,
                        })
                      }
                    >
                      Registrar recibido
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() =>
                        open({
                          kind: "payment",
                          value: payment,
                          status: "canceled",
                          reference: payment.reference,
                          confirmed: false,
                        })
                      }
                    >
                      Cancelar registro
                    </Button>
                  </div>
                )}
              </article>
            ))}
          </div>
          {!payments.length && (
            <p className="rounded-3xl border border-dashed p-10 text-center text-muted-foreground">
              No hay pagos en esta vista.
            </p>
          )}
          {more.payments && (
            <Button variant="outline" disabled={busy} onClick={() => void loadMore("payments")}>
              Cargar más pagos
            </Button>
          )}
        </>
      )}
      {tab === "planes" && (
        <>
          <h2 className="font-display text-2xl font-bold">Planes y precios</h2>
          <p className="text-sm text-muted-foreground">
            Configuración interna. Los precios se publicarán al activar el proveedor de pagos.
          </p>
          <div className="grid gap-4 sm:grid-cols-2">
            {data.plans.map((plan) => (
              <article key={plan.id} className="rounded-3xl bg-card p-6">
                <p className="text-xs uppercase tracking-wider text-muted-foreground">{plan.id}</p>
                <h3 className="mt-3 font-display text-2xl font-bold">{plan.name}</h3>
                <p className="my-4 text-lg font-semibold">
                  {plan.amount_cents === null || !plan.currency
                    ? "Precio por definir"
                    : `${money(plan.amount_cents, plan.currency)}${plan.billing_interval === "month" ? " / mes" : plan.billing_interval === "year" ? " / año" : ""}`}
                </p>
                <p className="mb-4 text-sm font-semibold">
                  {plan.annual_amount_cents !== null &&
                  plan.currency &&
                  plan.billing_interval !== "none"
                    ? `${money(plan.annual_amount_cents, plan.currency)} / año`
                    : ""}
                </p>
                <ul className="mb-5 space-y-1 text-sm">
                  {Object.entries(plan.limits ?? {}).map(([key, value]) => (
                    <li key={key}>
                      {value}{" "}
                      {
                        {
                          members: "miembros",
                          lists: "listas activas",
                          devices: "tablets vinculadas",
                          photos: "fotos",
                          widgets: "widgets por inicio",
                        }[key]
                      }
                    </li>
                  ))}
                </ul>
                <p className="mb-5 text-xs text-muted-foreground">
                  Propuesta por hogar. Límites y cobros reales aún desactivados.
                </p>
                <Button
                  variant="outline"
                  onClick={() =>
                    open({
                      kind: "plan",
                      value: {
                        ...plan,
                        limits:
                          plan.limits ??
                          (plan.id === "free"
                            ? { members: 4, lists: 3, devices: 1, photos: 10, widgets: 6 }
                            : { members: 12, lists: 20, devices: 3, photos: 30, widgets: 64 }),
                      },
                      amount:
                        plan.amount_cents === null ? "" : (plan.amount_cents / 100).toFixed(2),
                      annualAmount:
                        plan.annual_amount_cents === null
                          ? ""
                          : (plan.annual_amount_cents / 100).toFixed(2),
                    })
                  }
                >
                  <SlidersHorizontal className="size-4" />
                  Configurar plan
                </Button>
              </article>
            ))}
          </div>
        </>
      )}
      {tab === "actividad" && (
        <>
          <h2 className="font-display text-2xl font-bold">Actividad administrativa</h2>
          <p className="text-sm text-muted-foreground">
            Historial de planes, accesos y pagos. Conserva la autoría de cada cambio.
          </p>
          <ol className="space-y-3">
            {data.audit.map((entry) => (
              <li key={entry.sequence} className="rounded-2xl bg-card p-4">
                <p className="text-sm font-bold">{labels[entry.action] ?? entry.action}</p>
                <p className="mt-1 break-words text-xs text-muted-foreground">
                  {entry.actor_email ?? "Cuenta eliminada"} · {when(entry.created_at)}
                </p>
                <details className="mt-2 text-xs text-muted-foreground">
                  <summary className="cursor-pointer">Detalle</summary>
                  <pre className="mt-2 whitespace-pre-wrap break-all">
                    {JSON.stringify({ destino: entry.target_id, ...entry.details }, null, 2)}
                  </pre>
                </details>
              </li>
            ))}
          </ol>
          {!data.audit.length && (
            <p className="rounded-2xl bg-card p-6 text-muted-foreground">
              Todavía no hay acciones administrativas registradas.
            </p>
          )}
          {more.audit && (
            <Button variant="outline" disabled={busy} onClick={() => void loadMore("audit")}>
              Cargar más actividad
            </Button>
          )}
        </>
      )}
      {tab === "configuracion" && (
        <>
          <div className="flex items-center justify-between gap-3">
            <h2 className="font-display text-2xl font-bold">Configuración del negocio</h2>
            <Button
              variant="outline"
              onClick={() => open({ kind: "settings", value: { ...data.settings } })}
            >
              <Settings2 className="size-4" />
              Editar
            </Button>
          </div>
          <dl className="grid gap-4 rounded-3xl bg-card p-6 sm:grid-cols-2">
            {[
              ["Nombre del negocio", data.settings.business_name],
              ["País", data.settings.country],
              ["Moneda", data.settings.currency],
              ["Correo de soporte", data.settings.support_email],
            ].map(([label, value]) => (
              <div key={label}>
                <dt className="text-xs text-muted-foreground">{label}</dt>
                <dd className="mt-1 break-words font-semibold">{value ?? "Por definir"}</dd>
              </div>
            ))}
          </dl>
          <section className="rounded-3xl bg-card p-6">
            <h3 className="font-display text-lg font-bold">Antes de vender suscripciones</h3>
            <ul className="mt-4 space-y-3 text-sm text-muted-foreground">
              <li>Datos legales, país, moneda y precios.</li>
              <li>Proveedor de pagos, impuestos, cancelaciones y devoluciones.</li>
              <li>Política de privacidad, términos y canal de soporte.</li>
              <li>Pruebas del cobro, confirmación del proveedor y recuperación ante errores.</li>
            </ul>
          </section>
          <section className="rounded-3xl bg-success p-6">
            <h3 className="font-semibold">Infraestructura actual</h3>
            <p className="mt-2 text-sm">
              Web y aplicación en Cloudflare. Datos y acceso en Supabase. Correo transaccional con
              Resend.
            </p>
            <p className="mt-2 text-xs">
              Planes gratuitos sujetos a sus cuotas. No se activan ampliaciones de pago desde esta
              consola.
            </p>
          </section>
        </>
      )}
      <Dialog
        open={!!form}
        onOpenChange={(value) => {
          if (!value && !busy) setForm(null);
        }}
      >
        <DialogContent className="max-h-[85dvh] overflow-y-auto rounded-3xl">
          <DialogHeader>
            <DialogTitle>
              {form?.kind === "settings"
                ? "Datos del negocio"
                : form?.kind === "plan"
                  ? "Configurar plan"
                  : form?.kind === "new-payment"
                    ? "Anotar pago externo"
                    : form?.status === "received"
                      ? "Registrar cobro recibido"
                      : "Cancelar registro"}
            </DialogTitle>
            <DialogDescription>
              {form?.kind === "payment" || form?.kind === "new-payment"
                ? "Este registro no realiza cargos ni devuelve dinero."
                : "Los cambios quedan registrados en la actividad administrativa."}
            </DialogDescription>
          </DialogHeader>
          <form className="space-y-4" onSubmit={(event) => void save(event)}>
            {form?.kind === "settings" && (
              <>
                {(
                  [
                    ["business_name", "Nombre del negocio"],
                    ["country", "País (código de dos letras)"],
                    ["support_email", "Correo de soporte"],
                  ] as const
                ).map(([key, label]) => (
                  <label key={key} className="block text-sm font-semibold">
                    {label}
                    <input
                      className={inputClass}
                      value={form.value[key] ?? ""}
                      type={key === "support_email" ? "email" : "text"}
                      maxLength={key === "country" ? 2 : key === "business_name" ? 100 : 254}
                      pattern={key === "country" ? "[A-Z]{2}" : undefined}
                      onChange={(event) => {
                        const value = event.target.value;
                        setForm({
                          ...form,
                          value: {
                            ...form.value,
                            [key]: value.trim()
                              ? key === "country"
                                ? value.toUpperCase()
                                : value
                              : null,
                          },
                        });
                      }}
                    />
                  </label>
                ))}
                <label className="block text-sm font-semibold">
                  Moneda
                  <select
                    className={inputClass}
                    value={form.value.currency ?? ""}
                    onChange={(event) =>
                      setForm({
                        ...form,
                        value: { ...form.value, currency: event.target.value || null },
                      })
                    }
                  >
                    <option value="">Por definir</option>
                    {currencies.map((currency) => (
                      <option key={currency}>{currency}</option>
                    ))}
                  </select>
                </label>
              </>
            )}
            {form?.kind === "plan" && (
              <>
                <label className="block text-sm font-semibold">
                  Nombre del plan
                  <input
                    required
                    maxLength={80}
                    className={inputClass}
                    value={form.value.name}
                    onChange={(event) =>
                      setForm({ ...form, value: { ...form.value, name: event.target.value } })
                    }
                  />
                </label>
                <label className="block text-sm font-semibold">
                  Precio mensual
                  <input
                    inputMode="decimal"
                    className={inputClass}
                    value={form.amount}
                    placeholder="Por definir"
                    onChange={(event) => setForm({ ...form, amount: event.target.value })}
                  />
                </label>
                <label className="block text-sm font-semibold">
                  Precio anual
                  <input
                    inputMode="decimal"
                    className={inputClass}
                    value={form.annualAmount}
                    placeholder="Por definir"
                    onChange={(event) => setForm({ ...form, annualAmount: event.target.value })}
                  />
                </label>
                <label className="block text-sm font-semibold">
                  Moneda
                  <select
                    className={inputClass}
                    value={form.value.currency ?? ""}
                    onChange={(event) =>
                      setForm({
                        ...form,
                        value: { ...form.value, currency: event.target.value || null },
                      })
                    }
                  >
                    <option value="">Por definir</option>
                    {currencies.map((currency) => (
                      <option key={currency}>{currency}</option>
                    ))}
                  </select>
                </label>
                {form.value.limits && (
                  <fieldset className="space-y-3">
                    <legend className="text-sm font-bold">Capacidad por hogar</legend>
                    {Object.entries(form.value.limits).map(([key, value]) => (
                      <label key={key} className="block text-sm font-semibold">
                        {
                          {
                            members: "Miembros",
                            lists: "Listas activas",
                            devices: "Tablets vinculadas",
                            photos: "Fotos",
                            widgets: "Widgets por inicio",
                          }[key]
                        }
                        <input
                          required
                          type="number"
                          min={1}
                          max={
                            key === "members"
                              ? 50
                              : key === "photos"
                                ? 30
                                : key === "widgets"
                                  ? 64
                                  : 20
                          }
                          value={value}
                          className={inputClass}
                          onChange={(e) =>
                            setForm({
                              ...form,
                              value: {
                                ...form.value,
                                limits: { ...form.value.limits!, [key]: Number(e.target.value) },
                              },
                            })
                          }
                        />
                      </label>
                    ))}
                  </fieldset>
                )}
                <label className="block text-sm font-semibold">
                  Periodicidad
                  <select
                    className={inputClass}
                    value={form.value.billing_interval}
                    onChange={(event) =>
                      setForm({
                        ...form,
                        value: {
                          ...form.value,
                          billing_interval: event.target.value as Plan["billing_interval"],
                        },
                      })
                    }
                  >
                    <option value="month">Mensual</option>
                    <option value="year">Anual</option>
                    <option value="none">Sin renovación</option>
                  </select>
                </label>
              </>
            )}
            {form?.kind === "new-payment" && (
              <>
                <label className="block text-sm font-semibold">
                  Hogar
                  <select
                    required
                    className={inputClass}
                    value={form.household}
                    onChange={(event) => setForm({ ...form, household: event.target.value })}
                  >
                    {households.map((home) => (
                      <option key={home.id} value={home.id}>
                        {home.name}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="block text-sm font-semibold">
                  Importe
                  <input
                    required
                    inputMode="decimal"
                    className={inputClass}
                    value={form.amount}
                    onChange={(event) => setForm({ ...form, amount: event.target.value })}
                  />
                </label>
                <label className="block text-sm font-semibold">
                  Moneda
                  <select
                    required
                    className={inputClass}
                    value={form.currency}
                    onChange={(event) => setForm({ ...form, currency: event.target.value })}
                  >
                    <option value="">Seleccionar</option>
                    {currencies.map((currency) => (
                      <option key={currency}>{currency}</option>
                    ))}
                  </select>
                </label>
                <label className="block text-sm font-semibold">
                  Referencia
                  <input
                    maxLength={150}
                    className={inputClass}
                    value={form.reference}
                    onChange={(event) => setForm({ ...form, reference: event.target.value })}
                  />
                </label>
                <label className="block text-sm font-semibold">
                  Nota interna
                  <textarea
                    maxLength={500}
                    className={inputClass}
                    value={form.note}
                    onChange={(event) => setForm({ ...form, note: event.target.value })}
                  />
                </label>
              </>
            )}
            {form?.kind === "payment" && (
              <>
                <p className="rounded-2xl bg-secondary p-4 font-semibold">
                  {form.value.household_label} ·{" "}
                  {money(form.value.amount_cents, form.value.currency)}
                </p>
                <label className="block text-sm font-semibold">
                  Referencia del cobro externo
                  <input
                    required={form.status === "received"}
                    maxLength={150}
                    className={inputClass}
                    value={form.reference}
                    onChange={(event) => setForm({ ...form, reference: event.target.value })}
                  />
                </label>
                {form.status === "received" && (
                  <label className="flex items-start gap-3 text-sm">
                    <input
                      type="checkbox"
                      required
                      checked={form.confirmed}
                      onChange={(event) => setForm({ ...form, confirmed: event.target.checked })}
                      className="mt-1 size-4"
                    />
                    Confirmo que este dinero ya fue recibido fuera de HomeHub.
                  </label>
                )}
              </>
            )}
            {formError && (
              <p role="alert" className="text-sm text-destructive">
                {formError}
              </p>
            )}
            <Button type="submit" disabled={busy} className="w-full rounded-full">
              {busy ? "Guardando…" : "Guardar"}
            </Button>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
