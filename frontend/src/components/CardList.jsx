import { Card } from './Card';

export function CardList({ blocks }) {
  if (!blocks || blocks.length === 0) {
    return <p className="text-sm text-gray-500">No readable content found.</p>;
  }

  return (
    <div className="flex flex-col gap-6" style={{ margin: '32px 0' }}>
      {blocks
        .slice()
        .sort((a, b) => a.order - b.order)
        .map((block) => (
          <Card key={block.id} block={block} />
        ))}
    </div>
  );
}
