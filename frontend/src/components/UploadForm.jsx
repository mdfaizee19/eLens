import { useState } from 'react';

const MODES = [
  { key: 'file', label: 'File' },
  { key: 'url', label: 'URL' },
  { key: 'text', label: 'Paste text' },
];

export function UploadForm({ onSubmit, isSubmitting }) {
  const [mode, setMode] = useState('file');
  const [file, setFile] = useState(null);
  const [url, setUrl] = useState('');
  const [text, setText] = useState('');

  // Only the file mode needs a client-side guard (a form with no file
  // selected has nothing to send). URL/text deliberately defer "is this
  // empty/valid" to the backend, which is the actual source of truth for
  // that validation and returns a specific, renderable error either way.
  const canSubmit = !isSubmitting && (mode !== 'file' || file);

  function handleSubmit(e) {
    e.preventDefault();
    if (!canSubmit) return;
    if (mode === 'file') onSubmit({ file });
    else if (mode === 'url') onSubmit({ url });
    else onSubmit({ text });
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-4">
      <div
        role="tablist"
        aria-label="Input mode"
        className="inline-flex rounded-lg border border-gray-300 p-1 self-start"
      >
        {MODES.map(({ key, label }) => (
          <button
            key={key}
            type="button"
            role="tab"
            aria-selected={mode === key}
            onClick={() => setMode(key)}
            className={`px-4 py-1.5 rounded-md text-sm font-medium transition-colors ${
              mode === key
                ? 'bg-gray-900 text-white'
                : 'text-gray-600 hover:bg-gray-100'
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      {mode === 'file' && (
        <label className="flex flex-col gap-1">
          <span className="text-sm font-medium text-gray-700">PDF file</span>
          <input
            type="file"
            accept="application/pdf"
            onChange={(e) => setFile(e.target.files?.[0] ?? null)}
            className="rounded-md border border-gray-300 p-2 text-sm"
          />
        </label>
      )}

      {mode === 'url' && (
        <label className="flex flex-col gap-1">
          <span className="text-sm font-medium text-gray-700">Page URL</span>
          <input
            type="url"
            placeholder="https://example.com/article"
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            className="rounded-md border border-gray-300 p-2 text-sm"
          />
        </label>
      )}

      {mode === 'text' && (
        <label className="flex flex-col gap-1">
          <span className="text-sm font-medium text-gray-700">Paste text</span>
          <textarea
            rows={6}
            value={text}
            onChange={(e) => setText(e.target.value)}
            className="rounded-md border border-gray-300 p-2 text-sm"
          />
        </label>
      )}

      <button
        type="submit"
        disabled={!canSubmit}
        className="self-start rounded-md bg-gray-900 px-5 py-2 text-sm font-semibold text-white disabled:opacity-40 disabled:cursor-not-allowed"
      >
        {isSubmitting ? 'Processing…' : 'Submit'}
      </button>
    </form>
  );
}
