import { describe, it, expect } from "vitest";
import { applicationContext, adminEntry, isAdminHost } from "./pwa-context";

describe("independent PWA origins", () => {
  it("recognizes only the administrative hostname", () => {
    expect(isAdminHost("admin.skendal.com")).toBe(true);
    for (const host of [
      "app.skendal.com",
      "admin.skendal.com.attacker.invalid",
      "skendal.com",
      "admin-skendal.com",
    ])
      expect(isAdminHost(host)).toBe(false);
  });
  it("keeps production and local origins distinct", () => {
    expect(applicationContext(new URL("https://app.skendal.com"))).toMatchObject({
      admin: false,
      adminOrigin: "https://admin.skendal.com",
      householdOrigin: "https://app.skendal.com",
    });
    expect(applicationContext(new URL("http://admin.localhost:8081"))).toMatchObject({
      admin: true,
      adminOrigin: "http://admin.localhost:8081",
      householdOrigin: "http://app.localhost:8081",
    });
  });
  it("drops authentication material rather than carrying it to the other PWA", () => {
    const target = adminEntry(
      new URL(
        "https://app.skendal.com/admin?access_token=untrusted&email=person%40example.invalid#access_token=temporary",
      ),
    );
    expect(target).toBe("https://admin.skendal.com/#");
    expect(adminEntry(new URL("https://app.skendal.com/admin?stripe=success&code=temporary"))).toBe(
      "https://admin.skendal.com/?stripe=success#",
    );
  });
});
