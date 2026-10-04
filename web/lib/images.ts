/**
 * Preparing images for the record, in this browser, before anything is
 * signed.
 *
 * - The file's real type is read from its first bytes; the name and the
 *   browser's MIME guess are not trusted.
 * - Every image is decoded and redrawn on a canvas, then encoded as a JFIF
 *   JPEG of at most 400 KB: the form GenVM's model gateway reads and the
 *   contract checks. Redrawing drops everything that is not pixels, so camera
 *   metadata (capture time, device, GPS position) never reaches the chain.
 *   KeyWitness does not read that metadata at all.
 * - Redaction rectangles are painted over the pixels before encoding, so the
 *   bytes on chain never contained what was covered.
 * - A video is never stored: the person picks one still, which is filed as
 *   a still from a video.
 */

export const IMAGE_MAX_BYTES = 400_000;
export const MAX_EDGE = 1280;
export const MAX_SOURCE_BYTES = 25 * 1024 * 1024;
const JFIF_APP0 = [0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46, 0x00, 0x01, 0x01, 0x00, 0x00, 0x01, 0x00, 0x01, 0x00, 0x00];

export type SourceKind = "jpeg" | "png" | "webp" | "gif" | "avif" | "unknown";

/** The image format a file's first bytes declare. */
export function sniff(head: Uint8Array): SourceKind {
  const at = (i: number, bytes: number[]) => bytes.every((v, k) => head[i + k] === v);
  if (at(0, [0xff, 0xd8, 0xff])) return "jpeg";
  if (at(0, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) return "png";
  if (at(0, [0x52, 0x49, 0x46, 0x46]) && at(8, [0x57, 0x45, 0x42, 0x50])) return "webp";
  if (at(0, [0x47, 0x49, 0x46, 0x38])) return "gif";
  if (at(4, [0x66, 0x74, 0x79, 0x70]) && (at(8, [0x61, 0x76, 0x69, 0x66]) || at(8, [0x61, 0x76, 0x69, 0x73]))) return "avif";
  return "unknown";
}

/** FF D8 FF E0, the APP0 length, then "JFIF" and a zero byte: what the contract checks. */
export function isJfif(b: Uint8Array): boolean {
  const name = [0x4a, 0x46, 0x49, 0x46, 0x00];
  return b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff && b[3] === 0xe0 && name.every((v, i) => b[6 + i] === v);
}

export const IMAGE_SIDE_MIN = 16;
export const IMAGE_SIDE_MAX = 4096;

const sideOk = (w: number, h: number) => w >= IMAGE_SIDE_MIN && w <= IMAGE_SIDE_MAX && h >= IMAGE_SIDE_MIN && h <= IMAGE_SIDE_MAX;
const SIDES = `each side must be between ${IMAGE_SIDE_MIN} and ${IMAGE_SIDE_MAX} pixels`;
const BROKEN = "its structure is broken";
const u16 = (d: Uint8Array, i: number) => ((d[i] ?? 0) << 8) | (d[i + 1] ?? 0);
const u32 = (d: Uint8Array, i: number) => (((d[i] ?? 0) * 0x1000000) + ((d[i + 1] ?? 0) << 16) + ((d[i + 2] ?? 0) << 8) + (d[i + 3] ?? 0));
const ascii = (d: Uint8Array, i: number, n: number) => String.fromCharCode(...d.subarray(i, i + n));
const PNG_CHUNKS = ["IHDR", "PLTE", "IDAT", "IEND", "tRNS", "gAMA", "cHRM", "sRGB", "iCCP", "sBIT", "pHYs", "bKGD"];

/** The contract's own walk of a JPEG, up to its first scan. "" when the contract accepts the file. */
function jpegProblem(d: Uint8Array): string {
  if (!isJfif(d)) return "it does not open as a JFIF JPEG";
  if (d[d.length - 2] !== 0xff || d[d.length - 1] !== 0xd9) return "it does not end where a JPEG ends";
  let pos = 2;
  let tables = false;
  let frame = false;
  for (let n = 0; n < 64; n++) {
    if (pos + 4 > d.length || d[pos] !== 0xff) return BROKEN;
    const marker = d[pos + 1] ?? 0;
    const length = u16(d, pos + 2);
    if (length < 2 || pos + 2 + length > d.length) return BROKEN;
    if (marker === 0xe1 || marker === 0xed || marker === 0xfe) {
      return "it carries a metadata block (camera data, an editor record or a comment)";
    }
    if (marker === 0xc0 || marker === 0xc1 || marker === 0xc2) {
      if (frame || length - 2 < 6) return BROKEN;
      if (!sideOk(u16(d, pos + 7), u16(d, pos + 5))) return SIDES;
      frame = true;
    } else if (marker === 0xdb) tables = true;
    else if (marker === 0xda) return frame && tables ? "" : BROKEN;
    else if (!((marker >= 0xe0 && marker <= 0xef) || marker === 0xc4 || marker === 0xdd)) {
      return "it uses a kind of JPEG coding that is not accepted";
    }
    pos += 2 + length;
  }
  return BROKEN;
}

/** The contract's own walk of a PNG, chunk by chunk. */
function pngProblem(d: Uint8Array): string {
  let pos = 8;
  let first = true;
  let hasData = false;
  for (let n = 0; n < 4096; n++) {
    if (pos + 12 > d.length) return BROKEN;
    const length = u32(d, pos);
    const kind = ascii(d, pos + 4, 4);
    if (pos + 12 + length > d.length) return BROKEN;
    if (first) {
      if (kind !== "IHDR" || length !== 13) return BROKEN;
      if (!sideOk(u32(d, pos + 8), u32(d, pos + 12))) return SIDES;
      first = false;
    } else if (!PNG_CHUNKS.includes(kind) || kind === "IHDR") {
      return "it carries a chunk that is not image data (text, a time or camera data)";
    }
    if (kind === "IDAT") hasData = true;
    pos += 12 + length;
    if (kind === "IEND") return hasData && pos === d.length ? "" : BROKEN;
  }
  return BROKEN;
}

/**
 * Why the contract would refuse these bytes as an image, or "" when it
 * would store them. The same walk the contract does, so a file is checked
 * here before anything is signed; the fixtures prove the two agree.
 */
export function imageProblem(d: Uint8Array): string {
  if ([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a].every((v, i) => d[i] === v)) return pngProblem(d);
  if (d[0] === 0xff && d[1] === 0xd8 && d[2] === 0xff) return jpegProblem(d);
  return "it is neither a PNG nor a JFIF JPEG";
}

/**
 * A JPEG as the contract accepts it: the JFIF header first, and no segment
 * before the first scan that is not image data. Some encoders write their
 * own camera-data block, an editor record or a comment even for a freshly
 * drawn canvas; those are dropped here. The pixels are not touched.
 */
export function cleanJpeg(jpeg: Uint8Array): Uint8Array {
  if (jpeg[0] !== 0xff || jpeg[1] !== 0xd8) throw new Error("The encoder did not produce a JPEG.");
  const kept: Uint8Array[] = [];
  let header: Uint8Array | null = null;
  let pos = 2;
  for (let n = 0; n < 64 && pos + 4 <= jpeg.length && jpeg[pos] === 0xff; n++) {
    const marker = jpeg[pos + 1] ?? 0;
    const length = u16(jpeg, pos + 2);
    if (marker === 0xda || length < 2 || pos + 2 + length > jpeg.length) break;
    const segment = jpeg.subarray(pos, pos + 2 + length);
    const jfif = marker === 0xe0 && ascii(segment, 4, 4) === "JFIF" && segment[8] === 0;
    if (jfif) header ??= segment;
    else if (marker !== 0xe1 && marker !== 0xed && marker !== 0xfe) kept.push(segment);
    pos += 2 + length;
  }
  const parts = [new Uint8Array([0xff, 0xd8]), header ?? new Uint8Array(JFIF_APP0), ...kept, jpeg.subarray(pos)];
  const out = new Uint8Array(parts.reduce((n, x) => n + x.length, 0));
  let at = 0;
  for (const x of parts) {
    out.set(x, at);
    at += x.length;
  }
  return out;
}

export function fitWithin(width: number, height: number, edge = MAX_EDGE): { width: number; height: number } {
  const scale = Math.min(1, edge / Math.max(width, height));
  return { width: Math.max(1, Math.round(width * scale)), height: Math.max(1, Math.round(height * scale)) };
}

/** A redaction rectangle in fractions of the image (0 to 1), so it survives resizing. */
export interface Box {
  x: number;
  y: number;
  w: number;
  h: number;
}

export function clampBox(b: Box): Box {
  const c = (v: number) => Math.min(1, Math.max(0, v));
  const x1 = c(Math.min(b.x, b.x + b.w));
  const x2 = c(Math.max(b.x, b.x + b.w));
  const y1 = c(Math.min(b.y, b.y + b.h));
  const y2 = c(Math.max(b.y, b.y + b.h));
  return { x: x1, y: y1, w: x2 - x1, h: y2 - y1 };
}

async function encode(canvas: HTMLCanvasElement, quality: number): Promise<Uint8Array> {
  const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/jpeg", quality));
  if (!blob) throw new Error("This browser could not encode the image.");
  const bytes = cleanJpeg(new Uint8Array(await blob.arrayBuffer()));
  // Checked the way the contract checks it, before anything is signed.
  const problem = imageProblem(bytes);
  if (problem) throw new Error(`This browser produced an image the contract would refuse: ${problem}.`);
  return bytes;
}

/** Draw, paint the redactions, and encode under the size limit. */
export async function encodeForRecord(source: CanvasImageSource, width: number, height: number,
  boxes: Box[] = []): Promise<{ bytes: Uint8Array; width: number; height: number }> {
  let edge = MAX_EDGE;
  for (let attempt = 0; attempt < 6; attempt++) {
    const fit = fitWithin(width, height, edge);
    if (fit.width < IMAGE_SIDE_MIN || fit.height < IMAGE_SIDE_MIN) {
      throw new Error(`This image is too small or too narrow: each side must be at least ${IMAGE_SIDE_MIN} pixels.`);
    }
    const canvas = document.createElement("canvas");
    canvas.width = fit.width;
    canvas.height = fit.height;
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("This browser cannot draw images.");
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, fit.width, fit.height);
    ctx.drawImage(source, 0, 0, fit.width, fit.height);
    ctx.fillStyle = "#000000";
    for (const b of boxes.map(clampBox)) {
      ctx.fillRect(Math.floor(b.x * fit.width), Math.floor(b.y * fit.height),
        Math.ceil(b.w * fit.width) + 1, Math.ceil(b.h * fit.height) + 1);
    }
    for (const quality of [0.86, 0.78, 0.7]) {
      const bytes = await encode(canvas, quality);
      if (bytes.length <= IMAGE_MAX_BYTES) return { bytes, width: fit.width, height: fit.height };
    }
    edge = Math.round(edge * 0.8);
  }
  throw new Error("The image could not be reduced below 400 KB.");
}

export interface PreparedImage {
  bytes: Uint8Array;
  width: number;
  height: number;
  preview: string;
  sourceKind: SourceKind;
  redacted: boolean;
}

/** A photograph or a scanned page from a file the person picked. */
export async function prepareImage(file: File, boxes: Box[] = []): Promise<PreparedImage> {
  if (file.size > MAX_SOURCE_BYTES) throw new Error("Choose an image smaller than 25 MB.");
  const kind = sniff(new Uint8Array(await file.slice(0, 16).arrayBuffer()));
  if (kind === "unknown") throw new Error("This file is not an image KeyWitness can read (JPEG, PNG, WebP, GIF or AVIF).");
  const bitmap = await createImageBitmap(file, { imageOrientation: "from-image" });
  try {
    const { bytes, width, height } = await encodeForRecord(bitmap, bitmap.width, bitmap.height, boxes);
    const preview = URL.createObjectURL(new Blob([bytes as BlobPart], { type: "image/jpeg" }));
    return { bytes, width, height, preview, sourceKind: kind, redacted: boxes.length > 0 };
  } finally {
    bitmap.close();
  }
}

/** One still from a video element at its current time, encoded like any image. */
export async function captureFrame(video: HTMLVideoElement, boxes: Box[] = []): Promise<PreparedImage> {
  if (!video.videoWidth || !video.videoHeight) throw new Error("The video has not loaded a frame yet.");
  const { bytes, width, height } = await encodeForRecord(video, video.videoWidth, video.videoHeight, boxes);
  const preview = URL.createObjectURL(new Blob([bytes as BlobPart], { type: "image/jpeg" }));
  return { bytes, width, height, preview, sourceKind: "jpeg", redacted: boxes.length > 0 };
}

export function frameTime(seconds: number): string {
  const s = Math.max(0, Math.floor(seconds));
  return `${String(Math.floor(s / 60)).padStart(2, "0")}:${String(s % 60).padStart(2, "0")}`;
}

/** Text that looks like contact details or codes, for a warning before filing. Never a guarantee. */
export function privacyWarnings(text: string): string[] {
  const warnings: string[] = [];
  if (/[\w.+-]+@[\w-]+\.[\w.]+/.test(text)) warnings.push("an email address");
  if (/(\+?\d[\d\s().-]{8,}\d)/.test(text)) warnings.push("what looks like a phone number");
  if (/\b(code|pin|password|passcode|key safe|lockbox)\b/i.test(text)) warnings.push("something that may be an access code");
  if (/\b\d{1,4}\s+[A-Z][a-z]+\s+(Street|St|Road|Rd|Avenue|Ave|Lane|Ln|Close|Way|Drive|Dr)\b/.test(text)) {
    warnings.push("what looks like a street address");
  }
  return warnings;
}

/* ---- sources kept for re-encoding: redaction boxes are painted from the original pixels ---- */

export interface ImageSource {
  bitmap: ImageBitmap;
  kind: SourceKind;
  /** The picked file's name, or the video's name with the frame time. */
  name: string;
  /** For a still from a video: minutes and seconds into it. */
  frameTime?: string;
}

export async function sourceFromFile(file: File): Promise<ImageSource> {
  if (file.size > MAX_SOURCE_BYTES) throw new Error("Choose an image smaller than 25 MB.");
  const kind = sniff(new Uint8Array(await file.slice(0, 16).arrayBuffer()));
  if (kind === "unknown") throw new Error("This file is not an image KeyWitness can read (JPEG, PNG, WebP, GIF or AVIF).");
  try {
    return { bitmap: await createImageBitmap(file, { imageOrientation: "from-image" }), kind, name: file.name };
  } catch {
    throw new Error("This browser could not decode the image.");
  }
}

export async function sourceFromVideo(video: HTMLVideoElement, name: string): Promise<ImageSource> {
  if (!video.videoWidth || !video.videoHeight) throw new Error("The video has not loaded a frame yet.");
  const at = frameTime(video.currentTime);
  return { bitmap: await createImageBitmap(video), kind: "jpeg", name: `${name} at ${at}`, frameTime: at };
}

export async function encodeSource(src: ImageSource, boxes: Box[] = []): Promise<PreparedImage> {
  const { bytes, width, height } = await encodeForRecord(src.bitmap, src.bitmap.width, src.bitmap.height, boxes);
  const preview = URL.createObjectURL(new Blob([bytes as BlobPart], { type: "image/jpeg" }));
  return { bytes, width, height, preview, sourceKind: src.kind, redacted: boxes.length > 0 };
}
