import { readFile } from 'node:fs/promises';
import { config } from '../config.js';
import { parseListingFeed } from './normalizedFeed.js';

/** Bundled demo listings (fictional groups around Austin, TX) so the app works with no API keys. */
export const sampleSource = {
  name: 'sample',
  label: 'Demo data (fictional Austin-area rescues)',
  async search() {
    const feed = JSON.parse(await readFile(config.sampleDataFile, 'utf8'));
    return parseListingFeed(feed, 'sample');
  },
};
