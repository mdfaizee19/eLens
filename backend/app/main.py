import logging

from fastapi import FastAPI, File, Form, HTTPException, UploadFile
from fastapi.encoders import jsonable_encoder
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse

from app.blocks import build_blocks
from app.extractors.pdf import extract_pdf_with_ocr_fallback
from app.extractors.text import extract_text
from app.extractors.url import extract_url
from app.models import IngestResponse
from app.profiling import log_request_timings, start_request

logging.basicConfig(level=logging.INFO)
logging.getLogger("app.profiling").setLevel(logging.INFO)

app = FastAPI(title="AcessLens API")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173"],
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.post("/ingest", response_model=IngestResponse)
async def ingest(
    file: UploadFile | None = File(default=None),
    url: str | None = Form(default=None),
    text: str | None = Form(default=None),
):
    provided = [v for v in (file, url, text) if v]
    if len(provided) != 1:
        raise HTTPException(
            status_code=400,
            detail="Provide exactly one of: file, url, text",
        )

    start_request()
    warnings: list[str] = []

    try:
        if file is not None:
            data = await file.read()
            title, paragraphs, warnings = extract_pdf_with_ocr_fallback(data)
            source_type = "pdf"
        elif url is not None:
            title, paragraphs = extract_url(url)
            source_type = "url"
        else:
            title, paragraphs = extract_text(text)
            source_type = "text"
    except ValueError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc

    blocks = build_blocks(paragraphs)
    log_request_timings(source_type)

    response = IngestResponse(
        source_type=source_type,
        title=title,
        blocks=blocks,
        warnings=warnings or None,
    )
    payload = response.model_dump()
    if not payload.get("warnings"):
        payload.pop("warnings", None)
    return JSONResponse(content=jsonable_encoder(payload))
