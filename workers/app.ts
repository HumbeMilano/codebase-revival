export type WorkerEnv = Cloudflare.Env;
const json = (value: unknown, status = 200) =>
  Response.json(value, {
    status,
    headers: { "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff" },
  });
const escapeHtml = (value: string) =>
  value.replace(
    /[&<>"']/g,
    (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!,
  );

async function body(request: Request): Promise<Record<string, unknown>> {
  const reader = request.body?.getReader();
  if (!reader) throw new Error("body");
  const chunks: Uint8Array[] = [];
  let length = 0;
  for (;;) {
    const chunk = await reader.read();
    if (chunk.done) break;
    length += chunk.value.length;
    if (length > 8192) {
      await reader.cancel();
      throw new Error("body");
    }
    chunks.push(chunk.value);
  }
  const bytes = new Uint8Array(length);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.length;
  }
  const data: unknown = JSON.parse(new TextDecoder().decode(bytes));
  if (!data || typeof data !== "object" || Array.isArray(data)) throw new Error("body");
  return data as Record<string, unknown>;
}
export async function sendInvitation(request: Request, env: WorkerEnv): Promise<Response> {
  if (request.method !== "POST") return json({ error: "Método no permitido." }, 405);
  const origin = request.headers.get("origin");
  if (origin && origin !== new URL(request.url).origin)
    return json({ error: "Origen no permitido." }, 403);
  const authorization = request.headers.get("authorization");
  if (!authorization?.startsWith("Bearer "))
    return json({ error: "Vuelve a iniciar sesión para invitar." }, 401);
  if (!env.RESEND_API_KEY || !env.SUPABASE_URL || !env.SUPABASE_PUBLIC_KEY)
    return json({ error: "El envío de invitaciones todavía no está configurado." }, 503);
  let data: Record<string, unknown>;
  try {
    data = await body(request);
  } catch {
    return json({ error: "Revisa los datos de la invitación." }, 400);
  }
  const email = typeof data["email"] === "string" ? data["email"].trim().toLowerCase() : "";
  const name = typeof data["name"] === "string" ? data["name"].trim() : "";
  const role = data["role"];
  const code = data["code"];
  if (
    name.length < 1 ||
    name.length > 100 ||
    email.length > 254 ||
    !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) ||
    !["admin", "member"].includes(String(role)) ||
    (code !== undefined && (typeof code !== "string" || !/^[A-F0-9]{16,32}$/.test(code)))
  )
    return json({ error: "Escribe un nombre y correo válidos y elige un rol." }, 400);
  const rpcHeaders = {
    apikey: env.SUPABASE_PUBLIC_KEY,
    Authorization: authorization,
    "Content-Type": "application/json",
  };
  try {
    // Supabase verifies the JWT; the RPC checks the adult's current membership,
    // suspension, recipient binding and email limits under the household lock.
    const prepared = await fetch(`${env.SUPABASE_URL}/rest/v1/rpc/prepare_email_invite`, {
      method: "POST",
      headers: rpcHeaders,
      body: JSON.stringify({ _member_name: name, _role: role, _email: email, _code: code ?? null }),
    });
    if (!prepared.ok) {
      const failure = (await prepared.json()) as { code?: string };
      return json(
        {
          error:
            failure.code === "54000"
              ? "Has alcanzado el límite de envío o debes esperar un minuto para reenviar."
              : "No se pudo preparar la invitación. Comprueba tu acceso de adulto y vuelve a intentarlo.",
        },
        failure.code === "54000" ? 429 : prepared.status === 401 ? 401 : 403,
      );
    }
    const invite = (await prepared.json()) as {
      code: string;
      delivery_id: string;
      email: string;
      name: string;
      household_name: string;
    };
    const link = `https://app.skendal.com/?invite=${encodeURIComponent(invite.code)}&email=${encodeURIComponent(invite.email)}`;
    const delivered = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${env.RESEND_API_KEY}`,
        "Content-Type": "application/json",
        "Idempotency-Key": `homehub-invite-${invite.delivery_id}`,
      },
      body: JSON.stringify({
        from: "HomeHub · Skendal <no-reply@mail.skendal.com>",
        to: [invite.email],
        subject: "Invitación a HomeHub",
        text: `Hola, ${invite.name}. Te invitaron a unirte al hogar ${invite.household_name} en HomeHub.\n\nCrea tu cuenta o entra con ${invite.email}:\n${link}\n\nLa invitación caduca en 7 días y solo sirve para ese correo. Si no la esperabas, puedes ignorarla.`,
        html: `<div style="font-family:system-ui,sans-serif;max-width:560px;margin:auto;padding:24px;color:#263c2d"><h1>Te invitaron a HomeHub</h1><p>Hola, ${escapeHtml(invite.name)}.</p><p>Únete al hogar <strong>${escapeHtml(invite.household_name)}</strong> para organizar tareas, compras y calendario.</p><p><a style="display:inline-block;background:#284638;color:white;padding:14px 22px;border-radius:12px;text-decoration:none" href="${escapeHtml(link)}">Aceptar invitación</a></p><p>Crea tu cuenta o entra con <strong>${escapeHtml(invite.email)}</strong>. La invitación caduca en 7 días y solo sirve para ese correo.</p><p>Si no la esperabas, puedes ignorarla.</p></div>`,
      }),
    });
    if (!delivered.ok)
      return json(
        {
          error:
            "El correo no pudo enviarse. La invitación queda pendiente; espera un minuto y reintenta.",
        },
        503,
      );
    const receipt = (await delivered.json()) as { id?: string };
    if (!receipt.id)
      return json(
        { error: "No se pudo confirmar el envío. Revisa las invitaciones antes de reenviar." },
        503,
      );
    const recorded = await fetch(`${env.SUPABASE_URL}/rest/v1/rpc/mark_invite_email_sent`, {
      method: "POST",
      headers: rpcHeaders,
      body: JSON.stringify({
        _code: invite.code,
        _message_id: receipt.id,
        _delivery_id: invite.delivery_id,
      }),
    });
    if (!recorded.ok)
      return json({
        sent: true,
        warning:
          "El proveedor aceptó el correo, pero no se pudo actualizar su estado. No lo reenvíes todavía.",
      });
    return json({ sent: true });
  } catch {
    return json(
      { error: "No se pudo confirmar el envío. Espera un minuto y vuelve a intentarlo." },
      503,
    );
  }
}
export default {
  fetch(request: Request, env: WorkerEnv): Promise<Response> {
    const path = new URL(request.url).pathname;
    if (path === "/api/invitations") return sendInvitation(request, env);
    if (path.startsWith("/api/"))
      return Promise.resolve(json({ error: "Ruta no encontrada." }, 404));
    return env.ASSETS.fetch(request);
  },
};
