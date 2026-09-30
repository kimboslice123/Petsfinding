import { readFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

export const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

// Minimal .env loader so the app has zero dependencies.
function loadDotEnv() {
  const file = path.join(ROOT, '.env');
  if (!existsSync(file)) return;
  for (const line of readFileSync(file, 'utf8').split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
    if (m && process.env[m[1]] === undefined) process.env[m[1]] = m[2].replace(/^['"]|['"]$/g, '');
  }
}
loadDotEnv();

export const config = {
  port: Number(process.env.PORT) || 3000,
  rescueGroupsApiKey: process.env.RESCUEGROUPS_API_KEY || '',
  useSampleData: (process.env.USE_SAMPLE_DATA || 'auto').toLowerCase(),
  orgFeedsFile: path.join(ROOT, 'data', 'org-feeds.json'),
  sampleDataFile: path.join(ROOT, 'data', 'sample-listings.json'),
  resultLimit: 10,
  requestTimeoutMs: 10000,
};
