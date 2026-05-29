import React from 'react';
import ReactDOM from 'react-dom/client';
import './index.css';
import App from './App';

const root = ReactDOM.createRoot(document.getElementById('root'));
root.render(<React.StrictMode><App /></React.StrictMode>);

// Register service worker with a cache-busting version string.
// Each deployment gets a unique version so stale cached files are
// always replaced — without touching the user's localStorage data.
if ('serviceWorker' in navigator) {
  window.addEventListener('load', async () => {
    try {
      // Use the app build time as the cache version key
      const version = process.env.REACT_APP_BUILD_TIME || Date.now().toString();

      // Pass the version to the SW via postMessage after registration
      const reg = await navigator.serviceWorker.register('/sw.js');

      // Once the SW is active, tell it the current cache version
      const sendVersion = (sw) => {
        sw.postMessage({ type: 'SET_VERSION', version });
      };

      if (reg.active) sendVersion(reg.active);
      reg.addEventListener('updatefound', () => {
        const newSW = reg.installing;
        if (newSW) {
          newSW.addEventListener('statechange', () => {
            if (newSW.state === 'activated') sendVersion(newSW);
          });
        }
      });
    } catch (e) {
      console.warn('SW registration failed:', e);
    }
  });
}
