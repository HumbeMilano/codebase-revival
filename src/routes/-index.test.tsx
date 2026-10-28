import { afterEach, describe, expect, it, vi } from "vitest";
import { isRedirect } from "@tanstack/react-router";
import { Route } from "./index";

const arrival = vi.hoisted(() => ({ recovery: false, token: null, error: false }));
vi.mock("@/integrations/supabase/client", () => ({ passwordRecoveryArrival: arrival }));
vi.mock("@/components/hub/HubApp", () => ({ HubApp: () => null }));

afterEach(() => {
  arrival.recovery = false;
  window.history.replaceState({}, "", "/");
});

async function redirectOptions() {
  try {
    await Route.options.beforeLoad!({} as never);
  } catch (error) {
    if (isRedirect(error)) return error.options;
    throw error;
  }
  throw new Error("Expected the recovery route to redirect");
}

describe("recovery at the household entry point", () => {
  it("preserves a live recovery fragment across the legacy document redirect", async () => {
    window.history.replaceState({}, "", "/#type=recovery&access_token=temporary");
    expect(await redirectOptions()).toMatchObject({
      to: "/reset-password",
      hash: "type=recovery&access_token=temporary",
      reloadDocument: true,
      replace: true,
    });
  });
  it("keeps recovery intent after Auth consumes the fragment without losing it to a reload", async () => {
    arrival.recovery = true;
    const redirect = await redirectOptions();
    expect(redirect).toMatchObject({ to: "/reset-password", replace: true });
    expect(redirect.reloadDocument).not.toBe(true);
  });
  it("allows ordinary login and invitation URLs through", async () => {
    window.history.replaceState({}, "", "/?invite=ABCDEF0123456789ABCDEF0123456789");
    expect(await Route.options.beforeLoad!({} as never)).toBeUndefined();
  });
});
