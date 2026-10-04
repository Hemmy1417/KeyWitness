"use client";

/**
 * One read of chain state, keyed. State is set only when the read answers
 * (never synchronously inside the effect), "loading" is derived from the
 * key, and `reload()` reads again bypassing the short cache. Every sheet
 * also reloads when any transaction in this tab finalizes.
 */
import { useCallback, useEffect, useEffectEvent, useRef, useState } from "react";

import { ReadError } from "./read";

/** Waits before reading again after a transient failure: 10 s, 20 s, 40 s, then every 60 s. */
export function retryDelay(attempt: number): number {
  return Math.min(60_000, 10_000 * 2 ** Math.max(0, attempt));
}

export interface ChainRead<T> {
  data: T | undefined;
  error: unknown;
  /** The last read failed for a transient reason and will be tried again. */
  retrying: boolean;
  loading: boolean;
  reload: () => void;
}

export function useChain<T>(key: string | null, fetcher: (fresh: boolean) => Promise<T>): ChainRead<T> {
  const [state, setState] = useState<{ key: string; tick: number; data?: T; error?: unknown }>({ key: "", tick: -1 });
  const [tick, setTick] = useState(0);
  const fresh = useRef(false);
  const run = useEffectEvent((f: boolean) => fetcher(f));

  useEffect(() => {
    if (key === null) return;
    let alive = true;
    const f = fresh.current;
    fresh.current = false;
    run(f).then(
      (data) => { if (alive) setState({ key, tick, data }); },
      (error: unknown) => { if (alive) setState({ key, tick, error }); },
    );
    return () => { alive = false; };
  }, [key, tick]);

  const reload = useCallback(() => {
    fresh.current = true;
    setTick((t) => t + 1);
  }, []);

  useEffect(() => {
    const h = () => reload();
    window.addEventListener("keywitness:changed", h);
    return () => window.removeEventListener("keywitness:changed", h);
  }, [reload]);

  // A transient failure (rate limit, a network drop) is not an answer: read
  // again on a growing delay rather than leaving the page on the failure.
  const attempts = useRef(0);
  const failed = key !== null && state.key === key ? state.error : undefined;
  const transient = failed instanceof ReadError ? failed.transient : failed !== undefined;
  useEffect(() => {
    if (!transient) {
      attempts.current = 0;
      return;
    }
    const timer = window.setTimeout(() => {
      attempts.current += 1;
      setTick((t) => t + 1);
    }, retryDelay(attempts.current));
    return () => window.clearTimeout(timer);
  }, [transient, failed]);

  const current = key !== null && state.key === key;
  return {
    data: current ? state.data : undefined,
    error: current ? state.error : undefined,
    retrying: current && transient,
    loading: key !== null && (!current || (state.data === undefined && state.error === undefined)),
    reload,
  };
}
