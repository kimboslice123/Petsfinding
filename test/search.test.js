import { test } from 'node:test';
import assert from 'node:assert/strict';
import { search } from '../src/search.js';
import { sampleSource } from '../src/sources/sample.js';
import { parseRescueGroupsResponse } from '../src/sources/rescueGroups.js';

test('end-to-end search over demo data returns ranked orgs with caveats', async () => {
  const r = await search(
    { species: 'dog', breeds: 'labrador', ages: 'young,adult', temperaments: 'goodWithKids', zip: '78701', distance: '100' },
    { sources: [sampleSource] },
  );
  assert.ok(r.results.length > 0 && r.results.length <= 10);
  for (const org of r.results) {
    assert.ok(org.pets.every((p) => p.species === 'dog'));
    assert.ok(org.pets.every((p) => p.goodWithKids !== false));
    assert.ok(org.distance <= 100);
  }
  assert.ok(r.results.some((o) => o.caveats.length > 0));
  assert.ok(r.externalSearches.some((l) => l.site === 'Petfinder'));
});

test('rejects invalid ZIP codes', async () => {
  await assert.rejects(search({ zip: 'abc' }, { sources: [sampleSource] }), /ZIP/);
});

test('failing sources are reported, not fatal', async () => {
  const broken = { name: 'broken', label: 'Broken', search: async () => { throw new Error('boom'); } };
  const r = await search({ species: 'cat', zip: '78701', distance: 50 }, { sources: [sampleSource, broken] });
  assert.equal(r.sources.find((s) => s.name === 'broken').ok, false);
  assert.ok(r.results.length > 0);
});

test('parses RescueGroups.org JSON:API responses', () => {
  const json = {
    data: [{
      id: '1', type: 'animals',
      attributes: { name: 'Rex', ageGroup: 'Young', breedPrimary: 'Labrador Retriever', isKidsOk: true, isCatsOk: false, distance: 12.3, descriptionText: 'Home visit required.' },
      relationships: { orgs: { data: [{ type: 'orgs', id: '9' }] }, species: { data: [{ type: 'species', id: '8' }] } },
    }],
    included: [
      { type: 'orgs', id: '9', attributes: { name: 'Test Rescue', city: 'Austin', state: 'TX', lat: '30.2', lon: '-97.7', facebookUrl: 'https://facebook.com/x' } },
      { type: 'species', id: '8', attributes: { singular: 'Dog' } },
    ],
  };
  const { orgs, pets } = parseRescueGroupsResponse(json);
  assert.equal(orgs[0].id, 'rg:9');
  assert.equal(orgs[0].facebookUrl, 'https://facebook.com/x');
  assert.equal(pets[0].species, 'dog');
  assert.equal(pets[0].ageGroup, 'young');
  assert.equal(pets[0].goodWithCats, false);
  assert.equal(pets[0].distance, 12.3);
});
