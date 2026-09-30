import { config } from './config.js';
import { geocodeZip, haversineMiles } from './geo.js';
import { rankOrganizations, TEMPERAMENTS } from './matcher.js';
import { AGE_GROUPS } from './model.js';
import { sampleSource } from './sources/sample.js';
import { rescueGroupsSource } from './sources/rescueGroups.js';
import { orgFeedsSource } from './sources/orgFeeds.js';
import { externalSearchLinks } from './sources/externalLinks.js';

const LIVE_SOURCES = [rescueGroupsSource, orgFeedsSource];

export async function activeSources() {
  const live = [];
  for (const s of LIVE_SOURCES) if (await s.isConfigured()) live.push(s);
  const mode = config.useSampleData;
  const useSample = mode === 'true' || (mode === 'auto' && live.length === 0);
  return useSample ? [...live, sampleSource] : live;
}

const list = (v) =>
  (Array.isArray(v) ? v : String(v || '').split(','))
    .map((s) => s.trim())
    .filter(Boolean);

/** Validate and normalize raw query-string input into matcher preferences. */
export function parsePreferences(raw) {
  const maxDistance = Math.min(Math.max(Number(raw.distance) || 50, 1), 500);
  return {
    species: String(raw.species || 'any').toLowerCase(),
    breeds: list(raw.breeds).slice(0, 10),
    mixedOk: raw.mixedOk !== 'false' && raw.mixedOk !== false,
    ages: list(raw.ages).map((a) => a.toLowerCase()).filter((a) => AGE_GROUPS.includes(a)),
    temperaments: list(raw.temperaments).filter((t) => TEMPERAMENTS[t]),
    zip: String(raw.zip || '').trim(),
    maxDistance,
  };
}

const orgKey = (o) => `${String(o.name).toLowerCase().replace(/[^a-z0-9]/g, '')}|${String(o.state || '').toLowerCase()}`;

/** Merge the same rescue appearing in multiple sources (e.g. RescueGroups + its own site feed). */
function mergeResults(results) {
  const orgs = new Map();
  const aliases = new Map();
  const byKey = new Map();
  const pets = [];
  const seenPets = new Set();

  for (const r of results) {
    for (const o of r.orgs) {
      const key = orgKey(o);
      const existing = byKey.get(key);
      if (existing) {
        aliases.set(o.id, existing.id);
        for (const [k, v] of Object.entries(o)) if (existing[k] == null || existing[k] === '') existing[k] = v;
        existing.sources = [...new Set([...existing.sources, ...o.sources])];
        existing.policies = { ...o.policies, ...existing.policies };
      } else {
        const copy = { ...o, sources: [...o.sources] };
        byKey.set(key, copy);
        orgs.set(copy.id, copy);
      }
    }
  }
  for (const r of results) {
    for (const p of r.pets) {
      const orgId = aliases.get(p.orgId) || p.orgId;
      const dedupe = `${orgId}|${String(p.name).toLowerCase()}|${p.species}|${p.breeds?.[0] || ''}`;
      if (seenPets.has(dedupe)) continue;
      seenPets.add(dedupe);
      pets.push({ ...p, orgId });
    }
  }
  return { orgs, pets };
}

export async function search(rawPrefs, { sources, fetchImpl } = {}) {
  const prefs = parsePreferences(rawPrefs);
  const origin = await geocodeZip(prefs.zip, { fetchImpl });
  prefs.origin = origin;

  const srcs = sources || (await activeSources());
  const settled = await Promise.allSettled(srcs.map((s) => s.search(prefs, { fetchImpl })));
  const sourceStatus = [];
  const ok = [];
  settled.forEach((r, i) => {
    const s = srcs[i];
    if (r.status === 'fulfilled') {
      ok.push(r.value);
      sourceStatus.push({ name: s.name, label: s.label, ok: true, pets: r.value.pets.length, warnings: r.value.warnings || [] });
    } else {
      sourceStatus.push({ name: s.name, label: s.label, ok: false, error: r.reason?.message || String(r.reason) });
    }
  });

  const data = mergeResults(ok);

  // Fill in distances the source didn't compute.
  for (const org of data.orgs.values()) org.distance = haversineMiles(origin, org.location);
  for (const pet of data.pets) {
    if (pet.distance == null) {
      pet.distance = haversineMiles(origin, pet.location) ?? data.orgs.get(pet.orgId)?.distance ?? null;
    }
    if (pet.distance != null) pet.distance = Math.round(pet.distance * 10) / 10;
  }

  const results = rankOrganizations(data, prefs, config.resultLimit);
  const { origin: _o, ...echo } = prefs;
  return {
    query: echo,
    origin,
    results,
    totalPetsSearched: data.pets.length,
    totalOrgsSearched: data.orgs.size,
    sources: sourceStatus,
    externalSearches: externalSearchLinks(prefs),
  };
}
