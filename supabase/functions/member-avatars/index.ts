import { createClient } from "npm:@supabase/supabase-js@2.118.0";
import { memberAvatarResponse } from "./handler.ts";

Deno.serve((request: Request) => {
  const url = Deno.env.get("SUPABASE_URL")!;
  const scopedHeaders: Record<string, string> = {};
  for (const name of ["authorization", "x-device-token"]) {
    const value = request.headers.get(name);
    if (value) scopedHeaders[name] = value;
  }
  const client = createClient(url, Deno.env.get("SUPABASE_ANON_KEY")!, {
    auth: { persistSession: false, autoRefreshToken: false },
    global: { headers: scopedHeaders },
  });
  return memberAvatarResponse(request, {
    context: () => client.rpc("my_context"),
    list: () => client.rpc("household_avatar_paths"),
    sign: (paths) =>
      createClient(url, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, {
        auth: { persistSession: false, autoRefreshToken: false },
      })
        .storage.from("personal-avatars")
        .createSignedUrls(paths, 300),
  });
});
