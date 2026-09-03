/**
 * Girl's Room — browser entry point.
 *
 * The one job here beyond mounting: if the content files fail validation, say so on the page
 * in full rather than showing a blank screen. Hard rule 9 — a typo'd id fails loudly, and a
 * white page is the quietest failure there is.
 */

import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';

import App from './App.tsx';
import './styles.css';

const root = document.getElementById('root');

if (root !== null) {
  try {
    createRoot(root).render(<StrictMode><App /></StrictMode>);
  } catch (error) {
    root.className = 'fatal';
    root.textContent = error instanceof Error ? error.message : String(error);
  }
}
