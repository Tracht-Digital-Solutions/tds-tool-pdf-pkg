import { describe, expect, it } from "vitest";
import { PDFDict, PDFName, PDFNumber, PDFContext, PDFArray, PDFBool } from "pdf-lib";
import { isRecompressibleImage } from "./PdfCompress";

/** Build a stream dictionary the way a real PDF carries one. */
function dict(entries: Record<string, unknown>): PDFDict {
  const context = PDFContext.create();
  const d = context.obj({}) as PDFDict;
  for (const [key, value] of Object.entries(entries)) {
    d.set(PDFName.of(key), value as never);
  }
  return d;
}

describe("isRecompressibleImage", () => {
  it("accepts a plain JPEG image stream", () => {
    expect(
      isRecompressibleImage(
        dict({ Subtype: PDFName.of("Image"), Filter: PDFName.of("DCTDecode") }),
      ),
    ).toBe(true);
  });

  it("accepts a filter given as an array", () => {
    const context = PDFContext.create();
    const filters = PDFArray.withContext(context);
    filters.push(PDFName.of("DCTDecode"));
    expect(
      isRecompressibleImage(dict({ Subtype: PDFName.of("Image"), Filter: filters })),
    ).toBe(true);
  });

  it("rejects anything that is not an image", () => {
    expect(
      isRecompressibleImage(
        dict({ Subtype: PDFName.of("Form"), Filter: PDFName.of("DCTDecode") }),
      ),
    ).toBe(false);
  });

  it("rejects a Flate-encoded image", () => {
    // Raw samples mean predictors, bit depth and colour space have to be read
    // correctly; getting any of them wrong corrupts the page silently instead
    // of failing, so those images are left exactly as they are.
    expect(
      isRecompressibleImage(
        dict({ Subtype: PDFName.of("Image"), Filter: PDFName.of("FlateDecode") }),
      ),
    ).toBe(false);
  });

  it("rejects a stencil mask", () => {
    // One bit per pixel: re-encoding it as an 8-bit colour image would change
    // what the object means, not just how big it is.
    expect(
      isRecompressibleImage(
        dict({
          Subtype: PDFName.of("Image"),
          Filter: PDFName.of("DCTDecode"),
          ImageMask: PDFBool.True,
        }),
      ),
    ).toBe(false);
  });

  it("rejects a stream with no filter at all", () => {
    expect(isRecompressibleImage(dict({ Subtype: PDFName.of("Image") }))).toBe(false);
  });

  it("does not mistake a width for a filter", () => {
    expect(
      isRecompressibleImage(
        dict({ Subtype: PDFName.of("Image"), Width: PDFNumber.of(100) }),
      ),
    ).toBe(false);
  });
});
