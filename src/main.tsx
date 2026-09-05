import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App, SafeBoundary } from './App';
import { applyTheme, readThemePreference, systemTheme, ThemeProvider } from './ui/theme';
import './styles.css';
import { registerOfflineShell } from './pwa/register';
import { startInstallTracking } from './pwa/install';

const stopInstallTracking = startInstallTracking();
if (import.meta.hot) import.meta.hot.dispose(stopInstallTracking);
// Set the document theme before React renders, including login/loading/error screens.
applyTheme(readThemePreference() ?? systemTheme());
createRoot(document.getElementById('root')!, {
  onCaughtError: () => {}, // Intentionally no user content/session in error reports.
}).render(<StrictMode><SafeBoundary><ThemeProvider><App /></ThemeProvider></SafeBoundary></StrictMode>);
void registerOfflineShell();