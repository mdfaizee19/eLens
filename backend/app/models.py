from typing import List, Literal, Optional
from pydantic import BaseModel


class Sentence(BaseModel):
    index: int
    text: str


class Block(BaseModel):
    id: str
    order: int
    sentences: List[Sentence]


class IngestResponse(BaseModel):
    source_type: Literal["pdf", "url", "text"]
    title: Optional[str] = None
    blocks: List[Block]
    warnings: Optional[List[str]] = None
