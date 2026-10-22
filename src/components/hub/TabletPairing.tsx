import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import qrcode from "qrcode-generator";
import { CheckCircle2, Copy, LoaderCircle, QrCode, ShieldCheck } from "lucide-react";
import { z } from "zod";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { getDeviceToken } from "@/lib/db";
import { passkeyError, supportsPasskeys } from "@/lib/passkeys";
import {
  approveTabletPairing,
  clearPairingRequest,
  finishTabletPairing,
  pairingClient,
  pairingLink,
  previewSchema,
  readPairingLink,
  startTabletPairing,
  type TabletPairingRequest,
} from "@/lib/tablet-pairing";

function PairingQr({ value }: { value: string }) {
  const code = useMemo(() => {
    const qr = qrcode(0, "M");
    qr.addData(value);
    qr.make();
    const count = qr.getModuleCount(),
      modules = [];
    for (let row = 0; row < count; row++)
      for (let col = 0; col < count; col++)
        if (qr.isDark(row, col)) modules.push(`M${col + 4} ${row + 4}h1v1h-1z`);
    return { size: count + 8, path: modules.join("") };
  }, [value]);
  return (
    <svg
      role="img"
      aria-label="QR para vincular esta tablet"
      viewBox={`0 0 ${code.size} ${code.size}`}
      className="mx-auto aspect-square w-full max-w-80 rounded-2xl bg-white"
      shapeRendering="crispEdges"
    >
      <rect width={code.size} height={code.size} fill="white" />
      <path d={code.path} fill="black" />
    </svg>
  );
}

export function TabletPairingPane({
  onPaired,
  onCancel,
}: {
  onPaired: () => void;
  onCancel?: () => void;
}) {
  const [request, setRequest] = useState<TabletPairingRequest | null>(null);
  const [error, setError] = useState("");
  const [expired, setExpired] = useState(false);
  const [done, setDone] = useState("");
  const [retry, setRetry] = useState(0);
  const [copy, setCopy] = useState(false);
  const callback = useRef(onPaired);
  callback.current = onPaired;
  useEffect(() => {
    let active = true;
    setError("");
    setExpired(false);
    void startTabletPairing()
      .then((value) => {
        if (active) setRequest(value);
      })
      .catch(() => {
        if (active) setError("No se pudo preparar el QR. Comprueba la conexión y reintenta.");
      });
    return () => {
      active = false;
    };
  }, [retry]);
  useEffect(() => {
    if (!request) return;
    let active = true,
      timer: ReturnType<typeof setTimeout> | undefined,
      polling = false,
      finished = false;
    const controller = new AbortController(),
      client = pairingClient();
    const poll = async () => {
      if (!active || finished || polling || document.visibilityState === "hidden") return;
      if (Date.parse(request.expiresAt) <= Date.now()) {
        setExpired(true);
        return;
      }
      polling = true;
      try {
        const status = await client
          .rpc("tablet_pairing_status", { _id: request.id, _claim_secret: request.claimSecret })
          .abortSignal(controller.signal);
        if (status.error) throw status.error;
        const result = z
          .object({ status: z.enum(["pending", "approved", "claimed", "expired"]) })
          .parse(status.data);
        if (!active) return;
        if (result.status === "expired") {
          setExpired(true);
          return;
        }
        if (result.status === "approved" || result.status === "claimed") {
          const claimed = await client
            .rpc("claim_tablet_pairing", { _id: request.id, _claim_secret: request.claimSecret })
            .abortSignal(controller.signal);
          if (claimed.error) throw claimed.error;
          const receipt = z
            .object({ token: z.string().regex(/^[a-f0-9]{64}$/), household_name: z.string() })
            .parse(claimed.data);
          if (!active) return;
          await finishTabletPairing(receipt.token, controller.signal);
          if (!active) return;
          finished = true;
          setDone(receipt.household_name);
          timer = setTimeout(() => {
            if (active) callback.current();
          }, 1200);
          return;
        }
        setError("");
      } catch {
        if (active) setError("Esperando conexión… El QR sigue siendo el mismo.");
      } finally {
        polling = false;
      }
      if (active) timer = setTimeout(() => void poll(), 2500);
    };
    void poll();
    const visible = () => {
      if (document.visibilityState !== "hidden" && !polling && !finished) {
        clearTimeout(timer);
        void poll();
      }
    };
    document.addEventListener("visibilitychange", visible);
    return () => {
      active = false;
      controller.abort();
      clearTimeout(timer);
      document.removeEventListener("visibilitychange", visible);
    };
  }, [request]);
  const reset = async () => {
    if (request)
      await pairingClient()
        .rpc("cancel_tablet_pairing", { _id: request.id, _claim_secret: request.claimSecret })
        .then(
          () => {},
          () => {},
        );
    clearPairingRequest();
    setRequest(null);
    setRetry((value) => value + 1);
  };
  if (done)
    return (
      <section className="space-y-4 rounded-3xl bg-card p-6 text-center shadow-card" role="status">
        <CheckCircle2 className="mx-auto size-12 text-primary" />
        <h1 className="font-display text-2xl font-bold">Vinculada correctamente</h1>
        <p>{done}</p>
      </section>
    );
  return (
    <section className="space-y-5 rounded-3xl bg-card p-5 text-center shadow-card">
      <h1 className="font-display text-3xl font-extrabold">Vincula tu tablet</h1>
      <p className="text-sm text-muted-foreground">
        Escanea este QR con la cámara de tu teléfono y confirma el hogar.
      </p>
      {!request && !error && (
        <div role="status" className="grid aspect-square place-items-center">
          <LoaderCircle className="size-10 animate-spin" />
          <span>Preparando QR…</span>
        </div>
      )}
      {request && !expired && <PairingQr value={pairingLink(request)} />}
      {expired && (
        <div className="space-y-4 rounded-2xl bg-secondary p-8">
          <QrCode className="mx-auto size-12" />
          <p>El QR caducó.</p>
          <Button onClick={() => void reset()}>Generar otro QR</Button>
        </div>
      )}
      {error && (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      )}
      {!request && error && <Button onClick={() => setRetry((v) => v + 1)}>Reintentar</Button>}
      {request && !expired && (
        <>
          <p role="status" className="text-sm text-muted-foreground">
            Esperando tu confirmación en el teléfono…
          </p>
          <Button
            type="button"
            variant="ghost"
            className="w-full"
            onClick={() => {
              if (!navigator.clipboard) {
                setError(
                  "No se pudo copiar el enlace. Escanea el QR con la cámara de tu teléfono.",
                );
                return;
              }
              void navigator.clipboard.writeText(pairingLink(request)).then(
                () => setCopy(true),
                () => setError("No se pudo copiar el enlace."),
              );
            }}
          >
            <Copy />
            {copy ? "Enlace copiado" : "Copiar enlace para el teléfono"}
          </Button>
        </>
      )}
      {onCancel && (
        <Button
          variant="ghost"
          onClick={() => {
            if (request)
              void pairingClient()
                .rpc("cancel_tablet_pairing", {
                  _id: request.id,
                  _claim_secret: request.claimSecret,
                })
                .then(
                  () => {},
                  () => {},
                );
            clearPairingRequest();
            onCancel();
          }}
        >
          Volver
        </Button>
      )}
    </section>
  );
}

function PairingLogin() {
  const [email, setEmail] = useState(""),
    [password, setPassword] = useState(""),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  return (
    <form
      className="space-y-4"
      onSubmit={(event) => {
        event.preventDefault();
        if (busy) return;
        setBusy(true);
        setError("");
        void supabase.auth
          .signInWithPassword({ email: email.trim(), password })
          .then(
            (result) => {
              if (result.error)
                setError("Correo o contraseña incorrectos, o correo pendiente de confirmar.");
            },
            () => setError("No se pudo conectar. Reintenta."),
          )
          .finally(() => setBusy(false));
      }}
    >
      <h1 className="font-display text-3xl font-bold">Entra para vincular</h1>
      <p className="text-sm text-muted-foreground">Usa la cuenta adulta de tu hogar.</p>
      <label className="block text-sm font-semibold">
        Correo
        <input
          className="mt-1 w-full rounded-xl border bg-background px-3 py-3"
          type="email"
          autoComplete="username"
          required
          value={email}
          onChange={(e) => setEmail(e.target.value)}
        />
      </label>
      <label className="block text-sm font-semibold">
        Contraseña
        <input
          className="mt-1 w-full rounded-xl border bg-background px-3 py-3"
          type="password"
          autoComplete="current-password"
          required
          value={password}
          onChange={(e) => setPassword(e.target.value)}
        />
      </label>
      {error && (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      )}
      <Button type="submit" disabled={busy} className="w-full">
        {busy ? "Entrando…" : "Entrar para continuar"}
      </Button>
      <a href="/" className="block text-center text-sm underline">
        Ir a HomeHub
      </a>
    </form>
  );
}

function PhoneApproval({ request }: { request: { id: string; approvalSecret: string } }) {
  const [status, setStatus] = useState<"loading" | "login" | "ready" | "error" | "done">("loading");
  const [preview, setPreview] = useState<z.infer<typeof previewSchema> | null>(null),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false);
  const userId = useRef(""),
    revision = useRef(0),
    approval = useRef<AbortController | null>(null);
  const load = useCallback(async () => {
    const version = ++revision.current;
    setStatus("loading");
    setError("");
    setBusy(false);
    setPreview(null);
    try {
      const current = await supabase.auth.getUser();
      if (version !== revision.current) return;
      if (current.error && current.error.name !== "AuthSessionMissingError") throw current.error;
      if (!current.data.user) {
        setStatus("login");
        return;
      }
      userId.current = current.data.user.id;
      const result = await supabase.rpc("tablet_pairing_preview", {
        _id: request.id,
        _approval_secret: request.approvalSecret,
      });
      if (result.error) throw result.error;
      const parsed = previewSchema.parse(result.data);
      if (version === revision.current) {
        setPreview(parsed);
        setStatus(parsed.status === "approved" ? "done" : "ready");
      }
    } catch {
      if (version === revision.current) {
        setError(
          "El QR caducó o esta cuenta no es adulta de un hogar. Genera otro QR o entra con la cuenta correcta.",
        );
        setStatus("error");
      }
    }
  }, [request.id, request.approvalSecret]);
  useEffect(() => {
    let active = true;
    void load();
    const { data } = supabase.auth.onAuthStateChange((event) => {
      if (event === "SIGNED_IN" || event === "SIGNED_OUT") {
        approval.current?.abort();
        setTimeout(() => {
          if (active) void load();
        }, 0);
      }
    });
    return () => {
      active = false;
      revision.current++;
      approval.current?.abort();
      data.subscription.unsubscribe();
    };
  }, [load]);
  const confirm = async () => {
    if (busy) return;
    const controller = new AbortController();
    approval.current = controller;
    const version = revision.current;
    setBusy(true);
    setError("");
    try {
      await approveTabletPairing(request, userId.current, controller.signal);
      if (version === revision.current) setStatus("done");
    } catch (reason) {
      if (version === revision.current) setError(passkeyError(reason));
    } finally {
      if (version === revision.current) setBusy(false);
    }
  };
  if (status === "login") return <PairingLogin />;
  if (status === "loading") return <p role="status">Comprobando el hogar…</p>;
  if (status === "done")
    return (
      <section className="space-y-5 text-center">
        <CheckCircle2 className="mx-auto size-14 text-primary" />
        <h1 className="font-display text-3xl font-bold">Tablet autorizada</h1>
        <p>Ya puedes usarla con el PIN del hogar.</p>
        <a href="/" className="block underline">
          Volver a HomeHub
        </a>
      </section>
    );
  return (
    <section className="space-y-5 text-center">
      <ShieldCheck className="mx-auto size-12 text-primary" />
      <h1 className="font-display text-3xl font-bold">
        {preview
          ? `¿Vincular esta tablet a ${preview.household_name}?`
          : "No se pudo abrir el vínculo"}
      </h1>
      {preview && (
        <p className="text-sm text-muted-foreground">Confirma con la seguridad de tu teléfono.</p>
      )}
      {error && (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      )}
      {status === "ready" && (
        <Button
          className="h-12 w-full"
          disabled={busy || !supportsPasskeys()}
          onClick={() => void confirm()}
        >
          {busy ? "Confirmando…" : "Vincular tablet"}
        </Button>
      )}
      {status === "ready" && !supportsPasskeys() && (
        <p role="alert">
          Abre el enlace en Safari o Chrome actualizado para confirmar con tu teléfono.
        </p>
      )}
      {status === "error" && (
        <Button variant="outline" onClick={() => void load()}>
          Reintentar
        </Button>
      )}
      <a href="/" className="block text-sm underline">
        Volver a HomeHub
      </a>
    </section>
  );
}

export function TabletPairingPage() {
  const [link] = useState(() => readPairingLink());
  const [relink, setRelink] = useState(false);
  const alreadyPaired = !!getDeviceToken();
  return (
    <main className="flex min-h-dvh flex-col bg-background px-5 py-6 text-foreground">
      <a href="/" className="font-display text-xl font-bold">
        homehub
      </a>
      <div className="mx-auto my-auto w-full max-w-md py-8">
        {!link && window.location.hash ? (
          <section className="space-y-4 rounded-3xl bg-card p-6 text-center">
            <h1 className="font-display text-2xl font-bold">El enlace no es válido</h1>
            <p>Escanea de nuevo el QR que muestra la tablet.</p>
            <a href="/" className="block underline">
              Volver a HomeHub
            </a>
          </section>
        ) : link ? (
          <div className="rounded-3xl bg-card p-6 shadow-card">
            <PhoneApproval request={link} />
          </div>
        ) : alreadyPaired && !relink ? (
          <section className="space-y-5 rounded-3xl bg-card p-6 text-center shadow-card">
            <CheckCircle2 className="mx-auto size-12 text-primary" />
            <h1 className="font-display text-3xl font-bold">Esta tablet ya está vinculada</h1>
            <a href="/" className="block font-semibold underline">
              Abrir mi hogar
            </a>
            <Button variant="ghost" onClick={() => setRelink(true)}>
              Volver a vincular
            </Button>
          </section>
        ) : (
          <TabletPairingPane
            onPaired={() => window.location.replace("/")}
            onCancel={() => window.location.assign("/")}
          />
        )}
      </div>
    </main>
  );
}
