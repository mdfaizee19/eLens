import { useEffect, useRef, useState } from 'react';
import * as pdfjsLib from 'pdfjs-dist';

pdfjsLib.GlobalWorkerOptions.workerSrc = '/pdfjs/pdf.worker.mjs';

// A real web page (not a Chrome-extension page) rendering a PDF with a real
// text layer via PDF.js. This exists specifically so the AcessLens
// extension's gaze-tracking effect has real DOM text to work with when
// reading a PDF - Chrome's built-in PDF viewer doesn't expose one, and a
// sandboxed extension page can't get camera access (opaque origin). A real
// http(s) origin is the only context that satisfies both at once.
export function PdfViewerPage({ fileUrl }) {
  const pagesRef = useRef(null);
  const [status, setStatus] = useState('Loading…');

  useEffect(() => {
    if (!fileUrl || !pagesRef.current) return;
    let cancelled = false;

    async function render() {
      try {
        const pdf = await pdfjsLib.getDocument({
          url: fileUrl,
          cMapUrl: '/pdfjs/cmaps/',
          cMapPacked: true,
          standardFontDataUrl: '/pdfjs/standard_fonts/',
        }).promise;
        if (cancelled) return;
        setStatus(`${pdf.numPages} pages`);

        for (let pageNum = 1; pageNum <= pdf.numPages; pageNum++) {
          if (cancelled) return;
          const page = await pdf.getPage(pageNum);
          const viewport = page.getViewport({ scale: 1.4 });

          const pageContainer = document.createElement('div');
          pageContainer.className = 'pdf-page';
          pageContainer.style.cssText = `position: relative; background: white; box-shadow: 0 2px 8px rgba(0,0,0,0.3); width: ${viewport.width}px; height: ${viewport.height}px;`;

          const canvas = document.createElement('canvas');
          canvas.width = viewport.width;
          canvas.height = viewport.height;
          canvas.style.display = 'block';
          pageContainer.appendChild(canvas);

          const textLayerDiv = document.createElement('div');
          textLayerDiv.className = 'textLayer';
          textLayerDiv.style.width = viewport.width + 'px';
          textLayerDiv.style.height = viewport.height + 'px';
          pageContainer.appendChild(textLayerDiv);

          pagesRef.current.appendChild(pageContainer);

          await page.render({ canvasContext: canvas.getContext('2d'), viewport }).promise;
          const textContent = await page.getTextContent();
          await new pdfjsLib.TextLayer({ textContentSource: textContent, container: textLayerDiv, viewport }).render();
        }
      } catch (err) {
        if (!cancelled) setStatus('Failed to load PDF: ' + err.message);
      }
    }

    render();
    return () => {
      cancelled = true;
    };
  }, [fileUrl]);

  return (
    <div style={{ background: '#525659', minHeight: '100vh' }}>
      <link rel="stylesheet" href="/pdfjs/pdf_viewer.css" />
      <div
        style={{
          position: 'sticky',
          top: 0,
          zIndex: 100,
          background: '#323639',
          color: 'white',
          padding: '10px 16px',
          display: 'flex',
          alignItems: 'center',
          gap: 12,
          fontSize: 13,
          fontFamily: 'system-ui, sans-serif',
        }}
      >
        <strong>AcessLens PDF Viewer</strong>
        <span style={{ opacity: 0.8 }}>{status}</span>
        <span style={{ opacity: 0.6 }}>
          Turn on AcessLens gaze tracking from the toolbar icon to enable the reading effect.
        </span>
      </div>
      <div
        ref={pagesRef}
        style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 16, padding: '24px 0 200px' }}
      />
    </div>
  );
}
