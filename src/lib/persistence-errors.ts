export class PersistenceConflictError extends Error {
  constructor() {
    super("Este registro cambió en otro dispositivo. Actualiza los datos y vuelve a intentarlo.");
    this.name = "PersistenceConflictError";
  }
}

export function persistenceErrorMessage(error: unknown): string {
  if (error instanceof PersistenceConflictError) return error.message;
  const detail =
    error && typeof error === "object" ? (error as { code?: string; message?: string }) : {};
  const message = detail.message ?? "";
  if (detail.code === "40001" || /revision|conflict|modified|stale/i.test(message))
    return new PersistenceConflictError().message;
  if (
    /suspended|inactive|revoked|not authorized|forbidden|permission denied|finance.*expired/i.test(
      message,
    )
  )
    return "Tu acceso cambió o caducó. Vuelve a entrar para actualizar tus permisos.";
  if (/already exists|duplicate|unique/i.test(message))
    return "Ese registro ya existe. Actualiza la lista antes de intentarlo de nuevo.";
  if (/invalid|must|constraint|check violation|member|split/i.test(message))
    return "Revisa los datos y las personas seleccionadas. No se guardó el cambio.";
  return "No se pudo guardar el cambio. Se restauraron los datos confirmados. Revisa la conexión y vuelve a intentarlo.";
}
