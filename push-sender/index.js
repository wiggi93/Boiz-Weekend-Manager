// Tiny Web-Push sender sidecar.
//
// PocketBase JS hooks can't do the VAPID (ES256) signing + payload encryption
// that the Web Push protocol requires, so this ~80-line Node service does the
// actual sending. The PocketBase backend POSTs { subscriptions, payload } to
// /send on the internal Docker network; this service signs + encrypts with
// the VAPID keys and fans the message out to the push services (Apple/Google).
//
// Env:
//   VAPID_PUBLIC_KEY / VAPID_PRIVATE_KEY  — `npx web-push generate-vapid-keys`
//   VAPID_SUBJECT                          — mailto:you@example.com
//   PUSH_SENDER_TOKEN                      — shared secret; must match the
//                                            backend's PUSH_SENDER_TOKEN
//   PORT                                   — default 8030

import http from 'node:http';
import webpush from 'web-push';

const {
  VAPID_PUBLIC_KEY,
  VAPID_PRIVATE_KEY,
  VAPID_SUBJECT = 'mailto:admin@example.com',
  PUSH_SENDER_TOKEN = '',
  PORT = 8030,
} = process.env;

if (!VAPID_PUBLIC_KEY || !VAPID_PRIVATE_KEY) {
  console.error('[push-sender] VAPID keys missing — set VAPID_PUBLIC_KEY / VAPID_PRIVATE_KEY');
  process.exit(1);
}
webpush.setVapidDetails(VAPID_SUBJECT, VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY);

const readBody = (req) => new Promise((resolve, reject) => {
  let data = '';
  req.on('data', (c) => { data += c; if (data.length > 1_000_000) reject(new Error('body too large')); });
  req.on('end', () => resolve(data));
  req.on('error', reject);
});

const server = http.createServer(async (req, res) => {
  const json = (code, obj) => { res.writeHead(code, { 'content-type': 'application/json' }); res.end(JSON.stringify(obj)); };

  if (req.method === 'GET' && req.url === '/health') return json(200, { ok: true });

  if (req.method !== 'POST' || req.url !== '/send') return json(404, { error: 'not found' });
  if (PUSH_SENDER_TOKEN && req.headers['authorization'] !== `Bearer ${PUSH_SENDER_TOKEN}`) {
    return json(401, { error: 'unauthorized' });
  }

  let body;
  try { body = JSON.parse(await readBody(req)); }
  catch { return json(400, { error: 'invalid json' }); }

  const subs = Array.isArray(body.subscriptions) ? body.subscriptions : [];
  const payload = JSON.stringify(body.payload || {});
  if (subs.length === 0) return json(200, { sent: 0, failed: 0, gone: [] });

  let sent = 0, failed = 0;
  const gone = []; // endpoints the push service reports as expired/invalid
  await Promise.all(subs.map(async (sub) => {
    try {
      await webpush.sendNotification(sub, payload, { TTL: 3600 });
      sent++;
    } catch (err) {
      failed++;
      // 404/410 = subscription is dead; report it so the backend can prune.
      if (err?.statusCode === 404 || err?.statusCode === 410) gone.push(sub.endpoint);
      else console.warn('[push-sender] send failed', err?.statusCode || '', err?.message || '');
    }
  }));

  json(200, { sent, failed, gone });
});

server.listen(Number(PORT), () => console.log(`[push-sender] listening on :${PORT}`));
