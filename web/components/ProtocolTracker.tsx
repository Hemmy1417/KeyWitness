"use client";

/**
 * After a write is decided, this follows it through GenLayer's own lifecycle
 * until it is final, from Studio Next's reports alone:
 *
 * - the STORED status (one of the 14 the consensus contracts define),
 * - the lifecycle read's next ACTION (Finalize is an action, never a status),
 * - the appeal window, counted down from the network's own timestamps,
 * - a real protocol appeal (getAppealCharge, then appealTransaction) while
 *   the decision is active, offered only for the writes where it matters.
 *
 * It calls a write finalized and recorded only when the transaction is
 * FINALIZED, its leader's execution succeeded and the validators agreed.
 */
import { createClient } from "genlayer-js";
import { useCallback, useEffect, useRef, useState } from "react";

import { Icon } from "./bits";
import { STUDIO_NEXT, txUrl } from "@/lib/chain";
import { gen, sentence } from "@/lib/present";
import { refusalOf, fetchTx, consensusAgreed } from "@/lib/txresult";
import {
  actionText, agreed, appealable, appealWindowEnds, consensusText, executionOk, finalizedAndRecorded, readProtocolStatus,
  STATUS_TEXT,
  type ProtocolStatus,
} from "@/lib/txstatus";
import { holdFastClock, useNow } from "@/lib/useNow";
import { useWallet } from "@/lib/wallet";

export type FinalOutcome = "recorded" | "no-majority" | "refused" | "canceled";

type AppealClient = {
  getAppealCharge(args: { txId: `0x${string}` }): Promise<bigint>;
  appealTransaction(args: { txId: `0x${string}`; value?: bigint }): Promise<unknown>;
};

export function ProtocolTracker({ hash, offerAppeal, onFinal }: {
  hash: string;
  /** Offer a protocol appeal for this transaction (assessments and readjudications). */
  offerAppeal?: boolean;
  onFinal?: (outcome: FinalOutcome, status: ProtocolStatus, refusal: string) => void;
}) {
  const w = useWallet();
  const now = useNow();
  const [status, setStatus] = useState<ProtocolStatus | null>(null);
  const [error, setError] = useState("");
  const [refusal, setRefusal] = useState("");
  const [charge, setCharge] = useState<bigint | null>(null);
  const [appeal, setAppeal] = useState<"" | "pricing" | "review" | "signing" | "sent" | "failed">("");
  const [appealError, setAppealError] = useState("");
  const fired = useRef(false);

  useEffect(() => holdFastClock(), []);

  const poll = useCallback(async () => {
    try {
      const s = await readProtocolStatus(hash);
      setStatus(s);
      setError("");
      return s;
    } catch (e) {
      setError(String((e as Error)?.message ?? e));
      return null;
    }
  }, [hash]);

  useEffect(() => {
    let alive = true;
    let timer = 0;
    const tick = async () => {
      const s = await poll();
      if (!alive) return;
      if (s && (s.stored === "FINALIZED" || s.stored === "CANCELED")) return;
      timer = window.setTimeout(tick, 2000);
    };
    void tick();
    return () => { alive = false; window.clearTimeout(timer); };
  }, [poll]);

  useEffect(() => {
    if (!status || fired.current) return;
    if (status.stored !== "FINALIZED" && status.stored !== "CANCELED") return;
    fired.current = true;
    if (status.stored === "CANCELED") {
      onFinal?.("canceled", status, "");
      return;
    }
    if (finalizedAndRecorded(status)) {
      window.dispatchEvent(new Event("keywitness:changed"));
      onFinal?.("recorded", status, "");
    } else if (executionOk(status) && !agreed(status)) {
      onFinal?.("no-majority", status, "");
    } else {
      void fetchTx(hash).then((tx) => {
        const text = refusalOf(tx);
        setRefusal(text);
        onFinal?.(consensusAgreed(tx.result_name) ? "refused" : "no-majority", status, text);
      }).catch(() => onFinal?.("refused", status, ""));
    }
  }, [status, hash, onFinal]);

  const client = (): AppealClient | null => {
    if (!w.provider || !w.address) return null;
    return createClient({ chain: { ...STUDIO_NEXT }, provider: w.provider, account: w.address as `0x${string}` } as
      Parameters<typeof createClient>[0]) as unknown as AppealClient;
  };

  const priceAppeal = async () => {
    const c = client();
    if (!c) { setAppealError("Connect a wallet on Studio Next to appeal."); return; }
    setAppeal("pricing");
    setAppealError("");
    try {
      setCharge(await c.getAppealCharge({ txId: hash as `0x${string}` }));
      setAppeal("review");
    } catch (e) {
      setAppeal("failed");
      setAppealError(String((e as Error)?.message ?? e).slice(0, 200));
    }
  };

  const sendAppeal = async () => {
    const c = client();
    if (!c || charge === null) return;
    setAppeal("signing");
    try {
      await c.appealTransaction({ txId: hash as `0x${string}`, value: charge });
      setAppeal("sent");
      void poll();
    } catch (e) {
      setAppeal("failed");
      setAppealError(String((e as Error)?.message ?? e).slice(0, 200));
    }
  };

  if (!status) {
    return <p className="t-small text-[var(--color-ink-3)]" role="status">{error ? `Reading the network: ${error}` : "Reading the network..."}</p>;
  }

  const ends = appealWindowEnds(status);
  const can = appealable(status, now);
  const left = ends && now ? Math.max(0, Math.round((ends - now) / 1000)) : null;
  const final = status.stored === "FINALIZED";

  return (
    <div className="flex flex-col gap-4" aria-live="polite">
      <dl className="grid gap-x-6 gap-y-2 sm:grid-cols-[180px_1fr]">
        <dt className="t-small text-[var(--color-ink-3)]">Protocol status</dt>
        <dd className="t-small">{STATUS_TEXT[status.stored]} <span className="t-mono text-[var(--color-ink-3)]">({status.stored})</span></dd>
        {status.lifecycleRead ? (
          <>
            <dt className="t-small text-[var(--color-ink-3)]">Next protocol action</dt>
            <dd className="t-small">{actionText(status.action)}</dd>
          </>
        ) : (
          <>
            <dt className="t-small text-[var(--color-ink-3)]">Lifecycle read</dt>
            <dd className="t-small">Not served by this network; only the stored status is shown.</dd>
          </>
        )}
        {status.consensus ? (
          <>
            <dt className="t-small text-[var(--color-ink-3)]">Consensus</dt>
            <dd className="t-small">{consensusText(status.consensus)}
              {status.validators ? `; ${status.validators} validators in the first round` : ""}{" "}
              <span className="t-mono text-[var(--color-ink-3)]">({status.consensus})</span></dd>
          </>
        ) : null}
        {status.rounds.length > 1 ? (
          <>
            <dt className="t-small text-[var(--color-ink-3)]">Rounds</dt>
            <dd className="t-small">{status.rounds.join(", then ")}</dd>
          </>
        ) : null}
      </dl>

      {!final && ends ? (
        <p className="t-small flex items-center gap-2">
          <Icon name="clock" />
          {left && left > 0 ? `Protocol appeal window: about ${left} seconds left` : "The protocol appeal window is closing"}
          <span className="text-[var(--color-ink-3)]">
            (Studio Next sets {status.windowSeconds} seconds; the network decides when it closes)
          </span>
        </p>
      ) : null}

      {offerAppeal && !final ? (
        <div className="folio p-4 flex flex-col gap-3">
          <p className="t-small font-semibold">Protocol appeal</p>
          <p className="t-small text-[var(--color-ink-2)]">
            Anyone may appeal this decision while its window is open. A fresh, larger committee of validators then
            rechecks it. The charge has two parts: a bond, which GenLayer returns two and a half times over if the
            appeal succeeds and pays to the validators if it fails, and the cost of the extra round, which is spent
            either way.
          </p>
          {can.ok ? (
            appeal === "" || appeal === "failed" ? (
              <button type="button" className="btn self-start" onClick={() => void priceAppeal()}>
                Price a {can.kind === "VALIDATOR" ? "validator" : "leader"} appeal
              </button>
            ) : appeal === "pricing" ? <p className="t-small">Reading the appeal charge from the network...</p>
              : appeal === "review" && charge !== null ? (
                <div className="flex flex-wrap items-center gap-3">
                  <span className="t-small">Charge: <span className="t-mono">{gen(charge)}</span></span>
                  <button type="button" className="btn btn-primary" onClick={() => void sendAppeal()}>Sign the appeal</button>
                  <button type="button" className="btn" onClick={() => setAppeal("")}>Cancel</button>
                </div>
              ) : appeal === "signing" ? <p className="t-small">Waiting for your wallet...</p>
                : appeal === "sent" ? <p className="t-small">Appeal submitted. The rounds above update as the committee votes.</p> : null
          ) : <p className="t-small text-[var(--color-ink-3)]">{can.why}</p>}
          {appealError ? <p className="t-micro text-[var(--color-adverse)]" role="alert">{appealError}</p> : null}
        </div>
      ) : null}

      {final ? (
        finalizedAndRecorded(status) ? (
          <p className="t-body font-semibold flex items-center gap-2"><Icon name="check" /> Finalized and recorded.</p>
        ) : executionOk(status) && !agreed(status) ? (
          <p className="t-small">
            <span className="font-semibold">Finalized, but the validators reached no majority.</span> Nothing it asked for
            was recorded and the case is unchanged. It can be sent again.
          </p>
        ) : (
          <p className="t-small"><span className="font-semibold">The contract refused it.</span>{" "}
            {refusal ? sentence(refusal) : "Reading the contract's reason..."}</p>
        )
      ) : null}
      <a className="link t-small inline-flex items-center gap-1 self-start" href={txUrl(hash)} target="_blank" rel="noreferrer">
        See this transaction on the explorer <Icon name="external" size={13} />
      </a>
    </div>
  );
}
