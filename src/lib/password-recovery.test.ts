import { afterEach, describe, expect, it } from "vitest";
import type { Session } from "@supabase/supabase-js";
import {
  canResumePasswordRecovery,
  forgetPasswordRecovery,
  passwordRecoveryError,
  recoveryArrival,
  rememberPasswordRecovery,
} from "./password-recovery";

function session(id = "first", userId = "one", version = "one"): Session {
  const access_token = `header.${btoa(JSON.stringify({ session_id: id }))}.${version}`;
  return { access_token, user: { id: userId } } as Session;
}
afterEach(() => sessionStorage.clear());
describe("password recovery continuation", () => {
  it("captures recovery intent and errors before Auth removes the URL fragment", () => {
    expect(
      recoveryArrival(
        new URL("https://app.example/reset-password#type=recovery&access_token=temporary"),
      ),
    ).toEqual({ recovery: true, token: "temporary", error: false });
    expect(
      recoveryArrival(
        new URL("https://app.example/reset-password#error=access_denied&error_code=otp_expired"),
      ).error,
    ).toBe(true);
    expect(
      recoveryArrival(new URL("https://app.example/reset-password?error_code=otp_expired")).error,
    ).toBe(true);
    expect(
      recoveryArrival(new URL("https://app.example/#type=signup&access_token=unrelated")).token,
    ).toBeNull();
  });
  it("resumes only the verified account and original session, including token refresh", () => {
    const original = session();
    rememberPasswordRecovery(original, 1000);
    expect(canResumePasswordRecovery(original, 2000)).toBe(true);
    expect(canResumePasswordRecovery(session("first", "one", "refreshed"), 2000)).toBe(true);
    expect(canResumePasswordRecovery(session("second"), 2000)).toBe(false);
    expect(canResumePasswordRecovery(session("first", "two"), 2000)).toBe(false);
    expect(sessionStorage.getItem("skendal-password-recovery")).not.toContain(
      original.access_token,
    );
  });
  it("expires the continuation and clears it after completion or sign-out", () => {
    rememberPasswordRecovery(session(), 1000);
    expect(canResumePasswordRecovery(session(), 1000 + 3_600_000)).toBe(false);
    forgetPasswordRecovery();
    expect(canResumePasswordRecovery(session(), 2000)).toBe(false);
  });
  it("does not persist legacy bearer tokens in a continuation marker", () => {
    rememberPasswordRecovery({ access_token: "opaque-token", user: { id: "one" } } as Session);
    expect(sessionStorage.getItem("skendal-password-recovery")).toBeNull();
  });
  it("treats malformed or implausibly long markers as absent", () => {
    sessionStorage.setItem("skendal-password-recovery", "malformed");
    expect(canResumePasswordRecovery(session())).toBe(false);
    sessionStorage.setItem(
      "skendal-password-recovery",
      JSON.stringify({ key: "one:first", expiresAt: Date.now() + 7_200_000 }),
    );
    expect(canResumePasswordRecovery(session())).toBe(false);
  });
  it("provides actionable password, expiry and rate-limit messages", () => {
    expect(passwordRecoveryError({ code: "same_password" })).toContain("diferente");
    expect(passwordRecoveryError({ code: "weak_password" })).toContain("más segura");
    expect(passwordRecoveryError({ status: 429 })).toContain("Espera un minuto");
    expect(passwordRecoveryError({ code: "session_not_found" })).toContain("Solicita uno nuevo");
    expect(passwordRecoveryError(new Error("Failed to fetch"))).toContain("conexión");
  });
});
