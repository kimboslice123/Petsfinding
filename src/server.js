import http from 'node:http';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { config, ROOT } from './config.js';
import { search, activeSources, parsePreferences } from './search.js';
import { TEMPERAMENTS } from './matcher.js';
import { buildPetfinderPrompt, petfinderImportSource } from './sources/petfinderImport.js';

const PUBLIC = path.join(ROOT, 'public');
const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml', '.png': 'image/png' };

const MAX_BODY_BYTES = 1_000_000;

class BadRequest extends Error {}

async function readJsonBody(req) {
  let size = 0;
  const chunks = [];
  for await (const chunk of req) {
    size += chunk.length;
    if (size > MAX_BODY_BYTES) throw new BadRequest('Pasted results are too large (1 MB max).');
    chunks.push(chunk);
  }
  try {
    return JSON.parse(Buffer.concat(chunks).toString('utf8') || '{}');
  } catch {
    throw new BadRequest('Request body must be JSON.');
  }
}

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
      if (req.method === 'POST' && url.pathname === '/api/search') {
        // Same as GET, plus optional Petfinder results pasted from Claude in Chrome.
        const { petfinderResults, ...prefs } = await readJsonBody(req);
        const extraSources = [];
        if (petfinderResults && String(petfinderResults).trim()) {
          try {
            extraSources.push(petfinderImportSource(petfinderResults));
          } catch (err) {
            throw new BadRequest(`Petfinder results: ${err.message}`);
          }
        }
        return sendJson(res, 200, await search(prefs, { extraSources }));
      }
      if (req.method === 'GET' && url.pathname === '/api/petfinder-prompt') {
        const prefs = parsePreferences(Object.fromEntries(url.searchParams));
        prefs.temperamentLabels = prefs.temperaments.map((t) => TEMPERAMENTS[t].label);
        return sendJson(res, 200, { prompt: buildPetfinderPrompt(prefs) });
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
      const status = err instanceof BadRequest || /zip/i.test(err.message) ? 400 : 500;
      sendJson(res, status, { error: err.message });
    }
  });
}

if (import.meta.url === `file://${process.argv[1]}`) {
  createServer().listen(config.port, () => {
    console.log(`Petsfinding running at http://localhost:${config.port}`);
  });
}
