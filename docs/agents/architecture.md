# Architecture

## Layout

- `src/index.ts` — the `ToolPackManifest` with four tools. It is the only file tsup
  compiles and `tsc` type-checks.
- `tools/*.astro` — shells that the site's `/tools/[slug]` template renders. Each takes
  `lang` and forwards it to its island.
- `islands/*.tsx` — hydrated React islands. `pdf-lib` for everything that writes a PDF,
  `pdfjs-dist` for the one tool that renders one.
- `islands/shared.ts` — `parseRange`, `downloadPdf`, `mm`, `formatBytes`, `reencode`.
  Imported relatively, which is fine inside a pack. Only a manifest `component` must be
  a package subpath.
- `islands/` is not type-checked here (`tsconfig` covers `src/**` only). The
  `tds-tools-frontend` build is the real gate for a markup change.

## Tools

| id / slug | island | engine |
|---|---|---|
| `pdf-komprimieren` | `PdfCompress` | pdf-lib + canvas |
| `pdf-wasserzeichen` | `PdfWatermark` | pdf-lib |
| `bilder-zu-pdf` | `ImagesToPdf` | pdf-lib + canvas |
| `pdf-zu-bildern` | `PdfToImages` | **pdfjs-dist** |

`pdf-werkzeuge` (merge/split/rotate) stays in **`tds-tool-media-pkg`** and is
deliberately not duplicated. `composeToolPacks` fails hard on a colliding id or slug,
which takes the whole site build down. `src/index.test.ts` asserts neither name
appears in this pack.

## Manifest contract

- `component` is a package subpath resolved via `exports`, never relative.
- Tool `id` and `slug` must stay unique across all composed packs.
- All four declare `premiumDefault: true` and `priceCentsDefault`. The paywall (login,
  entitlement, Stripe) lives in the site's tool page and `tds-ext-tools-pkg`. This
  package only states the default, which the admin catalog may override.

## The pdf.js worker is a build asset

`PdfToImages` resolves it with
`await import("pdfjs-dist/build/pdf.worker.min.mjs?url")`, which Vite turns into an
emitted file. It loads lazily inside the handler, so a visitor who only reads the guide
doesn't pay for the ~1 MB engine.

- Only the site build proves this works. Verify by grepping the built `dist/` for
  `pdf.worker`, never by reading the diff.
- If a future Vite refuses `?url` from inside a published package, the fallback is
  `?worker&inline`.
