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
// SW lands in "waiting" instead of silently swapping. The flow:
//   1. checkForUpdate() runs on app start, on every foreground / focus,
//      and on an interval. It calls registration.update() to ask the SW
//      to look for a new version on the network.
//   2. If registration.waiting is populated → there's a new SW ready.
//      Either onNeedRefresh fires (vite-plugin-pwa) or we surface the
//      banner ourselves. Belt-and-braces because the lifecycle event
//      doesn't always fire reliably on iOS PWAs that backgrounded.
//   3. Tap banner → updateSW(true) → skipWaiting → controllerchange
//      → page reload with new bundle.
let bannerShown = false;
const showBanner = () => {
  if (bannerShown || document.getElementById('ww-update-banner')) return;
  bannerShown = true;
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

  // If the user tabs/apps away after seeing the banner, apply silently.
  const onHidden = () => {
    if (document.visibilityState === 'hidden') {
      document.removeEventListener('visibilitychange', onHidden);
      updateSW(true);
    }
  };
  document.addEventListener('visibilitychange', onHidden);
};

const updateSW = registerSW({
  immediate: true,
  onNeedRefresh: showBanner,
});

const checkForUpdate = async () => {
  if (!('serviceWorker' in navigator)) return;
  try {
    const reg = await navigator.serviceWorker.getRegistration();
    if (!reg) return;
    await reg.update();
    // If onNeedRefresh didn't fire for whatever reason, fall back to
    // showing the banner manually when we can see a waiting worker.
    if (reg.waiting) showBanner();
  } catch (_) { /* offline / transient */ }
};

// Initial check + on every foreground transition + on focus + interval.
// iOS PWAs pause JS in the background, so the foreground event is the
// most reliable signal we have.
setTimeout(checkForUpdate, 4000);
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'visible') checkForUpdate();
});
window.addEventListener('focus', checkForUpdate);
setInterval(checkForUpdate, 2 * 60 * 1000); // every 2 min while open

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <ErrorBoundary>
      <App />
    </ErrorBoundary>
  </React.StrictMode>
);
