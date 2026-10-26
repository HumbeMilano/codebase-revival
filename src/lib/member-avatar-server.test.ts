// @vitest-environment node
import { describe, expect, it, vi } from "vitest";
import { memberAvatarResponse } from "../../supabase/functions/member-avatars/handler";
const path = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa/photo.png";
function services() {
  return {
    context: vi.fn().mockResolvedValue({ data: [{ household_id: "home" }], error: null }),
    list: vi.fn().mockResolvedValue({ data: [{ member_key: "m_ana", path }], error: null }),
    sign: vi.fn().mockResolvedValue({
      data: [{ path, signedUrl: "https://private.invalid/avatar" }],
      error: null,
    }),
  };
}
const request = (headers: Record<string, string> = { "x-device-token": "fixture-device" }) =>
  new Request("https://project.invalid/member-avatars", {
    method: "POST",
    headers,
    body: JSON.stringify({ paths: ["another-user/secret.png"] }),
  });
describe("household avatar signing boundary", () => {
  it("checks household authorization before listing or signing anything", async () => {
    const s = services();
    expect((await memberAvatarResponse(request({}), s)).status).toBe(401);
    expect(
      (
        await memberAvatarResponse(
          request({ Origin: "https://other.invalid", Authorization: "Bearer fixture" }),
          s,
        )
      ).status,
    ).toBe(403);
    s.context.mockResolvedValue({ data: [], error: null });
    expect((await memberAvatarResponse(request(), s)).status).toBe(403);
    expect(s.list).not.toHaveBeenCalled();
    expect(s.sign).not.toHaveBeenCalled();
  });
  it("signs only RPC-authorized paths and never accepts paths from the request", async () => {
    const s = services();
    const response = await memberAvatarResponse(request(), s);
    expect(response.status).toBe(200);
    expect(response.headers.get("Cache-Control")).toBe("no-store");
    expect(s.sign).toHaveBeenCalledWith([path]);
    expect(await response.json()).toEqual({
      avatars: [{ member_key: "m_ana", path, url: "https://private.invalid/avatar" }],
    });
  });
  it("rejects invalid metadata and lets a missing image fall back without losing other avatars", async () => {
    const s = services();
    s.list.mockResolvedValueOnce({
      data: [{ member_key: "m_ana", path: "../secret.png" }],
      error: null,
    });
    expect((await memberAvatarResponse(request(), s)).status).toBe(503);
    expect(s.sign).not.toHaveBeenCalled();
    s.list.mockResolvedValue({
      data: [
        { member_key: "m_ana", path },
        { member_key: "m_other", path: path.replace("photo", "missing") },
      ],
      error: null,
    });
    const response = await memberAvatarResponse(request(), s);
    expect(((await response.json()) as { avatars: unknown[] }).avatars).toHaveLength(1);
  });
});
