/** Presentation gate shared by all financial surfaces; the database enforces authorization. */
export function canViewFinances(
  role: "admin" | "member" | undefined,
  adultAuthorized: boolean,
): boolean {
  return role === "admin" || (role === "member" && adultAuthorized);
}
