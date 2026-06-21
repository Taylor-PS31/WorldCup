import React from 'react';
import ReactDOM from 'react-dom/client';
import './index.css';
import App from './App';

const root = ReactDOM.createRoot(document.getElementById('root'));
root.render(<React.StrictMode><App /></React.StrictMode>);

// ── App version — bump this string on every deployment ──
// This is the single source of truth for cache-busting. Unlike Date.now(),
// it stays the same across page loads of the SAME deployed code, so the
// service worker correctly detects "no change" vs "new version".
const APP_VERSION = 'v17-2026-06-21';

// Register service worker with the fixed version above.
// If the version differs from what's stored, force ONE reload to guarantee
// the user gets fresh JS — this fixes devices stuck on stale cached bundles
// (e.g. Android Chrome holding an old service worker that never updated).
if ('serviceWorker' in navigator) {
  window.addEventListener('load', async () => {
    try {
      const lastSeenVersion = localStorage.getItem('wc2026_app_version');

      const reg = await navigator.serviceWorker.register('/sw.js');

      const sendVersion = (sw) => {
        sw.postMessage({ type: 'SET_VERSION', version: APP_VERSION });
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

      // If this is a genuinely new version the user hasn't seen yet,
      // force a one-time hard reload after the SW has taken control.
      // This does NOT touch localStorage — only clears cached JS/CSS.
      if (lastSeenVersion && lastSeenVersion !== APP_VERSION) {
        localStorage.setItem('wc2026_app_version', APP_VERSION);
        // Unregister old SW and reload once to guarantee fresh assets
        const regs = await navigator.serviceWorker.getRegistrations();
        await Promise.all(regs.map(r => r.unregister()));
        if ('caches' in window) {
          const keys = await caches.keys();
          await Promise.all(keys.map(k => caches.delete(k)));
        }
        window.location.reload();
        return;
      }
      localStorage.setItem('wc2026_app_version', APP_VERSION);
    } catch (e) {
      console.warn('SW registration failed:', e);
    }
  });
}
