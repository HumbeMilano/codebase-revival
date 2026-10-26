import { createClient } from "npm:@supabase/supabase-js@2.118.0";
// No ordinary user can issue these capabilities. The management-only SQL job
// binds one synthetic identity and household before any provider test is run.
Deno.serve(async (request: Request) => {
  const json = (value: unknown, status = 200) =>
    Response.json(value, { status, headers: { "Cache-Control": "no-store" } });
  if (request.method !== "POST") return json({ error: "Method not allowed" }, 405);
  if (Number(request.headers.get("content-length") ?? 0) > 4096)
    return json({ error: "Body too large" }, 400);
  const token = request.headers.get("authorization")?.replace(/^Bearer /, "") ?? "";
  if (token.length < 40 || token.length > 200)
    return json({ error: "Test capability required" }, 403);
  const url = Deno.env.get("SUPABASE_URL")!;
  const options = { auth: { persistSession: false, autoRefreshToken: false } };
  const admin = createClient(url, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, options);
  const ordinary = createClient(url, Deno.env.get("SUPABASE_ANON_KEY")!, options);
  try {
    const reader = request.body?.getReader();
    if (!reader) return json({ error: "Body required" }, 400);
    const chunks: Uint8Array[] = [];
    let length = 0;
    for (;;) {
      const next = await reader.read();
      if (next.done) break;
      length += next.value.byteLength;
      if (length > 4096) {
        await reader.cancel();
        return json({ error: "Body too large" }, 400);
      }
      chunks.push(next.value);
    }
    const bytes = new Uint8Array(length);
    let offset = 0;
    for (const chunk of chunks) {
      bytes.set(chunk, offset);
      offset += chunk.length;
    }
    const raw = new TextDecoder("utf-8", { fatal: true }).decode(bytes);
    const body = JSON.parse(raw);
    if (body.action === "cleanup") {
      const { data: job, error } = await admin.rpc("cleanup_subscription_test_identity", {
        _job_id: body.job_id,
        _token: token,
      });
      if (error) return json({ error: "Cleanup denied" }, 403);
      if (job.user_id) {
        const { error: deletionError } = await admin.auth.admin.deleteUser(job.user_id);
        if (deletionError) throw deletionError;
      }
      const finished = await admin.rpc("finish_subscription_test_cleanup", {
        _job_id: body.job_id,
        _token: token,
      });
      if (finished.error) throw finished.error;
      return json({ deleted: true, job_id: job.id });
    }
    if (
      body.action !== "create" ||
      typeof body.password !== "string" ||
      body.password.length < 24 ||
      body.password.length > 120 ||
      !/^\d{4}$/.test(body.pin)
    )
      return json({ error: "Synthetic credentials required" }, 400);
    const { data: job, error } = await admin.rpc("claim_subscription_test_identity", {
      _token: token,
    });
    if (error) return json({ error: "Test job denied" }, 403);
    const created = await admin.auth.admin.createUser({
      email: job.email,
      password: body.password,
      email_confirm: true,
    });
    // A retry may reuse this exact capability/password; never reset any account.
    // A duplicate is accepted only if normal password sign-in for this exact
    // reserved address succeeds below. No existing password is ever changed.
    void created;
    const signed = await ordinary.auth.signInWithPassword({
      email: job.email,
      password: body.password,
    });
    if (signed.error || !signed.data.user) throw signed.error;
    if (job.user_id && job.user_id !== signed.data.user.id) throw new Error("Identity mismatch");
    const context = await ordinary.rpc("my_context");
    if (context.error) throw context.error;
    let household = context.data?.[0]?.household_id;
    if (!household) {
      const createdHousehold = await ordinary.rpc("create_household", {
        _name: `Skendal billing QA ${job.id}`,
        _member_name: "Billing QA",
        _pin: body.pin,
      });
      if (createdHousehold.error) throw createdHousehold.error;
      household = createdHousehold.data;
    }
    const bound = await admin.rpc("finish_subscription_test_identity", {
      _token: token,
      _user_id: signed.data.user.id,
      _household_id: household,
    });
    if (bound.error) throw bound.error;
    await ordinary.auth.signOut();
    return json({
      job_id: job.id,
      user_id: signed.data.user.id,
      household_id: household,
      email: job.email,
    });
  } catch {
    return json({ error: "Synthetic test identity operation failed" }, 503);
  }
});
