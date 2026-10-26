export type AvatarPath = { member_key: string; path: string };
type Result<T> = { data: T | null; error: unknown };
type Services = {
  context: () => PromiseLike<Result<{ household_id: string }[]>>;
  list: () => PromiseLike<Result<AvatarPath[]>>;
  sign: (
    paths: string[],
  ) => PromiseLike<Result<{ path?: string; signedUrl?: string; error?: string | null }[]>>;
};
const headers = {
  "Access-Control-Allow-Origin": "https://app.skendal.com",
  "Access-Control-Allow-Headers":
    "authorization, apikey, content-type, x-client-info, x-device-token",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Cache-Control": "no-store",
  "Content-Type": "application/json",
};
const reply = (value: unknown, status = 200) => Response.json(value, { status, headers });
export async function memberAvatarResponse(request: Request, services: Services) {
  const origin = request.headers.get("origin");
  if (origin && origin !== "https://app.skendal.com") return reply({ error: "Forbidden" }, 403);
  if (request.method === "OPTIONS") return new Response(null, { headers });
  if (request.method !== "POST") return reply({ error: "Method not allowed" }, 405);
  if (!request.headers.get("authorization") && !request.headers.get("x-device-token"))
    return reply({ error: "Authentication required" }, 401);
  try {
    const context = await services.context();
    if (context.error || !context.data?.[0]?.household_id)
      return reply({ error: "Household access denied" }, 403);
    const result = await services.list();
    if (result.error) throw result.error;
    const avatars = result.data ?? [];
    if (
      avatars.length > 128 ||
      new Set(avatars.map((a) => a.member_key)).size !== avatars.length ||
      avatars.some(
        (a) =>
          !/^[a-zA-Z0-9_-]{1,100}$/.test(a.member_key) ||
          !/^[a-f0-9-]{36}\/[a-zA-Z0-9._-]{1,200}\.(jpe?g|png|webp)$/.test(a.path),
      )
    )
      throw new Error("Invalid avatar scope");
    // Request bodies never choose paths. Only the authorized RPC's references are signed.
    const signed = avatars.length
      ? await services.sign(avatars.map((a) => a.path))
      : { data: [], error: null };
    if (signed.error) throw signed.error;
    const urls = new Map(
      (signed.data ?? [])
        .filter((a) => !a.error && a.path && a.signedUrl)
        .map((a) => [a.path!, a.signedUrl!]),
    );
    return reply({
      avatars: avatars
        .filter((a) => urls.has(a.path))
        .map((a) => ({ ...a, url: urls.get(a.path) })),
    });
  } catch {
    return reply({ error: "Avatars unavailable" }, 503);
  }
}
