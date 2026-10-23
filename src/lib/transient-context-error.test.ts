import { describe, expect, it } from "vitest";
import { isTransientContextError } from "./transient-context-error";

describe("transient household context failures", () => {
  it("preserves a valid identity after temporary upstream errors", () => {
    expect(isTransientContextError({ httpStatus: 500, message: "Internal Server Error" })).toBe(
      true,
    );
    expect(isTransientContextError({ status: 522 })).toBe(true);
    expect(isTransientContextError({ status: 525 })).toBe(true);
    expect(isTransientContextError(new TypeError("Failed to fetch"))).toBe(true);
    expect(isTransientContextError({ message: "Network connection failed" })).toBe(true);
  });

  it("never preserves the identity after denied access or non-temporary errors", () => {
    expect(isTransientContextError({ httpStatus: 401, message: "Failed to fetch" })).toBe(false);
    expect(isTransientContextError({ status: 403 })).toBe(false);
    expect(isTransientContextError({ code: "42501", message: "Household suspended" })).toBe(false);
    expect(isTransientContextError({ code: "PGRST301" })).toBe(false);
    expect(isTransientContextError({ status: 400, message: "Invalid device" })).toBe(false);
    expect(isTransientContextError(null)).toBe(false);
  });
});
