import { defineToolPack, defineTool } from "@tracht-digital-solutions/tds-tools-contract";

/**
 * The PDF toolkit: four premium tools that all run entirely in the visitor's
 * browser. Nothing is uploaded, which is the whole point — the documents people
 * want to compress, stamp or convert are invoices, contracts and scans.
 *
 * `tds-tool-media` keeps its own `pdf-werkzeuge` (merge / split / rotate); the
 * tools here are deliberately disjoint from it rather than a replacement, so no
 * slug ever moves between packs.
 *
 * Every tool ships `premiumDefault` + `priceCentsDefault`; the admin catalog
 * (`/tools-verwaltung`) has the final say on gating and price.
 */
export default defineToolPack({
  id: "pdf",
  name: "PDF",
  version: "0.1.0",
  tools: [
    defineTool({
      id: "pdf-komprimieren",
      slug: "pdf-komprimieren",
      name: "PDF komprimieren",
      category: "media",
      description:
        "PDF-Dateien verkleinern, indem eingebettete Bilder neu berechnet werden. Seitenaufbau und Text bleiben erhalten, die Datei bleibt versandfähig.",
      icon: "shrink",
      keywords: ["pdf", "komprimieren", "verkleinern", "dateigröße", "optimieren"],
      component: "@tracht-digital-solutions/tds-tool-pdf/tools/PdfCompress.astro",
      premiumDefault: true,
      priceCentsDefault: 500,
      seo: {
        title: "PDF komprimieren — Dateigröße verkleinern",
        description:
          "PDF verkleinern ohne Upload: eingebettete Bilder werden im Browser neu berechnet, der Text bleibt unangetastet. Für Anhänge, die zu groß zum Versenden sind.",
      },
    }),
    defineTool({
      id: "pdf-wasserzeichen",
      slug: "pdf-wasserzeichen",
      name: "PDF-Wasserzeichen",
      category: "media",
      description:
        "Wasserzeichen und Stempel in ein PDF setzen: eigener Text oder ein Bild, frei in Größe, Winkel, Deckkraft, Farbe und Seitenauswahl.",
      icon: "stamp",
      keywords: ["pdf", "wasserzeichen", "stempel", "entwurf", "vertraulich", "kopie"],
      component: "@tracht-digital-solutions/tds-tool-pdf/tools/PdfWatermark.astro",
      premiumDefault: true,
      priceCentsDefault: 500,
      seo: {
        title: "PDF-Wasserzeichen einfügen — Text oder Bild",
        description:
          "Wasserzeichen ins PDF setzen: „Entwurf“, „Vertraulich“ oder das eigene Logo, mit einstellbarem Winkel und einstellbarer Deckkraft. Läuft lokal im Browser.",
      },
    }),
    defineTool({
      id: "bilder-zu-pdf",
      slug: "bilder-zu-pdf",
      name: "Bilder zu PDF",
      category: "media",
      description:
        "Mehrere Fotos oder Scans in ein einziges PDF zusammenfassen — mit Seitenformat, Ausrichtung, Rand und frei sortierbarer Reihenfolge.",
      icon: "images",
      keywords: ["bilder", "pdf", "scan", "jpg", "png", "zusammenfassen"],
      component: "@tracht-digital-solutions/tds-tool-pdf/tools/ImagesToPdf.astro",
      premiumDefault: true,
      priceCentsDefault: 500,
      seo: {
        title: "Bilder zu PDF zusammenfügen — JPG und PNG",
        description:
          "Aus abfotografierten Belegen und Scans ein sauberes PDF machen: Reihenfolge festlegen, Seitenformat wählen, fertig. Ohne Upload, direkt im Browser.",
      },
    }),
    defineTool({
      id: "pdf-zu-bildern",
      slug: "pdf-zu-bildern",
      name: "PDF zu Bildern",
      category: "media",
      description:
        "Einzelne PDF-Seiten als PNG oder JPG herausrechnen, in wählbarer Auflösung — für Präsentationen, Vorschaubilder oder den Druck einer Seite.",
      icon: "file-image",
      keywords: ["pdf", "bild", "png", "jpg", "seite", "exportieren", "umwandeln"],
      component: "@tracht-digital-solutions/tds-tool-pdf/tools/PdfToImages.astro",
      premiumDefault: true,
      priceCentsDefault: 500,
      seo: {
        title: "PDF zu Bildern — Seiten als PNG oder JPG",
        description:
          "PDF-Seiten in Bilder umwandeln: Auflösung und Format wählen, einzelne Seiten oder alle. Die Datei verlässt dabei zu keinem Zeitpunkt Ihren Rechner.",
      },
    }),
  ],
  i18n: {
    de: {
      "pdf.compress": "PDF komprimieren",
      "pdf.watermark": "PDF-Wasserzeichen",
      "pdf.imagesToPdf": "Bilder zu PDF",
      "pdf.pdfToImages": "PDF zu Bildern",
    },
    en: {
      "pdf.compress": "Compress PDF",
      "pdf.watermark": "PDF Watermark",
      "pdf.imagesToPdf": "Images to PDF",
      "pdf.pdfToImages": "PDF to Images",
    },
  },
});
