import http from 'node:http';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { config, ROOT } from './config.js';
import { search, activeSources } from './search.js';
import { TEMPERAMENTS } from './matcher.js';

const PUBLIC = path.join(ROOT, 'public');
const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml', '.png': 'image/png' };

function sendJson(res, status, body) {
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8' });
  res.end(JSON.stringify(body));
}

async function serveStatic(res, pathname) {
  const file = path.normalize(path.join(PUBLIC, pathname === '/' ? 'index.html' : pathname));
  if (!file.startsWith(PUBLIC)) return sendJson(res, 403, { error: 'Forbidden' });
  try {
    const body = await readFile(file);
    res.writeHead(200, { 'Content-Type': TYPES[path.extname(file)] || 'application/octet-stream' });
    res.end(body);
  } catch {
    sendJson(res, 404, { error: 'Not found' });
  }
}

export function createServer() {
  return http.createServer(async (req, res) => {
    const url = new URL(req.url, 'http://localhost');
    try {
      if (req.method === 'GET' && url.pathname === '/api/search') {
        const result = await search(Object.fromEntries(url.searchParams));
        return sendJson(res, 200, result);
      }
      if (req.method === 'GET' && url.pathname === '/api/options') {
        const sources = await activeSources();
        return sendJson(res, 200, {
          temperaments: Object.entries(TEMPERAMENTS).map(([key, t]) => ({ key, label: t.label })),
          sources: sources.map((s) => ({ name: s.name, label: s.label })),
        });
      }
      if (req.method === 'GET') return serveStatic(res, url.pathname);
      sendJson(res, 405, { error: 'Method not allowed' });
    } catch (err) {
      const status = /zip/i.test(err.message) ? 400 : 500;
      sendJson(res, status, { error: err.message });
    }
  });
}

if (import.meta.url === `file://${process.argv[1]}`) {
  createServer().listen(config.port, () => {
    console.log(`Petsfinding running at http://localhost:${config.port}`);
  });
}
