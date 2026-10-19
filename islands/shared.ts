/**
 * Helpers shared by this pack's islands. Imported relatively — that is fine
 * *inside* a pack; only the `component` entry of a tool manifest has to be a
 * package subpath.
 *
 * See the tools-site convention: labels are translated, logic is not.
 */
import { downloadBytes } from "@tracht-digital-solutions/tds-shared/download";

export type Lang = "de" | "en";

/**
 * Downloads go through tds-shared (`./download`): the link is attached, and
 * the object URL is revoked after Firefox has read it.
 */
export { downloadBlob } from "@tracht-digital-solutions/tds-shared/download";

/** pdf-lib bytes as a `.pdf` download (the shared helper copies the view first). */
export function downloadPdf(bytes: Uint8Array, name: string): void {
  downloadBytes(bytes, "application/pdf", name);
}

/** Human-readable byte size in the visitor's language (tds-shared `formatBytes`). */
export { formatBytes } from "@tracht-digital-solutions/tds-shared/format";

/**
 * Parse "1-3,5" (1-indexed) into a sorted, de-duped 0-indexed page list.
 * An empty spec means "every page" — that is what the page-range inputs in this
 * pack promise, and it keeps the common case free of typing.
 */
export function parseRange(spec: string, pageCount: number): number[] {
  if (spec.trim() === "") return Array.from({ length: pageCount }, (_, i) => i);
  const out = new Set<number>();
  for (const part of spec.split(",")) {
    const t = part.trim();
    if (!t) continue;
    const m = /^(\d+)(?:-(\d+))?$/.exec(t);
    if (!m) continue;
    const start = Number(m[1]);
    const end = m[2] ? Number(m[2]) : start;
    for (let i = start; i <= end; i++) {
      if (i >= 1 && i <= pageCount) out.add(i - 1);
    }
  }
  return [...out].sort((a, b) => a - b);
}

/** Millimetres → PDF points (72 dpi). Page geometry is authored in mm here. */
export function mm(value: number): number {
  return (value * 72) / 25.4;
}

export const PAGE_SIZES = {
  a4: { w: 210, h: 297 },
  a5: { w: 148, h: 210 },
  letter: { w: 215.9, h: 279.4 },
} as const;

export type PageSizeKey = keyof typeof PAGE_SIZES;

/**
 * Decode an image file to a canvas-drawable bitmap and re-encode it as JPEG or
 * PNG at the requested size. Used by the compressor and by images-to-PDF, which
 * both need a normalised, embeddable image regardless of what was dropped in.
 *
 * Returns `null` when the browser cannot decode the input at all.
 */
export async function reencode(
  source: Blob,
  opts: { maxWidth?: number; quality: number; type: "image/jpeg" | "image/png" },
): Promise<{ blob: Blob; width: number; height: number } | null> {
  let bitmap: ImageBitmap;
  try {
    bitmap = await createImageBitmap(source);
  } catch {
    return null;
  }
  const scale = opts.maxWidth && bitmap.width > opts.maxWidth ? opts.maxWidth / bitmap.width : 1;
  const width = Math.max(1, Math.round(bitmap.width * scale));
  const height = Math.max(1, Math.round(bitmap.height * scale));

  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d");
  if (!ctx) return null;
  // A JPEG has no alpha channel; without a white ground a transparent PNG turns
  // black rather than white when it is flattened.
  if (opts.type === "image/jpeg") {
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, width, height);
  }
  ctx.drawImage(bitmap, 0, 0, width, height);
  bitmap.close?.();

  const blob = await new Promise<Blob | null>((resolve) =>
    canvas.toBlob((b) => resolve(b), opts.type, opts.quality),
  );
  if (!blob) return null;
  return { blob, width, height };
}

/**
 * The 14 standard PDF fonts are encoded WinAnsi, which covers German but not,
 * say, an em dash typed on a Mac or a stray emoji. An unencodable character
 * makes pdf-lib throw at draw time, which would surface as "could not be
 * processed" for what is really one bad character — so they are dropped here.
 */
export function toWinAnsi(text: string): string {
  return text
    .replace(/[‘’‚‹›]/g, "'")
    .replace(/[“”„]/g, '"')
    .replace(/[–—]/g, "-")
    .replace(/…/g, "...")
    // eslint-disable-next-line no-control-regex
    .replace(/[^\u0000-\u00FF]/g, "");
}
