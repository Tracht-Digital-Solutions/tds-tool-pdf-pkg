import { useState } from "react";
import { PDFDocument } from "pdf-lib";
import { PAGE_SIZES, downloadPdf, mm, reencode, type Lang, type PageSizeKey } from "./shared";

type Orientation = "portrait" | "landscape" | "auto";
type Fit = "fit" | "fill";

interface Strings {
  needImages: string;
  failed: string;
  noneUsable: string;
  done: (n: number) => string;
  outName: string;
  chooseImages: string;
  chosen: (n: number) => string;
  pageSize: string;
  sizeFromImage: string;
  orientation: string;
  portrait: string;
  landscape: string;
  auto: string;
  margin: string;
  fit: string;
  fitWhole: string;
  fitFill: string;
  quality: string;
  order: string;
  up: string;
  down: string;
  remove: string;
  working: string;
  run: string;
  note: string;
}

/** German is the default; an older pinned pack must keep working unchanged. */
const STRINGS = {
  de: {
    needImages: "Bitte mindestens ein Bild wählen.",
    failed: "Das PDF konnte nicht erstellt werden.",
    noneUsable: "Keines der gewählten Bilder konnte gelesen werden.",
    done: (n) => `PDF mit ${n} Seite(n) erstellt.`,
    outName: "bilder.pdf",
    chooseImages: "Bilder auswählen (JPG, PNG, WebP)",
    chosen: (n) => `${n} Bild(er) gewählt`,
    pageSize: "Seitenformat",
    sizeFromImage: "So groß wie das Bild",
    orientation: "Ausrichtung",
    portrait: "Hochformat",
    landscape: "Querformat",
    auto: "Nach Bild richten",
    margin: "Rand (mm)",
    fit: "Bild einpassen",
    fitWhole: "Ganz sichtbar (mit Rand)",
    fitFill: "Seite füllen (Ränder werden beschnitten)",
    quality: "Bildqualität",
    order: "Reihenfolge",
    up: "Nach oben",
    down: "Nach unten",
    remove: "Entfernen",
    working: "Erstelle …",
    run: "PDF erstellen & herunterladen",
    note: "Die Bilder werden lokal im Browser verarbeitet und niemals hochgeladen.",
  },
  en: {
    needImages: "Please choose at least one image.",
    failed: "The PDF could not be created.",
    noneUsable: "None of the chosen images could be read.",
    done: (n) => `Created a PDF with ${n} page(s).`,
    outName: "images.pdf",
    chooseImages: "Choose images (JPG, PNG, WebP)",
    chosen: (n) => `${n} image(s) selected`,
    pageSize: "Page size",
    sizeFromImage: "Same size as the image",
    orientation: "Orientation",
    portrait: "Portrait",
    landscape: "Landscape",
    auto: "Follow the image",
    margin: "Margin (mm)",
    fit: "Image fit",
    fitWhole: "Fully visible (with margin)",
    fitFill: "Fill the page (edges are cropped)",
    quality: "Image quality",
    order: "Order",
    up: "Move up",
    down: "Move down",
    remove: "Remove",
    working: "Creating …",
    run: "Create PDF & download",
    note: "The images are processed locally in your browser and are never uploaded.",
  },
} satisfies Record<Lang, Strings>;

/**
 * Scale an image into a page box. `fit` keeps the whole image visible (letterboxed);
 * `fill` covers the box and lets the overflow be cropped.
 */
export function layout(
  image: { width: number; height: number },
  box: { width: number; height: number },
  mode: Fit,
): { width: number; height: number; x: number; y: number } {
  const ratio = image.width / image.height;
  const boxRatio = box.width / box.height;
  const wide = mode === "fit" ? ratio > boxRatio : ratio < boxRatio;
  const width = wide ? box.width : box.height * ratio;
  const height = wide ? box.width / ratio : box.height;
  return {
    width,
    height,
    x: (box.width - width) / 2,
    y: (box.height - height) / 2,
  };
}

/** Move an item within a list; out-of-range moves are a no-op, not an error. */
export function reorder<T>(items: T[], from: number, to: number): T[] {
  if (to < 0 || to >= items.length || from < 0 || from >= items.length) return items;
  const next = items.slice();
  const [moved] = next.splice(from, 1);
  if (moved === undefined) return items;
  next.splice(to, 0, moved);
  return next;
}

/**
 * Premium images-to-PDF tool — turns a pile of photographed receipts or scans
 * into one ordered PDF, with page size, orientation, margin and fit. Everything
 * happens client-side; nothing is uploaded.
 */
interface Props {
  lang?: Lang;
}

export default function ImagesToPdf({ lang = "de" }: Props) {
  const t = STRINGS[lang];
  const [files, setFiles] = useState<File[]>([]);
  const [pageSize, setPageSize] = useState<PageSizeKey | "image">("a4");
  const [orientation, setOrientation] = useState<Orientation>("auto");
  const [margin, setMargin] = useState(10);
  const [fit, setFit] = useState<Fit>("fit");
  const [quality, setQuality] = useState(80);
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const run = async () => {
    setBusy(true);
    setError(null);
    setStatus(null);
    try {
      if (files.length === 0) throw new Error(t.needImages);
      const doc = await PDFDocument.create();
      let pages = 0;

      for (const file of files) {
        // Everything goes through the canvas: it normalises WebP, HEIC-ish JPEGs
        // and CMYK originals into something pdf-lib can embed, and it applies the
        // quality setting in one place.
        const out = await reencode(file, { quality: quality / 100, type: "image/jpeg" });
        if (!out) continue;
        const embedded = await doc.embedJpg(new Uint8Array(await out.blob.arrayBuffer()));

        let pageWidth: number;
        let pageHeight: number;
        if (pageSize === "image") {
          pageWidth = embedded.width;
          pageHeight = embedded.height;
        } else {
          const preset = PAGE_SIZES[pageSize];
          const wantLandscape =
            orientation === "landscape" ||
            (orientation === "auto" && embedded.width > embedded.height);
          pageWidth = mm(wantLandscape ? preset.h : preset.w);
          pageHeight = mm(wantLandscape ? preset.w : preset.h);
        }

        const page = doc.addPage([pageWidth, pageHeight]);
        const inset = pageSize === "image" ? 0 : mm(margin);
        const box = {
          width: Math.max(1, pageWidth - inset * 2),
          height: Math.max(1, pageHeight - inset * 2),
        };
        const placed = layout(embedded, box, pageSize === "image" ? "fit" : fit);
        page.drawImage(embedded, {
          x: inset + placed.x,
          y: inset + placed.y,
          width: placed.width,
          height: placed.height,
        });
        pages++;
      }

      if (pages === 0) throw new Error(t.noneUsable);
      downloadPdf(await doc.save(), t.outName);
      setStatus(t.done(pages));
    } catch (e) {
      setError(e instanceof Error ? e.message : t.failed);
    } finally {
      setBusy(false);
    }
  };

  // Geometry/border/padding from the shared primitive; the pack ships no CSS.
  const field = "field-boxed w-full";

  return (
    <div className="images-to-pdf space-y-5">
      <label className="block text-sm">
        <span className="mb-1 block opacity-80">{t.chooseImages}</span>
        <input
          type="file"
          accept="image/*"
          multiple
          className={field}
          onChange={(e) => setFiles(Array.from(e.target.files ?? []))}
        />
        {files.length > 0 && (
          <span className="mt-1 block text-xs opacity-60">{t.chosen(files.length)}</span>
        )}
      </label>

      {files.length > 1 && (
        <div className="space-y-2">
          <p className="text-sm opacity-80">{t.order}</p>
          <ul className="tds-list space-y-2">
            {files.map((f, i) => (
              <li key={`${f.name}-${i}`} className="flex flex-wrap items-center gap-2 text-sm">
                <span className="min-w-0 flex-1 truncate">
                  {i + 1}. {f.name}
                </span>
                <button
                  type="button"
                  className="btn btn-ghost"
                  aria-label={t.up}
                  onClick={() => setFiles(reorder(files, i, i - 1))}
                  disabled={i === 0}
                >
                  ↑
                </button>
                <button
                  type="button"
                  className="btn btn-ghost"
                  aria-label={t.down}
                  onClick={() => setFiles(reorder(files, i, i + 1))}
                  disabled={i === files.length - 1}
                >
                  ↓
                </button>
                <button
                  type="button"
                  className="btn btn-ghost"
                  aria-label={t.remove}
                  onClick={() => setFiles(files.filter((_, j) => j !== i))}
                >
                  ✕
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}

      <div className="grid gap-4 sm:grid-cols-2">
        <label className="block text-sm">
          <span className="mb-1 block opacity-80">{t.pageSize}</span>
          <select
            className={field}
            value={pageSize}
            onChange={(e) => setPageSize(e.target.value as PageSizeKey | "image")}
          >
            <option value="a4">A4</option>
            <option value="a5">A5</option>
            <option value="letter">Letter</option>
            <option value="image">{t.sizeFromImage}</option>
          </select>
        </label>

        <label className="block text-sm">
          <span className="mb-1 block opacity-80">{t.orientation}</span>
          <select
            className={field}
            value={orientation}
            disabled={pageSize === "image"}
            onChange={(e) => setOrientation(e.target.value as Orientation)}
          >
            <option value="auto">{t.auto}</option>
            <option value="portrait">{t.portrait}</option>
            <option value="landscape">{t.landscape}</option>
          </select>
        </label>

        <label className="block text-sm">
          <span className="mb-1 block opacity-80">{t.margin}</span>
          <input
            type="number"
            min={0}
            max={40}
            className={field}
            value={margin}
            disabled={pageSize === "image"}
            onChange={(e) => setMargin(Math.max(0, Number(e.target.value)))}
          />
        </label>

        <label className="block text-sm">
          <span className="mb-1 block opacity-80">{t.fit}</span>
          <select
            className={field}
            value={fit}
            disabled={pageSize === "image"}
            onChange={(e) => setFit(e.target.value as Fit)}
          >
            <option value="fit">{t.fitWhole}</option>
            <option value="fill">{t.fitFill}</option>
          </select>
        </label>

        <label className="block text-sm sm:col-span-2">
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
      </div>

      <button type="button" className="btn btn-primary" onClick={run} disabled={busy}>
        {busy ? t.working : t.run}
      </button>

      {error && <p className="status-pill status-pill--danger text-sm" role="alert">{error}</p>}
      {status && <p className="status-pill status-pill--success text-sm">{status}</p>}

      <p className="text-xs opacity-60">{t.note}</p>
    </div>
  );
}
