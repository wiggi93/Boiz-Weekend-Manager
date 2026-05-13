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

// Auto-reload when a new service worker is ready, but only if the document
// isn't actively focused (to avoid yanking the page out from under a tapping
// user). When focused, show a small "neu laden" banner instead.
registerSW({
  immediate: true,
  onNeedRefresh() {
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
    banner.addEventListener('click', () => location.reload());
    document.body.appendChild(banner);

    // If user goes away (tabs out / app backgrounded), reload silently on return
    const reloadIfBackgrounded = () => {
      if (document.visibilityState === 'visible' && !document.hasFocus()) return;
      if (document.visibilityState === 'hidden') {
        document.addEventListener('visibilitychange', () => {
          if (document.visibilityState === 'visible') location.reload();
        }, { once: true });
      }
    };
    reloadIfBackgrounded();
  },
});

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <ErrorBoundary>
      <App />
    </ErrorBoundary>
  </React.StrictMode>
);
