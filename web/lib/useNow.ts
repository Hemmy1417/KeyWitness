"use client";

/**
 * One clock for every page, read through React's external-store hook so
 * rendering stays pure. It ticks every second while a countdown is on screen
 * and every fifteen seconds otherwise; the server renders with no clock.
 */
import { useSyncExternalStore } from "react";

let current = Date.now();
const listeners = new Set<() => void>();
let timer: ReturnType<typeof setInterval> | null = null;
let fast = 0;

function restart(): void {
  if (timer) clearInterval(timer);
  timer = setInterval(() => {
    current = Date.now();
    for (const l of listeners) l();
  }, fast > 0 ? 1_000 : 15_000);
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  if (!timer) {
    current = Date.now();
    restart();
  }
  return () => {
    listeners.delete(listener);
    if (listeners.size === 0 && timer) {
      clearInterval(timer);
      timer = null;
    }
  };
}

export function useNow(): number {
  return useSyncExternalStore(subscribe, () => current, () => 0);
}

/** Ask for one-second ticks while a countdown is mounted. */
export function holdFastClock(): () => void {
  fast += 1;
  restart();
  return () => {
    fast = Math.max(0, fast - 1);
    if (timer) restart();
  };
}
