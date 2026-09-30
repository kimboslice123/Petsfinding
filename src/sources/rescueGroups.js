import { config } from '../config.js';
import { normalizeAgeGroup, normalizeSpecies, normalizeEnergy, triBool } from '../model.js';

const BASE = 'https://api.rescuegroups.org/v5';
const PAGE_SIZE = 250;
const MAX_PAGES = 3;

/**
 * RescueGroups.org v5 public API: thousands of rescues/shelters, radius search
 * by postal code. Docs: https://api.rescuegroups.org/v5/public/docs
 */
export const rescueGroupsSource = {
  name: 'rescuegroups',
  label: 'RescueGroups.org',
  isConfigured: () => Boolean(config.rescueGroupsApiKey),

  async search(query, { fetchImpl = globalThis.fetch } = {}) {
    const filters = [];
    if (query.species && query.species !== 'any') {
      filters.push({ fieldName: 'species.singular', operation: 'equals', criteria: capitalize(query.species) });
    }
    const body = {
      data: {
        filterRadius: { miles: query.maxDistance, postalcode: query.zip },
        ...(filters.length ? { filters } : {}),
      },
    };

    const orgs = new Map();
    const pets = [];
    for (let page = 1; page <= MAX_PAGES; page++) {
      const url = `${BASE}/public/animals/search/available/?include=orgs,breeds,species,pictures&limit=${PAGE_SIZE}&page=${page}&sort=animals.distance`;
      const res = await fetchImpl(url, {
        method: 'POST',
        headers: {
          Authorization: config.rescueGroupsApiKey,
          'Content-Type': 'application/vnd.api+json',
        },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(config.requestTimeoutMs),
      });
      if (!res.ok) throw new Error(`RescueGroups.org HTTP ${res.status}`);
      const json = await res.json();
      const parsed = parseRescueGroupsResponse(json);
      for (const o of parsed.orgs) orgs.set(o.id, o);
      pets.push(...parsed.pets);
      const pages = json.meta?.pages ?? 1;
      if (page >= pages) break;
    }
    return { orgs: [...orgs.values()], pets };
  },
};

function capitalize(s) {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

/** Exported for tests: converts a JSON:API response into normalized orgs/pets. */
export function parseRescueGroupsResponse(json) {
  const included = new Map();
  for (const inc of json.included || []) included.set(`${inc.type}:${inc.id}`, inc);
  const rel = (animal, name) =>
    (animal.relationships?.[name]?.data || []).map((d) => included.get(`${d.type}:${d.id}`)).filter(Boolean);

  const orgs = new Map();
  const pets = [];
  for (const a of json.data || []) {
    const attr = a.attributes || {};
    const org = rel(a, 'orgs')[0];
    if (!org) continue;
    const orgId = `rg:${org.id}`;
    if (!orgs.has(orgId)) orgs.set(orgId, normalizeOrg(org, orgId));

    const species = rel(a, 'species')[0]?.attributes?.singular;
    const breeds = [attr.breedPrimary, attr.breedSecondary].filter(Boolean);
    const picture = rel(a, 'pictures')[0]?.attributes;
    pets.push({
      id: `rg:${a.id}`,
      orgId,
      name: attr.name,
      species: normalizeSpecies(species),
      breeds: breeds.length ? breeds : (attr.breedString ? attr.breedString.split(/\s*\/\s*/) : []),
      isMixed: triBool(attr.isBreedMixed) ?? breeds.length > 1,
      ageGroup: normalizeAgeGroup(attr.ageGroup),
      sex: attr.sex,
      size: attr.sizeGroup,
      energy: normalizeEnergy(attr.energyLevel || attr.activityLevel),
      goodWithKids: triBool(attr.isKidsOk),
      goodWithDogs: triBool(attr.isDogsOk),
      goodWithCats: triBool(attr.isCatsOk),
      houseTrained: triBool(attr.isHousetrained),
      specialNeeds: triBool(attr.isSpecialNeeds),
      traits: [attr.newPeopleReaction, attr.vocalLevel && `${attr.vocalLevel} vocal`].filter(Boolean),
      description: attr.descriptionText || '',
      adoptionFee: attr.adoptionFeeString,
      url: attr.url,
      photo: attr.pictureThumbnailUrl || picture?.small?.url || picture?.original?.url,
      distance: typeof attr.distance === 'number' ? attr.distance : null,
      source: 'rescuegroups',
    });
  }
  return { orgs: [...orgs.values()], pets };
}

function normalizeOrg(org, id) {
  const o = org.attributes || {};
  return {
    id,
    name: o.name,
    type: o.type,
    city: o.city,
    state: o.state,
    postalCode: o.postalcode,
    location: o.lat != null && o.lon != null ? { lat: Number(o.lat), lng: Number(o.lon) } : null,
    website: o.url,
    adoptionUrl: o.adoptionUrl,
    facebookUrl: o.facebookUrl,
    email: o.email,
    phone: o.phone,
    adoptionProcess: [o.adoptionProcess, o.about].filter(Boolean).join('\n'),
    policies: {},
    sources: ['rescuegroups'],
  };
}
