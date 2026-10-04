"use client";

/**
 * The evidence on a case, exhibit by exhibit, grouped by who filed it. Every
 * claim a filer made about an item (what it shows, when it was taken, which
 * criteria it is for) is labelled as theirs. Images and texts are fetched
 * from the contract only when someone asks, and an image is shown with the
 * result of hashing the bytes the chain returned against the recorded digest.
 */
import { useState } from "react";

import { Fold, Icon, Loading, Machine, Note } from "@/components/bits";
import { useCase } from "./CaseFrame";
import {
  criterionName, DOC_LABEL, EVIDENCE_LABEL, exhibitName, local, plural, requirementLabel, reuseText, ROLE_LABEL, utc,
} from "@/lib/present";
import { getEvidenceText, getImage } from "@/lib/read";
import type { Evidence, Role, Terms } from "@/lib/types";

/** Required evidence still missing, counted exactly as the contract counts it. */
export function requiredStatus(t: Terms, evidence: Evidence[]): { type: string; min: number; have: number }[] {
  return t.required.map((r) => {
    const have = r.type.startsWith("DOC:")
      ? evidence.filter((e) => (e.kind === "DOCUMENT_PAGE" || e.kind === "TEXT_DOCUMENT") && e.doc_type === r.type.slice(4)).length
      : evidence.filter((e) => e.kind === r.type).length;
    return { type: r.type, min: r.min, have };
  });
}

export function Completeness() {
  const { t, evidence } = useCase();
  const rows = requiredStatus(t, evidence);
  if (!rows.length) {
    return <p className="t-small text-[var(--color-ink-2)]">The terms require no particular kind of evidence.</p>;
  }
  return (
    <ul className="flex flex-col gap-2">
      {rows.map((r) => {
        const met = r.have >= r.min;
        return (
          <li key={r.type} className="flex items-start gap-2 t-small">
            <span className={met ? "text-[var(--color-supported)]" : "text-[var(--color-uncertain)]"} aria-hidden="true">
              <Icon name={met ? "check" : "gap"} />
            </span>
            <span>
              {requirementLabel(r.type, r.min)}: {met ? "filed" : `${plural(r.min - r.have, "more needed", "more needed")}`}
              {met ? "." : ". Without it, no criterion can be established."}
            </span>
          </li>
        );
      })}
    </ul>
  );
}

function ImagePreview({ e }: { e: Evidence }) {
  const [shown, setShown] = useState<{ url: string; ok: boolean } | null>(null);
  const [state, setState] = useState<"" | "loading" | "failed">("");
  const load = () => {
    setState("loading");
    getImage(e.evidence_id).then(({ bytes, digest }) => {
      setShown({ url: URL.createObjectURL(new Blob([bytes as BlobPart], { type: e.media_type || "image/jpeg" })), ok: digest === e.sha256 });
      setState("");
    }, () => setState("failed"));
  };
  if (!shown) {
    return (
      <div className="flex flex-col gap-1">
        <button type="button" className="btn self-start" onClick={load} disabled={state === "loading"}>
          {state === "loading" ? "Reading the image from the chain..." : "Show the image as stored"}
        </button>
        {state === "failed" ? <p className="t-micro text-[var(--color-adverse)]">Studio Next did not return the image. Try again in a moment.</p> : null}
      </div>
    );
  }
  return (
    <figure className="flex flex-col gap-2">
      {/* eslint-disable-next-line @next/next/no-img-element -- bytes from the chain, shown as stored */}
      <img src={shown.url} alt={`${exhibitName(e.evidence_id)}, ${EVIDENCE_LABEL[e.kind].toLowerCase()} filed by the ${e.role.toLowerCase()}`}
        className="max-h-[420px] w-auto max-w-full self-start border border-[var(--color-rule)] bg-white" />
      <figcaption className={`t-micro flex items-center gap-1 ${shown.ok ? "text-[var(--color-supported)]" : "text-[var(--color-adverse)]"}`}>
        <Icon name={shown.ok ? "check" : "cross"} size={13} />
        {shown.ok ? "These bytes hash, in this browser, to the digest the contract recorded at filing."
          : "These bytes do not hash to the recorded digest. Do not rely on this image."}
      </figcaption>
    </figure>
  );
}

function TextPreview({ e }: { e: Evidence }) {
  const [text, setText] = useState<string | null>(null);
  const [state, setState] = useState<"" | "loading" | "failed">("");
  if (text === null) {
    return (
      <div className="flex flex-col gap-1">
        <button type="button" className="btn self-start" disabled={state === "loading"} onClick={() => {
          setState("loading");
          getEvidenceText(e.evidence_id).then((v) => { setText(v ?? ""); setState(""); }, () => setState("failed"));
        }}>{state === "loading" ? "Reading the text from the chain..." : "Show the text as filed"}</button>
        {state === "failed" ? <p className="t-micro text-[var(--color-adverse)]">Studio Next did not return the text. Try again in a moment.</p> : null}
      </div>
    );
  }
  return <pre className="inset whitespace-pre-wrap break-words p-4 t-small font-[inherit] max-h-[420px] overflow-auto">{text}</pre>;
}

export function ExhibitCard({ e, zone, all = [] }: { e: Evidence; zone: string; all?: Evidence[] }) {
  const image = e.kind !== "TEXT_DOCUMENT";
  const reuse = reuseText(e.reuse, e.first_filed_in, e.role);
  // The same bytes filed on this case by another role: one piece of evidence, counted as each filer's.
  const twins = all.filter((o) => o.sha256 === e.sha256 && o.evidence_id !== e.evidence_id);
  return (
    <article className="exhibit flex flex-col gap-3" aria-label={exhibitName(e.evidence_id)}>
      <header className="flex flex-wrap items-baseline justify-between gap-2">
        <h4 className="t-h3">{exhibitName(e.evidence_id)}</h4>
        <span className="t-small text-[var(--color-ink-2)]">
          {EVIDENCE_LABEL[e.kind]}{e.doc_type ? `: ${(DOC_LABEL[e.doc_type] ?? e.doc_type).toLowerCase()}` : ""}
          {e.kind === "VIDEO_FRAME" && e.frame_time ? `, ${e.frame_time} into the video` : ""}
        </span>
      </header>
      {e.title ? <p className="t-small font-semibold">{e.title}</p> : null}
      <p className="t-micro text-[var(--color-ink-3)]">
        Filed by the {ROLE_LABEL[e.role].toLowerCase()} {local(e.filed_at, zone)} ({utc(e.filed_at)}), the time the contract
        recorded{e.during_challenge ? ", during the challenge" : ""}.
      </p>
      <dl className="flex flex-col gap-2 t-small">
        <div>
          <dt className="inline font-semibold">Offered for: </dt>
          <dd className="inline">{e.criteria.length ? e.criteria.map(criterionName).join(", ") : "no criterion named by the filer"}</dd>
        </div>
        {e.description ? (
          <div>
            <dt className="inline font-semibold">The filer says it shows: </dt>
            <dd className="inline">{e.description}</dd>
          </div>
        ) : null}
        {e.declared_capture ? (
          <div>
            <dt className="inline font-semibold">{e.kind === "TEXT_DOCUMENT" ? "Date" : "Capture time"} the filer declared: </dt>
            <dd className="inline">{e.declared_capture}. This is the filer&apos;s claim; nothing verifies it.</dd>
          </div>
        ) : null}
        {e.redacted ? (
          <div>
            <dt className="inline font-semibold">Redacted before filing: </dt>
            <dd className="inline">{e.redaction_note || "the filer covered part of the image"}. The covered pixels never reached the chain.</dd>
          </div>
        ) : null}
      </dl>
      {reuse ? <Note tone="warn" title="Filed before">{reuse}</Note> : null}
      {twins.length ? (
        <Note title="Filed by both">
          These are the same bytes as {twins.map((o) => `${exhibitName(o.evidence_id)}, which the ${ROLE_LABEL[o.role].toLowerCase()} filed`).join(" and ")}.
          The validators are told they are one piece of evidence. Each copy counts as the item of the role that
          filed it, and a flag on one copy is not a flag on the other.
        </Note>
      ) : null}
      {image ? <ImagePreview e={e} /> : <TextPreview e={e} />}
      <Fold summary={`Verify ${exhibitName(e.evidence_id)}`}>
        <Machine label="Evidence id" value={e.evidence_id} />
        <Machine label={`sha256 of the stored ${image ? "bytes" : "text (UTF-8)"}`} value={e.sha256} />
        <Machine label="Size" value={`${e.bytes.toLocaleString("en-GB")} bytes${image ? `, ${e.media_type}` : ""}`} />
        <Machine label="File name as filed" value={e.file_name} />
        <Machine label="Filed by" value={e.filed_by} />
        {e.first_filed_in ? <Machine label="Same bytes first filed in" value={e.first_filed_in} /> : null}
        <p className="t-micro text-[var(--color-ink-3)] pt-2">
          The contract computed this digest itself from what it stores. A digest proves the stored bytes have not
          changed since filing; it does not prove who made them, when, or that they show what anyone says.
        </p>
      </Fold>
    </article>
  );
}

const ORDER: Role[] = ["CLAIMANT", "RESPONDENT", "INSPECTOR"];

export function Inventory() {
  const { t, evidence, evidenceLoading } = useCase();
  if (evidenceLoading && !evidence.length) return <Loading what="the evidence" />;
  if (!evidence.length) {
    return <p className="t-small text-[var(--color-ink-2)]">Nothing has been filed yet.</p>;
  }
  return (
    <div className="flex flex-col gap-10">
      {ORDER.filter((r) => evidence.some((e) => e.role === r)).map((r) => {
        const mine = evidence.filter((e) => e.role === r).sort((x, y) => x.seq - y.seq);
        return (
          <section key={r} className="flex flex-col gap-4" aria-label={`Filed by the ${ROLE_LABEL[r].toLowerCase()}`}>
            <h3 className="t-h3">Filed by the {ROLE_LABEL[r].toLowerCase()} <span className="t-small font-normal text-[var(--color-ink-3)]">({plural(mine.length, "exhibit")})</span></h3>
            {mine.map((e) => <ExhibitCard key={e.evidence_id} e={e} zone={t.time_zone} all={evidence} />)}
          </section>
        );
      })}
    </div>
  );
}
