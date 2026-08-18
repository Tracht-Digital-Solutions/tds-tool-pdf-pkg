import { describe, expect, it } from "vitest";
import { layout, reorder } from "./ImagesToPdf";

describe("layout", () => {
  const box = { width: 400, height: 800 }; // a tall box

  it("letterboxes a wide image in fit mode", () => {
    const placed = layout({ width: 200, height: 100 }, box, "fit");
    expect(placed.width).toBe(400);
    expect(placed.height).toBe(200);
    expect(placed.x).toBe(0);
    expect(placed.y).toBe(300);
  });

  it("covers the box in fill mode, overflowing the long side", () => {
    const placed = layout({ width: 200, height: 100 }, box, "fill");
    expect(placed.height).toBe(800);
    expect(placed.width).toBe(1600);
    // Centred overflow: the crop is shared between both edges rather than
    // taken off one side, which would cut a scanned page in half.
    expect(placed.x).toBe(-600);
  });

  it("leaves a matching aspect ratio untouched in either mode", () => {
    const square = { width: 500, height: 500 };
    const squareBox = { width: 300, height: 300 };
    for (const mode of ["fit", "fill"] as const) {
      const placed = layout(square, squareBox, mode);
      expect(placed.width).toBeCloseTo(300, 6);
      expect(placed.height).toBeCloseTo(300, 6);
      expect(placed.x).toBeCloseTo(0, 6);
      expect(placed.y).toBeCloseTo(0, 6);
    }
  });

  it("centres a tall image inside a tall box in fit mode", () => {
    const placed = layout({ width: 100, height: 400 }, box, "fit");
    expect(placed.height).toBe(800);
    expect(placed.width).toBe(200);
    expect(placed.x).toBe(100);
  });
});

describe("reorder", () => {
  it("moves an item up", () => {
    expect(reorder(["a", "b", "c"], 1, 0)).toEqual(["b", "a", "c"]);
  });

  it("moves an item down", () => {
    expect(reorder(["a", "b", "c"], 0, 2)).toEqual(["b", "c", "a"]);
  });

  it("returns the same list for an out-of-range move", () => {
    // The up/down buttons are disabled at the ends, but a keyboard repeat can
    // still fire one — silently doing nothing beats dropping the item.
    const items = ["a", "b"];
    expect(reorder(items, 0, -1)).toBe(items);
    expect(reorder(items, 1, 2)).toBe(items);
    expect(reorder(items, 5, 0)).toBe(items);
  });

  it("does not mutate the input", () => {
    const items = ["a", "b", "c"];
    reorder(items, 0, 2);
    expect(items).toEqual(["a", "b", "c"]);
  });
});
