import io
import re
import statistics

import pdfplumber

from app.extractors.ocr import OcrNoTextFound, ocr_pdf_pages
from app.profiling import stage

# Below this many non-whitespace characters, treat pdfplumber's extraction as
# empty (e.g. a scanned/image-only PDF) and fall back to OCR.
MIN_EXTRACTED_CHARS = 20


# A repeated running-footer/header line (e.g. "Roger Grosse CSC321 Lecture 1:
# Introduction 3 / 26") must appear at this fraction of pages, at the same
# vertical position, to be excluded as boilerplate rather than content.
REPEATED_LINE_MIN_PAGE_FRACTION = 0.5


def _open_pdf(data: bytes):
    """pdfminer/pdfplumber raise many different exception types on malformed
    or non-PDF input (missing /Root, bad xref, etc.) - normalize all of them
    into a clear ValueError so callers get a 4xx instead of an unhandled 500."""
    try:
        return pdfplumber.open(io.BytesIO(data))
    except Exception as exc:
        raise ValueError(f"Could not read PDF: {exc}") from exc


def _page_lines(page) -> list[tuple[float, float, str]]:
    """Return (top, bottom, text) for each line on the page, grouped by
    vertical position - the same word-position data used for paragraph-break
    detection, reused here to also detect running footers/headers."""
    with stage("1_raw_extraction"):
        words = page.extract_words(x_tolerance=1)
    if not words:
        return []

    with stage("2_layout_heuristic"):
        grouped: dict[float, list] = {}
        for w in words:
            grouped.setdefault(round(w["top"], 1), []).append(w)

        lines = []
        for top in sorted(grouped.keys()):
            line_words = sorted(grouped[top], key=lambda w: w["x0"])
            text = " ".join(w["text"] for w in line_words)
            bottom = max(w["bottom"] for w in line_words)
            lines.append((top, bottom, text))
        return lines


def _repeat_key(top: float, text: str) -> tuple[float, str]:
    # Slide/page numbers are the only part of a running footer that changes
    # page to page (e.g. "... Introduction 1 / 26" vs "... Introduction 2 /
    # 26"), so normalize digits out before comparing text across pages.
    normalized_text = re.sub(r"\d+", "#", text).strip()
    return (round(top), normalized_text)


def _find_repeated_lines(
    pages_lines: list[list[tuple[float, float, str]]],
) -> set[tuple[float, str]]:
    """Identify lines that recur at the same vertical position on most pages
    - running titles, footers, slide counters - so they can be excluded from
    paragraph text instead of being folded into sentences as content."""
    if len(pages_lines) < 3:
        return set()  # too few pages for "repeats across pages" to mean anything

    page_counts: dict[tuple[float, str], int] = {}
    for lines in pages_lines:
        keys_this_page = {_repeat_key(top, text) for top, _, text in lines}
        for key in keys_this_page:
            page_counts[key] = page_counts.get(key, 0) + 1

    threshold = max(2, round(len(pages_lines) * REPEATED_LINE_MIN_PAGE_FRACTION))
    return {key for key, count in page_counts.items() if count >= threshold}


def _paragraphs_from_lines(
    lines: list[tuple[float, float, str]], excluded_keys: set[tuple[float, str]]
) -> list[str]:
    with stage("2_layout_heuristic"):
        lines = [
            (top, bottom, text)
            for top, bottom, text in lines
            if _repeat_key(top, text) not in excluded_keys
        ]
        if not lines:
            return []

        # A real paragraph break shows up as a line-to-line gap well above the
        # page's normal (single-spaced) line gap. Sub/superscript glyphs in
        # mathematical notation occasionally produce small negative gaps as an
        # artifact of this PDF's font metrics; those are noise, not breaks, so
        # only gaps clearly larger than normal count.
        raw_gaps = [lines[i][0] - lines[i - 1][1] for i in range(1, len(lines))]
        typical_gaps = [g for g in raw_gaps if 0 < g < 5]
        normal_gap = statistics.median(typical_gaps) if typical_gaps else 1.0
        break_threshold = max(normal_gap * 3, normal_gap + 2)

        paragraphs = []
        current_lines = [lines[0][2]]
        for i in range(1, len(lines)):
            gap = lines[i][0] - lines[i - 1][1]
            if gap > break_threshold:
                paragraphs.append(" ".join(current_lines))
                current_lines = [lines[i][2]]
            else:
                current_lines.append(lines[i][2])
        if current_lines:
            paragraphs.append(" ".join(current_lines))

        return [" ".join(p.split()) for p in paragraphs if p.strip()]


def extract_pdf(data: bytes) -> tuple[str | None, list[str]]:
    paragraphs: list[str] = []

    with _open_pdf(data) as pdf:
        title = (pdf.metadata or {}).get("Title") or None
        pages_lines = [_page_lines(page) for page in pdf.pages]
        excluded_keys = _find_repeated_lines(pages_lines)
        for lines in pages_lines:
            paragraphs.extend(_paragraphs_from_lines(lines, excluded_keys))

    return title, paragraphs


def _extracted_char_count(paragraphs: list[str]) -> int:
    return len("".join(paragraphs).strip())


def extract_pdf_with_ocr_fallback(data: bytes) -> tuple[str | None, list[str], list[str]]:
    """Same result as extract_pdf() for every PDF that already extracts
    cleanly - OCR only runs when that extraction comes back empty. Returns
    (title, paragraphs, warnings); warnings is empty except when one or more
    OCR'd pages fail."""
    title, paragraphs = extract_pdf(data)

    if _extracted_char_count(paragraphs) > MIN_EXTRACTED_CHARS:
        return title, paragraphs, []

    with _open_pdf(data) as pdf:
        page_count = len(pdf.pages)

    if page_count == 0:
        raise ValueError("PDF has no pages")

    page_texts, warnings = ocr_pdf_pages(data, page_count)
    ocr_paragraphs = [
        " ".join(p.split())
        for page_text in page_texts
        for p in page_text.split("\n\n")
        if p.strip()
    ]

    if not ocr_paragraphs:
        raise OcrNoTextFound()

    return title, ocr_paragraphs, warnings
