import { useState } from "react";
import { PDFDocument, PDFName, PDFNumber, PDFRawStream } from "pdf-lib";
import { downloadPdf, formatBytes, reencode, type Lang } from "./shared";

interface Strings {
  needOne: string;
  failed: string;
  nothingToDo: string;
  choosePdf: string;
  quality: string;
  maxWidth: string;
  keepSize: string;
  working: string;
  run: string;
  outName: string;
  note: string;
  result: (before: string, after: string, percent: string, images: number) => string;
  grew: string;
}

/** German is the default; an older pinned pack must keep working unchanged. */
const STRINGS = {
  de: {
    needOne: "Bitte ein PDF wählen.",
    failed: "Das PDF konnte nicht verarbeitet werden.",
    nothingToDo:
      "In diesem PDF ließ sich nichts verkleinern — es enthält keine neu berechenbaren Bilder. Das ist bei reinen Textdokumenten normal.",
    choosePdf: "PDF auswählen",
    quality: "Bildqualität",
    maxWidth: "Bilder höchstens breit (Pixel)",
    keepSize: "Größe beibehalten",
    working: "Verarbeite …",
    run: "Verkleinern & herunterladen",
    outName: "verkleinert.pdf",
    note: "Das PDF wird lokal im Browser verarbeitet und niemals hochgeladen.",
    result: (before, after, percent, images) =>
      `${images} Bild(er) neu berechnet: ${before} → ${after} (${percent} kleiner).`,
    grew:
      "Das Ergebnis wäre größer als das Original gewesen — die Datei ist bereits gut komprimiert und wurde unverändert gelassen.",
  },
  en: {
    needOne: "Please choose a PDF.",
    failed: "The PDF could not be processed.",
    nothingToDo:
      "Nothing in this PDF could be made smaller — it holds no images that can be recomputed. That is normal for a pure text document.",
    choosePdf: "Choose a PDF",
    quality: "Image quality",
    maxWidth: "Limit image width to (pixels)",
    keepSize: "Keep original size",
    working: "Processing …",
    run: "Compress & download",
    outName: "compressed.pdf",
    note: "The PDF is processed locally in your browser and is never uploaded.",
    result: (before, after, percent, images) =>
      `Recomputed ${images} image(s): ${before} → ${after} (${percent} smaller).`,
    grew:
      "The result would have been larger than the original — the file is already well compressed and was left untouched.",
  },
} satisfies Record<Lang, Strings>;

/** A PDF name object stringifies as "/Image"; comparing that is dialect-proof. */
function nameOf(value: unknown): string {
  return value === undefined || value === null ? "" : String(value);
}

/**
 * Is this stream a JPEG image we may safely re-encode?
 *
 * Only DCTDecode (JPEG) qualifies. A FlateDecode image carries raw samples whose
 * meaning depends on predictors, bit depth and colour space, and getting any of
 * those wrong silently corrupts the page rather than failing — so those are left
 * exactly as they are.
 */
export function isRecompressibleImage(dict: {
  get: (key: PDFName) => unknown;
}): boolean {
  if (nameOf(dict.get(PDFName.of("Subtype"))) !== "/Image") return false;
  const filter = nameOf(dict.get(PDFName.of("Filter")));
  // Either "/DCTDecode" or an array rendered as "[ /DCTDecode ]".
  if (!filter.includes("/DCTDecode")) return false;
  // A JPEG that is itself a stencil mask has one bit per pixel; re-encoding it
  // as an 8-bit colour image would change what it means.
  if (nameOf(dict.get(PDFName.of("ImageMask"))) === "true") return false;
  return true;
}

/**
 * Premium PDF compressor. Walks the document's object graph, re-encodes every
 * embedded JPEG through a canvas at the chosen quality (optionally downscaling
 * it), and writes the result back into the same object — so text, vectors, links
 * and the page structure are untouched. Runs entirely client-side.
 */
interface Props {
  lang?: Lang;
}

export default function PdfCompress({ lang = "de" }: Props) {
  const t = STRINGS[lang];
  const [file, setFile] = useState<File | null>(null);
  const [quality, setQuality] = useState(65);
  const [maxWidth, setMaxWidth] = useState(1600);
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const run = async () => {
    setBusy(true);
    setError(null);
    setStatus(null);
    try {
      if (!file) throw new Error(t.needOne);
      const originalBytes = await file.arrayBuffer();
      const doc = await PDFDocument.load(originalBytes);

      let touched = 0;
      for (const [ref, obj] of doc.context.enumerateIndirectObjects()) {
        if (!(obj instanceof PDFRawStream)) continue;
        if (!isRecompressibleImage(obj.dict)) continue;

        const jpeg = new Blob([obj.asUint8Array().slice()], { type: "image/jpeg" });
        const out = await reencode(jpeg, {
          maxWidth: maxWidth > 0 ? maxWidth : undefined,
          quality: quality / 100,
          type: "image/jpeg",
        });
        if (!out) continue;
        const bytes = new Uint8Array(await out.blob.arrayBuffer());
        if (bytes.length >= obj.asUint8Array().length) continue;

        const dict = obj.dict;
        dict.set(PDFName.of("Width"), PDFNumber.of(out.width));
        dict.set(PDFName.of("Height"), PDFNumber.of(out.height));
        dict.set(PDFName.of("Length"), PDFNumber.of(bytes.length));
        dict.set(PDFName.of("Filter"), PDFName.of("DCTDecode"));
        dict.set(PDFName.of("ColorSpace"), PDFName.of("DeviceRGB"));
        dict.set(PDFName.of("BitsPerComponent"), PDFNumber.of(8));
        // The canvas always hands back baseline RGB, so any decode array or
        // filter parameters that described the previous encoding are now lies.
        dict.delete(PDFName.of("DecodeParms"));
        dict.delete(PDFName.of("Decode"));
        doc.context.assign(ref, PDFRawStream.of(dict, bytes));
        touched++;
      }

      if (touched === 0) {
        setStatus(t.nothingToDo);
        return;
      }

      const saved = await doc.save({ useObjectStreams: true });
      if (saved.length >= originalBytes.byteLength) {
        setStatus(t.grew);
        return;
      }
      const percent = `${Math.round((1 - saved.length / originalBytes.byteLength) * 100)} %`;
      downloadPdf(saved, t.outName);
      setStatus(
        t.result(
          formatBytes(originalBytes.byteLength, lang),
          formatBytes(saved.length, lang),
          percent,
          touched,
        ),
      );
    } catch (e) {
      setError(e instanceof Error ? e.message : t.failed);
    } finally {
      setBusy(false);
    }
  };

  // Geometry/border/padding from the shared primitive; the pack ships no CSS.
  const field = "field-boxed w-full";

  return (
    <div className="pdf-compress space-y-5">
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
          <span className="mb-1 block opacity-80">
            {t.quality}: {quality} %
          </span>
          <input
            type="range"
            min={30}
            max={95}
            step={5}
            value={quality}
            onChange={(e) => setQuality(Number(e.target.value))}
            className="w-full"
          />
        </label>

        <label className="block text-sm">
          <span className="mb-1 block opacity-80">{t.maxWidth}</span>
          <select
            className={field}
            value={maxWidth}
            onChange={(e) => setMaxWidth(Number(e.target.value))}
          >
            <option value={0}>{t.keepSize}</option>
            <option value={2400}>2400</option>
            <option value={1600}>1600</option>
            <option value={1200}>1200</option>
            <option value={800}>800</option>
          </select>
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
