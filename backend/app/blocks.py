import uuid

from app.models import Block, Sentence
from app.profiling import stage
from app.segmentation import split_sentences

MIN_BLOCK_WORDS = 30
MAX_BLOCK_WORDS = 70


def build_blocks(paragraphs: list[str]) -> list[Block]:
    """Group sentences into blocks of ~MIN_BLOCK_WORDS-MAX_BLOCK_WORDS words.

    A block ends at whichever comes first:
      (a) its running word count reaches MAX_BLOCK_WORDS, forcing a break
          even mid-paragraph (at a sentence boundary), or
      (b) a real paragraph boundary is reached and the running word count
          has already reached MIN_BLOCK_WORDS.
    A paragraph boundary alone, below MIN_BLOCK_WORDS (e.g. a short heading),
    does not end a block - it keeps accumulating into the next paragraph.
    Page/document boundaries carry no meaning here: paragraphs is a flat
    sequence with no page markers, so a page edge only ends a block if it
    happens to coincide with (a) or (b).
    """
    blocks: list[Block] = []
    current_sentences: list[str] = []
    current_words = 0

    def flush() -> None:
        nonlocal current_sentences, current_words
        if current_sentences:
            blocks.append(
                Block(
                    id=str(uuid.uuid4()),
                    order=len(blocks),
                    sentences=[
                        Sentence(index=i, text=text)
                        for i, text in enumerate(current_sentences)
                    ],
                )
            )
        current_sentences = []
        current_words = 0

    for paragraph in paragraphs:
        paragraph = paragraph.strip()
        if not paragraph:
            continue

        sentences = [s.text for s in split_sentences(paragraph)]
        with stage("4_build_blocks_grouping"):
            for i, sentence_text in enumerate(sentences):
                current_sentences.append(sentence_text)
                current_words += len(sentence_text.split())

                is_last_sentence_of_paragraph = i == len(sentences) - 1
                if current_words >= MAX_BLOCK_WORDS:
                    flush()
                elif is_last_sentence_of_paragraph and current_words >= MIN_BLOCK_WORDS:
                    flush()

    flush()  # trailing partial block at end of document
    return blocks
