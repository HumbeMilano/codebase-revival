import type { Session } from "@supabase/supabase-js";
import { sessionIdentity } from "./session-identity";

export type RecoveryArrival = { recovery: boolean; token: string | null; error: boolean };
export function recoveryArrival(url: URL): RecoveryArrival {
  const hash = new URLSearchParams(url.hash.slice(1));
  const recovery = hash.get("type") === "recovery";
  return {
    recovery,
    token: recovery ? hash.get("access_token") : null,
    error: Boolean(
      hash.get("error") ||
      hash.get("error_code") ||
      url.searchParams.get("error") ||
      url.searchParams.get("error_code"),
    ),
  };
}

const KEY = "skendal-password-recovery";
const WINDOW_MS = 60 * 60 * 1000;
// This is a UI continuation marker, never an authorization credential. Every
// resume checks Auth again. Store no tokens, passwords, email or household data.
function identity(session: Session) {
  const value = sessionIdentity(session.user.id, session.access_token);
  return value === `${session.user.id}:${session.access_token}` ? null : value;
}
export function forgetPasswordRecovery() {
  try {
    sessionStorage.removeItem(KEY);
  } catch {
    /* Optional tab storage. */
  }
}
export function rememberPasswordRecovery(session: Session, now = Date.now()) {
  const key = identity(session);
  if (!key) return;
  try {
    sessionStorage.setItem(KEY, JSON.stringify({ key, expiresAt: now + WINDOW_MS }));
  } catch {
    /* The current page remains usable if tab storage is blocked. */
  }
}
export function canResumePasswordRecovery(session: Session, now = Date.now()) {
  try {
    const value = JSON.parse(sessionStorage.getItem(KEY) ?? "null") as {
      key?: unknown;
      expiresAt?: unknown;
    } | null;
    const key = identity(session);
    return Boolean(
      key &&
      value?.key === key &&
      typeof value.expiresAt === "number" &&
      value.expiresAt > now &&
      value.expiresAt <= now + WINDOW_MS,
    );
  } catch {
    return false;
  }
}

export function passwordRecoveryError(reason: unknown): string {
  const value =
    reason && typeof reason === "object"
      ? (reason as { code?: unknown; message?: unknown; status?: unknown })
      : {};
  const code = String(value.code ?? ""),
    message = String(value.message ?? "");
  if (code === "same_password" || /different from.*old password|same password/i.test(message))
    return "Elige una contraseña diferente a la anterior.";
  if (
    code === "weak_password" ||
    /password.*(weak|length|characters)|weak.*password/i.test(message)
  )
    return "Usa una contraseña más segura, con al menos 6 caracteres, letras y números.";
  if (value.status === 429 || /rate.limit|too.many|over.*rate/i.test(code + message))
    return "Has hecho varios intentos seguidos. Espera un minuto y vuelve a intentarlo.";
  if (/session|token.*expired|otp_expired|reauthentication|not authenticated/i.test(code + message))
    return "El enlace ya no es válido. Solicita uno nuevo aquí.";
  return "No se pudo completar la acción. Revisa tu conexión y vuelve a intentarlo.";
}
