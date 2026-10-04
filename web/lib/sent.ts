/**
 * Transactions this browser sent for a case. A convenience only: the case's
 * real history is on chain (its event log) and on the explorer. Each entry
 * here is labelled as sent from this browser.
 */
import { useMemo, useSyncExternalStore } from "react";

export interface Sent {
  hash: string;
  method: string;
  at?: number;
}

const key = (cid: string) => `keywitness.sent.${cid}`;

export function sentFor(cid: string): Sent[] {
  try {
    const raw = window.localStorage.getItem(key(cid));
    const list = raw ? (JSON.parse(raw) as Sent[]) : [];
    return Array.isArray(list) ? list.filter((s) => typeof s?.hash === "string") : [];
  } catch {
    return [];
  }
}

export function rememberSent(cid: string, s: Sent): void {
  try {
    const list = sentFor(cid);
    if (list.some((x) => x.hash === s.hash)) return;
    window.localStorage.setItem(key(cid), JSON.stringify([...list, { ...s, at: Date.now() }].slice(-40)));
  } catch {
    /* no storage: nothing remembered */
  }
}

function subscribe(cb: () => void): () => void {
  window.addEventListener("storage", cb);
  window.addEventListener("keywitness:changed", cb);
  return () => {
    window.removeEventListener("storage", cb);
    window.removeEventListener("keywitness:changed", cb);
  };
}

function rawFor(cid: string): string {
  try {
    return window.localStorage.getItem(key(cid)) ?? "[]";
  } catch {
    return "[]";
  }
}

/** The transactions this browser sent for a case, read without a render the server cannot match. */
export function useSent(cid: string): Sent[] {
  const raw = useSyncExternalStore(subscribe, () => rawFor(cid), () => "[]");
  return useMemo(() => {
    try {
      const list = JSON.parse(raw) as Sent[];
      return Array.isArray(list) ? list.filter((x) => typeof x?.hash === "string") : [];
    } catch {
      return [];
    }
  }, [raw]);
}
