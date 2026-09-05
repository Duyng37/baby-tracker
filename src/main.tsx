import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App, SafeBoundary } from './App';
import './styles.css';

createRoot(document.getElementById('root')!, {
  onCaughtError: () => {}, // Intentionally no user content/session in error reports.
}).render(<StrictMode><SafeBoundary><App /></SafeBoundary></StrictMode>);