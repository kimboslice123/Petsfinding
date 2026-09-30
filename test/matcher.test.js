import { test } from 'node:test';
import assert from 'node:assert/strict';
import { breedMatches, scorePet, rankOrganizations } from '../src/matcher.js';

const base = {
  species: 'dog', breeds: ['Labrador Retriever'], isMixed: false, ageGroup: 'adult',
  goodWithKids: true, goodWithDogs: true, goodWithCats: null, houseTrained: true, energy: 'moderate', distance: 10,
};
const prefs = { species: 'dog', breeds: ['lab'], mixedOk: true, ages: ['adult'], temperaments: ['goodWithKids'], maxDistance: 50 };

test('breed matching is forgiving', () => {
  assert.ok(breedMatches('lab', 'Labrador Retriever'));
  assert.ok(breedMatches('golden', 'Golden Retriever'));
  assert.ok(breedMatches('pit bull', 'American Pit Bull Terrier'));
  assert.ok(!breedMatches('beagle', 'Labrador Retriever'));
});

test('perfect match scores high', () => {
  const { score, excluded } = scorePet(base, prefs);
  assert.equal(excluded, undefined);
  assert.ok(score >= 90, `score ${score}`);
});

test('wrong species and out-of-range distance are excluded', () => {
  assert.equal(scorePet({ ...base, species: 'cat' }, prefs).excluded, 'species');
  assert.equal(scorePet({ ...base, distance: 80 }, prefs).excluded, 'distance');
});

test('explicit household incompatibility is a hard filter', () => {
  assert.equal(scorePet({ ...base, goodWithKids: false }, prefs).excluded, 'temperament:goodWithKids');
});

test('unknown temperament gets partial credit, not exclusion', () => {
  const known = scorePet(base, { ...prefs, temperaments: ['goodWithCats'] });
  assert.equal(known.excluded, undefined);
  assert.ok(known.score < scorePet(base, prefs).score);
});

test('mixed breeds score lower than exact breed but still count when allowed', () => {
  const mutt = { ...base, breeds: ['Beagle', 'Mixed'], isMixed: true };
  const exact = scorePet(base, prefs).score;
  const mixed = scorePet(mutt, prefs).score;
  assert.ok(mixed < exact);
  assert.ok(mixed > 0);
});

test('ranks orgs, caps results, and penalizes adoption-radius conflicts', () => {
  const orgs = new Map();
  const pets = [];
  for (let i = 0; i < 12; i++) {
    orgs.set(`o${i}`, { id: `o${i}`, name: `Org ${i}`, policies: i === 0 ? { adoptionRadiusMiles: 5 } : {} });
    pets.push({ ...base, id: `p${i}`, orgId: `o${i}`, distance: 10 + i });
  }
  const ranked = rankOrganizations({ orgs, pets }, prefs, 10);
  assert.equal(ranked.length, 10);
  assert.equal(ranked[0].rank, 1);
  assert.notEqual(ranked[0].org.id, 'o0');
  const o0 = rankOrganizations({ orgs, pets }, prefs, 20).find((r) => r.org.id === 'o0');
  assert.equal(o0.conflicts.length, 1);
});
