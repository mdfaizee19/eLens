import concurrent.futures
import logging
import os

logger = logging.getLogger(__name__)

OCR_PAGE_CAP = 20
OCR_DPI = 300
OCR_TIMEOUT_SECONDS = 60


class OcrPageLimitExceeded(ValueError):
    def __init__(self, page_count: int):
        super().__init__(
            f"Document too long for OCR fallback — {OCR_PAGE_CAP} page limit "
            f"(document has {page_count} pages)"
        )


class OcrTimeout(ValueError):
    def __init__(self):
        super().__init__(f"OCR fallback exceeded {OCR_TIMEOUT_SECONDS}s timeout")


class OcrRasterizationError(ValueError):
    def __init__(self, reason: str):
        super().__init__(f"Could not rasterize PDF for OCR: {reason}")


class OcrNoTextFound(ValueError):
    def __init__(self):
        super().__init__(
            "No extractable text found in this PDF, even after OCR — the "
            "document may be blank or contain no readable content."
        )


def _configure_binaries():
    import pytesseract

    tesseract_cmd = os.environ.get("TESSERACT_CMD")
    if tesseract_cmd:
        pytesseract.pytesseract.tesseract_cmd = tesseract_cmd


def _ocr_pages(data: bytes) -> tuple[list[str], list[int]]:
    from pdf2image import convert_from_bytes
    import pytesseract

    _configure_binaries()
    poppler_path = os.environ.get("POPPLER_PATH")
    try:
        images = convert_from_bytes(data, dpi=OCR_DPI, poppler_path=poppler_path)
    except Exception as exc:
        raise OcrRasterizationError(str(exc)) from exc

    page_texts = []
    failed_pages = []
    for i, image in enumerate(images):
        try:
            page_texts.append(pytesseract.image_to_string(image))
        except Exception:
            logger.exception("OCR failed on page %d, skipping that page", i + 1)
            page_texts.append("")
            failed_pages.append(i + 1)
    return page_texts, failed_pages


def ocr_pdf_pages(data: bytes, page_count: int) -> tuple[list[str], list[str]]:
    """Rasterize each page at OCR_DPI and OCR it independently. Raises
    OcrPageLimitExceeded before doing any work if page_count > OCR_PAGE_CAP,
    OcrTimeout if the whole run exceeds OCR_TIMEOUT_SECONDS, and
    OcrRasterizationError if pdf2image/poppler can't rasterize the file at all
    (e.g. a malformed PDF that pdfplumber alone didn't already reject).

    Returns (page_texts, warnings) - page_texts excludes empty/whitespace-only
    pages (including pages that failed OCR); warnings has one human-readable
    message per page that failed OCR, e.g. for partial-result signaling."""
    if page_count > OCR_PAGE_CAP:
        raise OcrPageLimitExceeded(page_count)

    with concurrent.futures.ThreadPoolExecutor(max_workers=1) as executor:
        future = executor.submit(_ocr_pages, data)
        try:
            page_texts, failed_pages = future.result(timeout=OCR_TIMEOUT_SECONDS)
        except concurrent.futures.TimeoutError as exc:
            raise OcrTimeout() from exc

    warnings = [
        f"OCR failed on page {page_num} of {page_count} — content from that page is missing."
        for page_num in failed_pages
    ]
    return [t.strip() for t in page_texts if t.strip()], warnings
