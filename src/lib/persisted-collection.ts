import { useCallback, useRef, useState, type Dispatch, type SetStateAction } from "react";

export interface SyncGuard {
  revision: number;
  pending: number;
  queue: Promise<void>;
}

/** Evaluate updates once, outside React's replayable updater, and serialize writes. */
export function usePersistedCollection<T>(
  initial: T,
  sync: (prev: T, next: T) => Promise<void>,
  guard: SyncGuard,
  onError: () => void,
) {
  const [value, render] = useState(initial);
  const current = useRef(initial);
  const replace = useCallback((next: T) => {
    current.current = next;
    render(next);
  }, []);
  const update: Dispatch<SetStateAction<T>> = useCallback((action) => {
    const prev = current.current;
    const next = typeof action === "function" ? (action as (value: T) => T)(prev) : action;
    if (next === prev) return;
    guard.revision += 1;
    guard.pending += 1;
    replace(next);
    guard.queue = guard.queue
      .then(() => sync(prev, next))
      .catch(onError)
      .finally(() => { guard.pending -= 1; });
  }, [sync, guard, onError, replace]);
  return [value, update, replace] as const;
}