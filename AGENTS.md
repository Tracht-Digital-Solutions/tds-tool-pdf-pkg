# AGENTS.md — tds-tool-pdf-pkg

A **tool package** for the TDS tools platform: four **premium** PDF tools, all
fully client-side. Read `tds-tools-contract-pkg`'s AGENTS.md for the platform
model and `tds-tools-frontend/TOOLS-PLATFORM.md` for the operator handbook.

## Shape

- `src/index.ts` — the `ToolPackManifest` (four tools). The only file tsup
  compiles and `tsc` type-checks.
- `tools/*.astro` — shells the site's `/tools/[slug]` template renders. Each
  takes `lang` and forwards it to its island.
- `islands/*.tsx` — hydrated React islands. `pdf-lib` for everything that writes
  a PDF; `pdfjs-dist` for the one tool that has to *render* one.
- `islands/shared.ts` — `parseRange`, `downloadPdf`, `mm`, `formatBytes`,
  `reencode`. Imported relatively, which is fine *inside* a pack; only a
  manifest's `component` has to be a package subpath.

## The tools

| id / slug | island | engine |
|---|---|---|
| `pdf-komprimieren` | `PdfCompress` | pdf-lib + canvas |
| `pdf-wasserzeichen` | `PdfWatermark` | pdf-lib |
| `bilder-zu-pdf` | `ImagesToPdf` | pdf-lib + canvas |
| `pdf-zu-bildern` | `PdfToImages` | **pdfjs-dist** |

`pdf-werkzeuge` (merge / split / rotate) stays in **`tds-tool-media-pkg`** and is
deliberately *not* duplicated here. `composeToolPacks` hard-errors on a colliding
id or slug, which takes the whole site build down — `src/index.test.ts` asserts
neither name appears in this pack.

## Gotchas

- **This pack ships NO CSS — every control must carry a shared class.** A surface
  layer only sets tokens; they reach an element through `btn` / `chip` /
  `field-boxed` / `status-pill`. A `<button>` without `btn` has no padding, no
  radius and no 44px touch target, and an `<input>` without `field-boxed` renders
  **invisible**, because Tailwind preflight zeroes borders. `npm run
  lint:primitives` runs in CI; the script is a byte-identical copy of the seed in
  `tds-ext-template-pkg`.
- **`status-pill` ist ein Etikett, keine Blockmeldung.** Die Plakette hat
  `white-space: nowrap` und Versalien und ist für ein Wort gedacht. Eine
  Fehlermeldung darin bricht nicht um, sondern macht das Dokument breiter als
  das Fenster: im JSON-Formatter waren es 460px bei 390px Fenster, weil die
  Meldung den Text des Browsers trägt und damit beliebig lang ist. Zu sehen
  ist davon nichts — `body { overflow-x: hidden }` schneidet den Überhang ab,
  man findet es nur, indem man `document.documentElement.scrollWidth` misst.
  Für eine Meldung über mehrere Zeilen ist `tds-alert` (`--success` /
  `--warning` / `--danger`) die richtige Klasse; tds-shared sagt das im
  Kommentar über `.status-pill` auch selbst. Ein `<span>` als kurzes Etikett
  neben etwas anderem bleibt eine Plakette.
- **Never hand-author a radius, and do not reach for
  a `rounded-[…]` arbitrary value either.** Tailwind generates no arbitrary value
  out of a package inside `node_modules`, so from here that ships as no rule at
  all. Use the shared class.
- **`islands/` is NOT type-checked here** (`tsconfig` covers `src/**/*` only).
  The islands are compiled by the `tds-tools-frontend` build — that build is the
  real gate for a markup change, not `npm run type-check`.
- **The pdf.js worker is a build asset, and only the site build proves it.**
  `PdfToImages` resolves it with `await import("pdfjs-dist/build/pdf.worker.min.mjs?url")`,
  which Vite turns into an emitted file. It is loaded lazily inside the handler
  so the ~1 MB engine is not paid for by a visitor who only reads the guide. If a
  future Vite ever refuses the `?url` from inside a published package, the
  fallback is `?worker&inline`. Verify by grepping the built `dist/` for
  `pdf.worker`, never by reading the diff.
- **The compressor only touches JPEGs, on purpose.** `isRecompressibleImage`
  accepts `/DCTDecode` images and nothing else. A Flate-encoded image carries raw
  samples whose meaning depends on predictors, bit depth and colour space, and
  getting any of those wrong corrupts the page *silently* instead of failing. A
  stencil mask (`/ImageMask true`) is one bit per pixel and is skipped for the
  same reason.
- **After re-encoding, the image dictionary must be rewritten, not just the
  bytes.** The canvas always returns baseline RGB, so `Width`, `Height`,
  `Length`, `Filter`, `ColorSpace` and `BitsPerComponent` are all reset and
  `DecodeParms` / `Decode` are deleted — leaving a stale `/DeviceCMYK` behind
  produces a page with wildly wrong colours and no error anywhere.
- **A JPEG has no alpha channel.** `reencode` paints a white ground before
  drawing, or a transparent PNG flattens to **black**. Same reason
  `PdfToImages` fills the canvas before rendering a page.
- **Standard PDF fonts are WinAnsi-encoded.** `toWinAnsi` folds typographic
  quotes and dashes down and drops anything else, because pdf-lib *throws* at
  draw time on an unencodable character — which would surface as a generic
  "could not be processed" for one pasted emoji.
- **Object URLs are a manual resource.** `PdfToImages` keeps every preview URL in
  a ref and revokes on re-run and on unmount; a 300 dpi page is several megabytes
  and the leak lasts as long as the tab.
- `component` = package subpath via `exports`, never relative.
- Tool `id` + `slug` globally unique across composed packs.
- All four declare `premiumDefault: true` + `priceCentsDefault`. The paywall
  itself lives in the site's tool page (login + entitlement) and
  `tds-ext-tools-pkg` (Stripe) — this package only states the default, which the
  admin catalog may override.
- Version stays in the `0.1.x` line (the site pins `^0.1.0`, and a 0.x caret is
  minor-locked).

## Tests

`npm run test:run` (vitest). Unlike the four older tool packs, **the suite runs
in CI** — `_build.yml` gates on it between `lint:primitives` and `build`. These
tools carry real binary logic, and a regression test that gates nothing is
decoration.

- `src/index.test.ts` — manifest contract plus the **monetisation fields**.
  `premiumDefault` drives the site's `ToolGate`, `priceCentsDefault` seeds Stripe
  Checkout; a flag lost in an edit silently makes a paid tool free and nothing
  goes red. Also pins the copy budgets the site measures (description 81–160,
  SEO title ≤ 60 and never brand-leading, all distinct) so the failure lands in
  the repo that owns the sentence.
- `islands/shared.test.ts` — the range parser, including that an **empty spec
  means every page** (the inputs promise exactly that; returning `[]` would read
  as "no valid page range" on the commonest path).
- `islands/PdfWatermark.test.ts` — colour parsing, WinAnsi folding, the four
  placements, and a real pdf-lib round trip asserting an `ExtGState` exists,
  which is how a silently-ignored opacity would show up.
- `islands/PdfCompress.test.ts` — the image-eligibility rule against real
  `PDFDict` objects, both directions.
- `islands/ImagesToPdf.test.ts` — fit/fill arithmetic (centred overflow, so a
  crop is shared between both edges rather than cutting one) and the reorder
  helper's no-op on an out-of-range move.

`test-setup.ts` shims `Blob.arrayBuffer`, which jsdom 25 lacks — a limitation of
the test DOM, not of the tools.

## Release

Push to `main` auto-releases a patch to GitHub Packages `@latest` and dispatches
a rebuild of `tds-tools-frontend`. The manual button is for a minor/major bump.
Use `[skip ci]` in a commit message to skip both.
