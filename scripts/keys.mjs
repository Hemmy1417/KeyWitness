/**
 * Test wallets for the scripts, one per role. Creates .data/keys.json (gitignored)
 * with a fresh key for any role it lacks, then tops each account up from the
 * Studio Next faucet. Only addresses are printed, never a key.
 *
 *   node scripts/keys.mjs
 */
import { createAccount, generatePrivateKey } from "genlayer-js";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import { GEN, KEYS_PATH, rpc, sleep } from "./lib.mjs";

const ROLES = ["OPERATOR", "CLAIMANT", "RESPONDENT", "INSPECTOR", "STRANGER", "SECOND"];
const TARGET = 30n * GEN;

const keys = existsSync(KEYS_PATH) ? JSON.parse(readFileSync(KEYS_PATH, "utf-8")) : {};
let changed = false;
for (const role of ROLES) {
  if (!keys[role]) {
    const pk = generatePrivateKey();
    keys[role] = { pk, addr: createAccount(pk).address };
    changed = true;
  }
}
if (changed) {
  mkdirSync(dirname(KEYS_PATH), { recursive: true });
  writeFileSync(KEYS_PATH, JSON.stringify(keys, null, 2));
  console.log(`wrote ${KEYS_PATH}`);
}

const balance = async (addr) => BigInt((await rpc("eth_getBalance", [addr, "latest"])).result ?? "0x0");

for (const role of ROLES) {
  const addr = createAccount(keys[role].pk).address;
  let have = await balance(addr);
  if (have < TARGET) {
    // The faucet counts in atto and credits the checksummed spelling.
    const r = await rpc("sim_fundAccount", [addr, (TARGET - have).toString()]);
    if (r.error) throw new Error(`${role}: the faucet refused (${r.error.message})`);
    for (let i = 0; i < 15 && have < TARGET; i++) {
      await sleep(2000);
      have = await balance(addr);
    }
  }
  console.log(`${role.padEnd(10)} ${addr}  ${Number(have / 10n ** 14n) / 10000} GEN`);
}
