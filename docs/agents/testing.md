# Testing

`npm run test:run` runs vitest. `_build.yml` gates on it between `lint:primitives` and
`build`. These tools carry real binary logic, so the suite must gate releases.
`test-setup.ts` shims `Blob.arrayBuffer`, which jsdom 25 lacks.

| Suite | Covers |
|---|---|
| `src/index.test.ts` | Manifest contract and **monetisation fields**; copy budgets (description 81–160, SEO title ≤ 60, never brand-leading, all distinct); `pdf-werkzeuge` absent |
| `islands/shared.test.ts` | Range parser; an **empty spec means every page** |
| `islands/PdfWatermark.test.ts` | Colour parsing, WinAnsi folding, the four placements, a real pdf-lib round trip asserting an `ExtGState` exists |
| `islands/PdfCompress.test.ts` | Image-eligibility rule against real `PDFDict` objects, both directions |
| `islands/ImagesToPdf.test.ts` | Fit/fill arithmetic (centred overflow, crop shared by both edges), reorder no-op on an out-of-range move |

Why these matter:

- `premiumDefault` drives the site's `ToolGate`, and `priceCentsDefault` seeds Stripe
  Checkout. A flag lost in an edit silently makes a paid tool free.
- Copy budgets are checked here so the failure lands in the repo that owns the sentence.
- An empty range returning `[]` would read as "no valid page range" on the most common path.
- A missing `ExtGState` is how a silently ignored opacity shows up.
