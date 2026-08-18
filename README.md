# @tracht-digital-solutions/tds-tool-pdf

PDF tools for the **TDS tools platform** (`tds-tools-frontend`). Fully
client-side — nothing is uploaded, which is the point: the documents people want
to compress, stamp or convert are invoices, contracts and scans.

## Tools

| id | slug | premium | description |
|---|---|---|---|
| `pdf-komprimieren` | `pdf-komprimieren` | **yes** | Re-encodes embedded JPEGs through a canvas; text, vectors and structure untouched |
| `pdf-wasserzeichen` | `pdf-wasserzeichen` | **yes** | Text watermark with size, colour, opacity, angle and four placements |
| `bilder-zu-pdf` | `bilder-zu-pdf` | **yes** | Photos and scans into one ordered PDF (page size, orientation, margin, fit) |
| `pdf-zu-bildern` | `pdf-zu-bildern` | **yes** | Renders pages to PNG/JPG at 96/150/300 dpi via pdf.js |

All four ship `premiumDefault: true` + `priceCentsDefault: 500`; the admin
catalog decides the final gating and price. The paywall (login + purchase) is
enforced by the site's tool page and `tds-ext-tools-pkg`, not by this package.

`pdf-werkzeuge` (merge / split / rotate) lives in `tds-tool-media-pkg` and is
deliberately not duplicated here.

## Develop

```bash
npm install --no-package-lock
npm run type-check
npm run lint:primitives
npm run test:run     # vitest — manifest + island logic
npm run build
```

## Tests

- **`src/index.test.ts`** — the manifest contract and the **monetisation
  fields**. `premiumDefault` drives the site's `ToolGate` and
  `priceCentsDefault` seeds Stripe Checkout, so a flag lost in an edit silently
  makes a paid tool free. It also measures the copy budgets the tools site
  enforces (description 81–160 characters, SEO title ≤ 60 and never leading with
  the brand, both distinct per tool) — failing here beats failing in a repo whose
  author did not write the sentence.
- **`islands/PdfWatermark.test.ts`** — runs **pdf-lib for real**: colour parsing,
  the WinAnsi folding that stops one pasted emoji from failing the whole export,
  the four placement geometries, and a round trip asserting the `ExtGState` that
  an opacity below 1 requires.
- **`islands/PdfCompress.test.ts`** — the eligibility rule for re-encoding an
  image, tested against real `PDFDict` objects in both directions (JPEG yes;
  Flate, stencil masks, forms and filterless streams no).
- **`islands/ImagesToPdf.test.ts`** — the fit/fill arithmetic and the reorder
  helper.
- **`islands/shared.test.ts`** — the page-range parser, the mm→points
  conversion and the size formatter in both locales.

`test-setup.ts` shims `Blob.arrayBuffer`, which jsdom lacks — a limitation of the
test DOM, not of the tools.

The `.astro` shells and `.tsx` islands are compiled at the **site** build; that
build is also the only place the pdf.js worker asset is proven. Release happens
on push to `main` (auto patch to `@latest`; the manual button is for
minor/major). See `tds-tools-contract-pkg` for the platform model.
