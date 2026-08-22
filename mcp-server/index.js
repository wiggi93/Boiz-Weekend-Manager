#!/usr/bin/env node
/**
 * Boiz Weekend Manager — MCP server, LOCAL stdio mode.
 *
 * For the hosted/remote variant (usable from the phone) see http.js — that one
 * is what runs in Docker behind Traefik. This entrypoint stays useful for
 * development and for driving the app from a terminal without the network hop.
 *
 * Setup:
 *   cd mcp-server && npm install
 *   claude mcp add boiz --env BOIZ_EMAIL=… --env BOIZ_PASSWORD=… \
 *     -- node /absolute/path/to/mcp-server/index.js
 */
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import PocketBase from 'pocketbase';
import { registerTools } from './tools.js';

const PB_URL = process.env.BOIZ_PB_URL || 'https://boiz-api.dr-disco.eu';
const EMAIL = process.env.BOIZ_EMAIL;
const PASSWORD = process.env.BOIZ_PASSWORD;

if (!EMAIL || !PASSWORD) {
  console.error('[boiz-mcp] BOIZ_EMAIL und BOIZ_PASSWORD müssen gesetzt sein.');
  process.exit(1);
}

const pb = new PocketBase(PB_URL);
pb.autoCancellation(false);

async function ensureAuth() {
  if (pb.authStore.isValid) return;
  await pb.collection('users').authWithPassword(EMAIL, PASSWORD);
}
/** Stdio has the password, so a stale token can simply be re-acquired. */
async function withAuth(fn) {
  await ensureAuth();
  try {
    return await fn();
  } catch (e) {
    if (e?.status === 401 || e?.status === 403) {
      pb.authStore.clear();
      await ensureAuth();
      return await fn();
    }
    throw e;
  }
}

const server = new McpServer({ name: 'boiz-weekend-manager', version: '1.0.0' });
registerTools(server, { pb, withAuth, PB_URL });

await server.connect(new StdioServerTransport());
console.error(`[boiz-mcp] stdio verbunden mit ${PB_URL} als ${EMAIL}`);
