from functools import lru_cache

import spacy

from app.models import Sentence
from app.profiling import stage


@lru_cache(maxsize=1)
def _nlp():
    with stage("3a_spacy_model_load"):
        return spacy.load("en_core_web_sm", exclude=["ner", "lemmatizer"])


def split_sentences(text: str) -> list[Sentence]:
    with stage("3b_spacy_segmentation"):
        doc = _nlp()(text)
        sentences = [s.text.strip() for s in doc.sents if s.text.strip()]
    return [Sentence(index=i, text=s) for i, s in enumerate(sentences)]
