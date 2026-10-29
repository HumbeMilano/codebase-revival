import { createHash } from "node:crypto";
import { expect, test, type Page, type Route } from "@playwright/test";

export const HOME_ID = "10000000-0000-4000-8000-000000000001";
export const USER_ID = "20000000-0000-4000-8000-000000000001";
const memberKey = "m_ana";
type Row = Record<string, unknown>;
type Change = {
  id: string;
  operation: "insert" | "update" | "delete";
  expected_revision: number | null;
  values: Row;
};
const user = {
  id: USER_ID,
  aud: "authenticated",
  role: "authenticated",
  email: "ana@example.invalid",
  email_confirmed_at: "2026-01-01T00:00:00Z",
  app_metadata: { provider: "email", providers: ["email"] },
  user_metadata: {},
  identities: [],
  created_at: "2026-01-01T00:00:00Z",
};
const encode = (value: unknown) => Buffer.from(JSON.stringify(value)).toString("base64url");
const token = `${encode({ alg: "HS256", typ: "JWT" })}.${encode({ sub: USER_ID, role: "authenticated", session_id: "homehub-e2e-session", exp: Math.floor(Date.now() / 1000) + 86_400 })}.test_signature`;
export function recoveryPath(path = "/reset-password") {
  return `${path}#${new URLSearchParams({ access_token: token, refresh_token: "e2e_refresh_token", expires_in: "86400", token_type: "bearer", type: "recovery" })}`;
}

/** A deterministic API double: all household records stay in test-runner memory.
 * This verifies the browser's Auth/HTTP/state boundaries, not production RLS.
 */
export class HouseholdBackend {
  rows: Record<string, Row[]> = Object.fromEntries(
    [
      "chores",
      "shopping_items",
      "shopping_lists",
      "events",
      "notes",
      "bills",
      "bill_splits",
      "bill_overrides",
      "contributions",
    ].map((table) => [table, []]),
  );
  constructor() {
    this.rows["shopping_lists"] = [
      {
        id: HOME_ID,
        household_id: HOME_ID,
        name: "Groceries",
        archived: false,
        position: 0,
        revision: 1,
      },
    ];
  }
  businessSettings: Row = {
    business_name: null,
    country: "US",
    currency: "USD",
    support_email: null,
    revision: 1,
  };
  businessPlans: Row[] = [
    {
      id: "free",
      name: "HomeHub",
      amount_cents: 0,
      annual_amount_cents: 0,
      currency: "USD",
      billing_interval: "none",
      revision: 1,
    },
    {
      id: "pro",
      name: "Family Pro",
      amount_cents: 299,
      annual_amount_cents: 599,
      currency: "USD",
      billing_interval: "month",
      revision: 1,
    },
  ];
  businessPayments: Row[] = [];
  businessAudit: Row[] = [];
  failNextSave = false;
  platformAdmin = false;
  failAdminAction = false;
  writeRequests = 0;
  financeActive = false;
  financialReadsWithoutGrant = 0;
  unexpectedRequests: string[] = [];
  shoppingReceipts = new Map<string, unknown>();
  photos: Row[] = [];
  photoCapacity = 30;
  photoObjects = new Map<string, Buffer>();
  avatarObjects = new Map<string, Buffer>();
  profile: Row = { id: USER_ID, avatar_path: null, preferred_view: "auto", time_format: "24" };
  avatarSigningRequests = 0;
  avatarDownloads = 0;
  photoUploadRequests = 0;
  loseNextPhotoRegistration = false;
  photoRegistrationRequests = 0;
  losePhotoRegistrationAt: number | null = null;
  recoveryRequests: { email: string; redirect: string | null }[] = [];
  hasHousehold = true;
  members = [
    { key: memberKey, name: "Ana", role: "admin" },
    { key: "m_nico", name: "Nico", role: "member" },
  ];
  setupRequests: { method: string; args: Row }[] = [];
  memberChanges: { method: string; args: Row }[] = [];
  pinConfigured = true;
  pinSetRequests: Row[] = [];
  passwordUpdates = 0;
  leaveRequests = 0;
  logoutRequests = 0;
  failNextPasswordUpdate = false;
  dashboardPreference: Row | null = null;
  dashboardSaveRequests = 0;
  loseNextDashboardResponse = false;
  dashboardDeviceReads = 0;
  pairings = new Map<
    string,
    {
      claimHash: string;
      approvalHash: string;
      approved: boolean;
      claimed: boolean;
      expiresAt: string;
    }
  >();

  async install(page: Page) {
    await page.route("**/api/weather", (route) =>
      route.fulfill({
        json: {
          temperature: 24.4,
          symbol: "partlycloudy_day",
          location: "Ciudad de prueba",
          updatedAt: new Date().toISOString(),
        },
      }),
    );
    await page.route("**/api/billing/status", (route) =>
      route.fulfill({
        json: {
          provider: "stripe",
          mode: "sandbox",
          key_configured: true,
          gateway_configured: true,
          live_payments: false,
        },
      }),
    );

    await page.route("**/api/tablet-pairing", async (route) => {
      const data = route.request().postDataJSON();
      const expiresAt = new Date(Date.now() + 300000).toISOString();
      this.pairings.set(data.id, {
        claimHash: data.claim_hash,
        approvalHash: data.approval_hash,
        approved: false,
        claimed: false,
        expiresAt,
      });
      await route.fulfill({ json: { id: data.id, name: data.name, expires_at: expiresAt } });
    });
    await page.route("**/auth/v1/**", (route) => this.auth(route));
    await page.route("**/rest/v1/**", (route) => this.data(route));
    await page.route("**/storage/v1/**", async (route) => {
      const request = route.request(),
        url = new URL(request.url());
      const avatar = "/object/personal-avatars/";
      if (request.method() === "POST" && url.pathname.includes(avatar)) {
        const path = decodeURIComponent(url.pathname.split(avatar)[1]!);
        const incoming = new Request(request.url(), {
          method: "POST",
          headers: request.headers(),
          body: new Uint8Array(request.postDataBuffer()!),
        });
        const form = await incoming.formData();
        const image = [...form.values()].find((value) => typeof value !== "string");
        if (!image || typeof image === "string") throw new Error("Avatar upload expected");
        this.avatarObjects.set(path, Buffer.from(await image.arrayBuffer()));
        return route.fulfill({
          json: { Id: crypto.randomUUID(), Key: `personal-avatars/${path}` },
        });
      }
      const signedAvatar = "/object/sign/personal-avatars/";
      if (url.pathname.includes(signedAvatar)) {
        const path = decodeURIComponent(url.pathname.split(signedAvatar)[1]!);
        if (request.method() === "POST")
          return route.fulfill({
            json: { signedURL: `/object/sign/personal-avatars/${path}?fixture=1` },
          });
        const image = this.avatarObjects.get(path);
        return image
          ? route.fulfill({ contentType: "image/png", body: image })
          : route.fulfill({ status: 404, body: "Missing avatar" });
      }
      if (request.method() === "DELETE" && url.pathname.endsWith("/object/personal-avatars")) {
        const paths = request.postDataJSON().prefixes as string[];
        for (const path of paths) this.avatarObjects.delete(path);
        return route.fulfill({ json: paths.map((name) => ({ name })) });
      }
      const marker = "/object/household-photos/";
      if (request.method() === "POST" && url.pathname.includes(marker)) {
        const path = decodeURIComponent(url.pathname.split(marker)[1]!);
        this.photoUploadRequests++;
        if (this.photoObjects.has(path))
          return route.fulfill({
            status: 409,
            json: { statusCode: "409", error: "Duplicate", message: "The resource already exists" },
          });
        const incoming = new Request(request.url(), {
          method: "POST",
          headers: request.headers(),
          body: new Uint8Array(request.postDataBuffer()!),
        });
        const form = await incoming.formData();
        const image = [...form.values()].find((value) => typeof value !== "string");
        if (!image || typeof image === "string") throw new Error("Expected uploaded photo");
        this.photoObjects.set(path, Buffer.from(await image.arrayBuffer()));
        return route.fulfill({
          json: { Id: crypto.randomUUID(), Key: `household-photos/${path}` },
        });
      }
      const info = "/object/info/household-photos/";
      if (request.method() === "GET" && url.pathname.includes(info)) {
        const path = decodeURIComponent(url.pathname.split(info)[1]!);
        return this.photoObjects.has(path)
          ? route.fulfill({
              json: { id: "stored-photo", name: path, metadata: { mimetype: "image/jpeg" } },
            })
          : route.fulfill({ status: 404, json: { message: "Not found" } });
      }
      if (request.method() === "DELETE" && url.pathname.endsWith("/object/household-photos")) {
        const paths = request.postDataJSON().prefixes as string[];
        for (const path of paths) this.photoObjects.delete(path);
        return route.fulfill({ json: paths.map((name) => ({ name })) });
      }
      return route.fulfill({ status: 404, json: { message: "No photo in this fixture" } });
    });
    await page.route("https://photos.fixture.invalid/uploaded/**", (route) => {
      const path = decodeURIComponent(
        new URL(route.request().url()).pathname.slice("/uploaded/".length),
      );
      const photo = this.photoObjects.get(path);
      return photo
        ? route.fulfill({ contentType: "image/jpeg", body: photo })
        : route.fulfill({ status: 404, body: "Not found" });
    });
    await page.route("**/functions/v1/household-photos", (route) =>
      route.fulfill({ json: { photos: this.photos } }),
    );
    await page.route("**/functions/v1/member-avatars", (route) => {
      this.avatarSigningRequests++;
      return route.fulfill({
        json: {
          avatars: this.avatarPaths().map((row) => ({
            ...row,
            url: `https://avatars.fixture.invalid/${encodeURIComponent(String(row.path))}`,
          })),
        },
      });
    });
    await page.route("https://avatars.fixture.invalid/**", (route) => {
      this.avatarDownloads++;
      const image = this.avatarObjects.get(
        decodeURIComponent(new URL(route.request().url()).pathname.slice(1)),
      );
      return image
        ? route.fulfill({ contentType: "image/png", body: image })
        : route.fulfill({ status: 404, body: "Missing avatar" });
    });
    await page.routeWebSocket(/\/realtime\/v1\//, (socket) => socket.close());
  }

  private async auth(route: Route) {
    const { pathname } = new URL(route.request().url());
    if (pathname.endsWith("/passkeys/authentication/options")) {
      return route.fulfill({
        json: {
          challenge_id: crypto.randomUUID(),
          options: {
            challenge: "Y2hhbGxlbmdl",
            rpId: "127.0.0.1",
            timeout: 60000,
            userVerification: "required",
          },
        },
      });
    }
    if (pathname.endsWith("/passkeys/authentication/verify")) {
      return route.fulfill({
        json: {
          access_token: token,
          token_type: "bearer",
          expires_in: 86400,
          refresh_token: "temporary_pairing_refresh",
          user,
        },
      });
    }
    if (pathname.endsWith("/passkeys"))
      return route.fulfill({
        json: [{ id: "fixture-passkey", created_at: "2026-01-01T00:00:00Z" }],
      });
    if (pathname.endsWith("/token")) {
      return route.fulfill({
        json: {
          access_token: token,
          token_type: "bearer",
          expires_in: 86_400,
          expires_at: Math.floor(Date.now() / 1000) + 86_400,
          refresh_token: "e2e_refresh_token",
          user,
        },
      });
    }
    if (pathname.endsWith("/recover")) {
      this.recoveryRequests.push({
        email: String(route.request().postDataJSON().email),
        redirect: new URL(route.request().url()).searchParams.get("redirect_to"),
      });
      return route.fulfill({ json: {} });
    }
    if (pathname.endsWith("/user")) {
      if (route.request().method() === "PUT") {
        this.passwordUpdates++;
        if (this.failNextPasswordUpdate) {
          this.failNextPasswordUpdate = false;
          return route.fulfill({
            status: 422,
            json: {
              code: "same_password",
              message: "New password should be different from the old password.",
            },
          });
        }
      }
      return route.fulfill({ json: user });
    }
    if (pathname.endsWith("/logout")) {
      this.logoutRequests++;
      return route.fulfill({ status: 204 });
    }
    this.unexpectedRequests.push(pathname);
    return route.fulfill({
      status: 400,
      json: { message: `Unexpected fixture auth request: ${pathname}` },
    });
  }

  private async data(route: Route) {
    const request = route.request();
    const url = new URL(request.url());
    const endpoint = url.pathname.split("/").at(-1) ?? "";
    if (url.pathname.includes("/rpc/")) {
      const args = (request.postDataJSON() ?? {}) as Row;
      const result = await this.rpc(endpoint, args, request.headers());
      return route.fulfill(result);
    }
    if (endpoint === "profiles") {
      if (request.method() === "PATCH") Object.assign(this.profile, request.postDataJSON());
      const profile = this.profile;
      return route.fulfill({
        json: request.headers()["accept"]?.includes("vnd.pgrst.object") ? profile : [profile],
      });
    }
    if (endpoint === "dashboard_preferences") {
      if (request.headers()["x-device-token"]) {
        this.dashboardDeviceReads++;
        return route.fulfill({ status: 403, json: { message: "Account required" } });
      }
      return route.fulfill({ json: this.dashboardPreference ? [this.dashboardPreference] : [] });
    }
    if (!(endpoint in this.rows)) {
      this.unexpectedRequests.push(url.pathname);
      return route.fulfill({
        status: 400,
        json: { message: `Unexpected fixture data request: ${endpoint}` },
      });
    }
    if (request.method() !== "GET") {
      this.unexpectedRequests.push(`${request.method()} ${endpoint}`);
      return route.fulfill({
        status: 400,
        json: { message: "Household writes must use transactional RPCs" },
      });
    }
    if (
      ["bills", "bill_splits", "bill_overrides", "contributions"].includes(endpoint) &&
      request.headers()["x-device-token"] &&
      (!this.financeActive || request.headers()["x-finance-token"] !== "fixture-finance-token")
    ) {
      this.financialReadsWithoutGrant++;
      return route.fulfill({ json: [], headers: { "Content-Range": "*/0" } });
    }
    let rows = [...(this.rows[endpoint] ?? [])];
    for (const [key, value] of url.searchParams) {
      if (value.startsWith("eq.")) rows = rows.filter((row) => String(row[key]) === value.slice(3));
      if (value.startsWith("in.(")) {
        const ids = value
          .slice(4, -1)
          .split(",")
          .map((id) => id.replaceAll('"', ""));
        rows = rows.filter((row) => ids.includes(String(row[key])));
      }
    }
    const total = rows.length;
    const offset = Number(url.searchParams.get("offset") ?? 0);
    const limit = Number(url.searchParams.get("limit") ?? 500);
    rows = rows.slice(offset, offset + limit);
    return route.fulfill({
      json: rows,
      headers: {
        "Content-Range": `${offset}-${Math.max(offset, offset + rows.length - 1)}/${total}`,
      },
    });
  }

  private avatarPaths() {
    return this.profile["avatar_path"]
      ? [{ member_key: "m_ana", path: this.profile["avatar_path"] }]
      : [];
  }

  private async rpc(
    name: string,
    args: Row,
    headers: Record<string, string>,
  ): Promise<{ status?: number; json?: unknown }> {
    const member = { key: memberKey, name: "Ana", role: "admin" };
    switch (name) {
      case "save_dashboard_layout": {
        this.dashboardSaveRequests++;
        if (headers["x-device-token"] || !headers["authorization"]?.startsWith("Bearer "))
          return { status: 403, json: { message: "Account required" } };
        const expected = Number(args["_expected_revision"]);
        const current = this.dashboardPreference;
        if (
          current &&
          current["revision"] === expected + 1 &&
          JSON.stringify(current["layout"]) === JSON.stringify(args["_layout"])
        )
          return { json: [current] };
        if ((current?.["revision"] ?? 0) !== expected)
          return {
            status: 409,
            json: { code: "40001", message: "Dashboard changed on another device" },
          };
        this.dashboardPreference = {
          user_id: USER_ID,
          layout: args["_layout"],
          revision: expected + 1,
          updated_at: new Date().toISOString(),
        };
        if (this.loseNextDashboardResponse) {
          this.loseNextDashboardResponse = false;
          return { status: 503, json: { message: "Response lost after commit" } };
        }
        return { json: [this.dashboardPreference] };
      }
      case "my_context":
        if (!this.hasHousehold) return { json: [] };
        return {
          json: [
            {
              household_id: HOME_ID,
              household_name: "Hogar de prueba",
              member_key: headers["x-device-token"] ? null : memberKey,
              mode: headers["x-device-token"] ? "device" : "account",
            },
          ],
        };
      case "household_members":
        return { json: this.members };
      case "leave_household":
        this.leaveRequests++;
        this.hasHousehold = false;
        return { status: 204 };
      case "my_pin_configured":
        return { json: this.pinConfigured };
      case "set_my_pin":
        if (args["_account"] !== USER_ID)
          return { status: 403, json: { message: "Account changed" } };
        this.pinSetRequests.push(args);
        this.pinConfigured = true;
        return { json: null };
      case "create_household":
      case "redeem_invite":
        this.pinConfigured = Boolean(args["_pin"]);
        this.setupRequests.push({ method: name, args });
        this.hasHousehold = true;
        return { json: HOME_ID };
      case "create_member": {
        this.memberChanges.push({ method: name, args });
        const created = {
          key: `m_${crypto.randomUUID()}`,
          name: String(args["_name"]),
          role: String(args["_role"]),
        };
        this.members.push(created);
        return { json: created.key };
      }
      case "update_member": {
        this.memberChanges.push({ method: name, args });
        const changed = this.members.find((member) => member.key === args["_key"]);
        if (!changed) return { status: 404, json: { message: "Member not found" } };
        changed.name = String(args["_name"]);
        changed.role = String(args["_role"]);
        return { json: null };
      }
      case "tablet_pairing_preview":
      case "tablet_pairing_status":
      case "approve_tablet_pairing":
      case "cancel_tablet_pairing":
      case "claim_tablet_pairing": {
        const request = this.pairings.get(String(args["_id"]));
        const approval = name === "tablet_pairing_preview" || name === "approve_tablet_pairing";
        const secret = String(args[approval ? "_approval_secret" : "_claim_secret"]);
        if (
          !request ||
          createHash("sha256").update(secret).digest("hex") !==
            request[approval ? "approvalHash" : "claimHash"]
        )
          return { status: 403, json: { message: "Invalid pairing request" } };
        if (name === "tablet_pairing_preview")
          return {
            json: {
              name: "Tablet del hogar",
              household_name: "Hogar de prueba",
              expires_at: request.expiresAt,
              status: request.approved ? "approved" : "pending",
              requires_pin_setup: !this.pinConfigured,
            },
          };
        if (name === "approve_tablet_pairing") {
          if (!this.pinConfigured)
            return { status: 403, json: { message: "Set your tablet PIN before pairing" } };
          request.approved = true;
          return { json: null };
        }
        if (name === "claim_tablet_pairing") {
          if (!request.approved) return { status: 403, json: { message: "Not approved" } };
          request.claimed = true;
          return { json: { token: "a".repeat(64), household_name: "Hogar de prueba" } };
        }
        if (name === "cancel_tablet_pairing") {
          request.expiresAt = new Date(0).toISOString();
          return { json: null };
        }
        return {
          json: {
            status:
              Date.parse(request.expiresAt) <= Date.now()
                ? "expired"
                : request.claimed
                  ? "claimed"
                  : request.approved
                    ? "approved"
                    : "pending",
            expires_at: request.expiresAt,
          },
        };
      }
      case "household_photo_capacity":
        return { json: this.photoCapacity };
      case "list_household_photos":
        return { json: this.photos.map(({ url, ...photo }) => photo) };
      case "household_avatar_paths":
        return { json: this.avatarPaths() };
      case "add_household_photo": {
        this.photoRegistrationRequests++;
        const path = String(args["_path"]);
        let photo = this.photos.find((photo) => photo["path"] === path);
        if (!photo) {
          if (this.photos.length >= this.photoCapacity)
            return {
              status: 400,
              json: { message: `At most ${this.photoCapacity} household photos` },
            };
          photo = {
            id: crypto.randomUUID(),
            path,
            position: this.photos.length,
            url: `https://photos.fixture.invalid/uploaded/${path}`,
          };
          this.photos.push(photo);
        }
        if (
          this.loseNextPhotoRegistration ||
          this.photoRegistrationRequests === this.losePhotoRegistrationAt
        ) {
          this.loseNextPhotoRegistration = false;
          return { status: 503, json: { message: "Response lost after commit" } };
        }
        return { json: photo["id"] };
      }
      case "remove_household_photo":
        this.photos = this.photos.filter((photo) => photo["id"] !== args["_id"]);
        return { json: null };
      case "reorder_household_photos":
        this.photos = (args["_ids"] as string[]).map((id, position) => ({
          ...this.photos.find((photo) => photo["id"] === id)!,
          position,
        }));
        return { json: null };
      case "list_member_accounts":
        return { json: [] };
      case "pin_lock_status":
        return { json: { locked: false, retry_after: 0 } };
      case "verify_pin":
        return {
          json:
            args["_pin"] === "1234"
              ? [member]
              : args["_pin"] === "5678" && !args["_admin_only"]
                ? [{ key: "m_nico", name: "Nico", role: "member" }]
                : [],
        };
      case "authorize_finances":
        this.financeActive = args["_pin"] === "1234";
        return { json: this.financeActive ? "fixture-finance-token" : null };
      case "revoke_finance_session":
        this.financeActive = false;
        return { json: null };
      case "admin_business_overview":
        return this.platformAdmin
          ? {
              json: {
                settings: this.businessSettings,
                plans: this.businessPlans,
                payments: this.businessPayments,
                audit: this.businessAudit,
                totals: [],
                unconfirmed_accounts: 0,
                recent_accounts: 1,
                automatic_billing: false,
                can_delegate: true,
              },
            }
          : { status: 403, json: { message: "Forbidden" } };
      case "admin_stripe_sandbox_status":
        return {
          json: {
            configured: false,
            account_id: null,
            webhook_id: null,
            mode: "sandbox",
            automatic_billing: false,
            events: [],
          },
        };
      case "admin_save_business_plan": {
        const value = args["_plan"] as Row;
        const old = this.businessPlans.find((plan) => plan["id"] === value["id"]);
        if (!old || old["revision"] !== args["_expected_revision"])
          return { status: 409, json: { code: "40001", message: "Plan changed" } };
        const saved = { ...value, revision: Number(old["revision"]) + 1 };
        this.businessPlans = this.businessPlans.map((plan) =>
          plan["id"] === value["id"] ? saved : plan,
        );
        return { json: saved };
      }
      case "admin_create_business_payment": {
        const saved: Row = {
          id: args["_id"],
          sequence: this.businessPayments.length + 1,
          household_id: args["_household"],
          household_label: "Hogar de prueba",
          amount_cents: args["_amount_cents"],
          currency: args["_currency"],
          status: "pending",
          source: "manual",
          reference: args["_reference"],
          note: args["_note"],
          created_at: new Date().toISOString(),
          revision: 1,
        };
        this.businessPayments.unshift(saved);
        return { json: saved };
      }
      case "admin_update_business_payment": {
        const old = this.businessPayments.find((payment) => payment["id"] === args["_id"]);
        if (!old || old["revision"] !== args["_expected_revision"])
          return { status: 409, json: { code: "40001", message: "Payment changed" } };
        const saved: Row = {
          ...old,
          status: args["_status"],
          reference: args["_reference"],
          revision: Number(old["revision"]) + 1,
        };
        this.businessPayments = this.businessPayments.map((payment) =>
          payment["id"] === saved["id"] ? saved : payment,
        );
        return { json: saved };
      }
      case "am_platform_admin":
        return { json: this.platformAdmin };
      case "admin_stats":
        return {
          json: [
            {
              households: 1,
              suspended: 0,
              pro: 0,
              accounts: 1,
              members: 2,
              devices: 0,
              new_households_30d: 1,
              new_accounts_30d: 1,
            },
          ],
        };
      case "admin_list_households":
        return {
          json: [
            {
              id: HOME_ID,
              name: "Hogar de prueba",
              plan: "free",
              suspended: false,
              members: 2,
              accounts: 1,
              devices: 0,
              created_at: "2026-01-01",
            },
          ],
        };
      case "admin_list_accounts":
        return {
          json: [
            {
              user_id: USER_ID,
              email: user.email,
              confirmed: true,
              household_name: "Hogar de prueba",
              is_admin: true,
              created_at: "2026-01-01",
              last_sign_in_at: "2026-01-01",
            },
          ],
        };
      case "admin_set_household":
        return this.failAdminAction
          ? { status: 503, json: { message: "Fixture action unavailable" } }
          : { json: null };
      case "list_devices":
      case "list_invites":
      case "list_email_invites":
        return { json: [] };
      case "sync_shopping_lists": {
        const id = String(args["_mutation_id"]);
        if (this.shoppingReceipts.has(id)) return { json: this.shoppingReceipts.get(id) };
        const lists = await this.rpc(
          "save_collection",
          { ...args, _table: "shopping_lists", _changes: args["_list_changes"] ?? [] },
          headers,
        );
        if (lists.status) return lists;
        const items = await this.rpc(
          "save_collection",
          { ...args, _table: "shopping_items" },
          headers,
        );
        if (items.status) return items;
        const saved = { items: items.json, lists: lists.json };
        this.shoppingReceipts.set(id, saved);
        return { json: saved };
      }
      case "sync_shopping": {
        const id = String(args["_mutation_id"]);
        if (this.shoppingReceipts.has(id)) return { json: this.shoppingReceipts.get(id) };
        const saved = await this.rpc(
          "save_collection",
          { ...args, _table: "shopping_items" },
          headers,
        );
        if (!saved.status) this.shoppingReceipts.set(id, saved.json);
        return saved;
      }
      case "save_collection": {
        this.writeRequests += 1;
        if (this.failNextSave) {
          this.failNextSave = false;
          return {
            status: 503,
            json: { message: "Simulated save failure", code: "FIXTURE_FAILURE" },
          };
        }
        const table = String(args["_table"]);
        const next = [...(this.rows[table] ?? [])];
        const changed: Row[] = [];
        for (const change of args["_changes"] as Change[]) {
          const index = next.findIndex((row) => row["id"] === change.id);
          if (
            change.operation !== "insert" &&
            (index < 0 || next[index]?.["revision"] !== change.expected_revision)
          )
            return { status: 409, json: { message: "REVISION_CONFLICT", code: "40001" } };
          if (change.operation === "delete") next.splice(index, 1);
          else {
            const row: Row = {
              ...(index >= 0 ? next[index] : {}),
              ...change.values,
              id: change.id,
              household_id: HOME_ID,
              revision: Number(index >= 0 ? next[index]?.["revision"] : 0) + 1,
            };
            if (table === "shopping_items") row["list_id"] ??= HOME_ID;
            if (table === "shopping_lists") {
              row["archived"] ??= false;
              row["position"] ??= next.length;
            }
            if (table === "chores")
              row["completed_at"] = row["done"]
                ? (next[index]?.["completed_at"] ?? new Date().toISOString())
                : null;
            if (index >= 0) next[index] = row;
            else next.push(row);
            changed.push(row);
          }
        }
        this.rows[table] = next;
        return { json: changed };
      }
      case "save_bill": {
        this.writeRequests += 1;
        const bill = args["_bill"] as Row;
        const previous = this.rows["bills"]!.find((row) => row["id"] === bill["id"]);
        const { splits, overrides, ...fields } = bill;
        const row: Row = {
          ...fields,
          household_id: HOME_ID,
          revision: Number(previous?.["revision"] ?? 0) + 1,
        };
        this.rows["bills"] = [
          ...this.rows["bills"]!.filter((item) => item["id"] !== row["id"]),
          row,
        ];
        this.rows["bill_splits"] = [
          ...this.rows["bill_splits"]!.filter((item) => item["bill_id"] !== row["id"]),
          ...(splits as Row[]).map((split) => ({
            ...split,
            id: crypto.randomUUID(),
            bill_id: row["id"],
          })),
        ];
        this.rows["bill_overrides"] = [
          ...this.rows["bill_overrides"]!.filter((item) => item["bill_id"] !== row["id"]),
          ...(overrides as Row[]).map((override) => ({ ...override, bill_id: row["id"] })),
        ];
        return { json: row };
      }
      case "delete_bill": {
        this.rows["bills"] = this.rows["bills"]!.filter((row) => row["id"] !== args["_id"]);
        return { json: null };
      }
      default:
        this.unexpectedRequests.push(`rpc/${name}`);
        return { status: 400, json: { message: `Unexpected fixture RPC: ${name}` } };
    }
  }
}

export async function signIn(page: Page) {
  await page.goto("/");
  await page.getByLabel("Correo", { exact: true }).fill("ana@example.invalid");
  await page.getByLabel("Contraseña", { exact: true }).fill("test-password");
  await page.locator("form").getByRole("button", { name: "Entrar", exact: true }).click();
  await expect(page.getByText("Hola, Ana", { exact: true }).first()).toBeVisible();
}

export function adminUrl(page: Page, path = "/") {
  const origin = page.url().startsWith("http")
    ? page.url()
    : String(test.info().project.use.baseURL ?? "http://127.0.0.1:8080");
  const url = new URL(path, origin);
  url.hostname = url.hostname.endsWith("skendal.com") ? "admin.skendal.com" : "admin.localhost";
  return url.href;
}

export async function adminSignIn(page: Page, allowed = true) {
  await page.goto(adminUrl(page));
  await page.getByLabel("Correo", { exact: true }).fill("ana@example.invalid");
  await page.getByLabel("Contraseña", { exact: true }).fill("test-password");
  await page.locator("form").getByRole("button", { name: "Entrar", exact: true }).click();
  await expect(
    allowed
      ? page.getByText("Skendal · Consola del negocio", { exact: true })
      : page.getByRole("heading", { name: "Sin acceso", exact: true }),
  ).toBeVisible();
}

/** The browser boundary is synthetic; Postgres tests separately enforce fresh
 * signed passkey claims. Real camera scanning and biometrics need physical devices. */
export async function mockTabletPasskey(page: Page) {
  await page.addInitScript(() => {
    Object.defineProperty(window, "PublicKeyCredential", { configurable: true, value: class {} });
    Object.defineProperty(navigator, "credentials", {
      configurable: true,
      value: {
        get: async () => ({
          id: "fixture-passkey",
          rawId: new Uint8Array([1, 2, 3]).buffer,
          type: "public-key",
          authenticatorAttachment: "cross-platform",
          response: {
            clientDataJSON: new Uint8Array([1]).buffer,
            authenticatorData: new Uint8Array([2]).buffer,
            signature: new Uint8Array([3]).buffer,
            userHandle: null,
          },
          getClientExtensionResults: () => ({}),
        }),
      },
    });
  });
}

export async function openTabletPin(page: Page) {
  await expect(page.getByTestId("tablet-lock-screen")).toBeVisible({ timeout: 30000 });
  const reveal = page.getByRole("button", { name: "Mostrar información", exact: true });
  if (await reveal.isVisible()) await reveal.click();
  await page.getByRole("button", { name: "Entrar con PIN", exact: true }).click();
}

export async function section(page: Page, label: string) {
  await expect(page.getByRole("navigation").first()).toBeVisible({ timeout: 30000 });
  let button = page.getByRole("button", { name: label, exact: true }).first();
  if (!(await button.isVisible())) {
    await page.getByRole("button", { name: "Más", exact: true }).click();
    button = page.getByRole("button", { name: label, exact: true }).first();
  }
  await button.click();
}

/** Exercise the visible QR flow with isolated phone/tablet storage. */
export async function pairTablet(
  page: Page,
  backend: HouseholdBackend,
  beforeApproval?: (phone: Page) => Promise<void>,
) {
  const browser = page.context().browser()!;
  const phoneContext = await browser.newContext({
    baseURL: String(test.info().project.use.baseURL ?? "http://127.0.0.1:8080"),
  });
  const phone = await phoneContext.newPage();
  try {
    await backend.install(phone);
    await mockTabletPasskey(phone);
    await signIn(phone);
    await page.addInitScript(() =>
      Object.defineProperty(navigator, "clipboard", {
        configurable: true,
        value: {
          writeText: async (value: string) => {
            (window as unknown as { copiedPairingLink: string }).copiedPairingLink = value;
          },
        },
      }),
    );
    await page.goto("/");
    await page.getByRole("button", { name: "Tablet", exact: true }).click();
    await expect(page.getByRole("img", { name: "QR para vincular esta tablet" })).toBeVisible();
    await page.getByRole("button", { name: "Copiar enlace para el teléfono", exact: true }).click();
    const link = await page.evaluate(
      () => (window as unknown as { copiedPairingLink: string }).copiedPairingLink,
    );
    expect(new URL(link).pathname).toBe("/vincular");
    expect(new URL(link).search).toBe("");
    await phone.goto(link);
    await expect(
      phone.getByRole("heading", { name: "¿Vincular esta tablet a Hogar de prueba?" }),
    ).toBeVisible({ timeout: 30_000 });
    if (beforeApproval) await beforeApproval(phone);
    await phone.getByRole("button", { name: "Vincular tablet", exact: true }).click();
    await expect(
      phone.getByRole("heading", { name: "Tablet autorizada", exact: true }),
    ).toBeVisible();
    await expect(page.getByTestId("tablet-lock-screen")).toBeVisible();
    expect(
      await phone.evaluate(() =>
        Object.keys(localStorage).some((key) => key.includes("auth-token")),
      ),
    ).toBe(true);
    expect(
      await page.evaluate(() =>
        Object.keys(localStorage).filter((key) => key.includes("auth-token")),
      ),
    ).toEqual([]);
    expect(backend.pairings.size).toBe(1);
  } finally {
    await phoneContext.close();
  }
}
export async function enterPin(page: Page, pin: string) {
  const group = page.getByRole("group", { name: "PIN de 4 números" });
  await group.focus();
  await group.press("Delete");
  await group.pressSequentially(pin);
}
