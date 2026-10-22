import { describe, expect, it } from "vitest";
import { credentials, invitationCode, personalPreferences } from "./account-validation";

describe("personal accounts", () => {
  it("preserves and normalizes invitation codes without accepting URLs or invalid characters", () => {
    expect(invitationCode.parse(" abcd1234 ")).toBe("ABCD1234");
    expect(invitationCode.safeParse("https://bad.test").success).toBe(false);
  });
  it("allows only actual view and time preferences, never financial roles", () => {
    expect(personalPreferences.safeParse({ preferred_view: "mobile", time_format: "12" }).success).toBe(true);
    expect(personalPreferences.safeParse({ preferred_view: "admin", time_format: "24" }).success).toBe(false);
  });
  it("requires a real email and a valid password", () => {
    expect(credentials.safeParse({ email: "lucas", password: "123456" }).success).toBe(false);
    expect(credentials.safeParse({ email: "lucas@example.com", password: "12" }).success).toBe(false);
    expect(credentials.safeParse({ email: "lucas@example.com", password: "strong-password" }).success).toBe(true);
  });
});