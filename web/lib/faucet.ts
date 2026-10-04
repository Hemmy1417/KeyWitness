/**
 * Test GEN from Studio Next's own faucet (sim_fundAccount), so anyone can
 * try KeyWitness with nothing but a wallet. Studio networks only: every
 * amount here is test GEN with no value.
 */
import { rpc } from "./txresult";

export const FAUCET_AMOUNT_WEI = 10n * 10n ** 18n;

export async function requestTestGen(address: string): Promise<void> {
  await rpc("sim_fundAccount", [address, FAUCET_AMOUNT_WEI.toString()]);
}

export async function balanceOf(address: string): Promise<bigint> {
  return BigInt(String(await rpc("eth_getBalance", [address, "latest"])) || "0x0");
}
