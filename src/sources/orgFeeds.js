import { readFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { config } from '../config.js';
import { parseListingFeed } from './normalizedFeed.js';

async function loadFeedList() {
  if (!existsSync(config.orgFeedsFile)) return [];
  const list = JSON.parse(await readFile(config.orgFeedsFile, 'utf8'));
  return (list.feeds || []).filter((f) => f.enabled !== false && f.url);
}

/**
 * Individual adoption-group websites. Each configured feed URL must return
 * the listing format documented in normalizedFeed.js.
 */
export const orgFeedsSource = {
  name: 'orgFeeds',
  label: 'Individual rescue group sites',
  async isConfigured() {
    return (await loadFeedList()).length > 0;
  },
  async search(_query, { fetchImpl = globalThis.fetch } = {}) {
    const feeds = await loadFeedList();
    const results = await Promise.allSettled(
      feeds.map(async (f) => {
        const res = await fetchImpl(f.url, { signal: AbortSignal.timeout(config.requestTimeoutMs) });
        if (!res.ok) throw new Error(`${f.name || f.url}: HTTP ${res.status}`);
        return parseListingFeed(await res.json(), `feed-${f.id || f.name}`);
      }),
    );
    const out = { orgs: [], pets: [], warnings: [] };
    for (const r of results) {
      if (r.status === 'fulfilled') {
        out.orgs.push(...r.value.orgs);
        out.pets.push(...r.value.pets);
      } else {
        out.warnings.push(r.reason.message);
      }
    }
    return out;
  },
};
