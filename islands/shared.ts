/**
 * Helpers shared by this pack's islands. Imported relatively — that is fine
 * *inside* a pack; only the `component` entry of a tool manifest has to be a
 * package subpath.
 *
 * See the tools-site convention: labels are translated, logic is not.
 */
export type Lang = "de" | "en";

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

/** Hand a Blob to the visitor as a download. Nothing here ever leaves the tab. */
export function downloadBlob(blob: Blob, name: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export function downloadPdf(bytes: Uint8Array, name: string): void {
  // `.slice()` because pdf-lib hands back a view into a larger buffer.
  downloadBlob(new Blob([bytes.slice()], { type: "application/pdf" }), name);
}

/** Human-readable byte size, German-style decimal comma via toLocaleString. */
export function formatBytes(n: number, lang: Lang): string {
  const units = ["B", "KB", "MB"];
  let v = n;
  let u = 0;
  while (v >= 1024 && u < units.length - 1) {
    v /= 1024;
    u++;
  }
  const digits = u === 0 ? 0 : 1;
  return `${v.toLocaleString(lang === "de" ? "de-DE" : "en-GB", {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  })} ${units[u]}`;
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
