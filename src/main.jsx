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

// Update detection.
// iOS PWAs are notoriously unreliable about firing service-worker lifecycle
// events while the app sleeps and re-foregrounds, so the SW-based check was
// missing updates for the user. Switch to a direct HTML comparison: snapshot
// the bundle filename of the currently-loaded script (e.g. `index-AbC123.js`),
// then periodically fetch the live `index.html` (with a `?_v=` cachebuster
// that the SW is configured to bypass via NetworkOnly), parse out the bundle
// filename, and surface the banner if it differs.
// Match by src pattern, NOT by type attribute — Cloudflare Rocket Loader
// rewrites `type="module"` into a placeholder string before our JS sees it,
// so a `script[type="module"]` selector finds nothing in production. The
// src stays intact, so we look there instead.
const currentBundle = (() => {
  try {
    const scripts = Array.from(document.querySelectorAll('script[src*="/assets/index-"]'));
    for (const s of scripts) {
      const m = s.src.match(/\/assets\/(index-[A-Za-z0-9_-]+\.js)/);
      if (m) return m[1];
    }
  } catch (_) {}
  return null;
})();

// Fire a local push notification when a new version is available, mirroring
// the in-app banner. Only fires once per detected version and only if the
// user granted notification permission.
const notifyNewVersion = async () => {
  try {
    if (!('Notification' in window) || Notification.permission !== 'granted') return;
    const title = '✨ Neue Version verfügbar';
    const opts = {
      body: 'Tippe, um Boiz Weekend Manager zu aktualisieren.',
      icon: '/pwa-192x192.png',
      badge: '/pwa-192x192.png',
      tag: 'app-update',
      renotify: false,
    };
    const reg = await navigator.serviceWorker?.getRegistration();
    if (reg?.showNotification) { await reg.showNotification(title, opts); return; }
    new Notification(title, opts);
  } catch (_) { /* permission / unsupported */ }
};

let bannerShown = false;
const showBanner = () => {
  if (bannerShown || document.getElementById('ww-update-banner')) return;
  bannerShown = true;
  notifyNewVersion();
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
  banner.addEventListener('click', async () => {
    // Visual feedback so the user doesn't tap twice during the cache wipe.
    banner.textContent = '⏳ Lädt neue Version…';
    banner.style.pointerEvents = 'none';
    // Nuke everything cached and let the next load fetch fresh.
    // (updateSW alone wasn't reliable: if the SW had no "waiting" worker
    // it was a no-op, and the reload then served the same old cache,
    // causing an endless banner loop.)
    try {
      if ('serviceWorker' in navigator) {
        const regs = await navigator.serviceWorker.getRegistrations();
        await Promise.all(regs.map(r => r.unregister().catch(() => {})));
      }
      if ('caches' in window) {
        const keys = await caches.keys();
        await Promise.all(keys.map(k => caches.delete(k).catch(() => {})));
      }
    } catch (_) {}
    // Cachebuster on the URL also forces the HTTP layer + any CDN edge to
    // serve a fresh document.
    location.replace('/?_r=' + Date.now());
  });
  document.body.appendChild(banner);

  // If the user tabs/apps away after seeing the banner, apply silently.
  const onHidden = () => {
    if (document.visibilityState === 'hidden') {
      document.removeEventListener('visibilitychange', onHidden);
      try { updateSW(true); } catch (_) {}
    }
  };
  document.addEventListener('visibilitychange', onHidden);
};

const updateSW = registerSW({
  immediate: true,
  onNeedRefresh: showBanner,
});

// Direct HTML-based version probe. Works regardless of SW lifecycle quirks.
const checkForUpdateHtml = async () => {
  if (!currentBundle) return;
  try {
    const res = await fetch('/?_v=' + Date.now(), {
      cache: 'no-store',
      headers: { 'cache-control': 'no-cache' },
    });
    if (!res.ok) return;
    const html = await res.text();
    const m = html.match(/\/assets\/(index-[A-Za-z0-9_-]+\.js)/);
    if (m && m[1] && m[1] !== currentBundle) {
      // Live HTML references a different bundle → there's a deploy we missed.
      // Also kick the SW so its cache gets refreshed in parallel.
      navigator.serviceWorker?.getRegistration().then(r => r?.update()).catch(() => {});
      showBanner();
    }
  } catch (_) { /* offline / transient */ }
};

// Belt-and-braces: also ask the SW to look for updates. Catches the rare
// case where the HTML is unchanged but the SW itself has new content.
const checkForUpdateSw = async () => {
  if (!('serviceWorker' in navigator)) return;
  try {
    const reg = await navigator.serviceWorker.getRegistration();
    if (!reg) return;
    await reg.update();
    if (reg.waiting) showBanner();
  } catch (_) {}
};

const checkForUpdate = () => { checkForUpdateHtml(); checkForUpdateSw(); };

// Initial check shortly after boot + on every foreground transition + focus + interval.
// Foreground is the most reliable iOS trigger because JS only runs then.
setTimeout(checkForUpdate, 3000);
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'visible') checkForUpdate();
});
window.addEventListener('focus', checkForUpdate);
setInterval(checkForUpdate, 60 * 1000); // every minute while the app is open

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <ErrorBoundary>
      <App />
    </ErrorBoundary>
  </React.StrictMode>
);
