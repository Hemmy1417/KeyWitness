/**
 * Readiness for monitors: is a contract configured, and does Studio Next
 * answer with the expected chain id. It reads nothing from the contract (the
 * per-IP read budget belongs to the people using the app) and holds no
 * secrets.
 */
import { CHAIN_ID, EXPLORER, NETWORK_NAME, RPC_URL } from "@/lib/chain";
import { CONTRACT_ADDRESS, CONTRACT_CONFIGURED, IS_RECORD } from "@/lib/config";

export const dynamic = "force-dynamic";

export async function GET() {
  const started = Date.now();
  let reachable = false;
  let chainId: number | null = null;
  try {
    const res = await fetch(RPC_URL, {
      method: "POST",
      headers: { "content-type": "application/json", "user-agent": "Mozilla/5.0 (KeyWitness health check)" },
      body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "eth_chainId", params: [] }),
      signal: AbortSignal.timeout(5000),
      cache: "no-store",
    });
    const body = (await res.json()) as { result?: string };
    chainId = body.result ? parseInt(body.result, 16) : null;
    reachable = res.ok && chainId !== null;
  } catch {
    reachable = false;
  }
  const ok = CONTRACT_CONFIGURED && reachable && chainId === CHAIN_ID;
  return Response.json({
    ok,
    service: "keywitness-web",
    network: { name: NETWORK_NAME, chain_id: CHAIN_ID, rpc: RPC_URL, explorer: EXPLORER },
    contract: { address: CONTRACT_CONFIGURED ? CONTRACT_ADDRESS : null, configured: CONTRACT_CONFIGURED, deployment_of_record: IS_RECORD },
    rpc: { reachable, chain_id: chainId, ms: Date.now() - started },
    checked_at: new Date().toISOString(),
  }, { status: ok ? 200 : 503, headers: { "cache-control": "no-store" } });
}
