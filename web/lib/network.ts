import { studioDevnet } from "genlayer-js/chains";

/**
 * One network definition shared by the wallet, genlayer-js and the
 * Transaction Kit. Every consumer uses the same object, so an RPC override
 * can never produce transactions signed for another chain. Studio Next is
 * the environment genlayer-js calls studioDevnet (chain 61997); its
 * canonical RPC is studio-dev.genlayer.com, and studio-next.genlayer.com is
 * an alias of the same environment.
 */
const DEFAULT_RPC_URL = "https://studio-dev.genlayer.com/api";
const DEFAULT_CHAIN_ID = 61997;
const DEFAULT_CHAIN_NAME = "GenLayer Studio Next";

export interface NetworkOverrides {
  chainId?: string;
  rpcUrl?: string;
}

export function parseChainId(value: string | undefined): number {
  if (value === undefined || value.trim() === "") return DEFAULT_CHAIN_ID;
  const chainId = Number(value);
  if (!Number.isSafeInteger(chainId) || chainId <= 0) {
    throw new Error(`NEXT_PUBLIC_GENLAYER_CHAIN_ID must be a positive integer; received ${value}`);
  }
  return chainId;
}

export function createNetwork(overrides: NetworkOverrides = {}) {
  const chainId = parseChainId(overrides.chainId);
  const rpcUrl = overrides.rpcUrl?.trim() || DEFAULT_RPC_URL;
  const chain = {
    ...studioDevnet,
    id: chainId,
    name: DEFAULT_CHAIN_NAME,
    nativeCurrency: { name: "GEN", symbol: "GEN", decimals: 18 },
    rpcUrls: { default: { http: [rpcUrl] } },
  } satisfies typeof studioDevnet;
  return {
    chain,
    wallet: {
      chainId: `0x${chainId.toString(16).toUpperCase()}`,
      chainName: DEFAULT_CHAIN_NAME,
      nativeCurrency: chain.nativeCurrency,
      rpcUrls: [rpcUrl],
      blockExplorerUrls: [] as string[],
    },
  };
}

const network = createNetwork({
  chainId: process.env.NEXT_PUBLIC_GENLAYER_CHAIN_ID,
  rpcUrl: process.env.NEXT_PUBLIC_GENLAYER_RPC_URL,
});

export const GENLAYER_CHAIN = network.chain;
export const WALLET_NETWORK = network.wallet;
