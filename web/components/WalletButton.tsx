"use client";

/**
 * Connect, switch network, get test GEN, disconnect. Wallets are discovered
 * through EIP-6963, so a browser with several wallets signs with the one the
 * person picks.
 */
import { useEffect, useRef, useState } from "react";

import { NETWORK_NAME, shortAddress } from "@/lib/chain";
import { requestTestGen } from "@/lib/faucet";
import { useWallet } from "@/lib/wallet";

export function WalletButton() {
  const w = useWallet();
  const [open, setOpen] = useState(false);
  const [funding, setFunding] = useState<"" | "asking" | "done" | "failed">("");
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const close = (e: MouseEvent) => { if (!ref.current?.contains(e.target as Node)) setOpen(false); };
    const esc = (e: KeyboardEvent) => { if (e.key === "Escape") setOpen(false); };
    document.addEventListener("mousedown", close);
    document.addEventListener("keydown", esc);
    return () => {
      document.removeEventListener("mousedown", close);
      document.removeEventListener("keydown", esc);
    };
  }, [open]);

  const fund = async () => {
    if (!w.address) return;
    setFunding("asking");
    try {
      await requestTestGen(w.address);
      setFunding("done");
      window.dispatchEvent(new Event("keywitness:changed"));
    } catch {
      setFunding("failed");
    }
  };

  const label = w.restoring ? "Restoring wallet..." : w.address ? (w.chainOk ? "Wallet connected" : "Wrong network") : "Connect wallet";
  return (
    <div className="relative" ref={ref}>
      <button type="button" className="btn" aria-haspopup="dialog" aria-expanded={open} onClick={() => setOpen((v) => !v)}>
        {w.address ? (
          <span aria-hidden className="inline-block h-2.5 w-2.5 rounded-full"
            style={{ background: w.chainOk ? "var(--color-supported-bright)" : "var(--color-uncertain-bright)" }} />
        ) : null}
        {label}
      </button>
      {open ? (
        <div role="dialog" aria-label="Wallet"
          className="folio absolute right-0 z-40 mt-2 flex w-80 max-w-[calc(100vw-40px)] flex-col gap-3 p-4">
          {w.address ? (
            <>
              <div>
                <p className="t-micro text-[var(--color-ink-3)]">Connected wallet</p>
                <p className="t-mono">{shortAddress(w.address)}</p>
              </div>
              {!w.chainOk ? (
                <button type="button" className="btn btn-primary" onClick={() => void w.switchNetwork()}>
                  Switch to {NETWORK_NAME}
                </button>
              ) : (
                <p className="t-small">On {NETWORK_NAME}. Every amount is test GEN.</p>
              )}
              <button type="button" className="btn" disabled={funding === "asking"} onClick={() => void fund()}>
                {funding === "asking" ? "Asking the faucet..." : "Get 10 test GEN"}
              </button>
              {funding === "done" ? <p className="t-micro">The faucet sent 10 test GEN. It can take a few seconds to show.</p> : null}
              {funding === "failed" ? (
                <p className="t-micro text-[var(--color-adverse)]">The faucet did not answer. Try again in a moment.</p>
              ) : null}
              <button type="button" className="btn btn-quiet self-start" onClick={() => { w.disconnect(); setOpen(false); }}>
                Disconnect
              </button>
            </>
          ) : (
            <>
              <p className="t-small">Choose a wallet. KeyWitness never holds keys; your wallet signs every write.</p>
              {w.wallets.length ? w.wallets.map((d) => (
                <button key={d.info.uuid} type="button" className="btn justify-start" disabled={w.connecting}
                  onClick={() => void w.connect(d).then(() => setOpen(false))}>
                  {/* eslint-disable-next-line @next/next/no-img-element -- the wallet's own data-URI icon (EIP-6963) */}
                  {d.info.icon ? <img src={d.info.icon} alt="" width={20} height={20} /> : null}
                  {d.info.name}
                </button>
              )) : (
                <p className="t-small text-[var(--color-ink-3)]">
                  No browser wallet found. Install one that supports EIP-6963, such as MetaMask or Rabby.
                </p>
              )}
            </>
          )}
          {w.error ? <p className="t-micro text-[var(--color-adverse)]" role="alert">{w.error}</p> : null}
        </div>
      ) : null}
    </div>
  );
}
