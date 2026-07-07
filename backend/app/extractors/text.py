def extract_text(raw_text: str) -> tuple[str | None, list[str]]:
    paragraphs = [p.strip() for p in raw_text.split("\n\n") if p.strip()]
    if not paragraphs:
        paragraphs = [p.strip() for p in raw_text.split("\n") if p.strip()]
    return None, paragraphs
