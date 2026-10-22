import { useCallback, useEffect, useRef, useState } from "react";
import type { SupabaseClient } from "@supabase/supabase-js";
import { z } from "zod";
import type { Database } from "@/integrations/supabase/types";

export const tourSteps = [
  "home",
  "chores",
  "shopping",
  "finance",
  "calendar",
  "notes",
  "household",
] as const;
export type TourStep = (typeof tourSteps)[number];
const stateSchema = z.object({
  version: z.literal(1),
  seen: z.array(z.enum(tourSteps)).max(7),
  dismissed: z.boolean(),
});
export type TourProgress = z.infer<typeof stateSchema>;
const empty: TourProgress = { version: 1, seen: [], dismissed: false };
export function mergeTourProgress(a: TourProgress, b: TourProgress): TourProgress {
  return {
    version: 1,
    seen: tourSteps.filter((step) => a.seen.includes(step) || b.seen.includes(step)),
    dismissed: a.dismissed || b.dismissed,
  };
}
function read(accountId: string): TourProgress | null {
  try {
    return stateSchema.parse(
      JSON.parse(localStorage.getItem(`homehub-tour:${accountId}`) ?? "null"),
    );
  } catch {
    return null;
  }
}
function storeProgress(accountId: string, state: TourProgress) {
  try {
    localStorage.setItem(`homehub-tour:${accountId}`, JSON.stringify(state));
  } catch {
    /* The server still stores progress when local storage is blocked. */
  }
}

/** The supplied client is bound to this account, including delayed offline writes. */
export function useGuidedTour(accountId: string | null, client: SupabaseClient<Database>) {
  const [progress, setProgress] = useState<TourProgress | null>(null);
  const state = useRef<TourProgress | null>(null);
  const flushRef = useRef<() => Promise<void>>(async () => {});
  const active = useRef(false);
  const restarting = useRef(false);
  const identity = useRef({ accountId, client });
  identity.current = { accountId, client };
  useEffect(() => {
    let live = true,
      revision = 0;
    let flight: Promise<void> | null = null;
    active.current = true;
    state.current = accountId ? read(accountId) : null;
    setProgress(state.current);
    const publish = (next: TourProgress) => {
      state.current = next;
      setProgress(next);
      if (accountId) storeProgress(accountId, next);
    };
    const flush = async (): Promise<void> => {
      if (!live || !accountId || !state.current || restarting.current || navigator.onLine === false)
        return;
      revision++;
      if (flight) return flight;
      flight = (async () => {
        let written = -1;
        while (live && state.current && written !== revision) {
          written = revision;
          const snapshot = state.current;
          try {
            const result = await client.rpc("save_onboarding_progress", {
              _seen: snapshot.seen,
              _dismissed: snapshot.dismissed,
            });
            if (result.error) return;
            const saved = stateSchema.safeParse(result.data);
            if (live && saved.success && state.current)
              publish(mergeTourProgress(state.current, saved.data));
          } catch {
            return; /* Local progress is retried after reconnecting. */
          }
        }
      })().finally(() => {
        flight = null;
      });
      return flight;
    };
    flushRef.current = flush;
    if (accountId)
      void (async () => {
        try {
          const result = await client
            .from("profiles")
            .select("onboarding_state")
            .eq("id", accountId)
            .single();
          if (result.error) return;
          const saved = stateSchema.parse(result.data.onboarding_state);
          if (!live) return;
          publish(mergeTourProgress(saved, state.current ?? empty));
          await flush();
        } catch {
          /* Do not interrupt the app if tour preferences cannot be loaded. */
        }
      })();
    const online = () => {
      void flush();
    };
    window.addEventListener("online", online);
    return () => {
      live = false;
      active.current = false;
      window.removeEventListener("online", online);
    };
  }, [accountId, client]);
  const update = useCallback(
    (step?: TourStep) => {
      if (!accountId || !active.current || !state.current || restarting.current) return;
      const next = mergeTourProgress(state.current, {
        ...empty,
        seen: step ? [step] : [],
        dismissed: !step,
      });
      state.current = next;
      storeProgress(accountId, next);
      setProgress(next);
      void flushRef.current();
    },
    [accountId],
  );
  const seen = useCallback((step: TourStep) => update(step), [update]);
  const dismiss = useCallback(() => update(), [update]);
  const restart = useCallback(async () => {
    if (!accountId || !active.current || restarting.current) return;
    await flushRef.current();
    restarting.current = true;
    try {
      const result = await client.rpc("save_onboarding_progress", { _restart: true });
      if (result.error) throw result.error;
      const next = stateSchema.parse(result.data);
      if (
        !active.current ||
        identity.current.accountId !== accountId ||
        identity.current.client !== client
      )
        return;
      state.current = next;
      storeProgress(accountId, next);
      setProgress(next);
    } finally {
      restarting.current = false;
    }
  }, [accountId, client]);
  return { progress, seen, dismiss, restart };
}
