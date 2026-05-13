import React from 'react';
import ReactDOM from 'react-dom/client';
import { registerSW } from 'virtual:pwa-register';
import App from './App.jsx';
import ErrorBoundary from './ErrorBoundary.jsx';
import './index.css';

// Block all zoom / pinch gestures so the PWA feels native.
// Safari/iOS ignores meta viewport's user-scalable=no, so we hook gestures
// + double-tap manually.
['gesturestart', 'gesturechange', 'gestureend'].forEach(t =>
  document.addEventListener(t, e => e.preventDefault())
);
let lastTouchEnd = 0;
document.addEventListener('touchend', (e) => {
  const now = Date.now();
  if (now - lastTouchEnd < 350) e.preventDefault();
  lastTouchEnd = now;
}, { passive: false });
document.addEventListener('dblclick', (e) => e.preventDefault());

// New-version detection. Workbox is configured in 'prompt' mode, so a new
// SW lands in "waiting" instead of silently swapping. We surface a small
// amber pill at the bottom; tapping it (or backgrounding the app) calls
// updateSW(true) which fires skipWaiting → controllerchange → page reload.
const updateSW = registerSW({
  immediate: true,
  onNeedRefresh() {
    if (document.getElementById('ww-update-banner')) return;
    const banner = document.createElement('div');
    banner.id = 'ww-update-banner';
    banner.style.cssText = [
      'position:fixed', 'left:50%', 'bottom:max(20px,env(safe-area-inset-bottom))',
      'transform:translateX(-50%)', 'z-index:9999', 'background:#f5a524',
      'color:#0a0a0b', 'padding:10px 18px', 'border-radius:999px',
      'font-family:Manrope,system-ui,sans-serif', 'font-weight:700', 'font-size:13px',
      'box-shadow:0 8px 24px rgba(0,0,0,.3)', 'cursor:pointer',
      'display:flex', 'align-items:center', 'gap:8px',
    ].join(';');
    banner.textContent = '✨ Neue Version — tippen zum Laden';
    banner.addEventListener('click', () => updateSW(true));
    document.body.appendChild(banner);

    // If the user tabs/apps away, apply the update silently so they come
    // back to the new bundle.
    const onHidden = () => {
      if (document.visibilityState === 'hidden') {
        document.removeEventListener('visibilitychange', onHidden);
        updateSW(true);
      }
    };
    document.addEventListener('visibilitychange', onHidden);
  },
});

// Periodically check for SW updates while the PWA stays open (iOS users
// often leave it foregrounded for hours).
if ('serviceWorker' in navigator) {
  setInterval(() => {
    navigator.serviceWorker.getRegistration().then(r => r?.update());
  }, 30 * 60 * 1000); // every 30 min
}

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <ErrorBoundary>
      <App />
    </ErrorBoundary>
  </React.StrictMode>
);
