// @vitest-environment jsdom
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

/**
 * The one island in this pack that had no test — and the one with the two
 * mechanisms most likely to break silently:
 *
 *  1. **The lazy pdf.js load.** The engine and its worker are imported inside
 *     the click handler, and the worker arrives through Vite's `?url` suffix.
 *     Both are what keep a ~1 MB engine off the guide page and what make the
 *     tool work from inside a *published* package rather than only in this
 *     repo. A static import would still pass every other gate here.
 *  2. **The object-URL ledger.** Each rendered page mints one; they are
 *     released on re-run and on unmount. This is the pattern the media pack was
 *     missing, so it is worth pinning where it is already right.
 *
 * The rendering itself is pdf.js's job and is stubbed: what is asserted is this
 * island's own arithmetic and bookkeeping.
 */

const SOURCE = readFileSync(join(__dirname, "PdfToImages.tsx"), "utf8");

describe("the engine stays lazy", () => {
  it("imports pdfjs inside a handler, never at module scope", () => {
    // A top-level `import ... from "pdfjs-dist"` would ship the engine to every
    // visitor of the tool page, including the ones only reading the guide.
    expect(SOURCE).not.toMatch(/^import .*from "pdfjs-dist/m);
    expect(SOURCE).toMatch(/await import\("pdfjs-dist"\)/);
  });

  it("asks Vite for the worker as a URL asset", () => {
    // Without `?url` the worker is bundled as a module and pdf.js cannot start
    // it — and only a real site build shows that.
    expect(SOURCE).toMatch(/pdfjs-dist\/build\/pdf\.worker\.min\.mjs\?url/);
  });
});

// --- Behaviour -------------------------------------------------------------

let pageCount = 3;
let minted: string[] = [];
let revoked: string[] = [];

const renderPage = vi.fn();

vi.mock("pdfjs-dist", () => ({
  GlobalWorkerOptions: { workerSrc: "" },
  getDocument: vi.fn(() => ({
    promise: Promise.resolve({
      numPages: pageCount,
      getPage: vi.fn(async () => ({
        getViewport: vi.fn(() => ({ width: 100, height: 140 })),
        render: vi.fn(() => ({ promise: Promise.resolve(renderPage()) })),
      })),
    }),
  })),
}));

vi.mock("pdfjs-dist/build/pdf.worker.min.mjs?url", () => ({ default: "/worker.js" }));

const { default: PdfToImages, MAX_PAGES } = await import("./PdfToImages");

beforeEach(() => {
  pageCount = 3;
  minted = [];
  revoked = [];

  Object.defineProperty(URL, "createObjectURL", {
    configurable: true,
    value: vi.fn(() => {
      const url = `blob:page-${minted.length + 1}`;
      minted.push(url);
      return url;
    }),
  });
  Object.defineProperty(URL, "revokeObjectURL", {
    configurable: true,
    value: vi.fn((u: string) => void revoked.push(u)),
  });

  vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockImplementation(
    () => ({ drawImage: vi.fn(), fillRect: vi.fn(), scale: vi.fn() }) as unknown as CanvasRenderingContext2D,
  );
  vi.spyOn(HTMLCanvasElement.prototype, "toBlob").mockImplementation(function (cb: BlobCallback) {
    cb(new Blob([new Uint8Array(64)], { type: "image/png" }));
  });
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  delete (URL as Partial<typeof URL>).createObjectURL;
  delete (URL as Partial<typeof URL>).revokeObjectURL;
});

async function convert(lang?: "en") {
  const u = userEvent.setup({ delay: null });
  render(lang ? <PdfToImages lang={lang} /> : <PdfToImages />);
  const file = new File([new Uint8Array(32)], "doc.pdf", { type: "application/pdf" });
  await u.upload(screen.getByLabelText(lang === "en" ? /Choose a PDF/i : /PDF/i), file);
  await u.click(screen.getByRole("button", { name: lang === "en" ? /Convert/i : /Umwandeln|Konvertieren/i }));
  return u;
}

describe("converting", () => {
  it("renders one preview per page of the document", async () => {
    await convert();
    await waitFor(() => expect(minted).toHaveLength(3));
  });

  it("releases the previous run's urls before a second run", async () => {
    const u = await convert();
    await waitFor(() => expect(minted).toHaveLength(3));
    const first = [...minted];

    await u.click(screen.getByRole("button", { name: /Umwandeln|Konvertieren/i }));
    await waitFor(() => {
      for (const url of first) expect(revoked).toContain(url);
    });
  });

  it("releases every url on unmount", async () => {
    const u = userEvent.setup({ delay: null });
    const view = render(<PdfToImages />);
    const file = new File([new Uint8Array(32)], "doc.pdf", { type: "application/pdf" });
    await u.upload(screen.getByLabelText(/PDF/i), file);
    await u.click(screen.getByRole("button", { name: /Umwandeln|Konvertieren/i }));
    await waitFor(() => expect(minted).toHaveLength(3));

    view.unmount();
    for (const url of minted) expect(revoked).toContain(url);
  });

  it("refuses a document beyond the page ceiling instead of freezing the tab", async () => {
    // MAX_PAGES exists because 300 pages at 300 dpi takes the tab down. The
    // limit has to be enforced BEFORE any rendering starts.
    pageCount = MAX_PAGES + 1;
    await convert();
    await waitFor(() => expect(screen.getByRole("alert")).toBeDefined());
    expect(minted).toHaveLength(0);
  });
});
