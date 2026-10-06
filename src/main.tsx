import {StrictMode} from 'react';
import {createRoot} from 'react-dom/client';
import App from './App.tsx';
import './index.css';

// Development/testing reference date support (STRICTLY DISABLED in production)
const isDev = typeof import.meta !== 'undefined' && Boolean(import.meta.env?.DEV);
if (isDev && typeof window !== 'undefined') {
  const runtimeEnv = (window as any).__ENV__;
  const envRefDate = runtimeEnv?.VITE_EVENT_REFERENCE_DATE || (typeof import.meta !== 'undefined' ? import.meta.env?.VITE_EVENT_REFERENCE_DATE : undefined);
  const searchParams = typeof window.location?.search === 'string' ? new URLSearchParams(window.location.search) : null;
  const queryRefDate = searchParams?.get('refDate') || searchParams?.get('referenceDate');
  const candidate = (window as any).__EVENT_REFERENCE_DATE__ || queryRefDate || envRefDate;

  if (candidate && typeof candidate === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(candidate.trim())) {
    (window as any).__EVENT_REFERENCE_DATE__ = candidate.trim();
    console.info(`[Dev/Test] Active event reference date: ${(window as any).__EVENT_REFERENCE_DATE__}`);
  }
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
