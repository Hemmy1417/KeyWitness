"use client";

/**
 * Settings and network status: which network and contract this build uses,
 * whether they answer, what the contract's own ledger says it holds against
 * its balance on chain, the protocol's appeal window, and the wallet. Every
 * value is read live; a missing setting is named, never papered over.
 */
import Link from "next/link";
import type { ReactNode } from "react";

import { Fold, Icon, Loading, Machine, Note, ReadFailure, Section } from "@/components/bits";
import { addressUrl, CHAIN_ID, EXPLORER, NETWORK_NAME, RPC_URL } from "@/lib/chain";
import { CONTRACT_ADDRESS, CONTRACT_CONFIGURED, IS_RECORD, RECORD_ADDRESS, REPO_URL, SOURCE_SHA256, SOURCE_URL } from "@/lib/config";
import { gen, plural } from "@/lib/present";
import { getConfig, getStats } from "@/lib/read";
import { rpc } from "@/lib/txresult";
import { finalityWindow } from "@/lib/txstatus";
import { useChain } from "@/lib/useChain";
import { useWallet } from "@/lib/wallet";

function Row({ ok, title, children }: { ok: boolean | null; title: string; children: ReactNode }) {
  const tone = ok === null ? "text-[var(--color-ink-3)]" : ok ? "text-[var(--color-supported)]" : "text-[var(--color-adverse)]";
  return (
    <li className="flex items-start gap-3">
      <span className={`mt-0.5 ${tone}`} aria-hidden="true"><Icon name={ok === null ? "dash" : ok ? "check" : "cross"} /></span>
      <span className="flex flex-col">
        <span className="t-small font-semibold">{title}</span>
        <span className="t-small text-[var(--color-ink-2)]">{children}</span>
      </span>
    </li>
  );
}

export default function StatusPage() {
  const w = useWallet();
  const chain = useChain("status.chainid", () => rpc("eth_chainId", []).then((v) => parseInt(String(v), 16)));
  const window_ = useChain("status.window", () => finalityWindow());
  const config = useChain(CONTRACT_CONFIGURED ? "status.config" : null, () => getConfig());
  const stats = useChain(CONTRACT_CONFIGURED ? "status.stats" : null, (fresh) => getStats(fresh));
  const balance = useChain(CONTRACT_CONFIGURED ? "status.balance" : null,
    () => rpc("eth_getBalance", [CONTRACT_ADDRESS, "latest"]).then((v) => BigInt(String(v) || "0x0")));

  const ledger = stats.data ? BigInt(stats.data.held_wei) + BigInt(stats.data.bonds_wei) + BigInt(stats.data.owed_wei) : null;
  const docs = (path: string) => `${REPO_URL}/blob/main/${path}`;

  return (
    <div className="shell flex flex-col gap-12 py-12">
      <header className="flex flex-col gap-2">
        <h1 className="t-h1">Network and contract</h1>
        <p className="t-body text-[var(--color-ink-2)] measure">
          What this build talks to, read live. KeyWitness has no server of its own: every read goes from this browser to
          Studio Next, and every write is signed by the wallet that makes it.
        </p>
      </header>

      {!CONTRACT_CONFIGURED ? (
        <Note tone="warn" title="No contract is configured for this build.">
          <p>Set NEXT_PUBLIC_KEYWITNESS_CONTRACT to a deployed KeyWitness address, or build from a checkout whose config names the deployment of record.</p>
        </Note>
      ) : !IS_RECORD ? (
        <Note tone="warn" title="This build points at a different deployment.">
          <p>NEXT_PUBLIC_KEYWITNESS_CONTRACT overrides {RECORD_ADDRESS ? "the deployment of record" : "an empty default"}. Everything you see is from the overriding address below.</p>
        </Note>
      ) : null}

      <div className="grid gap-10 lg:grid-cols-2">
        <Section title="Health">
          <ul className="flex flex-col gap-4">
            <Row ok={chain.data === undefined ? null : chain.data === CHAIN_ID} title={`${NETWORK_NAME} answers`}>
              {chain.data === undefined ? (chain.error ? "The RPC did not answer." : "Asking...")
                : chain.data === CHAIN_ID ? `Chain ${CHAIN_ID}, as expected.` : `It reports chain ${chain.data}, not ${CHAIN_ID}.`}
            </Row>
            <Row ok={!CONTRACT_CONFIGURED ? false : config.data ? true : config.error ? false : null} title="The contract answers">
              {!CONTRACT_CONFIGURED ? "No contract configured." : config.data ? `Rules ${config.data.rules}, receipts ${config.data.receipt_schema}.`
                : config.error ? "The contract did not answer a read." : "Asking..."}
            </Row>
            <Row ok={!CONTRACT_CONFIGURED ? false : ledger === null || balance.data === undefined ? null : ledger === balance.data} title="Every atto is accounted for">
              {!CONTRACT_CONFIGURED ? "No contract configured." : ledger === null || balance.data === undefined ? "Reading the ledger and the balance..."
                : ledger === balance.data ? `The contract holds ${gen(balance.data)}, exactly what its ledger owes or holds.`
                  : `The balance is ${gen(balance.data)} but the ledger accounts for ${gen(ledger)}.`}
            </Row>
            <Row ok={window_.data === undefined ? null : window_.data !== null} title="Protocol appeal window">
              {window_.data === undefined ? "Asking..." : window_.data ? `${plural(window_.data, "second")}, as Studio Next reports it.`
                : "This network does not report it; appeal eligibility then comes from the lifecycle read alone."}
            </Row>
            <Row ok={w.address ? w.chainOk : null} title="Your wallet">
              {!w.address ? "Not connected. Reading needs no wallet; signing does." : w.chainOk ? `Connected on ${NETWORK_NAME}.` : `Connected, but on another network. Switch to ${NETWORK_NAME} to sign.`}
            </Row>
          </ul>
        </Section>

        <Section title="On the contract">
          {stats.error && !stats.data ? <ReadFailure what="the contract's counters" error={stats.error} retrying={stats.retrying} />
            : !stats.data ? (CONTRACT_CONFIGURED ? <Loading what="the contract's counters" /> : <p className="t-small">Nothing to read.</p>) : (
              <dl className="grid grid-cols-2 gap-x-6 gap-y-3">
                <dt className="t-small text-[var(--color-ink-3)]">Cases opened</dt><dd className="t-small">{stats.data.case}</dd>
                <dt className="t-small text-[var(--color-ink-3)]">Exhibits filed</dt><dd className="t-small">{stats.data.evidence}</dd>
                <dt className="t-small text-[var(--color-ink-3)]">Decisions recorded</dt><dd className="t-small">{stats.data.decision}</dd>
                <dt className="t-small text-[var(--color-ink-3)]">Held sums in custody</dt><dd className="t-small">{gen(stats.data.held_wei)}</dd>
                <dt className="t-small text-[var(--color-ink-3)]">Challenge bonds posted</dt><dd className="t-small">{gen(stats.data.bonds_wei)}</dd>
                <dt className="t-small text-[var(--color-ink-3)]">Owed, waiting to be withdrawn</dt><dd className="t-small">{gen(stats.data.owed_wei)}</dd>
                <dt className="t-small text-[var(--color-ink-3)]">Paid out so far</dt><dd className="t-small">{gen(stats.data.paid_out_wei)}</dd>
              </dl>
            )}
          <p className="t-micro text-[var(--color-ink-3)]">The contract&apos;s own counters, read with get_stats. All amounts are test GEN.</p>
        </Section>
      </div>

      <Section title="Configuration">
        <Machine label="Network" value={`${NETWORK_NAME}, chain ${CHAIN_ID}`} />
        <Machine label="RPC" value={RPC_URL} />
        <Machine label="Explorer" value={EXPLORER} href={EXPLORER} />
        <Machine label={IS_RECORD ? "Contract (deployment of record)" : "Contract"} value={CONTRACT_ADDRESS}
          href={CONTRACT_CONFIGURED ? addressUrl(CONTRACT_ADDRESS) : undefined} />
        <Machine label="sha256 of the contract source the deployment of record runs" value={SOURCE_SHA256} href={SOURCE_SHA256 ? SOURCE_URL : undefined} />
        {config.data ? (
          <Fold summary="Limits the contract enforces">
            <pre className="t-mono whitespace-pre-wrap break-all">{JSON.stringify(config.data.limits, null, 2)}</pre>
          </Fold>
        ) : null}
        <p className="t-small text-[var(--color-ink-2)]">
          Machine-readable health for monitors: <Link className="link" href="/api/health">/api/health</Link>.
        </p>
      </Section>

      <Section title="Documentation">
        <ul className="grid gap-2 sm:grid-cols-2 t-small">
          <li><a className="link" href={docs("docs/ARCHITECTURE.md")}>Architecture</a></li>
          <li><a className="link" href={docs("docs/GENLAYER_INTEGRATION.md")}>How KeyWitness uses GenLayer</a></li>
          <li><a className="link" href={docs("docs/CONTRACT_SPEC.md")}>The contract, method by method</a></li>
          <li><a className="link" href={docs("docs/THREAT_MODEL.md")}>Threat model</a></li>
          <li><a className="link" href={docs("docs/PRIVACY_AND_DATA_RETENTION.md")}>Privacy and data retention</a></li>
          <li><a className="link" href={docs("SECURITY.md")}>Reporting a security problem</a></li>
        </ul>
      </Section>
    </div>
  );
}
