/** Used only to distinguish browser sessions; server-side Auth/RLS verifies the JWT. */
export function sessionIdentity(userId: string, accessToken: string): string {
  try {
    const payload = accessToken.split(".")[1];
    if (!payload) throw new Error("Missing claims");
    const claims = JSON.parse(atob(payload.replace(/-/g, "+").replace(/_/g, "/"))) as {
      session_id?: unknown;
    };
    if (typeof claims.session_id === "string") return `${userId}:${claims.session_id}`;
  } catch {
    /* Legacy tokens are isolated by token value instead of sharing a session. */
  }
  return `${userId}:${accessToken}`;
}
