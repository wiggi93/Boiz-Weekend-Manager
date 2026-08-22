#!/usr/bin/env node
/**
 * Boiz Weekend Manager — HOSTED MCP server (Streamable HTTP + OAuth 2.1).
 *
 * This is the variant that runs in Docker behind Traefik, so Claude can reach
 * it from anywhere — including the phone — as a Custom Connector.
 *
 * Auth model: there is NO shared secret and no stored password. Each person
 * connecting goes through an OAuth flow whose login screen validates their
 * own Boiz credentials against PocketBase. The issued access token carries
 * that user's PocketBase token, so every tool call runs with exactly that
 * person's permissions — a member can't do host things, and revoking someone
 * in the app revokes them here too.
 *
 * Stateless transport: every request builds its own MCP server + PocketBase
 * client. No session affinity needed, which keeps it happy behind a proxy.
 *
 * Env:
 *   MCP_PUBLIC_URL  — public origin, e.g. https://boiz-mcp.dr-disco.eu (REQUIRED)
 *   BOIZ_PB_URL     — API base (default https://boiz-api.dr-disco.eu)
 *   MCP_STATE_FILE  — where clients/tokens are persisted (default /data/state.json)
 *   PORT            — listen port (default 8040)
 */
import express from 'express';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import PocketBase from 'pocketbase';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import { mcpAuthRouter } from '@modelcontextprotocol/sdk/server/auth/router.js';
import { requireBearerAuth } from '@modelcontextprotocol/sdk/server/auth/middleware/bearerAuth.js';
import { registerTools } from './tools.js';

const PUBLIC_URL = (process.env.MCP_PUBLIC_URL || '').replace(/\/$/, '');
const PB_URL = process.env.BOIZ_PB_URL || 'https://boiz-api.dr-disco.eu';
const STATE_FILE = process.env.MCP_STATE_FILE || '/data/state.json';
const PORT = Number(process.env.PORT) || 8040;

if (!PUBLIC_URL) {
  console.error('[boiz-mcp] MCP_PUBLIC_URL muss gesetzt sein (z.B. https://boiz-mcp.dr-disco.eu)');
  process.exit(1);
}

// ---------------- persistence ----------------
// Small enough to keep in memory and flush as JSON; survives restarts so
// connectors don't have to re-authorize after every deploy.
const empty = { clients: {}, codes: {}, tokens: {}, refresh: {} };
let state = { ...empty };
try {
  if (fs.existsSync(STATE_FILE)) state = { ...empty, ...JSON.parse(fs.readFileSync(STATE_FILE, 'utf8')) };
} catch (e) { console.error('[boiz-mcp] state load failed, starting fresh:', e.message); }

let flushTimer = null;
function save() {
  clearTimeout(flushTimer);
  flushTimer = setTimeout(() => {
    try {
      fs.mkdirSync(path.dirname(STATE_FILE), { recursive: true });
      fs.writeFileSync(STATE_FILE, JSON.stringify(state));
    } catch (e) { console.error('[boiz-mcp] state save failed:', e.message); }
  }, 250);
}
const rnd = (n = 32) => crypto.randomBytes(n).toString('hex');
const now = () => Math.floor(Date.now() / 1000);

/** Drop expired codes/tokens so the file doesn't grow forever. */
function sweep() {
  const t = now();
  for (const [k, v] of Object.entries(state.codes)) if (v.expiresAt < t) delete state.codes[k];
  for (const [k, v] of Object.entries(state.tokens)) if (v.expiresAt < t) delete state.tokens[k];
  save();
}
setInterval(sweep, 10 * 60 * 1000).unref();

// ---------------- OAuth provider ----------------
const TOKEN_TTL = 60 * 60 * 24 * 30; // 30 days, then the refresh token kicks in

const clientsStore = {
  async getClient(clientId) { return state.clients[clientId]; },
  // Dynamic Client Registration — Claude registers itself on first connect.
  async registerClient(client) {
    state.clients[client.client_id] = client;
    save();
    return client;
  },
};

const provider = {
  clientsStore,

  /** Park the request and send the user to our own login screen. */
  async authorize(client, params, res) {
    const lid = rnd(16);
    state.codes[`pending:${lid}`] = {
      pending: true,
      clientId: client.client_id,
      redirectUri: params.redirectUri,
      codeChallenge: params.codeChallenge,
      state: params.state,
      scopes: params.scopes || [],
      resource: params.resource?.toString(),
      expiresAt: now() + 600,
    };
    save();
    res.redirect(`/login?lid=${lid}`);
  },

  async challengeForAuthorizationCode(client, authorizationCode) {
    const rec = state.codes[authorizationCode];
    if (!rec || rec.clientId !== client.client_id) throw new Error('invalid authorization code');
    return rec.codeChallenge;
  },

  async exchangeAuthorizationCode(client, authorizationCode, _codeVerifier, redirectUri) {
    const rec = state.codes[authorizationCode];
    if (!rec || rec.pending) throw new Error('invalid authorization code');
    if (rec.clientId !== client.client_id) throw new Error('code was issued to a different client');
    if (rec.expiresAt < now()) { delete state.codes[authorizationCode]; throw new Error('authorization code expired'); }
    if (redirectUri && redirectUri !== rec.redirectUri) throw new Error('redirect_uri mismatch');
    delete state.codes[authorizationCode]; // single use

    const accessToken = rnd();
    const refreshToken = rnd();
    state.tokens[accessToken] = {
      clientId: client.client_id, userId: rec.userId, pbToken: rec.pbToken,
      scopes: rec.scopes, resource: rec.resource, expiresAt: now() + TOKEN_TTL,
    };
    state.refresh[refreshToken] = { clientId: client.client_id, userId: rec.userId, pbToken: rec.pbToken, scopes: rec.scopes };
    save();
    return { access_token: accessToken, token_type: 'bearer', expires_in: TOKEN_TTL, refresh_token: refreshToken, scope: (rec.scopes || []).join(' ') };
  },

  async exchangeRefreshToken(client, refreshToken, scopes) {
    const rec = state.refresh[refreshToken];
    if (!rec || rec.clientId !== client.client_id) throw new Error('invalid refresh token');
    const accessToken = rnd();
    state.tokens[accessToken] = {
      clientId: client.client_id, userId: rec.userId, pbToken: rec.pbToken,
      scopes: scopes || rec.scopes, expiresAt: now() + TOKEN_TTL,
    };
    save();
    return { access_token: accessToken, token_type: 'bearer', expires_in: TOKEN_TTL, refresh_token: refreshToken };
  },

  async verifyAccessToken(token) {
    const rec = state.tokens[token];
    if (!rec) throw new Error('invalid access token');
    if (rec.expiresAt < now()) { delete state.tokens[token]; save(); throw new Error('access token expired'); }
    return {
      token, clientId: rec.clientId, scopes: rec.scopes || [], expiresAt: rec.expiresAt,
      extra: { userId: rec.userId, pbToken: rec.pbToken },
    };
  },

  async revokeToken(client, request) {
    const t = request.token;
    if (state.tokens[t]?.clientId === client.client_id) delete state.tokens[t];
    if (state.refresh[t]?.clientId === client.client_id) delete state.refresh[t];
    save();
  },
};

// ---------------- app ----------------
const app = express();
app.set('trust proxy', true);
app.disable('x-powered-by');

app.get('/health', (_req, res) => res.json({ ok: true, service: 'boiz-mcp' }));

// OAuth endpoints: /authorize, /token, /register, /revoke + metadata documents
app.use(mcpAuthRouter({
  provider,
  issuerUrl: new URL(PUBLIC_URL),
  baseUrl: new URL(PUBLIC_URL),
  resourceName: 'Boiz Weekend Manager',
}));

// ---------------- login screen ----------------
const esc = (s) => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const loginPage = (lid, error) => `<!doctype html>
<html lang="de"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Boiz — Verbinden</title>
<style>
  :root { --grad: linear-gradient(135deg, #7c5cff 0%, #4cc9f0 130%); }
  * { box-sizing: border-box; }
  body { margin:0; min-height:100dvh; display:flex; align-items:center; justify-content:center;
    background: radial-gradient(900px 480px at 85% -12%, rgba(124,92,255,.16), transparent 60%), #07080d;
    color:#f2f3f7; font-family: system-ui, -apple-system, sans-serif; padding:20px; }
  .card { width:100%; max-width:380px; background:#12141d; border:1px solid #262b3a; border-radius:16px; padding:26px; }
  h1 { font-size:22px; margin:0 0 4px; }
  p.sub { color:#8b90a3; font-size:13px; margin:0 0 20px; line-height:1.5; }
  label { display:block; font-size:11px; letter-spacing:.12em; color:#8b90a3; margin:14px 0 6px; text-transform:uppercase; }
  input { width:100%; padding:12px 14px; border-radius:12px; border:1px solid #262b3a; background:#0d0f16; color:#f2f3f7; font-size:15px; }
  input:focus { outline:none; border-color:#8b7bff; }
  button { width:100%; margin-top:20px; padding:14px; border:0; border-radius:14px; background:var(--grad);
    color:#fff; font-size:16px; font-weight:700; cursor:pointer; }
  .err { margin-top:14px; background:rgba(239,68,68,.12); border:1px solid #ef4444; color:#fca5a5;
    padding:10px 12px; border-radius:10px; font-size:13px; }
</style></head><body>
<div class="card">
  <h1>🍻 Boiz verbinden</h1>
  <p class="sub">Melde dich mit deinem normalen Boiz-Account an. Claude bekommt danach genau die Rechte, die du auch in der App hast.</p>
  <form method="post" action="/login">
    <input type="hidden" name="lid" value="${esc(lid)}">
    <label>E-Mail</label>
    <input name="email" type="email" autocomplete="username" required autofocus>
    <label>Passwort</label>
    <input name="password" type="password" autocomplete="current-password" required>
    ${error ? `<div class="err">${esc(error)}</div>` : ''}
    <button type="submit">Verbinden</button>
  </form>
</div></body></html>`;

app.get('/login', (req, res) => {
  const lid = String(req.query.lid || '');
  if (!state.codes[`pending:${lid}`]) return res.status(400).send('Link abgelaufen — bitte den Verbinden-Vorgang neu starten.');
  res.type('html').send(loginPage(lid));
});

app.post('/login', express.urlencoded({ extended: false }), async (req, res) => {
  const { lid, email, password } = req.body || {};
  const pending = state.codes[`pending:${lid}`];
  if (!pending) return res.status(400).send('Link abgelaufen — bitte den Verbinden-Vorgang neu starten.');

  // Validate against the app's own user store — no separate credentials.
  const pb = new PocketBase(PB_URL);
  pb.autoCancellation(false);
  try {
    await pb.collection('users').authWithPassword(String(email || ''), String(password || ''));
  } catch {
    return res.type('html').status(401).send(loginPage(lid, 'Login fehlgeschlagen — E-Mail oder Passwort falsch.'));
  }
  if (!pb.authStore.record?.approved && pb.authStore.record?.role !== 'admin') {
    return res.type('html').status(403).send(loginPage(lid, 'Dein Account wartet noch auf die Freigabe durch einen Admin.'));
  }

  delete state.codes[`pending:${lid}`];
  const code = rnd(24);
  state.codes[code] = {
    clientId: pending.clientId, redirectUri: pending.redirectUri,
    codeChallenge: pending.codeChallenge, scopes: pending.scopes, resource: pending.resource,
    userId: pb.authStore.record.id, pbToken: pb.authStore.token,
    expiresAt: now() + 300,
  };
  save();

  const target = new URL(pending.redirectUri);
  target.searchParams.set('code', code);
  if (pending.state) target.searchParams.set('state', pending.state);
  res.redirect(target.toString());
});

// ---------------- MCP endpoint ----------------
const bearer = requireBearerAuth({ verifier: provider, resourceMetadataUrl: `${PUBLIC_URL}/.well-known/oauth-protected-resource` });

app.post('/mcp', bearer, express.json({ limit: '4mb' }), async (req, res) => {
  // Stateless: a fresh server + PocketBase client per request, scoped to the
  // authenticated user. Nothing is shared between people.
  const pb = new PocketBase(PB_URL);
  pb.autoCancellation(false);
  pb.authStore.save(req.auth.extra.pbToken, null);
  try {
    // Hydrate the user record so tools can use me().id.
    await pb.collection('users').authRefresh();
  } catch {
    return res.status(401).json({
      jsonrpc: '2.0', error: { code: -32001, message: 'Boiz-Session abgelaufen — bitte den Connector neu verbinden.' }, id: null,
    });
  }

  const server = new McpServer({ name: 'boiz-weekend-manager', version: '1.0.0' });
  registerTools(server, { pb, withAuth: (fn) => fn(), PB_URL });

  const transport = new StreamableHTTPServerTransport({ sessionIdGenerator: undefined });
  res.on('close', () => { transport.close(); server.close(); });
  await server.connect(transport);
  await transport.handleRequest(req, res, req.body);
});

// Stateless mode has no server-initiated stream / session teardown.
const noSession = (_req, res) => res.status(405).json({
  jsonrpc: '2.0', error: { code: -32000, message: 'Method not allowed.' }, id: null,
});
app.get('/mcp', noSession);
app.delete('/mcp', noSession);

app.listen(PORT, () => {
  console.error(`[boiz-mcp] HTTP auf :${PORT} — öffentlich ${PUBLIC_URL}, API ${PB_URL}`);
});
