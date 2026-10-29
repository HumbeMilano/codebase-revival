import { describe, expect, it } from "vitest";
import { isTransientContextError } from "./transient-context-error";

describe("temporary household verification failures", () => {
  it.each([500, 502, 503, 522, 525])(
    "recognizes server HTTP %s without relying on its body",
    (status) => {
      expect(isTransientContextError({ message: "Unavailable" }, status)).toBe(true);
    },
  );
  it.each([
    "Failed to fetch",
    "NetworkError",
    "network request failed",
    "Connection reset",
    "request timed out",
  ])("recognizes a transport failure: %s", (message) =>
    expect(isTransientContextError(new Error(message))).toBe(true),
  );
  it.each([401, 403, 404, 409])("does not hide HTTP %s behind transport wording", (status) => {
    expect(isTransientContextError({ message: "Failed to fetch" }, status)).toBe(false);
  });
  it.each([
    { code: "42501", message: "Permission denied" },
    { code: "PGRST301", message: "JWT expired" },
    { code: "session_not_found", message: "Session missing" },
    { message: "Household suspended" },
    { message: "Device revoked" },
    { message: "Invalid device token" },
  ])("prioritizes explicit denial over a server error: %j", (error) => {
    expect(isTransientContextError(error, 503)).toBe(false);
  });
  it("fails closed on unclassified validation and missing-session errors", () => {
    expect(isTransientContextError(new Error("Session missing"))).toBe(false);
    expect(isTransientContextError({ code: "23514", message: "Invalid context" })).toBe(false);
    expect(isTransientContextError(null)).toBe(false);
  });
});
