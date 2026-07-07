import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.jsx'
import { PdfViewerPage } from './PdfViewerPage.jsx'

// One extra route, not worth pulling in a router library for.
const isPdfViewer = window.location.pathname === '/pdf-viewer'
const fileUrl = new URLSearchParams(window.location.search).get('file')

createRoot(document.getElementById('root')).render(
  <StrictMode>
    {isPdfViewer ? <PdfViewerPage fileUrl={fileUrl} /> : <App />}
  </StrictMode>,
)
