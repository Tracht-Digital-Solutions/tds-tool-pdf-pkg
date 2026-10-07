# AGENTS.md — tds-tool-pdf-pkg

Tool pack for the public tools platform with four **premium** PDF tools: compress,
watermark, images to PDF and PDF to images. All run fully client-side. It builds against
`@tracht-digital-solutions/tds-tools-contract` and is composed into `tds-tools-frontend`
at build time.

Platform model: `tds-tools-contract-pkg/AGENTS.md`. Operator handbook:
`tds-tools-frontend/TOOLS-PLATFORM.md`.

## Commands

```bash
npm install --no-package-lock   # never npm ci; CI has no lockfile
npm run build                   # tsup, compiles src/index.ts only
npm run type-check              # tsc, covers src/** only
npm run test:run                # vitest (also gates CI)
npm run lint:primitives         # fails on a control without a shared class
```

## Hard rules

- **Every push to `main` publishes a `@latest` patch** and rebuilds `tds-tools-frontend`.
  The manual release button is for minor/major. `[skip ci]` skips both; use it for docs-only commits.
- Merge/split/rotate (`pdf-werkzeuge`) lives in `tds-tool-media-pkg`. Never duplicate it here.
- The compressor only re-encodes JPEGs (`/DCTDecode`). After re-encoding, rewrite the whole image dictionary.
- Text drawn into a PDF goes through `toWinAnsi`; pdf-lib throws on unencodable characters.
- All four tools declare `premiumDefault: true` and `priceCentsDefault`. The paywall lives in the site and `tds-ext-tools-pkg`.
- Ship no CSS. `component` is a package subpath. Tool `id` and `slug` stay unique.
- Stay inside the `0.2.x` line. The site pins `^0.2.0`, and a 0.x caret is minor-locked.

## Topic files

| File | Read before |
|---|---|
| [docs/agents/architecture.md](docs/agents/architecture.md) | Changing the manifest, tools, shared helpers or the pdf.js worker |
| [docs/agents/pdf-processing.md](docs/agents/pdf-processing.md) | Touching compression, re-encoding, fonts or object URLs |
| [docs/agents/conventions.md](docs/agents/conventions.md) | Touching any markup or styling in `islands/` or `tools/` |
| [docs/agents/testing.md](docs/agents/testing.md) | Writing or changing tests |

Workspace rules: `../CLAUDE.md`. Cross-repo state: `../MIGRATION-STATUS.md`.
