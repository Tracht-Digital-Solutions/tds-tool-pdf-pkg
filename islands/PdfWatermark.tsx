import { useState } from "react";
import { PDFDocument, StandardFonts, degrees, rgb } from "pdf-lib";
import { downloadPdf, parseRange, toWinAnsi, type Lang } from "./shared";

type Placement = "diagonal" | "center" | "footer" | "tile";

interface Strings {
  needPdf: string;
  needText: string;
  badRange: string;
  failed: string;
  done: (n: number) => string;
  outName: string;
  choosePdf: string;
  text: string;
  textPlaceholder: string;
  size: string;
  opacity: string;
  colour: string;
  rotation: string;
  placement: string;
  placeDiagonal: string;
  placeCenter: string;
  placeFooter: string;
  placeTile: string;
  pages: string;
  pagesHint: string;
  working: string;
  run: string;
  note: string;
}

/** German is the default; an older pinned pack must keep working unchanged. */
const STRINGS = {
  de: {
    needPdf: "Bitte ein PDF wählen.",
    needText: "Bitte einen Text für das Wasserzeichen eingeben.",
    badRange: "Kein gültiger Seitenbereich.",
    failed: "Das PDF konnte nicht verarbeitet werden.",
    done: (n) => `Wasserzeichen auf ${n} Seite(n) gesetzt.`,
    outName: "wasserzeichen.pdf",
    choosePdf: "PDF auswählen",
    text: "Text",
    textPlaceholder: "Entwurf",
    size: "Schriftgröße",
    opacity: "Deckkraft",
    colour: "Farbe",
    rotation: "Winkel",
    placement: "Anordnung",
    placeDiagonal: "Diagonal über die Seite",
    placeCenter: "Waagerecht in der Mitte",
    placeFooter: "Als Fußzeile",
    placeTile: "Gekachelt über die ganze Seite",
    pages: "Seiten",
    pagesHint: "Leer lassen für alle Seiten, sonst z. B. 1-3,5",
    working: "Verarbeite …",
    run: "Wasserzeichen setzen & herunterladen",
    note: "Das PDF wird lokal im Browser verarbeitet und niemals hochgeladen.",
  },
  en: {
    needPdf: "Please choose a PDF.",
    needText: "Please enter the watermark text.",
    badRange: "That is not a valid page range.",
    failed: "The PDF could not be processed.",
    done: (n) => `Watermark applied to ${n} page(s).`,
    outName: "watermarked.pdf",
    choosePdf: "Choose a PDF",
    text: "Text",
    textPlaceholder: "Draft",
    size: "Font size",
    opacity: "Opacity",
    colour: "Colour",
    rotation: "Angle",
    placement: "Placement",
    placeDiagonal: "Diagonally across the page",
    placeCenter: "Horizontally in the centre",
    placeFooter: "As a footer",
    placeTile: "Tiled across the whole page",
    pages: "Pages",
    pagesHint: "Leave empty for every page, otherwise e.g. 1-3,5",
    working: "Processing …",
    run: "Apply watermark & download",
    note: "The PDF is processed locally in your browser and is never uploaded.",
  },
} satisfies Record<Lang, Strings>;

/** "#e8536f" → pdf-lib rgb(). Falls back to a mid grey on anything unparseable. */
export function hexToRgb(hex: string): { r: number; g: number; b: number } {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex.trim());
  if (!m || !m[1]) return { r: 0.5, g: 0.5, b: 0.5 };
  const n = parseInt(m[1], 16);
  return {
    r: ((n >> 16) & 255) / 255,
    g: ((n >> 8) & 255) / 255,
    b: (n & 255) / 255,
  };
}

// `toWinAnsi` lives in ./shared with the pack's other cross-island helpers.
// Re-exported here because this island's test imports it from this module,
// and because the office pack keeps its copy in shared.ts too — one place per
// pack, so the next fix does not have to be found twice.
export { toWinAnsi } from "./shared";

/**
 * Where to stamp the watermark on a page of the given size. Returns one or more
 * draw positions in PDF user space (origin bottom-left).
 */
export function placementPositions(
  placement: Placement,
  page: { width: number; height: number },
  textWidth: number,
  fontSize: number,
): { x: number; y: number }[] {
  if (placement === "footer") {
    return [{ x: (page.width - textWidth) / 2, y: fontSize }];
  }
  if (placement === "tile") {
    const stepX = Math.max(textWidth + fontSize * 2, 80);
    const stepY = Math.max(fontSize * 5, 80);
    const out: { x: number; y: number }[] = [];
    for (let y = stepY / 2; y < page.height; y += stepY) {
      for (let x = -textWidth / 2; x < page.width; x += stepX) {
        out.push({ x, y });
      }
    }
    return out;
  }
  return [{ x: (page.width - textWidth) / 2, y: (page.height - fontSize) / 2 }];
}

/**
 * Premium watermarking tool — stamps a text watermark onto chosen pages of a
 * PDF, with size, colour, opacity, angle and four placements. Client-side via
 * pdf-lib; the file never leaves the tab.
 */
interface Props {
  lang?: Lang;
}

export default function PdfWatermark({ lang = "de" }: Props) {
  const t = STRINGS[lang];
  const [file, setFile] = useState<File | null>(null);
  const [text, setText] = useState("");
  const [size, setSize] = useState(48);
  const [opacity, setOpacity] = useState(20);
  const [colour, setColour] = useState("#c0392b");
  const [angle, setAngle] = useState(45);
  const [placement, setPlacement] = useState<Placement>("diagonal");
  const [range, setRange] = useState("");
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const run = async () => {
    setBusy(true);
    setError(null);
    setStatus(null);
    try {
      if (!file) throw new Error(t.needPdf);
      const clean = toWinAnsi(text).trim();
      if (clean === "") throw new Error(t.needText);

      const doc = await PDFDocument.load(await file.arrayBuffer());
      const font = await doc.embedFont(StandardFonts.HelveticaBold);
      const pages = doc.getPages();
      const indices = parseRange(range, pages.length);
      if (indices.length === 0) throw new Error(t.badRange);

      const { r, g, b } = hexToRgb(colour);
      const textWidth = font.widthOfTextAtSize(clean, size);
      const turn = placement === "diagonal" ? angle : 0;

      for (const i of indices) {
        const page = pages[i];
        if (!page) continue;
        const { width, height } = page.getSize();
        for (const pos of placementPositions(placement, { width, height }, textWidth, size)) {
          page.drawText(clean, {
            x: pos.x,
            y: pos.y,
            size,
            font,
            color: rgb(r, g, b),
            opacity: opacity / 100,
            rotate: degrees(turn),
          });
        }
      }

      downloadPdf(await doc.save(), t.outName);
      setStatus(t.done(indices.length));
    } catch (e) {
      setError(e instanceof Error ? e.message : t.failed);
    } finally {
      setBusy(false);
    }
  };

  // Geometry/border/padding from the shared primitive; the pack ships no CSS.
  const field = "field-boxed w-full";

  return (
    <div className="pdf-watermark space-y-5">
      <label className="block text-sm">
        <span className="mb-1 block opacity-80">{t.choosePdf}</span>
        <input
          type="file"
          accept="application/pdf"
          className={field}
          onChange={(e) => setFile(e.target.files?.[0] ?? null)}
        />
      </label>

      <label className="block text-sm">
        <span className="mb-1 block opacity-80">{t.text}</span>
        <input
          type="text"
          className={field}
          value={text}
          placeholder={t.textPlaceholder}
          onChange={(e) => setText(e.target.value)}
        />
      </label>

      <div className="grid gap-4 sm:grid-cols-2">
        <label className="block text-sm">
          <span className="mb-1 block opacity-80">{t.placement}</span>
          <select
            className={field}
            value={placement}
            onChange={(e) => setPlacement(e.target.value as Placement)}
          >
            <option value="diagonal">{t.placeDiagonal}</option>
            <option value="center">{t.placeCenter}</option>
            <option value="footer">{t.placeFooter}</option>
            <option value="tile">{t.placeTile}</option>
          </select>
        </label>

        <label className="block text-sm">
          <span className="mb-1 block opacity-80">{t.colour}</span>
          <input
            type="color"
            className={field}
            value={colour}
            onChange={(e) => setColour(e.target.value)}
          />
        </label>

        <label className="block text-sm">
          <span className="mb-1 block opacity-80">
            {t.size}: {size} pt
          </span>
          <input
            type="range"
            min={8}
            max={120}
            step={2}
            value={size}
            onChange={(e) => setSize(Number(e.target.value))}
            className="w-full"
          />
        </label>

        <label className="block text-sm">
          <span className="mb-1 block opacity-80">
            {t.opacity}: {opacity} %
          </span>
          <input
            type="range"
            min={5}
            max={100}
            step={5}
            value={opacity}
            onChange={(e) => setOpacity(Number(e.target.value))}
            className="w-full"
          />
        </label>

        {placement === "diagonal" && (
          <label className="block text-sm">
            <span className="mb-1 block opacity-80">
              {t.rotation}: {angle}°
            </span>
            <input
              type="range"
              min={0}
              max={90}
              step={5}
              value={angle}
              onChange={(e) => setAngle(Number(e.target.value))}
              className="w-full"
            />
          </label>
        )}

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
      </div>

      <button type="button" className="btn btn-primary" onClick={run} disabled={busy}>
        {busy ? t.working : t.run}
      </button>

      {error && <p className="tds-alert tds-alert--danger" role="alert">{error}</p>}
      {status && <p className="tds-alert tds-alert--success">{status}</p>}

      <p className="text-xs opacity-60">{t.note}</p>
    </div>
  );
}
