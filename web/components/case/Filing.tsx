"use client";

/**
 * Filing evidence. Everything is prepared in this browser before anything
 * is signed: images are decoded and redrawn (camera metadata never leaves
 * the device), redaction boxes are painted over the pixels, the digest of
 * the exact bytes to be filed is shown, and an exact copy of an exhibit
 * already on the case is caught before the contract refuses it. Each item
 * is its own transaction with its own progress, so one failure never hides
 * the others.
 */
import { useRef, useState, type PointerEvent as ReactPointerEvent } from "react";

import { Act } from "@/components/Act";
import type { FlowResult } from "@/components/TxFlow";
import { Field, Icon, Note } from "@/components/bits";
import { useCase } from "./CaseFrame";
import { CAPS, CHALLENGE_CAPS, type Can } from "@/lib/acts";
import { sha256Hex } from "@/lib/hash";
import {
  clampBox, encodeSource, privacyWarnings, sourceFromFile, sourceFromVideo, type Box, type ImageSource, type PreparedImage,
} from "@/lib/images";
import { criterionName, DOC_LABEL, EVIDENCE_LABEL, exhibitName, plural, ROLE_LABEL } from "@/lib/present";
import type { EvidenceKind } from "@/lib/types";

type ImageKind = "PHOTO" | "VIDEO_FRAME" | "DOCUMENT_PAGE";

const KIND_HELP: Record<EvidenceKind, string> = {
  PHOTO: "Photographs of the property. Pick one or several; each is filed as its own exhibit.",
  VIDEO_FRAME: "Pick a video, move to the moment that matters and keep that still. The video itself never leaves this browser.",
  DOCUMENT_PAGE: "Photographed or scanned pages of a report, an invoice or a message. Say what kind of document each is.",
  TEXT_DOCUMENT: "Type or paste the text of a report, a statement or a message thread.",
};

const ACK_TEXT = "I understand that what I file, and every word I add, becomes public and permanent on Studio Next.";

let counter = 0;
const nextKey = () => `draft-${(counter += 1)}`;

interface Draft {
  key: string;
  kind: ImageKind;
  src: ImageSource;
  boxes: Box[];
  prepared: PreparedImage | null;
  digest: string;
  busy: boolean;
  error: string;
  description: string;
  declared: string;
  criteria: string[];
  docType: string;
  redactionNote: string;
  /** The name published with the exhibit: the file's own name until the filer changes it. */
  fileName: string;
  filed: string;
}

function Remaining() {
  const { c, a } = useCase();
  if (!a.role) return null;
  const n = c.counts[a.role] ?? { img: 0, doc: 0, cimg: 0, cdoc: 0 };
  const challenge = c.state === "UNDER_CHALLENGE";
  const [ci, cd] = challenge ? CHALLENGE_CAPS : CAPS[a.role];
  const img = Math.max(0, ci - (challenge ? n.cimg : n.img));
  const doc = Math.max(0, cd - (challenge ? n.cdoc : n.doc));
  return (
    <p className="t-small text-[var(--color-ink-2)]">
      You can file {plural(img, "more image")} and {plural(doc, "more document")}
      {challenge ? " during this challenge" : " while evidence is open"}.
    </p>
  );
}

function Criteria({ value, onChange }: { value: string[]; onChange: (v: string[]) => void }) {
  const { t } = useCase();
  return (
    <fieldset className="flex flex-col gap-1.5">
      <legend className="t-small font-semibold">Which criteria is it offered for?</legend>
      {t.criteria.map((x) => (
        <label key={x.id} className="flex items-start gap-2 t-small">
          <input type="checkbox" className="mt-1" checked={value.includes(x.id)}
            onChange={(e) => onChange(e.target.checked ? [...value, x.id] : value.filter((y) => y !== x.id))} />
          <span><span className="font-semibold">{criterionName(x.id)}.</span> {x.text}</span>
        </label>
      ))}
      <span className="t-micro text-[var(--color-ink-3)]">Your mapping is a claim; the validators judge each criterion on all the evidence.</span>
    </fieldset>
  );
}

function Warnings({ texts }: { texts: string[] }) {
  const found = [...new Set(texts.flatMap((x) => privacyWarnings(x)))];
  if (!found.length) return null;
  return (
    <Note tone="warn" title="Check before filing">
      <p>This looks like it contains {found.join(", ")}. Everything filed is public and permanent; remove it unless the case needs it.</p>
    </Note>
  );
}

/** Drag across the image to cover an area; the boxes are painted into the pixels before filing. */
function Redactor({ draft, locked, onBoxes }: { draft: Draft; locked: boolean; onBoxes: (boxes: Box[]) => void }) {
  const area = useRef<HTMLDivElement>(null);
  const [start, setStart] = useState<{ x: number; y: number } | null>(null);
  const [live, setLive] = useState<Box | null>(null);
  const at = (e: ReactPointerEvent) => {
    const r = area.current?.getBoundingClientRect();
    if (!r) return { x: 0, y: 0 };
    return { x: (e.clientX - r.left) / r.width, y: (e.clientY - r.top) / r.height };
  };
  if (!draft.prepared) return null;
  return (
    <div className="flex flex-col gap-2">
      <div ref={area} className={`relative self-start touch-none select-none border border-[var(--color-rule)] bg-white ${locked ? "" : "cursor-crosshair"}`}
        onPointerDown={(e) => { if (locked) return; (e.target as Element).setPointerCapture?.(e.pointerId); setStart(at(e)); setLive(null); }}
        onPointerMove={(e) => { if (start) { const p = at(e); setLive(clampBox({ x: start.x, y: start.y, w: p.x - start.x, h: p.y - start.y })); } }}
        onPointerUp={() => {
          if (!locked && live && live.w > 0.01 && live.h > 0.01) onBoxes([...draft.boxes, live]);
          setStart(null);
          setLive(null);
        }}>
        {/* eslint-disable-next-line @next/next/no-img-element -- the exact bytes about to be filed */}
        <img src={draft.prepared.preview} alt="The image as it will be filed" draggable={false}
          className="block max-h-[420px] w-auto max-w-full" />
        {live ? (
          <span aria-hidden="true" className="absolute border-2 border-[var(--color-uncertain-bright)] bg-black/60"
            style={{ left: `${live.x * 100}%`, top: `${live.y * 100}%`, width: `${live.w * 100}%`, height: `${live.h * 100}%` }} />
        ) : null}
      </div>
      <p className="t-micro text-[var(--color-ink-3)]">
        Drag across the image to cover anything private: a house number, a face, a key safe. Covered areas are painted
        black in this browser, so the covered pixels never reach the chain.
      </p>
      {draft.boxes.length ? (
        <div className="flex flex-wrap items-center gap-2">
          <span className="t-small">{plural(draft.boxes.length, "area")} covered.</span>
          <button type="button" className="btn btn-quiet" onClick={() => onBoxes(draft.boxes.slice(0, -1))}>Undo the last box</button>
          <button type="button" className="btn btn-quiet" onClick={() => onBoxes([])}>Remove every box</button>
        </div>
      ) : null}
    </div>
  );
}

function ImageDraftCard({ draft, ack, update, remove }: {
  draft: Draft; ack: boolean; update: (patch: Partial<Draft>) => void; remove: () => void;
}) {
  const { cid, a, evidence } = useCase();
  // While the write flow is open the card is locked: the bytes and words under review are the ones signed.
  const [signing, setSigning] = useState(false);
  // The contract refuses the same bytes twice from the same role only: another role may file its own copy.
  const same = draft.digest ? evidence.filter((e) => e.sha256 === draft.digest) : [];
  const dup = same.find((e) => e.role === a.role);
  const twin = dup ? undefined : same[0];
  const meta = {
    kind: draft.kind, file_name: draft.fileName.trim().slice(0, 120), description: draft.description.trim(),
    declared_capture: draft.declared.trim(), criteria: draft.criteria, redacted: draft.boxes.length > 0,
    redaction_note: draft.boxes.length ? draft.redactionNote.trim() : "",
    ...(draft.kind === "DOCUMENT_PAGE" ? { doc_type: draft.docType } : {}),
    ...(draft.kind === "VIDEO_FRAME" ? { frame_time: draft.src.frameTime ?? "" } : {}),
  };
  const base = a.file(draft.kind);
  const can: Can = !base.ok ? base
    : draft.busy || !draft.prepared ? { ok: false, why: "Preparing the image..." }
      : dup ? { ok: false, why: `These exact bytes are already ${exhibitName(dup.evidence_id)} on this case.` }
        : draft.kind === "DOCUMENT_PAGE" && !draft.docType ? { ok: false, why: "Say what kind of document the page is." }
          : !ack ? { ok: false, why: "Confirm the notice above first." } : base;
  if (!can.ok && signing) setSigning(false);

  if (draft.filed) {
    return (
      <div className="folio flex items-center gap-3 p-4 t-small">
        <span className="text-[var(--color-supported)]" aria-hidden="true"><Icon name="check" /></span>
        Filed as {exhibitName(draft.filed)}.
        <button type="button" className="btn btn-quiet ml-auto" onClick={remove}>Dismiss</button>
      </div>
    );
  }
  return (
    <div className="folio flex flex-col gap-4 p-5">
      <fieldset disabled={signing} className="flex min-w-0 flex-col gap-4">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <p className="t-small font-semibold">{EVIDENCE_LABEL[draft.kind]}: {draft.src.name}</p>
        <button type="button" className="btn btn-quiet" onClick={remove}>Remove</button>
      </div>
      {draft.error ? <p className="t-small text-[var(--color-adverse)]" role="alert">{draft.error}</p> : null}
      <Redactor draft={draft} locked={signing} onBoxes={(boxes) => update({ boxes })} />
      {draft.prepared ? (
        <p className="t-micro text-[var(--color-ink-3)] break-all">
          Redrawn without camera metadata, {draft.prepared.width} by {draft.prepared.height} pixels,{" "}
          {draft.prepared.bytes.length.toLocaleString("en-GB")} bytes. sha256 of the exact bytes to be filed:{" "}
          <span className="t-mono">{draft.digest || "computing..."}</span>
        </p>
      ) : <p className="t-small" role="status">Preparing the image...</p>}
      {dup ? <Note tone="warn" title="Already on this case">These exact bytes are {exhibitName(dup.evidence_id)}, which you filed. The contract refuses the same bytes twice from one role.</Note> : null}
      {twin ? (
        <Note title="The other side filed these bytes too">
          These are the same bytes as {exhibitName(twin.evidence_id)}, which the {ROLE_LABEL[twin.role].toLowerCase()} filed.
          You may file your own copy. The validators are told the two are one piece of evidence, and each copy counts
          as the item of the role that filed it.
        </Note>
      ) : null}
      <div className="grid gap-4 md:grid-cols-2">
        <Field label="What it shows, in your words (public)" hint="Validators examine the image before they read this, and treat it as your claim.">
          <textarea className="field" maxLength={300} value={draft.description} onChange={(e) => update({ description: e.target.value })} />
        </Field>
        <div className="flex flex-col gap-4">
          <Field label="Name shown with the exhibit (public)" hint="It starts as your file's name. Change it if the name says anything private.">
            <input className="field" maxLength={120} value={draft.fileName} onChange={(e) => update({ fileName: e.target.value })} />
          </Field>
          <Field label="When it was taken, if you know (optional)" hint="Your claim, never treated as proof. Image metadata is removed and never read.">
            <input className="field" maxLength={40} value={draft.declared} placeholder="2 October 2026, 14:10"
              onChange={(e) => update({ declared: e.target.value })} />
          </Field>
          {draft.kind === "DOCUMENT_PAGE" ? (
            <Field label="What kind of document is it?">
              <select className="field" value={draft.docType} onChange={(e) => update({ docType: e.target.value })}>
                <option value="">Choose...</option>
                {Object.entries(DOC_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
              </select>
            </Field>
          ) : null}
          {draft.boxes.length ? (
            <Field label="What you covered (public)" hint="For example: the house number and the tenant's name.">
              <input className="field" maxLength={160} value={draft.redactionNote} onChange={(e) => update({ redactionNote: e.target.value })} />
            </Field>
          ) : null}
        </div>
      </div>
      <Criteria value={draft.criteria} onChange={(criteria) => update({ criteria })} />
      <Warnings texts={[draft.fileName, draft.description, draft.declared, draft.redactionNote]} />
      </fieldset>
      {signing ? <p className="t-micro text-[var(--color-ink-3)]">Locked while you review and sign. Cancel to change anything.</p> : null}
      <Act label="File this as evidence" method="submit_image" can={can} caseId={cid} onOpenChange={setSigning}
        prepare={() => (draft.prepared ? [cid, JSON.stringify(meta), draft.prepared.bytes] : "The image is not ready.")}
        working="The contract checks the image, stores the bytes and computes their digest."
        onResult={(r: FlowResult) => {
          const id = r.returned?.evidence_id;
          if (r.outcome === "recorded" && typeof id === "string") update({ filed: id });
        }} />
    </div>
  );
}

function VideoPicker({ onFrame }: { onFrame: (src: ImageSource) => void }) {
  const ref = useRef<HTMLVideoElement>(null);
  const [video, setVideo] = useState<{ url: string; name: string } | null>(null);
  const [error, setError] = useState("");
  return (
    <div className="flex flex-col gap-3">
      <Field label="Choose a video">
        <input type="file" accept="video/*" className="field" onChange={(e) => {
          const f = e.target.files?.[0];
          if (!f) return;
          if (video) URL.revokeObjectURL(video.url);
          setVideo({ url: URL.createObjectURL(f), name: f.name });
          setError("");
        }} />
      </Field>
      {video ? (
        <>
          <video ref={ref} src={video.url} controls preload="metadata" muted playsInline
            className="max-h-[360px] w-auto max-w-full self-start border border-[var(--color-rule)] bg-black" />
          <button type="button" className="btn self-start" onClick={() => {
            const v = ref.current;
            if (!v) return;
            sourceFromVideo(v, video.name).then(onFrame, (e: unknown) => setError(e instanceof Error ? e.message : "The frame could not be read."));
          }}>Keep this frame</button>
          <p className="t-micro text-[var(--color-ink-3)]">Pause where it matters, then keep the frame. You can keep several.</p>
        </>
      ) : null}
      {error ? <p className="t-small text-[var(--color-adverse)]" role="alert">{error}</p> : null}
    </div>
  );
}

function TextFiling({ ack }: { ack: boolean }) {
  const { cid, a } = useCase();
  const [title, setTitle] = useState("");
  const [docType, setDocType] = useState("");
  const [text, setText] = useState("");
  const [description, setDescription] = useState("");
  const [declared, setDeclared] = useState("");
  const [criteria, setCriteria] = useState<string[]>([]);
  const [filed, setFiled] = useState("");
  const [signing, setSigning] = useState(false);
  const base = a.file("TEXT_DOCUMENT");
  const can: Can = !base.ok ? base
    : text.trim().length < 10 ? { ok: false, why: "A document needs at least 10 characters of text." }
      : !docType ? { ok: false, why: "Say what kind of document this is." }
        : !ack ? { ok: false, why: "Confirm the notice above first." } : base;
  if (!can.ok && signing) setSigning(false);
  const meta = { doc_type: docType, title: title.trim(), description: description.trim(), declared_capture: declared.trim(), criteria };
  return (
    <div className="folio flex flex-col gap-4 p-5">
      {filed ? (
        <p className="t-small flex items-center gap-2"><span className="text-[var(--color-supported)]" aria-hidden="true"><Icon name="check" /></span>
          Filed as {exhibitName(filed)}. You can file another below.</p>
      ) : null}
      <fieldset disabled={signing} className="flex min-w-0 flex-col gap-4">
      <div className="grid gap-4 md:grid-cols-2">
        <Field label="Title (public)">
          <input className="field" maxLength={120} value={title} onChange={(e) => setTitle(e.target.value)}
            placeholder="Inspection report, 4 October" />
        </Field>
        <Field label="What kind of document is it?">
          <select className="field" value={docType} onChange={(e) => setDocType(e.target.value)}>
            <option value="">Choose...</option>
            {Object.entries(DOC_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
          </select>
        </Field>
      </div>
      <Field label="The text" hint={`${text.length.toLocaleString("en-GB")} of 6,000 characters. Line breaks are kept; the contract stores the text and computes its digest.`}>
        <textarea className="field min-h-[220px]" maxLength={6000} value={text} onChange={(e) => setText(e.target.value)} />
      </Field>
      <div className="grid gap-4 md:grid-cols-2">
        <Field label="What it shows, in your words (public, optional)">
          <textarea className="field" maxLength={300} value={description} onChange={(e) => setDescription(e.target.value)} />
        </Field>
        <Field label="Its date, if it has one (optional)" hint="Your claim, never treated as proof.">
          <input className="field" maxLength={40} value={declared} onChange={(e) => setDeclared(e.target.value)} />
        </Field>
      </div>
      <Criteria value={criteria} onChange={setCriteria} />
      <Warnings texts={[title, text, description]} />
      </fieldset>
      {signing ? <p className="t-micro text-[var(--color-ink-3)]">Locked while you review and sign. Cancel to change anything.</p> : null}
      <Act label="File this document" method="submit_text" can={can} caseId={cid} onOpenChange={setSigning}
        prepare={() => [cid, JSON.stringify(meta), text]}
        working="The contract stores the text and computes its digest."
        onResult={(r) => {
          const id = r.returned?.evidence_id;
          if (r.outcome === "recorded" && typeof id === "string") {
            setFiled(id);
            setText("");
            setTitle("");
            setDescription("");
            setDeclared("");
            setCriteria([]);
          }
        }} />
    </div>
  );
}

export function FilingPanel() {
  const { a, t } = useCase();
  const kinds = t.allowed;
  const firstOk = kinds.find((k) => a.file(k).ok);
  const [kind, setKind] = useState<EvidenceKind | "">(firstOk ?? "");
  const [ack, setAck] = useState(false);
  const [drafts, setDrafts] = useState<Draft[]>([]);
  const [pickError, setPickError] = useState("");
  // The original pixels of each draft, and the newest encoding asked for, so
  // a slow encode never overwrites a newer set of redaction boxes.
  const sources = useRef(new Map<string, ImageSource>());
  const wanted = useRef(new Map<string, number>());

  const encode = async (key: string, boxes: Box[]) => {
    const src = sources.current.get(key);
    if (!src) return;
    const ticket = (wanted.current.get(key) ?? 0) + 1;
    wanted.current.set(key, ticket);
    setDrafts((list) => list.map((x) => (x.key === key ? { ...x, busy: true } : x)));
    try {
      const prepared = await encodeSource(src, boxes);
      const digest = await sha256Hex(prepared.bytes);
      if (wanted.current.get(key) !== ticket) {
        URL.revokeObjectURL(prepared.preview);
        return;
      }
      setDrafts((list) => list.map((x) => {
        if (x.key !== key) return x;
        if (x.prepared) URL.revokeObjectURL(x.prepared.preview);
        return { ...x, prepared, digest, busy: false, error: "" };
      }));
    } catch (e) {
      if (wanted.current.get(key) !== ticket) return;
      setDrafts((list) => list.map((x) => (x.key === key
        ? { ...x, busy: false, error: e instanceof Error ? e.message : "The image could not be prepared." } : x)));
    }
  };

  const update = (key: string, patch: Partial<Draft>) => {
    setDrafts((list) => list.map((d) => (d.key === key ? { ...d, ...patch } : d)));
    if (patch.boxes) void encode(key, patch.boxes);
  };

  const add = (src: ImageSource, k: ImageKind) => {
    const key = nextKey();
    sources.current.set(key, src);
    setDrafts((list) => [...list, { key, kind: k, src, boxes: [], prepared: null, digest: "", busy: true, error: "",
      description: "", declared: "", criteria: [], docType: "", redactionNote: "", fileName: src.name.slice(0, 120), filed: "" }]);
    void encode(key, []);
  };

  const remove = (key: string) => {
    const gone = drafts.find((x) => x.key === key);
    if (gone?.prepared) URL.revokeObjectURL(gone.prepared.preview);
    sources.current.get(key)?.bitmap.close();
    sources.current.delete(key);
    wanted.current.delete(key);
    setDrafts((list) => list.filter((x) => x.key !== key));
  };

  const pickFiles = async (files: FileList | null, k: ImageKind) => {
    setPickError("");
    for (const f of Array.from(files ?? [])) {
      try {
        add(await sourceFromFile(f), k);
      } catch (e) {
        setPickError(`${f.name}: ${e instanceof Error ? e.message : "could not be read"}`);
      }
    }
  };

  if (!kinds.some((k) => a.file(k).ok)) {
    return <p className="t-small text-[var(--color-ink-2)]">{a.file(kinds[0] ?? "PHOTO").why}</p>;
  }

  return (
    <div className="flex flex-col gap-6">
      <Remaining />
      <Note tone="privacy" title="Before you file">
        <p>
          Everything filed is public and permanent; nothing can be deleted from the chain. Images are redrawn in this
          browser, which removes camera metadata such as the capture time, the device and the location. Cover anything
          private with a box before filing. A digest proves a file was not changed after filing; it does not prove the
          file is authentic.
        </p>
        <label className="mt-3 flex items-start gap-2 t-small text-[var(--color-ink)]">
          <input type="checkbox" className="mt-1" checked={ack} onChange={(e) => setAck(e.target.checked)} />
          <span>{ACK_TEXT}</span>
        </label>
      </Note>

      <fieldset className="flex flex-col gap-2">
        <legend className="t-small font-semibold">What are you filing?</legend>
        <div className="flex flex-wrap gap-2">
          {kinds.map((k) => {
            const ok = a.file(k).ok;
            return (
              <button key={k} type="button" disabled={!ok} aria-pressed={kind === k}
                className={`btn ${kind === k ? "btn-primary" : ""}`} onClick={() => setKind(k)}>
                {EVIDENCE_LABEL[k]}
              </button>
            );
          })}
        </div>
        {kind ? <p className="t-small text-[var(--color-ink-2)]">{KIND_HELP[kind]}</p> : null}
        {kinds.filter((k) => !a.file(k).ok).map((k) => (
          <p key={k} className="t-micro text-[var(--color-ink-3)]">{EVIDENCE_LABEL[k]}: {a.file(k).why}</p>
        ))}
      </fieldset>

      {kind === "PHOTO" || kind === "DOCUMENT_PAGE" ? (
        <Field label={kind === "PHOTO" ? "Choose photographs" : "Choose page images"} hint="JPEG, PNG, WebP, GIF or AVIF, up to 25 MB each. The file's type is read from its bytes, not its name.">
          <input type="file" multiple accept="image/*" className="field"
            onChange={(e) => { void pickFiles(e.target.files, kind); e.target.value = ""; }} />
        </Field>
      ) : null}
      {kind === "VIDEO_FRAME" ? <VideoPicker onFrame={(src) => add(src, "VIDEO_FRAME")} /> : null}
      {pickError ? <p className="t-small text-[var(--color-adverse)]" role="alert">{pickError}</p> : null}

      {drafts.map((d) => (
        <ImageDraftCard key={d.key} draft={d} ack={ack} update={(patch) => update(d.key, patch)} remove={() => remove(d.key)} />
      ))}

      {kind === "TEXT_DOCUMENT" ? <TextFiling ack={ack} /> : null}
    </div>
  );
}
