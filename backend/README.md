# Backend

## System dependencies (required, not optional)

The OCR fallback in `/ingest` (PDF mode) needs both of these installed on the host
running this backend — `pip install -r requirements.txt` alone is not enough, since
`pytesseract` and `pdf2image` are thin wrappers around external binaries:

```
# Debian/Ubuntu-based hosts
apt install tesseract-ocr poppler-utils

# local macOS dev
brew install tesseract poppler
```

If `tesseract` or `pdftoppm`/`pdftoppm`-equivalents aren't on `PATH` (e.g. a custom
install location), set:

- `TESSERACT_CMD` — full path to the `tesseract` binary
- `POPPLER_PATH` — directory containing poppler's `pdftoppm`/`pdftocairo` binaries

The OCR path only runs when `pdfplumber`'s normal text extraction comes back empty
(e.g. scanned/image-only PDFs) — a host without these binaries will still serve every
other case (born-digital PDFs, URL, text) correctly; only the OCR fallback itself will
fail on that host.
