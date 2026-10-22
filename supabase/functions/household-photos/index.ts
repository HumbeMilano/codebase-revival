import { createClient } from "npm:@supabase/supabase-js@2.118.0";

const headers = {
  "Access-Control-Allow-Origin": "https://app.skendal.com",
  "Access-Control-Allow-Headers":
    "authorization, apikey, content-type, x-client-info, x-device-token",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Cache-Control": "no-store",
  "Content-Type": "application/json",
};
// verify_jwt is disabled for paired tablets, which authenticate with their
// revocable device token. Every request is authorized by my_context() before
// the service key may sign any path; callers never choose arbitrary paths.
Deno.serve(async (request: Request) => {
  if (request.headers.get("origin") && request.headers.get("origin") !== "https://app.skendal.com")
    return new Response("Forbidden", { status: 403 });
  if (request.method === "OPTIONS") return new Response(null, { headers });
  if (request.method !== "POST")
    return new Response("Method not allowed", { status: 405, headers });
  try {
    const url = Deno.env.get("SUPABASE_URL")!;
    const key = Deno.env.get("SUPABASE_ANON_KEY")!;
    const authorization = request.headers.get("authorization");
    const device = request.headers.get("x-device-token");
    const scopedHeaders: Record<string, string> = {};
    if (authorization) scopedHeaders.Authorization = authorization;
    if (device) scopedHeaders["x-device-token"] = device;
    if (!authorization && !device)
      return Response.json({ error: "Authentication required" }, { status: 401, headers });
    const client = createClient(url, key, {
      auth: { persistSession: false, autoRefreshToken: false },
      global: { headers: scopedHeaders },
    });
    const context = await client.rpc("my_context");
    const household = context.data?.[0]?.household_id;
    if (context.error || !household)
      return Response.json({ error: "Household access denied" }, { status: 403, headers });
    const listed = await client.rpc("list_household_photos");
    if (listed.error) throw listed.error;
    const photos = listed.data ?? [];
    if (
      photos.length > 12 ||
      photos.some((photo: { path: string }) => !photo.path.startsWith(household + "/"))
    )
      throw new Error("Invalid photo list");
    const admin = createClient(url, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const signed = photos.length
      ? await admin.storage.from("household-photos").createSignedUrls(
          photos.map((photo: { path: string }) => photo.path),
          300,
        )
      : { data: [], error: null };
    if (signed.error) throw signed.error;
    const urls = new Map<string, string>();
    for (const item of signed.data ?? []) {
      if (item.error || !item.path || !item.signedUrl) throw new Error("Photo signing failed");
      urls.set(item.path, item.signedUrl);
    }
    return Response.json(
      {
        photos: photos.map((photo: { id: string; path: string; position: number }) => ({
          ...photo,
          url: urls.get(photo.path),
        })),
      },
      { headers },
    );
  } catch {
    return Response.json({ error: "Photos unavailable" }, { status: 503, headers });
  }
});
