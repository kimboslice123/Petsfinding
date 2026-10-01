import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildPetfinderPrompt, extractJson, parsePetfinderImport } from '../src/sources/petfinderImport.js';
import { search } from '../src/search.js';
import { sampleSource } from '../src/sources/sample.js';
import { petfinderImportSource } from '../src/sources/petfinderImport.js';
import { createServer } from '../src/server.js';

const claudeReply = `Here are the pets I found:

\`\`\`json
[
  { "name": "Rex", "species": "Dog", "breed": "Labrador Retriever", "age": "Young",
    "goodWithKids": true, "goodWithCats": false, "houseTrained": true, "distanceMiles": 12,
    "description": "Sweet boy. Needs a fenced yard.", "adoptionFee": "$200",
    "url": "https://www.petfinder.com/dog/rex-1", "photo": "javascript:alert(1)",
    "organization": { "name": "Lone Star Lab Rescue", "city": "Austin", "state": "TX", "postalCode": "78745",
      "adoptionProcess": "Application and home visit required." } },
  { "name": "Penny", "species": "Dog", "breed": "Labrador Retriever / Mixed", "age": "Adult",
    "goodWithKids": null, "distanceMiles": 12,
    "organization": { "name": "Lone Star Lab Rescue", "state": "TX", "postalCode": "78745" } },
  { "species": "Dog" }
]
\`\`\`
Let me know if you want more.`;

test('prompt includes the adopter preferences and the JSON format', () => {
  const p = buildPetfinderPrompt({
    species: 'dog', zip: '78701', maxDistance: 75, breeds: ['Labrador'], mixedOk: true,
    ages: ['young'], temperamentLabels: ['Good with kids'],
  });
  assert.match(p, /ZIP 78701, within 75 miles/);
  assert.match(p, /Labrador \(mixes are OK\)/);
  assert.match(p, /Good with kids/);
  assert.match(p, /"organization"/);
  assert.match(p, /Do not fill out applications/);
});

test('extracts JSON from a fenced, chatty reply', () => {
  assert.equal(extractJson(claudeReply).length, 3);
  assert.deepEqual(extractJson('Sure! [{"name":"A"}] hope that helps'), [{ name: 'A' }]);
  assert.throws(() => extractJson('no json here'), /Couldn't read/);
});

test('groups pets by organization and sanitizes fields', () => {
  const { orgs, pets, warnings } = parsePetfinderImport(claudeReply);
  assert.equal(orgs.length, 1);
  assert.equal(orgs[0].name, 'Lone Star Lab Rescue');
  assert.equal(pets.length, 2);
  assert.equal(pets[0].species, 'dog');
  assert.equal(pets[0].distance, 12);
  assert.equal(pets[0].goodWithCats, false);
  assert.equal(pets[0].photo, undefined, 'non-http URLs are dropped');
  assert.equal(pets[0].source, 'petfinder');
  assert.match(warnings[0], /1 pasted entry was skipped/);
});

test('imported Petfinder pets are ranked with other sources and keep caveats', async () => {
  const r = await search(
    { species: 'dog', breeds: 'labrador', temperaments: 'goodWithKids', zip: '78701', distance: '50' },
    { sources: [sampleSource], extraSources: [petfinderImportSource(claudeReply)] },
  );
  const lone = r.results.find((x) => x.org.name === 'Lone Star Lab Rescue');
  assert.ok(lone, 'imported org appears in results');
  assert.ok(lone.org.location, 'org ZIP was geocoded');
  assert.ok(lone.caveats.includes('Home visit required before adoption'));
  assert.ok(lone.caveats.includes('Written application required'));
  assert.ok(lone.pets.find((p) => p.name === 'Rex').caveats.includes('Fenced yard required'));
  assert.ok(r.sources.some((s) => s.name === 'petfinder' && s.ok));
});

test('POST /api/search accepts pasted results and rejects garbage with 400', async () => {
  const server = createServer().listen(0);
  const port = server.address().port;
  try {
    const ok = await fetch(`http://localhost:${port}/api/search`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ species: 'dog', zip: '78701', distance: 50, petfinderResults: claudeReply }),
    });
    assert.equal(ok.status, 200);
    const body = await ok.json();
    assert.ok(body.results.some((x) => x.org.name === 'Lone Star Lab Rescue'));

    const bad = await fetch(`http://localhost:${port}/api/search`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ zip: '78701', petfinderResults: 'not json at all' }),
    });
    assert.equal(bad.status, 400);
    assert.match((await bad.json()).error, /Petfinder results/);
  } finally {
    server.close();
  }
});
