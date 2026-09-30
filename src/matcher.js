import { AGE_GROUPS } from './model.js';
import { orgCaveats, petCaveats, conflictsForAdopter } from './caveats.js';

/**
 * Temperament preferences the adopter can pick. `hard: true` means an explicit
 * "no" on the pet (e.g. not good with kids) removes the pet from results,
 * because that's a safety issue rather than a preference.
 */
export const TEMPERAMENTS = {
  goodWithKids: { label: 'Good with kids', hard: true, test: (p) => p.goodWithKids },
  goodWithDogs: { label: 'Good with dogs', hard: true, test: (p) => p.goodWithDogs },
  goodWithCats: { label: 'Good with cats', hard: true, test: (p) => p.goodWithCats },
  houseTrained: { label: 'House-trained', test: (p) => p.houseTrained },
  calm: { label: 'Calm / low energy', test: (p) => energyIs(p, 'low', 'high') },
  active: { label: 'Active / high energy', test: (p) => energyIs(p, 'high', 'low') },
  affectionate: { label: 'Affectionate / cuddly', test: (p) => hasTrait(p, /affection|cuddl|lap|snuggl|loving|velcro/) },
  playful: { label: 'Playful', test: (p) => hasTrait(p, /playful|loves to play|fetch|toys/) },
  independent: { label: 'Independent', test: (p) => hasTrait(p, /independent|self[- ]sufficient/) },
  quiet: { label: 'Quiet', test: (p) => hasTrait(p, /quiet|rarely barks|not vocal/) },
};

function energyIs(pet, want, opposite) {
  if (pet.energy === want) return true;
  if (pet.energy === opposite) return false;
  if (pet.energy === 'moderate') return null;
  return null;
}

function hasTrait(pet, re) {
  const hay = [...(pet.traits || []), pet.description || ''].join(' ').toLowerCase();
  return re.test(hay) ? true : null;
}

const WEIGHTS = { breed: 30, age: 20, temperament: 35, distance: 15 };

const norm = (s) => String(s || '').toLowerCase().replace(/[^a-z ]/g, ' ').replace(/\s+/g, ' ').trim();

/** Loose breed match: "lab" ~ "Labrador Retriever", "pit bull" ~ "American Pit Bull Terrier". */
export function breedMatches(wanted, actual) {
  const w = norm(wanted);
  const a = norm(actual);
  if (!w || !a) return false;
  if (a.includes(w) || w.includes(a)) return true;
  const wTokens = w.split(' ').filter((t) => t.length > 2);
  const aTokens = a.split(' ');
  return wTokens.length > 0 && wTokens.every((t) => aTokens.some((x) => x.startsWith(t) || (t.startsWith(x) && x.length > 3)));
}

/**
 * Score one pet against the adopter's preferences.
 * @returns {{score:number, reasons:string[], excluded?:string}}
 */
export function scorePet(pet, prefs) {
  const reasons = [];

  if (prefs.species && prefs.species !== 'any' && pet.species !== prefs.species) {
    return { score: 0, reasons, excluded: 'species' };
  }
  if (pet.distance != null && prefs.maxDistance && pet.distance > prefs.maxDistance) {
    return { score: 0, reasons, excluded: 'distance' };
  }

  // Breed
  let breedScore = WEIGHTS.breed;
  if (prefs.breeds?.length) {
    const primary = pet.breeds?.[0];
    if (prefs.breeds.some((b) => breedMatches(b, primary))) {
      reasons.push(`Breed: ${pet.breeds.join(' / ')}`);
    } else if (pet.breeds?.slice(1).some((pb) => prefs.breeds.some((b) => breedMatches(b, pb)))) {
      breedScore *= 0.7;
      reasons.push(`Part ${pet.breeds.slice(1).join(' / ')} mix`);
    } else if (prefs.mixedOk && pet.isMixed) {
      breedScore *= 0.2;
    } else {
      breedScore = 0;
    }
    if (breedScore === 0 && prefs.strictBreed) return { score: 0, reasons, excluded: 'breed' };
  }

  // Age
  let ageScore = WEIGHTS.age;
  if (prefs.ages?.length) {
    if (prefs.ages.includes(pet.ageGroup)) {
      reasons.push(`Age: ${pet.ageGroup}`);
    } else if (!pet.ageGroup) {
      ageScore *= 0.5;
    } else {
      const idx = AGE_GROUPS.indexOf(pet.ageGroup);
      const adjacent = prefs.ages.some((a) => Math.abs(AGE_GROUPS.indexOf(a) - idx) === 1);
      ageScore = adjacent ? ageScore * 0.4 : 0;
    }
  }

  // Temperament
  let tempScore = WEIGHTS.temperament;
  const wanted = (prefs.temperaments || []).filter((t) => TEMPERAMENTS[t]);
  if (wanted.length) {
    const share = WEIGHTS.temperament / wanted.length;
    tempScore = 0;
    for (const key of wanted) {
      const t = TEMPERAMENTS[key];
      const v = t.test(pet);
      if (v === true) {
        tempScore += share;
        reasons.push(t.label);
      } else if (v === false) {
        if (t.hard) return { score: 0, reasons, excluded: `temperament:${key}` };
      } else {
        tempScore += share * 0.4; // unknown — the group may simply not have tested it
      }
    }
  }

  // Distance
  let distScore = WEIGHTS.distance * 0.5;
  if (pet.distance != null && prefs.maxDistance) {
    distScore = WEIGHTS.distance * Math.max(0, 1 - pet.distance / prefs.maxDistance);
  }

  const score = Math.round(breedScore + ageScore + tempScore + distScore);
  return { score, reasons };
}

/**
 * Group scored pets by organization and rank organizations.
 * @param {{orgs: Map<string, import('./model.js').Organization>, pets: import('./model.js').Pet[]}} data
 */
export function rankOrganizations({ orgs, pets }, prefs, limit = 10) {
  const byOrg = new Map();
  for (const pet of pets) {
    const { score, reasons, excluded } = scorePet(pet, prefs);
    if (excluded || score < (prefs.minScore ?? 35)) continue;
    if (!byOrg.has(pet.orgId)) byOrg.set(pet.orgId, []);
    byOrg.get(pet.orgId).push({ pet, score, reasons });
  }

  const ranked = [];
  for (const [orgId, matches] of byOrg) {
    const org = orgs.get(orgId);
    if (!org) continue;
    matches.sort((a, b) => b.score - a.score);

    const top = matches[0].score;
    const top3 = matches.slice(0, 3);
    const avgTop3 = top3.reduce((s, m) => s + m.score, 0) / top3.length;
    const depthBonus = Math.min(matches.length, 5) * 2; // more matching pets = more options
    const distance = minDefined(matches.map((m) => m.pet.distance)) ?? org.distance ?? null;

    const orgLevel = orgCaveats(org);
    const conflicts = conflictsForAdopter(org, distance);
    const penalty = conflicts.length ? 25 : 0;

    const score = Math.round(Math.max(0, Math.min(100, top * 0.6 + avgTop3 * 0.3 + depthBonus - penalty)));

    ranked.push({
      org,
      score,
      distance,
      matchCount: matches.length,
      conflicts,
      caveats: orgLevel,
      pets: matches.slice(0, 5).map((m) => ({
        ...m.pet,
        matchScore: m.score,
        matchReasons: m.reasons,
        caveats: petCaveats(m.pet, orgLevel),
      })),
    });
  }

  ranked.sort((a, b) => b.score - a.score || (a.distance ?? 1e9) - (b.distance ?? 1e9));
  return ranked.slice(0, limit).map((r, i) => ({ rank: i + 1, ...r }));
}

function minDefined(values) {
  const nums = values.filter((v) => typeof v === 'number');
  return nums.length ? Math.min(...nums) : null;
}
