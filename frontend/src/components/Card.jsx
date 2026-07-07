import { FrontLoadedText } from './FrontLoadedText';

// Renders one block from Contract 1 (`id`, `order`, `sentences[].index/.text`)
// as a reading card.
export function Card({ block }) {
  return (
    <article
      data-block-id={block.id}
      data-block-order={block.order}
      className="reading-surface rounded-lg border border-gray-200 bg-white p-8 shadow-sm"
    >
      <p className="text-lg text-gray-900">
        {block.sentences.map((sentence) => (
          <span key={sentence.index}>
            <FrontLoadedText text={sentence.text} />{' '}
          </span>
        ))}
      </p>
    </article>
  );
}
