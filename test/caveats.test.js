import { test } from 'node:test';
import assert from 'node:assert/strict';
import { caveatsFromText, orgCaveats, petCaveats, conflictsForAdopter } from '../src/caveats.js';

test('extracts common adoption requirements from free text', () => {
  const c = caveatsFromText('Home visit and vet reference required. Fenced yard required. Adoption fee $250. We only adopt within 60 miles.');
  assert.ok(c.includes('Home visit required before adoption'));
  assert.ok(c.includes('Veterinary reference required'));
  assert.ok(c.includes('Fenced yard required'));
  assert.ok(c.includes('Fee: $250'));
  assert.ok(c.includes('Only adopts to homes within 60 miles'));
});

test('ignores negated requirements', () => {
  assert.deepEqual(caveatsFromText('Open adoptions: no home visit.'), []);
});

test('pet caveats omit ones already listed for the org', () => {
  const org = { policies: { fencedYardRequired: true } };
  const orgLevel = orgCaveats(org);
  const pet = { description: 'Needs a fenced yard. Bonded pair, must be adopted together.', specialNeeds: true };
  const c = petCaveats(pet, orgLevel);
  assert.ok(!c.includes('Fenced yard required'));
  assert.ok(c.includes('Bonded pair — must be adopted together'));
  assert.ok(c.includes('Has ongoing medical/special needs'));
});

test('flags adopters outside an org adoption radius', () => {
  assert.equal(conflictsForAdopter({ policies: { adoptionRadiusMiles: 40 } }, 30).length, 0);
  assert.equal(conflictsForAdopter({ policies: { adoptionRadiusMiles: 40 } }, 55).length, 1);
});
