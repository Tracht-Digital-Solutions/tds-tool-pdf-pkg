import { describe, expect, it } from "vitest";
import { PAGE_SIZES, formatBytes, mm, parseRange } from "./shared";

describe("parseRange", () => {
  it("reads a mixed spec into 0-indexed pages", () => {
    expect(parseRange("1-3,5", 10)).toEqual([0, 1, 2, 4]);
  });

  it("treats an empty spec as every page", () => {
    // The page inputs in this pack all promise "leave empty for every page";
    // returning [] instead would surface as "no valid page range" on the most
    // common path there is.
    expect(parseRange("", 3)).toEqual([0, 1, 2]);
    expect(parseRange("   ", 2)).toEqual([0, 1]);
  });

  it("drops pages outside the document and de-duplicates", () => {
    expect(parseRange("2,2,9-12", 3)).toEqual([1]);
  });

  it("ignores nonsense parts rather than failing the whole spec", () => {
    expect(parseRange("abc,2", 5)).toEqual([1]);
  });

  it("returns nothing when no part is in range", () => {
    expect(parseRange("99", 5)).toEqual([]);
  });

  it("sorts a spec written out of order", () => {
    expect(parseRange("5,1", 6)).toEqual([0, 4]);
  });
});

describe("mm", () => {
  it("converts millimetres to PDF points at 72 dpi", () => {
    expect(mm(25.4)).toBeCloseTo(72, 6);
    expect(mm(0)).toBe(0);
  });

  it("gives A4 its expected point size", () => {
    expect(mm(PAGE_SIZES.a4.w)).toBeCloseTo(595.28, 1);
    expect(mm(PAGE_SIZES.a4.h)).toBeCloseTo(841.89, 1);
  });
});

describe("formatBytes", () => {
  it("scales into KB and MB", () => {
    expect(formatBytes(512, "en")).toBe("512 B");
    expect(formatBytes(2048, "en")).toBe("2.0 KB");
    expect(formatBytes(5 * 1024 * 1024, "en")).toBe("5.0 MB");
  });

  it("uses the German decimal comma", () => {
    expect(formatBytes(1536, "de")).toBe("1,5 KB");
  });

  it("stops at MB rather than inventing a unit, and groups the thousands", () => {
    expect(formatBytes(3 * 1024 * 1024 * 1024, "en")).toBe("3,072.0 MB");
    expect(formatBytes(3 * 1024 * 1024 * 1024, "de")).toBe("3.072,0 MB");
  });
});
