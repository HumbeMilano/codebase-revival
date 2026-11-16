import { createClient } from "npm:@supabase/supabase-js@2.118.0";

const headers = {
  "Access-Control-Allow-Origin": "https://app.skendal.com",
  "Access-Control-Allow-Headers":
    "authorization, apikey, content-type, x-client-info, x-device-token",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Cache-Control": "no-store",
  "Content-Type": "application/json",
};
// The function authenticates accounts and revocable paired-tablet tokens itself.
// No caller-supplied path is signed; RLS selects the current household's metadata.
Deno.serve(async (request: Request) => {
  const respond = (body: unknown, status = 200) => Response.json(body, { status, headers });
  if (request.headers.get("origin") && request.headers.get("origin") !== "https://app.skendal.com")
    return respond({ error: "Origin denied" }, 403);
  if (request.method === "OPTIONS") return new Response(null, { headers });
  if (request.method !== "POST") return respond({ error: "Method not allowed" }, 405);
  try {
    const reader = request.body?.getReader();
    if (!reader) return respond({ error: "Recipe selection required" }, 400);
    let length = 0;
    const chunks: Uint8Array[] = [];
    for (;;) {
      const part = await reader.read();
      if (part.done) break;
      length += part.value.length;
      if (length > 8192) {
        await reader.cancel();
        return respond({ error: "Selection too large" }, 413);
      }
      chunks.push(part.value);
    }
    const bytes = new Uint8Array(length);
    let offset = 0;
    for (const chunk of chunks) {
      bytes.set(chunk, offset);
      offset += chunk.length;
    }
    let input: { recipe_ids?: unknown; covers?: unknown };
    try {
      input = JSON.parse(new TextDecoder().decode(bytes));
    } catch {
      return respond({ error: "Invalid selection" }, 400);
    }
    const ids = input?.recipe_ids;
    const covers = input?.covers === true;
    if (
      !Array.isArray(ids) ||
      !ids.length ||
      ids.length > 200 ||
      (!covers && ids.length !== 1) ||
      ids.some(
        (id) =>
          typeof id !== "string" ||
          !/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i.test(id),
      )
    )
      return respond({ error: "Invalid selection" }, 400);
    const authorization = request.headers.get("authorization"),
      device = request.headers.get("x-device-token");
    if (!authorization && !device) return respond({ error: "Authentication required" }, 401);
    const url = Deno.env.get("SUPABASE_URL")!;
    const scoped: Record<string, string> = {};
    if (authorization) scoped.Authorization = authorization;
    if (device) scoped["x-device-token"] = device;
    const client = createClient(url, Deno.env.get("SUPABASE_ANON_KEY")!, {
      auth: { persistSession: false, autoRefreshToken: false },
      global: { headers: scoped },
    });
    const context = await client.rpc("my_context");
    const household = context.data?.[0]?.household_id;
    if (context.error || !household) return respond({ error: "Household access denied" }, 403);
    const result = await client
      .from("recipe_photos")
      .select("id,recipe_id,path,position")
      .in("recipe_id", ids)
      .eq("household_id", household)
      .order("position")
      .order("created_at")
      .limit(800);
    if (result.error) throw result.error;
    const seen = new Set<string>();
    const photos = (result.data ?? []).filter((photo) => {
      if (covers && seen.has(photo.recipe_id)) return false;
      seen.add(photo.recipe_id);
      return true;
    });
    if (photos.some((p) => !p.path.startsWith(household + "/" + p.recipe_id + "/")))
      throw new Error("Invalid photo scope");
    const admin = createClient(url, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const signed = photos.length
      ? await admin.storage.from("recipe-photos").createSignedUrls(
          photos.map((p) => p.path),
          300,
        )
      : { data: [], error: null };
    if (signed.error) throw signed.error;
    const urls = new Map(
      (signed.data ?? [])
        .filter((p) => p.path && p.signedUrl && !p.error)
        .map((p) => [p.path, p.signedUrl]),
    );
    return respond({ photos: photos.map((p) => ({ ...p, url: urls.get(p.path) ?? null })) });
  } catch {
    return respond({ error: "Recipe photos unavailable" }, 503);
  }
});
