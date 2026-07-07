const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || 'http://localhost:8000';

export class IngestError extends Error {
  constructor(detail, status) {
    super(detail);
    this.name = 'IngestError';
    this.detail = detail;
    this.status = status;
  }
}

// Posts to /ingest per Contract 1. Exactly one of file/url/text must be set;
// the backend itself enforces and reports this - we don't duplicate that
// validation here beyond what's needed for a sane request.
export async function ingest({ file, url, text }) {
  const formData = new FormData();
  if (file) {
    formData.append('file', file);
  } else if (url) {
    formData.append('url', url);
  } else {
    formData.append('text', text ?? '');
  }

  let response;
  try {
    response = await fetch(`${API_BASE_URL}/ingest`, {
      method: 'POST',
      body: formData,
    });
  } catch (networkError) {
    // A real network failure (server down, DNS, CORS block reported as an
    // opaque failure by fetch) - distinct from a 4xx/5xx the server actually
    // answered with.
    throw new IngestError(
      `Could not reach the backend at ${API_BASE_URL}. Is it running? (${networkError.message})`,
      0,
    );
  }

  let body = null;
  try {
    body = await response.json();
  } catch {
    // response wasn't JSON at all
  }

  if (!response.ok) {
    const detail = body?.detail || `Request failed with status ${response.status}`;
    throw new IngestError(detail, response.status);
  }

  return body;
}
