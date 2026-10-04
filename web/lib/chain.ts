/**
 * Studio Next, the one network KeyWitness speaks to, and the helpers every
 * page uses to name it. Nothing falls back to another network: a wallet on
 * any other chain is asked to switch before it can sign.
 */
import { GENLAYER_CHAIN, WALLET_NETWORK } from "./network";

export const STUDIO_NEXT = GENLAYER_CHAIN;
export const RPC_URL: string = GENLAYER_CHAIN.rpcUrls.default.http[0] ?? "https://studio-dev.genlayer.com/api";
export const CHAIN_ID = GENLAYER_CHAIN.id;
export const CHAIN_HEX = WALLET_NETWORK.chainId;
export const NETWORK_NAME = GENLAYER_CHAIN.name;
export { WALLET_NETWORK };

export const EXPLORER = process.env.NEXT_PUBLIC_GENLAYER_EXPLORER_URL?.trim() || "https://explorer-studio-dev.genlayer.com";
export const txUrl = (hash: string) => `${EXPLORER}/tx/${hash}`;
export const addressUrl = (addr: string) => `${EXPLORER}/address/${addr}`;

export function sameAddress(a: string | null | undefined, b: string | null | undefined): boolean {
  return !!a && !!b && a.toLowerCase() === b.toLowerCase();
}

/** A short form for verification views only; pages name people by role. */
export function shortAddress(addr: string): string {
  return addr.length > 12 ? `${addr.slice(0, 6)}...${addr.slice(-4)}` : addr;
}

/** Errors worth an automatic retry: rate limits, a saturated node, transport drops. */
export function isTransient(e: unknown): boolean {
  const text = String((e as Error)?.message ?? e ?? "").toLowerCase();
  return ["429", "-32029", "server busy", "retry later", "rate", "fetch failed", "econnreset", "network",
    "timeout", "502", "503"].some((s) => text.includes(s));
}
