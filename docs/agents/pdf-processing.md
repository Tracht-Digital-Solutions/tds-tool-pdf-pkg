# PDF processing rules

## The compressor only touches JPEGs

`isRecompressibleImage` accepts `/DCTDecode` images and nothing else.

- A Flate-encoded image carries raw samples whose meaning depends on predictors, bit
  depth and colour space. Getting any of those wrong corrupts the page **silently**.
- A stencil mask (`/ImageMask true`) is one bit per pixel and is skipped for the same reason.

## Rewrite the image dictionary, not just the bytes

The canvas always returns baseline RGB. After re-encoding, reset `Width`, `Height`,
`Length`, `Filter`, `ColorSpace` and `BitsPerComponent`, and delete `DecodeParms` and
`Decode`. A stale `/DeviceCMYK` produces wildly wrong colours with no error anywhere.

## A JPEG has no alpha channel

`reencode` paints a white ground before drawing, or a transparent PNG flattens to
**black**. `PdfToImages` fills the canvas before rendering a page for the same reason.

## Fonts

Standard PDF fonts are WinAnsi-encoded. `toWinAnsi` folds typographic quotes and dashes
and drops anything else, because pdf-lib **throws** at draw time on an unencodable
character. One pasted emoji would otherwise surface as a generic "could not be processed".

## Object URLs are a manual resource

`PdfToImages` keeps every preview URL in a ref and revokes them on re-run and on
unmount. A 300 dpi page is several megabytes, and the leak lasts as long as the tab.
