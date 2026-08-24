import { useEffect, useRef, useState } from "react";
import { downloadBlob, parseRange, formatBytes, type Lang } from "./shared";

type Format = "image/png" | "image/jpeg";

interface Rendered {
  page: number;
  url: string;
  blob: Blob;
  width: number;
  height: number;
}

interface Strings {
  needPdf: string;
  badRange: string;
  failed: string;
  tooMany: (max: number) => string;
  done: (n: number) => string;
  choosePdf: string;
  pages: string;
  pagesHint: string;
  format: string;
  quality: string;
  resolution: string;
  screen: string;
  print: string;
  high: string;
  working: (done: number, total: number) => string;
  run: string;
  download: string;
  downloadAll: string;
  pageLabel: (n: number) => string;
  /** Download filename stem — translated, because the file lands on a desk. */
  pageFile: (n: number) => string;
  note: string;
}

/** German is the default; an older pinned pack must keep working unchanged. */
const STRINGS = {
  de: {
    needPdf: "Bitte ein PDF wählen.",
    badRange: "Kein gültiger Seitenbereich.",
    failed: "Das PDF konnte nicht gelesen werden.",
    tooMany: (max) => `Es werden höchstens ${max} Seiten auf einmal umgewandelt.`,
    done: (n) => `${n} Seite(n) umgewandelt.`,
    choosePdf: "PDF auswählen",
    pages: "Seiten",
    pagesHint: "Leer lassen für alle Seiten, sonst z. B. 1-3,5",
    format: "Format",
    quality: "JPG-Qualität",
    resolution: "Auflösung",
    screen: "Bildschirm (96 dpi)",
    print: "Druck (150 dpi)",
    high: "Hoch (300 dpi)",
    working: (done, total) => `Seite ${done} von ${total} …`,
    run: "Umwandeln",
    download: "Herunterladen",
    downloadAll: "Alle herunterladen",
    pageLabel: (n) => `Seite ${n}`,
    pageFile: (n) => `seite-${n}`,
    note: "Das PDF wird lokal im Browser gelesen und niemals hochgeladen.",
  },
  en: {
    needPdf: "Please choose a PDF.",
    badRange: "That is not a valid page range.",
    failed: "The PDF could not be read.",
    tooMany: (max) => `At most ${max} pages are converted at a time.`,
    done: (n) => `Converted ${n} page(s).`,
    choosePdf: "Choose a PDF",
    pages: "Pages",
    pagesHint: "Leave empty for every page, otherwise e.g. 1-3,5",
    format: "Format",
    quality: "JPEG quality",
    resolution: "Resolution",
    screen: "Screen (96 dpi)",
    print: "Print (150 dpi)",
    high: "High (300 dpi)",
    working: (done, total) => `Page ${done} of ${total} …`,
    run: "Convert",
    download: "Download",
    downloadAll: "Download all",
    pageLabel: (n) => `Page ${n}`,
    pageFile: (n) => `page-${n}`,
    note: "The PDF is read locally in your browser and is never uploaded.",
  },
} satisfies Record<Lang, Strings>;

/** Rendering 300 pages at 300 dpi would take the tab down; this is the ceiling. */
export const MAX_PAGES = 50;

/**
 * pdf.js needs its worker as a URL. Vite emits the file as a build asset via the
 * `?url` suffix, which is what keeps this working from inside a published
 * package rather than only in the pack's own repo. Loaded lazily so the ~1 MB
 * engine is fetched when the visitor converts something, not on page load.
 */
async function loadPdfjs() {
  const pdfjs = await import("pdfjs-dist");
  const worker = await import("pdfjs-dist/build/pdf.worker.min.mjs?url");
  pdfjs.GlobalWorkerOptions.workerSrc = worker.default;
  return pdfjs;
}

/**
 * Premium PDF-to-images tool — renders chosen pages of a PDF to PNG or JPEG at a
 * chosen resolution, previews them and hands them over as downloads. Runs
 * entirely in the browser via pdf.js.
 */
interface Props {
  lang?: Lang;
}

export default function PdfToImages({ lang = "de" }: Props) {
  const t = STRINGS[lang];
  const [file, setFile] = useState<File | null>(null);
  const [range, setRange] = useState("");
  const [format, setFormat] = useState<Format>("image/png");
  const [quality, setQuality] = useState(85);
  const [dpi, setDpi] = useState(150);
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null);
  const [pages, setPages] = useState<Rendered[]>([]);
  const [status, setStatus] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Object URLs are a manual resource: without this the previews leak for as
  // long as the tab lives, and a 300 dpi page is several megabytes.
  const urls = useRef<string[]>([]);
  const releaseUrls = () => {
    urls.current.forEach((u) => URL.revokeObjectURL(u));
    urls.current = [];
  };
  useEffect(() => releaseUrls, []);

  const run = async () => {
    setBusy(true);
    setError(null);
    setStatus(null);
    releaseUrls();
    setPages([]);
    try {
      if (!file) throw new Error(t.needPdf);
      const pdfjs = await loadPdfjs();
      const data = new Uint8Array(await file.arrayBuffer());
      const doc = await pdfjs.getDocument({ data }).promise;

      const indices = parseRange(range, doc.numPages);
      if (indices.length === 0) throw new Error(t.badRange);
      if (indices.length > MAX_PAGES) throw new Error(t.tooMany(MAX_PAGES));

      const scale = dpi / 72;
      const out: Rendered[] = [];
      for (const [i, index] of indices.entries()) {
        setProgress({ done: i + 1, total: indices.length });
        const page = await doc.getPage(index + 1);
        const viewport = page.getViewport({ scale });
        const canvas = document.createElement("canvas");
        canvas.width = Math.max(1, Math.floor(viewport.width));
        canvas.height = Math.max(1, Math.floor(viewport.height));
        const ctx = canvas.getContext("2d");
        if (!ctx) continue;
        // A PDF page has no background of its own; without this every
        // transparent area renders black in a JPEG.
        ctx.fillStyle = "#ffffff";
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        await page.render({ canvas, canvasContext: ctx, viewport }).promise;

        const blob = await new Promise<Blob | null>((resolve) =>
          canvas.toBlob((b) => resolve(b), format, quality / 100),
        );
        if (!blob) continue;
        const url = URL.createObjectURL(blob);
        urls.current.push(url);
        out.push({ page: index + 1, url, blob, width: canvas.width, height: canvas.height });
      }

      setPages(out);
      setStatus(t.done(out.length));
    } catch (e) {
      setError(e instanceof Error ? e.message : t.failed);
    } finally {
      setBusy(false);
      setProgress(null);
    }
  };

  const extension = format === "image/png" ? "png" : "jpg";
  // The filename followed the code, not the page: an English visitor got
  // "seite-1.png". Everything else on this island was already translated.
  const saveOne = (p: Rendered) => downloadBlob(p.blob, `${t.pageFile(p.page)}.${extension}`);

  // Geometry/border/padding from the shared primitive; the pack ships no CSS.
  const field = "field-boxed w-full";

  return (
    <div className="pdf-to-images space-y-5">
      <label className="block text-sm">
        <span className="mb-1 block opacity-80">{t.choosePdf}</span>
        <input
          type="file"
          accept="application/pdf"
          className={field}
          onChange={(e) => setFile(e.target.files?.[0] ?? null)}
        />
      </label>

      <div className="grid gap-4 sm:grid-cols-2">
        <label className="block text-sm">
          <span className="mb-1 block opacity-80">{t.pages}</span>
          <input
            type="text"
            className={field}
            value={range}
            placeholder="1-3,5"
            onChange={(e) => setRange(e.target.value)}
          />
          <span className="mt-1 block text-xs opacity-60">{t.pagesHint}</span>
        </label>

        <label className="block text-sm">
          <span className="mb-1 block opacity-80">{t.resolution}</span>
          <select className={field} value={dpi} onChange={(e) => setDpi(Number(e.target.value))}>
            <option value={96}>{t.screen}</option>
            <option value={150}>{t.print}</option>
            <option value={300}>{t.high}</option>
          </select>
        </label>

        <label className="block text-sm">
          <span className="mb-1 block opacity-80">{t.format}</span>
          <select
            className={field}
            value={format}
            onChange={(e) => setFormat(e.target.value as Format)}
          >
            <option value="image/png">PNG</option>
            <option value="image/jpeg">JPG</option>
          </select>
        </label>

        {format === "image/jpeg" && (
          <label className="block text-sm">
            <span className="mb-1 block opacity-80">
              {t.quality}: {quality} %
            </span>
            <input
              type="range"
              min={40}
              max={95}
              step={5}
              value={quality}
              onChange={(e) => setQuality(Number(e.target.value))}
              className="w-full"
            />
          </label>
        )}
      </div>

      <button type="button" className="btn btn-primary" onClick={run} disabled={busy}>
        {busy && progress ? t.working(progress.done, progress.total) : t.run}
      </button>

      {error && <p className="status-pill status-pill--danger text-sm" role="alert">{error}</p>}
      {status && <p className="status-pill status-pill--success text-sm">{status}</p>}

      {pages.length > 0 && (
        <div className="space-y-4">
          <button
            type="button"
            className="btn btn-ghost"
            onClick={() => pages.forEach(saveOne)}
          >
            {t.downloadAll}
          </button>
          <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {pages.map((p) => (
              <li key={p.page} className="space-y-2">
                <img
                  src={p.url}
                  alt={t.pageLabel(p.page)}
                  loading="lazy"
                  className="w-full"
                  width={p.width}
                  height={p.height}
                />
                <div className="flex flex-wrap items-center justify-between gap-2 text-xs opacity-70">
                  <span>
                    {t.pageLabel(p.page)} · {p.width}×{p.height} · {formatBytes(p.blob.size, lang)}
                  </span>
                  <button type="button" className="btn btn-ghost" onClick={() => saveOne(p)}>
                    {t.download}
                  </button>
                </div>
              </li>
            ))}
          </ul>
        </div>
      )}

      <p className="text-xs opacity-60">{t.note}</p>
    </div>
  );
}
