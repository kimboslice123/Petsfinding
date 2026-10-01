import { normalizeAgeGroup, normalizeSpecies, normalizeEnergy, triBool } from '../model.js';

/**
 * Converts a feed in the app's simple JSON listing format into normalized
 * orgs/pets. The same format is used by the bundled demo data and by any
 * individual rescue website that publishes (or that you scrape-with-permission
 * into) a JSON feed. See README "Adding individual rescue group sites".
 *
 * Format: { organizations: [ { id, name, ..., pets: [ {...} ] } ] }
 */
export function parseListingFeed(feed, sourceName) {
  const orgs = [];
  const pets = [];
  for (const o of feed.organizations || []) {
    const orgId = `${sourceName}:${o.id}`;
    orgs.push({
      id: orgId,
      name: o.name,
      type: o.type || 'rescue',
      city: o.city,
      state: o.state,
      postalCode: o.postalCode,
      location: o.lat != null ? { lat: Number(o.lat), lng: Number(o.lng) } : null,
      website: o.website,
      adoptionUrl: o.adoptionUrl,
      facebookUrl: o.facebookUrl,
      email: o.email,
      phone: o.phone,
      adoptionProcess: o.adoptionProcess,
      policies: o.policies || {},
      sources: [sourceName],
    });
    for (const p of o.pets || []) {
      const breeds = Array.isArray(p.breeds) ? p.breeds : String(p.breed || '').split(/\s*\/\s*/).filter(Boolean);
      pets.push({
        id: `${sourceName}:${p.id}`,
        orgId,
        name: p.name,
        species: normalizeSpecies(p.species),
        breeds,
        isMixed: p.isMixed ?? (breeds.length > 1 || /mix/i.test(breeds.join(' '))),
        ageGroup: normalizeAgeGroup(p.age),
        sex: p.sex,
        size: p.size,
        energy: normalizeEnergy(p.energy),
        goodWithKids: triBool(p.goodWithKids),
        goodWithDogs: triBool(p.goodWithDogs),
        goodWithCats: triBool(p.goodWithCats),
        houseTrained: triBool(p.houseTrained),
        specialNeeds: triBool(p.specialNeeds),
        traits: p.traits || [],
        description: p.description || '',
        adoptionFee: p.adoptionFee,
        url: p.url || o.adoptionUrl || o.website,
        photo: p.photo,
        location: p.lat != null ? { lat: Number(p.lat), lng: Number(p.lng) } : null,
        distance: typeof p.distance === 'number' ? p.distance : null,
        source: sourceName,
      });
    }
  }
  return { orgs, pets };
}
