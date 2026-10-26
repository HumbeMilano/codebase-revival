import { useEffect, useState } from "react";
import type { SupabaseClient } from "@supabase/supabase-js";
import { Download, FileText, ShieldCheck } from "lucide-react";
import { z } from "zod";
import type { Database, Json } from "@/integrations/supabase/types";
import { Button } from "@/components/ui/button";
import { documents, legalVersion } from "../../../legal/documents.mjs";
const profileSchema = z.object({
  company_formed: z.boolean(),
  operator_name: z.string(),
  operator_state: z.string(),
  operator_address: z.string(),
  support_email: z.string(),
  privacy_email: z.string(),
  copyright_name: z.string(),
  copyright_address: z.string(),
  copyright_phone: z.string(),
  copyright_email: z.string(),
  dmca_registered: z.boolean(),
  reviewed: z.boolean(),
  revision: z.number(),
  status: z.string(),
  minimum_age: z.number(),
  administrator_age: z.number(),
  updated_at: z.string(),
});
const requestSchema = z.object({
  id: z.string(),
  user_id: z.string().nullable(),
  kind: z.string(),
  detail: z.string(),
  status: z.string(),
  resolution: z.string(),
  created_at: z.string(),
});
const schema = z.object({
  profile: profileSchema,
  commercial_launch: z.literal(false),
  limits_enabled: z.boolean(),
  privacy_requests: z.array(requestSchema),
});
const fields = {
  operator_name: "Nombre legal de la empresa",
  operator_state: "Estado de constitución",
  operator_address: "Dirección postal pública",
  support_email: "Correo de soporte",
  privacy_email: "Correo de privacidad",
  copyright_name: "Persona o agente para copyright",
  copyright_address: "Dirección del agente",
  copyright_phone: "Teléfono del agente",
  copyright_email: "Correo de copyright",
} as const;
const flags = {
  company_formed: "Empresa constituida",
  dmca_registered: "Agente registrado en el Copyright Office",
  reviewed: "Documentos revisados profesionalmente",
} as const;
const kinds: Record<string, string> = {
  access: "Acceso y copia",
  correction: "Corrección",
  deletion: "Eliminación",
};
const statuses: Record<string, string> = {
  received: "Recibida",
  reviewing: "En revisión",
  completed: "Completada",
  declined: "No procede",
};
export function LegalConsole({ client }: { client: SupabaseClient<Database> }) {
  const [data, setData] = useState<z.infer<typeof schema> | null>(null);
  const [draft, setDraft] = useState<z.infer<typeof profileSchema> | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [reload, setReload] = useState(0);
  const [document, setDocument] = useState<keyof typeof documents>("terms");
  const [language, setLanguage] = useState<"es" | "en">("es");
  const [selected, setSelected] = useState("");
  const [resolution, setResolution] = useState("");
  const [status, setStatus] = useState("reviewing");
  useEffect(() => {
    let active = true;
    setData(null);
    void client.rpc("admin_business_legal").then(({ data: result, error: failure }) => {
      if (!active) return;
      if (failure) {
        setError("No se pudo cargar la preparación legal.");
        return;
      }
      try {
        const value = schema.parse(result);
        setData(value);
        setDraft(value.profile);
        setError("");
      } catch {
        setError("La respuesta legal no es válida.");
      }
    });
    return () => {
      active = false;
    };
  }, [client, reload]);
  const download = () => {
    const doc = documents[document][language];
    const text = `# ${doc.title}\n\n${doc.notice}\n\nVersión ${legalVersion}\n\n${doc.sections.map(([title, body]) => `## ${title}\n\n${body}`).join("\n\n")}\n`;
    const url = URL.createObjectURL(new Blob([text], { type: "text/markdown;charset=utf-8" }));
    const a = window.document.createElement("a");
    a.href = url;
    a.download = `skendal-${document}-${language}-BORRADOR.md`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  };
  const save = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!draft || busy) return;
    setBusy(true);
    setError("");
    const {
      revision,
      status: ignoredStatus,
      minimum_age,
      administrator_age,
      updated_at,
      ...profile
    } = draft;
    void ignoredStatus;
    void minimum_age;
    void administrator_age;
    void updated_at;
    try {
      const result = await client.rpc("admin_save_business_legal", {
        _profile: profile as Json,
        _expected_revision: revision,
      });
      if (result.error) throw result.error;
      const value = schema.parse(result.data);
      setData(value);
      setDraft(value.profile);
    } catch {
      setError("No se pudo guardar. Si otra sesión editó estos datos, vuelve a cargarlos.");
    } finally {
      setBusy(false);
    }
  };
  const resolve = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!selected || !resolution.trim() || busy) return;
    setBusy(true);
    try {
      const result = await client.rpc("admin_update_privacy_request", {
        _id: selected,
        _status: status,
        _resolution: resolution,
      });
      if (result.error) throw result.error;
      setSelected("");
      setResolution("");
      setReload((v) => v + 1);
    } catch {
      setError("No se pudo actualizar la solicitud.");
    } finally {
      setBusy(false);
    }
  };
  return (
    <section className="space-y-6">
      <div className="rounded-3xl bg-lilac p-6">
        <ShieldCheck className="mb-3 size-6" />
        <h2 className="font-display text-2xl font-bold">Preparación legal</h2>
        <p className="mt-2">
          Lanzamiento comercial cerrado. Documentos en borrador y cobros reales desactivados hasta
          constituir la empresa.
        </p>
        <p className="mt-2 text-sm">
          Acceso desde 13 años · Administración del hogar desde 18 · Menores de 18 con autorización
          y supervisión de su responsable.
        </p>
      </div>
      {error && (
        <p role="alert" className="text-destructive">
          {error}{" "}
          <Button variant="outline" onClick={() => setReload((v) => v + 1)}>
            Volver a cargar
          </Button>
        </p>
      )}
      {!data && !error && <p role="status">Cargando preparación legal…</p>}
      {draft && (
        <form onSubmit={save} className="space-y-4 rounded-3xl bg-card p-5">
          <h3 className="font-display text-xl font-bold">Operador y contactos</h3>
          <div className="grid gap-4 sm:grid-cols-2">
            {Object.entries(fields).map(([key, label]) => (
              <label key={key} className="text-sm font-semibold">
                {label}
                <input
                  type={key.endsWith("email") ? "email" : "text"}
                  maxLength={key.endsWith("email") ? 254 : 2000}
                  value={draft[key as keyof typeof fields]}
                  onChange={(e) => setDraft({ ...draft, [key]: e.target.value })}
                  className="mt-1 w-full rounded-xl border bg-background px-3 py-3 text-base"
                />
              </label>
            ))}
          </div>
          {Object.entries(flags).map(([key, label]) => (
            <label key={key} className="flex items-center gap-3 text-sm">
              <input
                type="checkbox"
                checked={draft[key as keyof typeof flags]}
                onChange={(e) => setDraft({ ...draft, [key]: e.target.checked })}
              />
              {label}
            </label>
          ))}
          <p className="text-sm text-muted-foreground">
            Guardar estos datos no publica contratos, activa límites ni habilita cobros.
          </p>
          <Button disabled={busy}>Guardar preparación</Button>
        </form>
      )}
      <article className="space-y-4 rounded-3xl bg-card p-5">
        <div className="flex items-center gap-2">
          <FileText className="size-5" />
          <h3 className="font-display text-xl font-bold">Borradores ES / EN</h3>
        </div>
        <div className="flex flex-wrap gap-3">
          <label>
            Documento
            <select
              aria-label="Documento legal"
              value={document}
              onChange={(e) => setDocument(e.target.value as keyof typeof documents)}
              className="ml-2 rounded-lg border bg-background p-2"
            >
              <option value="terms">Términos</option>
              <option value="privacy">Privacidad</option>
              <option value="copyright">Copyright</option>
            </select>
          </label>
          <label>
            Idioma
            <select
              aria-label="Idioma del borrador"
              value={language}
              onChange={(e) => setLanguage(e.target.value as "es" | "en")}
              className="ml-2 rounded-lg border bg-background p-2"
            >
              <option value="es">Español</option>
              <option value="en">English</option>
            </select>
          </label>
          <Button variant="outline" onClick={download}>
            <Download className="size-4" />
            Descargar borrador
          </Button>
        </div>
        <p className="rounded-xl bg-accent p-3 text-sm">{documents[document][language].notice}</p>
        <div className="max-h-[34rem] space-y-4 overflow-y-auto">
          {documents[document][language].sections.map(([title, body]) => (
            <section key={title}>
              <h4 className="font-bold">{title}</h4>
              <p className="mt-1 whitespace-pre-line text-sm leading-relaxed">{body}</p>
            </section>
          ))}
        </div>
      </article>
      {data && (
        <article className="space-y-4 rounded-3xl bg-card p-5">
          <h3 className="font-display text-xl font-bold">Solicitudes de privacidad</h3>
          {!data.privacy_requests.length && (
            <p className="text-sm text-muted-foreground">No hay solicitudes.</p>
          )}
          {data.privacy_requests.map((r) => (
            <div key={r.id} className="rounded-xl border p-4">
              <p className="font-semibold">
                {kinds[r.kind]} · {statuses[r.status]}
              </p>
              <p className="mt-1 break-all text-xs text-muted-foreground">
                Cuenta: {r.user_id ?? "eliminada"} ·{" "}
                {new Date(r.created_at).toLocaleDateString("es")}
              </p>
              <p className="mt-2 whitespace-pre-wrap text-sm">{r.detail}</p>
              {r.resolution && (
                <p className="mt-2 whitespace-pre-wrap text-sm">Respuesta: {r.resolution}</p>
              )}
              <Button
                className="mt-3"
                variant="outline"
                onClick={() => {
                  setSelected(r.id);
                  setResolution(r.resolution);
                  setStatus("reviewing");
                }}
              >
                Gestionar solicitud
              </Button>
            </div>
          ))}
          {selected && (
            <form onSubmit={resolve} className="space-y-3 rounded-xl bg-background p-4">
              <label className="block text-sm font-semibold">
                Estado
                <select
                  value={status}
                  onChange={(e) => setStatus(e.target.value)}
                  className="ml-2 rounded-lg border p-2"
                >
                  <option value="reviewing">En revisión</option>
                  <option value="completed">Completada</option>
                  <option value="declined">No procede</option>
                </select>
              </label>
              <label className="block text-sm font-semibold">
                Respuesta
                <textarea
                  required
                  maxLength={4000}
                  value={resolution}
                  onChange={(e) => setResolution(e.target.value)}
                  className="mt-1 min-h-24 w-full rounded-xl border p-3"
                />
              </label>
              <p className="text-sm text-muted-foreground">
                Marcar como completada requiere haber ejecutado y verificado la solicitud. Este
                formulario solo registra su resolución.
              </p>
              <Button disabled={busy}>Guardar respuesta</Button>
            </form>
          )}
        </article>
      )}
    </section>
  );
}
