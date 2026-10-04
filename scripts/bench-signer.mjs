/**
 * A local signer for exercising the app's write path in a real browser without
 * putting a key in the browser. A stand-in wallet announced on the page
 * (EIP-6963) forwards eth_sendTransaction here; this signs with one of the
 * test wallets in .data/keys.json and broadcasts it. The app then follows the
 * transaction exactly as it would for any wallet.
 *
 *   node scripts/bench-signer.mjs            listens on http://127.0.0.1:3199
 *
 * It listens on the loopback address only, answers only the local app's
 * origin, signs only for the test wallets, and prints addresses and hashes,
 * never a key. Test network only: every wallet here holds test GEN.
 */
import { createServer } from "node:http";

import { createWalletClient, http } from "viem";
import { privateKeyToAccount } from "viem/accounts";

import { chain, loadKeys, RPC } from "./lib.mjs";

const PORT = Number(process.env.KW_BENCH_PORT ?? 3199);
const ORIGIN = process.env.KW_BENCH_ORIGIN ?? "http://localhost:3188";

const keys = loadKeys();
const wallets = Object.fromEntries(Object.entries(keys).map(([role, k]) => {
  const account = privateKeyToAccount(k.pk);
  return [account.address.toLowerCase(), { role, client: createWalletClient({ account, chain, transport: http(RPC) }) }];
}));

const big = (v) => (v === undefined || v === null ? undefined : BigInt(v));

const server = createServer(async (req, res) => {
  const cors = { "access-control-allow-origin": ORIGIN, "access-control-allow-headers": "content-type",
    "access-control-allow-methods": "GET,POST,OPTIONS", "content-type": "application/json" };
  const reply = (code, body) => { res.writeHead(code, cors); res.end(JSON.stringify(body)); };
  if (req.method === "OPTIONS") return reply(204, {});
  if (req.headers.origin && req.headers.origin !== ORIGIN) return reply(403, { error: "this signer answers the local app only" });
  if (req.method === "GET" && req.url === "/accounts") {
    return reply(200, Object.fromEntries(Object.values(wallets).map((w) => [w.role, w.client.account.address])));
  }
  if (req.method === "POST" && req.url === "/send") {
    let raw = "";
    for await (const chunk of req) raw += chunk;
    try {
      const tx = JSON.parse(raw);
      const wallet = wallets[String(tx.from ?? "").toLowerCase()];
      if (!wallet) return reply(400, { error: "not one of the test wallets" });
      const hash = await wallet.client.sendTransaction({
        to: tx.to, data: tx.data, value: big(tx.value) ?? 0n, gas: big(tx.gas), nonce: tx.nonce === undefined ? undefined : Number(tx.nonce),
        ...(tx.gasPrice !== undefined ? { gasPrice: big(tx.gasPrice) } : {}),
        ...(tx.maxFeePerGas !== undefined ? { maxFeePerGas: big(tx.maxFeePerGas), maxPriorityFeePerGas: big(tx.maxPriorityFeePerGas) } : {}),
      });
      console.log(`${wallet.role.padEnd(10)} signed ${hash} to ${tx.to} value ${big(tx.value) ?? 0n}`);
      return reply(200, { hash });
    } catch (e) {
      console.log(`refused: ${String(e?.shortMessage ?? e?.message ?? e).slice(0, 200)}`);
      return reply(500, { error: String(e?.shortMessage ?? e?.message ?? e).slice(0, 300) });
    }
  }
  return reply(404, { error: "not found" });
});

server.listen(PORT, "127.0.0.1", () => {
  console.log(`bench signer on http://127.0.0.1:${PORT} for ${ORIGIN}`);
  for (const w of Object.values(wallets)) console.log(`${w.role.padEnd(10)} ${w.client.account.address}`);
});
