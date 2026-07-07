import { useState } from 'react';
import { ActiveBlockProvider } from './context/ActiveBlockContext';
import { UploadForm } from './components/UploadForm';
import { ErrorMessage } from './components/ErrorMessage';
import { WarningsBanner } from './components/WarningsBanner';
import { CardList } from './components/CardList';
import { ingest } from './lib/api';

const FONT_OPTIONS = [
  { key: 'atkinson', label: 'Atkinson Hyperlegible', family: "'Atkinson Hyperlegible', system-ui, sans-serif" },
  { key: 'opendyslexic', label: 'OpenDyslexic', family: "'OpenDyslexic', system-ui, sans-serif" },
];

function App() {
  const [status, setStatus] = useState('idle'); // idle | loading | success | error
  const [result, setResult] = useState(null);
  const [errorDetail, setErrorDetail] = useState(null);
  const [fontKey, setFontKey] = useState('atkinson');

  const activeFont = FONT_OPTIONS.find((f) => f.key === fontKey);

  async function handleSubmit(payload) {
    setStatus('loading');
    setErrorDetail(null);
    try {
      const response = await ingest(payload);
      setResult(response);
      setStatus('success');
    } catch (err) {
      setErrorDetail(err.detail || err.message);
      setResult(null);
      setStatus('error');
    }
  }

  return (
    <ActiveBlockProvider>
      <div
        className="mx-auto max-w-3xl"
        style={{ padding: '32px', '--reading-font': activeFont.family, lineHeight: 1.6 }}
      >
        <header className="mb-8">
          <h1 className="text-2xl font-bold text-gray-900">AcessLens</h1>
          <p className="mt-1 text-sm text-gray-600">
            Upload a PDF, a URL, or paste text to read it as front-loaded-emphasis
            cards.
          </p>
        </header>

        <div className="mb-6 flex items-center gap-3">
          <label htmlFor="font-select" className="text-sm font-medium text-gray-700">
            Reading font
          </label>
          <select
            id="font-select"
            value={fontKey}
            onChange={(e) => setFontKey(e.target.value)}
            className="rounded-md border border-gray-300 p-1.5 text-sm"
          >
            {FONT_OPTIONS.map((f) => (
              <option key={f.key} value={f.key}>
                {f.label}
              </option>
            ))}
          </select>
        </div>

        <UploadForm onSubmit={handleSubmit} isSubmitting={status === 'loading'} />

        <div className="mt-8 flex flex-col gap-4">
          {status === 'error' && <ErrorMessage detail={errorDetail} />}
          {status === 'success' && result && (
            <>
              {result.title && (
                <h2 className="text-lg font-semibold text-gray-900">{result.title}</h2>
              )}
              <WarningsBanner warnings={result.warnings} />
              <CardList blocks={result.blocks} />
            </>
          )}
        </div>
      </div>
    </ActiveBlockProvider>
  );
}

export default App;
