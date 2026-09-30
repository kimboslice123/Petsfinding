/**
 * Turns an organization's structured policies and free-text adoption process
 * (plus each pet's description) into short, human-readable caveats.
 */

const FOSTER = 'Lives in a foster home — schedule a meeting ahead of time';

const TEXT_RULES = [
  [/fenced[- ]in yard|fenced yard|secure(ly)? fenced/i, 'Fenced yard required'],
  [/home (visit|check|inspection)/i, 'Home visit required before adoption'],
  [/landlord|proof of (pet[- ]friendly )?(housing|rental)|lease/i, 'Renters need landlord approval / proof pets are allowed'],
  [/vet(erinary)? (reference|records|check)/i, 'Veterinary reference required'],
  [/personal reference/i, 'Personal references required'],
  [/(no|not good with) (small |young )?(kids|children)|adult[- ]only home|adults only/i, 'Not placed in homes with young children'],
  [/kids (over|older than) \d+|children (over|older than|ages?) \d+/i, 'Minimum child age applies'],
  [/only (dog|cat|pet)\b|no other (dogs|cats|pets|animals)/i, 'Must be the only pet in the home'],
  [/experienced (owner|adopter|home|handler)/i, 'Experienced owners only'],
  [/meet[- ]and[- ]greet|meet (your|the) (resident|current) (dog|cat|pets)/i, 'Meet-and-greet with resident pets required'],
  [/all (household|family) members/i, 'All household members must meet the pet'],
  [/by appointment|appointment only/i, 'Visits by appointment only'],
  [/(live|lives|living) in (a )?foster (home|care)|in foster (homes|care)|foster[- ]based/i, FOSTER],
  [/bonded pair|must be adopted together|adopted together/i, 'Bonded pair — must be adopted together'],
  [/special needs|medication|diabetic|chronic|special diet|ongoing (medical|treatment)/i, 'Has ongoing medical/special needs'],
  [/indoor[- ]only/i, 'Indoor-only home required'],
  [/no (out[- ]of[- ]state)|in[- ]state (adopters )?only|residents of [A-Z]/i, 'In-state adopters only'],
  [/adoption contract|spay\/neuter contract|return (to us|policy|clause)/i, 'Adoption contract with return clause'],
  [/crate training (is )?(required|expected)|expected to crate/i, 'Crate training expected'],
  [/trial (period|adoption)|foster[- ]to[- ]adopt/i, 'Trial / foster-to-adopt period before finalizing'],
];

function uniquePush(list, item) {
  if (item && !list.includes(item)) list.push(item);
}

// "No home visit" should not produce "Home visit required".
const NEGATION = /\b(no|not|without|never|don't|doesn't|isn't)\s+(\w+\s+)?$/i;

function matchesAffirmatively(text, re) {
  const global = new RegExp(re.source, re.flags.includes('g') ? re.flags : `${re.flags}g`);
  for (const m of text.matchAll(global)) {
    const before = text.slice(Math.max(0, m.index - 20), m.index);
    if (!NEGATION.test(before)) return true;
  }
  return false;
}

export function caveatsFromText(text) {
  const out = [];
  if (!text) return out;
  for (const [re, label] of TEXT_RULES) {
    if (matchesAffirmatively(text, re)) uniquePush(out, label);
  }

  const radius = text.match(/(?:within|live within|reside within)\s+(\d{1,4})\s*(?:miles|mi)\b/i);
  if (radius) uniquePush(out, `Only adopts to homes within ${radius[1]} miles`);

  const minAge = text.match(/(?:must be|at least|adopters?(?: must be)?)\s*(\d{2})\+?\s*(?:years?(?: of age| old)?|\+|or older)/i);
  if (minAge) uniquePush(out, `Adopter must be ${minAge[1]}+`);

  const fee = text.match(/(?:adoption|application)\s+fee[^$\d]{0,20}\$\s?(\d[\d,]*)/i);
  if (fee) uniquePush(out, `Fee: $${fee[1]}`);
  return out;
}

export function caveatsFromPolicies(p = {}) {
  const out = [];
  if (p.applicationRequired) out.push('Written application required');
  if (p.applicationFee) out.push(`Application fee: ${p.applicationFee}`);
  if (p.homeVisit) out.push('Home visit required before adoption');
  if (p.fencedYardRequired) out.push('Fenced yard required');
  if (p.landlordApproval) out.push('Renters need landlord approval / proof pets are allowed');
  if (p.vetReference) out.push('Veterinary reference required');
  if (p.meetAndGreetRequired) out.push('Meet-and-greet with resident pets required');
  if (p.minAdopterAge) out.push(`Adopter must be ${p.minAdopterAge}+`);
  if (p.adoptionRadiusMiles) out.push(`Only adopts to homes within ${p.adoptionRadiusMiles} miles`);
  if (p.inStateOnly) out.push('In-state adopters only');
  if (p.appointmentOnly) out.push('Visits by appointment only');
  if (p.fosterBased) out.push(FOSTER);
  if (p.typicalWaitDays) out.push(`Approval typically takes ~${p.typicalWaitDays} days`);
  return out;
}

/** Caveats that apply to the organization as a whole. */
export function orgCaveats(org) {
  const out = [];
  for (const c of caveatsFromPolicies(org.policies)) uniquePush(out, c);
  for (const c of caveatsFromText(org.adoptionProcess)) uniquePush(out, c);
  return out;
}

/** Caveats specific to a pet, excluding ones already stated at the org level. */
export function petCaveats(pet, orgLevel = []) {
  const out = [];
  if (pet.specialNeeds) uniquePush(out, 'Has ongoing medical/special needs');
  if (pet.goodWithKids === false) uniquePush(out, 'Not placed in homes with young children');
  if (pet.goodWithDogs === false) uniquePush(out, 'Not good with other dogs');
  if (pet.goodWithCats === false) uniquePush(out, 'Not good with cats');
  if (pet.adoptionFee) uniquePush(out, `Adoption fee: ${pet.adoptionFee}`);
  for (const c of caveatsFromText(pet.description)) {
    if (!c.startsWith('Fee:')) uniquePush(out, c);
  }
  return out.filter((c) => !orgLevel.includes(c));
}

/**
 * Caveats that conflict with the adopter's own situation, e.g. the org only
 * adopts within 30 miles but the adopter is 45 miles away.
 */
export function conflictsForAdopter(org, distanceMiles) {
  const out = [];
  const textRadius = Number(org.adoptionProcess?.match(/within\s+(\d{1,4})\s*(?:miles|mi)\b/i)?.[1]);
  const radius = org.policies?.adoptionRadiusMiles || textRadius || null;
  if (radius && distanceMiles != null && distanceMiles > radius) {
    out.push(`You appear to be ~${Math.round(distanceMiles)} mi away; this group only adopts within ${radius} miles`);
  }
  return out;
}
