import React from 'react';
import { createRoot } from 'react-dom/client';
import App from './App';
import { migrateLegacyStorage } from './lib/storage';
import { applyTheme, loadTheme } from './lib/theme';

// Carry RepoMind settings over first, so a theme chosen there applies before the first render and
// a chosen theme never flashes the other one.
migrateLegacyStorage();
applyTheme(loadTheme());

createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
