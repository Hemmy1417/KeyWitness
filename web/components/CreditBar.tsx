"use client";

/**
 * What the contract owes the connected wallet: a held sum, a returned or
 * forfeited bond, or value sent with a refused write. It waits in the ledger
 * and leaves only through the owner's own withdraw.
 */
import { Act } from "./Act";
import { gen } from "@/lib/present";
import { getCredit } from "@/lib/read";
import { useChain } from "@/lib/useChain";
import { useWallet } from "@/lib/wallet";
import { CONTRACT_CONFIGURED } from "@/lib/config";

export function CreditBar() {
  const w = useWallet();
  const credit = useChain(w.address && CONTRACT_CONFIGURED ? `credit.${w.address}` : null, () => getCredit(w.address));
  const owed = BigInt(credit.data?.owed ?? "0");
  if (!w.address || owed <= 0n) return null;
  return (
    <div className="inset hair-b">
      <div className="shell flex flex-wrap items-center justify-between gap-4 py-3">
        <p className="t-small"><span className="font-semibold">The contract holds {gen(owed)} for this wallet.</span>{" "}
          It is yours to withdraw.</p>
        <Act label="Withdraw it" method="withdraw" args={[]} can={{ ok: true, why: "" }} />
      </div>
    </div>
  );
}
