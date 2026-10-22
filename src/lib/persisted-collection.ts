import { useCallback, useEffect, useRef, useState, type SetStateAction } from "react";

export interface SyncGuard {
  revision: number;
  pending: number;
  queue: Promise<void>;
}

/** The result is false when the change was reverted or superseded. */
export type PersistedSetter<T> = (action: SetStateAction<T>) => Promise<boolean>;

export interface PersistenceStatus {
  pending: number;
  error: unknown;
  lastSavedAt: number | null;
}

/**
 * Keep the last acknowledged snapshot separately from optimistic edits. A failed
 * write rolls back and invalidates later edits based on that failed snapshot.
 * Callers can await the setter before dismissing an editor or announcing success.
 */
export function usePersistedCollection<T>(
  initial: T,
  sync: (prev: T, next: T) => Promise<T | void>,
  guard: SyncGuard,
  onError: (error: unknown) => void,
) {
  const [value, render] = useState(initial);
  const [status, setStatus] = useState<PersistenceStatus>({
    pending: 0,
    error: null,
    lastSavedAt: null,
  });
  const current = useRef(initial);
  const confirmed = useRef(initial);
  const generation = useRef(0);
  const mounted = useRef(true);

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      generation.current += 1;
    };
  }, []);

  const replace = useCallback((next: T) => {
    // A server refresh/session reset supersedes outstanding local work.
    generation.current += 1;
    current.current = next;
    confirmed.current = next;
    if (mounted.current) {
      render(next);
      setStatus((previous) => ({ ...previous, error: null }));
    }
  }, []);

  const update: PersistedSetter<T> = useCallback(
    (action) => {
      const prev = current.current;
      const next = typeof action === "function" ? (action as (value: T) => T)(prev) : action;
      if (next === prev) return Promise.resolve(true);
      const version = generation.current;
      guard.revision += 1;
      guard.pending += 1;
      current.current = next;
      if (mounted.current) {
        render(next);
        setStatus((previous) => ({ ...previous, pending: previous.pending + 1, error: null }));
      }

      const operation = guard.queue
        .then(async () => {
          if (!mounted.current || generation.current !== version) return false;
          try {
            const saved = await sync(prev, next);
            if (!mounted.current || generation.current !== version) return false;
            confirmed.current = saved === undefined ? next : saved;
            // Preserve edits queued while this request was running.
            if (current.current === next) {
              current.current = confirmed.current;
              render(confirmed.current);
            }
            setStatus((previous) => ({ ...previous, lastSavedAt: Date.now() }));
            return true;
          } catch (error) {
            if (generation.current === version) {
              generation.current += 1;
              guard.revision += 1;
              current.current = confirmed.current;
              if (mounted.current) {
                render(confirmed.current);
                setStatus((previous) => ({ ...previous, error }));
                onError(error);
              }
            }
            return false;
          }
        })
        .finally(() => {
          guard.pending -= 1;
          if (mounted.current)
            setStatus((previous) => ({ ...previous, pending: Math.max(0, previous.pending - 1) }));
        });
      // A failed operation cannot poison the queue for independent collections.
      guard.queue = operation.then(() => {});
      return operation;
    },
    [sync, guard, onError],
  );

  return [value, update, replace, status] as const;
}
