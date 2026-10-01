import { parseListingFeed } from './normalizedFeed.js';

/**
 * Petfinder has no public API (shut down Dec 2025), so Petfinder listings come
 * in through the adopter's own browser: Claude in Chrome reads the Petfinder
 * pages the adopter is looking at and returns JSON, which the adopter pastes
 * into Petsfinding. This module builds the instructions for Claude and turns
 * the pasted result into normalized orgs/pets.
 */

export const MAX_IMPORTED_PETS = 200;
const MAX_TEXT = 4000;

const AGE_LABEL = { baby: 'Puppy/Kitten (Baby)', young: 'Young', adult: 'Adult', senior: 'Senior' };

const EXAMPLE = `[
  {
    "name": "Biscuit",
    "species": "dog",
    "breed": "Labrador Retriever / Mixed",
    "age": "Young",
    "sex": "Male",
    "size": "Large",
    "energy": "High",
    "goodWithKids": true,
    "goodWithDogs": true,
    "goodWithCats": null,
    "houseTrained": true,
    "specialNeeds": false,
    "traits": ["Playful", "Friendly"],
    "description": "Short summary of the pet's About text and Health section",
    "adoptionFee": "$250",
    "distanceMiles": 17,
    "url": "https://www.petfinder.com/dog/...",
    "photo": "https://...",
    "organization": {
      "name": "Example Lab Rescue",
      "city": "Cedar Park",
      "state": "TX",
      "postalCode": "78613",
      "website": "https://...",
      "facebookUrl": "https://www.facebook.com/...",
      "email": "adopt@example.org",
      "phone": "555-555-5555",
      "adoptionProcess": "The organization's adoption policy / process text, word for word if short"
    }
  }
]`;

/** Instructions the adopter pastes into Claude in Chrome. */
export function buildPetfinderPrompt(prefs) {
  const species = prefs.species && prefs.species !== 'any' ? `${prefs.species}s` : 'pets';
  const lines = [
    `Please help me search Petfinder (www.petfinder.com) for ${species} to adopt.`,
    '',
    'My preferences:',
    `- Location: ZIP ${prefs.zip || '(ask me)'}, within ${prefs.maxDistance || 50} miles`,
  ];
  if (prefs.breeds?.length) lines.push(`- Breed(s): ${prefs.breeds.join(', ')}${prefs.mixedOk ? ' (mixes are OK)' : ''}`);
  if (prefs.ages?.length) lines.push(`- Age: ${prefs.ages.map((a) => AGE_LABEL[a] || a).join(', ')}`);
  if (prefs.temperamentLabels?.length) lines.push(`- Temperament / household: ${prefs.temperamentLabels.join(', ')}`);
  lines.push(
    '',
    'Steps:',
    `1. On petfinder.com, search for ${species} near my ZIP with the distance and filters above (use Petfinder's breed, age and "Good with" filters where available).`,
    '2. Open the best-fitting listings, up to 25. On each pet page read the About section (house-trained, health, "Good in a home with"), the adoption fee, and the shelter/rescue\'s adoption policy or process.',
    '3. Do not fill out applications, contact anyone, or sign in. Just read.',
    '',
    'Reply with ONLY a JSON array (no commentary) in exactly this format, one object per pet.',
    'Use true/false when the listing says so and null when it doesn\'t say. Don\'t guess.',
    '',
    EXAMPLE,
  );
  return lines.join('\n');
}

/** Pull a JSON value out of pasted text, tolerating ```json fences and stray prose. */
export function extractJson(text) {
  const raw = String(text || '').trim();
  if (!raw) throw new Error('Nothing was pasted.');
  const fenced = raw.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const body = fenced ? fenced[1] : raw;
  try {
    return JSON.parse(body);
  } catch {
    const start = body.search(/[[{]/);
    const end = Math.max(body.lastIndexOf(']'), body.lastIndexOf('}'));
    if (start >= 0 && end > start) {
      try {
        return JSON.parse(body.slice(start, end + 1));
      } catch {
        // fall through
      }
    }
  }
  throw new Error("Couldn't read the pasted results. Paste exactly the JSON that Claude returned.");
}

const str = (v, max = 300) => (v == null ? undefined : String(v).slice(0, max));
const httpUrl = (v) => (typeof v === 'string' && /^https?:\/\//i.test(v) ? v.slice(0, 1000) : undefined);
const bool = (v) => (v === true || v === false ? v : typeof v === 'string' ? v : null);

/**
 * Convert Claude's pet array (or a {pets:[...]} / {organizations:[...]} object)
 * into the listing-feed format, then normalize it.
 */
export function parsePetfinderImport(input) {
  const data = typeof input === 'string' ? extractJson(input) : input;
  if (data && Array.isArray(data.organizations)) return parseListingFeed(data, 'petfinder');

  const pets = Array.isArray(data) ? data : Array.isArray(data?.pets) ? data.pets : null;
  if (!pets) throw new Error('Expected a JSON array of pets.');

  const orgs = new Map();
  let skipped = 0;
  for (const p of pets.slice(0, MAX_IMPORTED_PETS)) {
    if (!p || typeof p !== 'object' || !p.name) {
      skipped++;
      continue;
    }
    const o = p.organization && typeof p.organization === 'object' ? p.organization : {};
    const orgName = str(o.name, 200) || 'Unknown organization (Petfinder)';
    const key = `${orgName}|${o.state || ''}`.toLowerCase().replace(/[^a-z0-9|]/g, '');
    if (!orgs.has(key)) {
      orgs.set(key, {
        id: key || `org${orgs.size}`,
        name: orgName,
        type: str(o.type, 50),
        city: str(o.city, 100),
        state: str(o.state, 20),
        postalCode: str(o.postalCode ?? o.zip, 10),
        website: httpUrl(o.website),
        adoptionUrl: httpUrl(o.adoptionUrl),
        facebookUrl: httpUrl(o.facebookUrl),
        email: str(o.email, 200),
        phone: str(o.phone, 50),
        adoptionProcess: str(o.adoptionProcess, MAX_TEXT),
        pets: [],
      });
    }
    const org = orgs.get(key);
    const distance = Number(p.distanceMiles ?? p.distance);
    org.pets.push({
      id: `${key}-${org.pets.length}-${String(p.name).toLowerCase().replace(/[^a-z0-9]/g, '')}`,
      name: str(p.name, 100),
      species: str(p.species, 30),
      breed: Array.isArray(p.breeds) ? p.breeds.map((b) => str(b, 80)).join(' / ') : str(p.breed, 200),
      age: str(p.age, 30),
      sex: str(p.sex, 20),
      size: str(p.size, 30),
      energy: str(p.energy, 30),
      goodWithKids: bool(p.goodWithKids),
      goodWithDogs: bool(p.goodWithDogs),
      goodWithCats: bool(p.goodWithCats),
      houseTrained: bool(p.houseTrained),
      specialNeeds: bool(p.specialNeeds),
      traits: Array.isArray(p.traits) ? p.traits.slice(0, 20).map((t) => str(t, 50)) : [],
      description: str(p.description, MAX_TEXT),
      adoptionFee: str(p.adoptionFee, 50),
      url: httpUrl(p.url),
      photo: httpUrl(p.photo),
      distance: Number.isFinite(distance) && distance >= 0 ? distance : null,
    });
  }

  const parsed = parseListingFeed({ organizations: [...orgs.values()] }, 'petfinder');
  parsed.warnings = [];
  if (pets.length > MAX_IMPORTED_PETS) parsed.warnings.push(`Only the first ${MAX_IMPORTED_PETS} pasted pets were used.`);
  if (skipped) parsed.warnings.push(`${skipped} pasted entr${skipped === 1 ? 'y was' : 'ies were'} skipped (no pet name).`);
  return parsed;
}

/** Wrap pasted results as a one-off source for a single search. */
export function petfinderImportSource(pasted) {
  const parsed = parsePetfinderImport(pasted);
  return {
    name: 'petfinder',
    label: 'Petfinder (via Claude in Chrome)',
    search: async () => parsed,
  };
}
