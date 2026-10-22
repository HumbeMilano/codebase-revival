import { z } from "zod";

export const invitationCode = z
  .string()
  .trim()
  .toUpperCase()
  .regex(/^[A-Z0-9]{8,16}$/, "Código de invitación no válido");
export const personalPreferences = z.object({
  preferred_view: z.enum(["auto", "mobile", "tablet"]),
  time_format: z.enum(["12", "24"]),
});
export const credentials = z.object({
  email: z.string().trim().email("Escribe un correo válido").max(255),
  password: z.string().min(6, "La contraseña debe tener al menos 6 caracteres").max(128),
});

export const INVITATION_KEY = "homehub-pending-invite";
export function readPendingInvite() {
  const result = invitationCode.safeParse(localStorage.getItem(INVITATION_KEY) ?? "");
  return result.success ? result.data : "";
}
