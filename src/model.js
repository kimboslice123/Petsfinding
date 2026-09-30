/**
 * Normalized shapes shared by every source adapter.
 *
 * @typedef {'baby'|'young'|'adult'|'senior'} AgeGroup
 *
 * @typedef {Object} Organization
 * @property {string} id              Globally unique, prefixed with the source (e.g. "rg:1234").
 * @property {string} name
 * @property {string} [type]          "rescue", "shelter", "foster network", ...
 * @property {string} [city]
 * @property {string} [state]
 * @property {string} [postalCode]
 * @property {{lat:number,lng:number}|null} [location]
 * @property {string} [website]
 * @property {string} [adoptionUrl]
 * @property {string} [facebookUrl]
 * @property {string} [email]
 * @property {string} [phone]
 * @property {string} [adoptionProcess]  Free text describing the group's process/policies.
 * @property {Object} [policies]         Structured policy flags (see caveats.js).
 * @property {string[]} sources          Where this org's data came from.
 *
 * @typedef {Object} Pet
 * @property {string} id
 * @property {string} orgId
 * @property {string} name
 * @property {string} species          Lowercase singular: "dog", "cat", "rabbit", ...
 * @property {string[]} breeds
 * @property {boolean} [isMixed]
 * @property {AgeGroup|null} ageGroup
 * @property {string} [sex]
 * @property {string} [size]
 * @property {'low'|'moderate'|'high'|null} [energy]
 * @property {boolean|null} [goodWithKids]
 * @property {boolean|null} [goodWithDogs]
 * @property {boolean|null} [goodWithCats]
 * @property {boolean|null} [houseTrained]
 * @property {boolean|null} [specialNeeds]
 * @property {string[]} [traits]       Free-form personality tags ("affectionate", "shy", ...).
 * @property {string} [description]
 * @property {string} [adoptionFee]
 * @property {string} [url]
 * @property {string} [photo]
 * @property {number|null} [distance]  Miles from the adopter, if known.
 * @property {string} source
 */

export const AGE_GROUPS = ['baby', 'young', 'adult', 'senior'];

export function normalizeAgeGroup(value) {
  const v = String(value || '').toLowerCase();
  if (/baby|puppy|kitten|infant/.test(v)) return 'baby';
  if (/young|juvenile|adolescent/.test(v)) return 'young';
  if (/senior|elder/.test(v)) return 'senior';
  if (/adult/.test(v)) return 'adult';
  return null;
}

export function normalizeSpecies(value) {
  const v = String(value || '').toLowerCase().trim();
  if (!v) return '';
  if (v.startsWith('dog') || v === 'puppy') return 'dog';
  if (v.startsWith('cat') || v === 'kitten') return 'cat';
  if (v.startsWith('rabbit') || v === 'bunny') return 'rabbit';
  return v.replace(/s$/, '');
}

/** Tri-state boolean from assorted API encodings ("Yes", "1", true, null...). */
export function triBool(value) {
  if (value === true || value === false) return value;
  if (value == null || value === '') return null;
  const v = String(value).toLowerCase();
  if (['yes', 'true', '1', 'y'].includes(v)) return true;
  if (['no', 'false', '0', 'n'].includes(v)) return false;
  return null;
}

export function normalizeEnergy(value) {
  const v = String(value || '').toLowerCase();
  if (/low|calm|couch/.test(v)) return 'low';
  if (/high|very/.test(v)) return 'high';
  if (/moder|medium/.test(v)) return 'moderate';
  return null;
}
