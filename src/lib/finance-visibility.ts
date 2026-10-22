/** Presentation-only gate for the PIN demo; not a server security boundary. */
export function canViewFinances(
  role: "admin" | "member" | undefined,
  adultAuthorized: boolean,
): boolean {
  return role === "admin" || (role === "member" && adultAuthorized);
}
