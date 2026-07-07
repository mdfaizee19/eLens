import trafilatura

from app.profiling import stage


def extract_url(url: str) -> tuple[str | None, list[str]]:
    with stage("1_raw_extraction"):
        downloaded = trafilatura.fetch_url(url)
        if downloaded is None:
            raise ValueError(f"Could not fetch URL: {url}")

        metadata = trafilatura.extract_metadata(downloaded)
        title = metadata.title if metadata else None

        extracted = trafilatura.extract(
            downloaded,
            output_format="txt",
            include_comments=False,
            include_tables=False,
            favor_precision=True,
        )
        if not extracted:
            raise ValueError(f"Could not extract readable content from URL: {url}")

        paragraphs = [p.strip() for p in extracted.split("\n") if p.strip()]
    return title, paragraphs
