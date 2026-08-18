import { describe, expect, it } from "vitest";
import { PDFDocument, PDFName, StandardFonts, degrees, rgb } from "pdf-lib";
import { hexToRgb, placementPositions, toWinAnsi } from "./PdfWatermark";

describe("hexToRgb", () => {
  it("reads a six-digit hex with or without the hash", () => {
    expect(hexToRgb("#ff0000")).toEqual({ r: 1, g: 0, b: 0 });
    expect(hexToRgb("00ff00")).toEqual({ r: 0, g: 1, b: 0 });
  });

  it("falls back to grey rather than throwing on junk", () => {
    // The colour comes from an <input type="color">, but a pinned older browser
    // can hand back an empty string — a grey watermark beats a failed export.
    expect(hexToRgb("")).toEqual({ r: 0.5, g: 0.5, b: 0.5 });
    expect(hexToRgb("#12345")).toEqual({ r: 0.5, g: 0.5, b: 0.5 });
  });
});

describe("toWinAnsi", () => {
  it("keeps German text intact", () => {
    expect(toWinAnsi("Größenänderung für Müller")).toBe("Größenänderung für Müller");
  });

  it("folds typographic punctuation down to its ASCII twin", () => {
    expect(toWinAnsi("„Entwurf“ – intern")).toBe('"Entwurf" - intern');
    expect(toWinAnsi("mehr …")).toBe("mehr ...");
  });

  it("drops characters the standard fonts cannot encode", () => {
    // pdf-lib throws at draw time on an unencodable character, which would
    // surface as a generic "could not be processed" for one stray emoji.
    expect(toWinAnsi("Entwurf 🚀")).toBe("Entwurf ");
  });
});

describe("placementPositions", () => {
  const page = { width: 600, height: 800 };

  it("centres a single stamp for the centre placement", () => {
    const [pos] = placementPositions("center", page, 200, 48);
    expect(pos).toEqual({ x: 200, y: (800 - 48) / 2 });
  });

  it("puts the footer stamp near the bottom edge", () => {
    const [pos] = placementPositions("footer", page, 200, 12);
    expect(pos?.y).toBe(12);
    expect(pos?.x).toBe(200);
  });

  it("tiles across the whole page", () => {
    const positions = placementPositions("tile", page, 100, 20);
    expect(positions.length).toBeGreaterThan(4);
    expect(positions.every((p) => p.y < page.height)).toBe(true);
  });

  it("starts the tiling left of the page so the edge is covered too", () => {
    const positions = placementPositions("tile", page, 100, 20);
    expect(positions[0]?.x).toBeLessThan(0);
  });
});

describe("stamping a real PDF", () => {
  /** Build a one-page PDF in memory so the test needs no fixture on disk. */
  async function blankPdf(): Promise<Uint8Array> {
    const doc = await PDFDocument.create();
    doc.addPage([600, 800]);
    return doc.save();
  }

  it("writes the watermark onto the chosen page and keeps the page count", async () => {
    const doc = await PDFDocument.load(await blankPdf());
    const font = await doc.embedFont(StandardFonts.HelveticaBold);
    const page = doc.getPages()[0]!;
    page.drawText("Entwurf", {
      x: 100,
      y: 400,
      size: 48,
      font,
      color: rgb(1, 0, 0),
      opacity: 0.2,
      rotate: degrees(45),
    });

    const out = await PDFDocument.load(await doc.save());
    expect(out.getPageCount()).toBe(1);
    // An opacity below 1 forces pdf-lib to attach an ExtGState; its absence is
    // how a silently-ignored opacity setting would show up.
    const resources = out.getPages()[0]!.node.Resources();
    expect(resources?.get(PDFName.of("ExtGState"))).toBeDefined();
  });

  it("measures text with the same font it draws with", async () => {
    const doc = await PDFDocument.create();
    const font = await doc.embedFont(StandardFonts.HelveticaBold);
    const width = font.widthOfTextAtSize("Entwurf", 48);
    expect(width).toBeGreaterThan(0);
    // The centre placement subtracts this from the page width; a zero would
    // stack every stamp on the left edge.
    const [pos] = placementPositions("center", { width: 600, height: 800 }, width, 48);
    expect(pos?.x).toBeLessThan(300);
  });
});
