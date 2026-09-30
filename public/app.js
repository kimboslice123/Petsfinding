const form = document.getElementById('prefs');
const statusEl = document.getElementById('status');
const resultsEl = document.getElementById('results');
const externalEl = document.getElementById('external');
const distOut = document.getElementById('distOut');

const esc = (s) =>
  String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
const safeUrl = (u) => (/^(https?:|mailto:|tel:)/i.test(u || '') ? u : null);
const link = (href, text) => (safeUrl(href) ? `<a href="${esc(href)}" target="_blank" rel="noopener">${esc(text)}</a>` : '');

form.distance.addEventListener('input', () => (distOut.textContent = form.distance.value));

async function loadOptions() {
  const res = await fetch('/api/options');
  const { temperaments, sources } = await res.json();
  document.getElementById('temperaments').innerHTML = temperaments
    .map((t) => `<label class="chip"><input type="checkbox" name="temperaments" value="${esc(t.key)}" /> ${esc(t.label)}</label>`)
    .join('');
  if (sources.some((s) => s.name === 'sample')) {
    statusEl.innerHTML = `<p class="notice">Demo mode: showing <strong>fictional</strong> Austin, TX–area rescues. Try ZIP 78701. Add a RescueGroups.org API key to search real listings.</p>`;
  }
}

form.addEventListener('submit', async (e) => {
  e.preventDefault();
  const fd = new FormData(form);
  const params = new URLSearchParams({
    species: fd.get('species'),
    breeds: fd.get('breeds'),
    mixedOk: fd.get('mixedOk') ? 'true' : 'false',
    ages: fd.getAll('ages').join(','),
    temperaments: fd.getAll('temperaments').join(','),
    zip: fd.get('zip'),
    distance: fd.get('distance'),
  });
  resultsEl.innerHTML = '';
  externalEl.innerHTML = '';
  statusEl.innerHTML = '<p class="loading">Searching rescue groups…</p>';
  try {
    const res = await fetch(`/api/search?${params}`);
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Search failed');
    render(data);
  } catch (err) {
    statusEl.innerHTML = `<p class="error">${esc(err.message)}</p>`;
  }
});

function render(data) {
  const failed = data.sources.filter((s) => !s.ok);
  const where = data.origin.city ? ` of ${esc(data.origin.city)}, ${esc(data.origin.state)}` : '';
  statusEl.innerHTML = `
    <p>Searched ${data.totalPetsSearched} pets at ${data.totalOrgsSearched} groups within ${data.query.maxDistance} miles${where}
      (sources: ${data.sources.map((s) => esc(s.label)).join(', ')}).</p>
    ${failed.map((s) => `<p class="error">${esc(s.label)} could not be searched: ${esc(s.error)}</p>`).join('')}`;

  resultsEl.innerHTML = data.results.length
    ? data.results.map(renderOrg).join('')
    : `<div class="card empty">No groups matched. Try widening your distance, adding more ages, or allowing mixed breeds.</div>`;

  externalEl.innerHTML = `
    <div class="card">
      <h2>Keep looking on sites we can't search automatically</h2>
      <p class="hint">Petfinder no longer offers a public API, and Facebook doesn't allow automated searching of posts or groups. These links open those sites with your search already filled in.</p>
      <ul class="external">${data.externalSearches
        .map((l) => `<li>${link(l.url, l.site)} <span class="hint">${esc(l.description)}</span></li>`)
        .join('')}</ul>
    </div>`;
}

function renderOrg(r) {
  const o = r.org;
  const contact = [
    link(o.adoptionUrl || o.website, 'Website'),
    link(o.facebookUrl, 'Facebook'),
    o.email ? link(`mailto:${o.email}`, o.email) : '',
    o.phone ? link(`tel:${o.phone}`, o.phone) : '',
  ].filter(Boolean).join(' · ');
  return `
  <article class="card org">
    <div class="org-head">
      <span class="rank">#${r.rank}</span>
      <div class="grow">
        <h2>${esc(o.name)}</h2>
        <p class="meta">${esc([o.type, [o.city, o.state].filter(Boolean).join(', ')].filter(Boolean).join(' · '))}
          ${r.distance != null ? ` · ${Math.round(r.distance)} mi away` : ''} · ${r.matchCount} matching pet${r.matchCount === 1 ? '' : 's'}</p>
        <p class="meta">${contact}</p>
      </div>
      <span class="score" title="Match score">${r.score}<small>/100</small></span>
    </div>
    ${r.conflicts.map((c) => `<p class="conflict">⚠️ ${esc(c)}</p>`).join('')}
    ${r.caveats.length ? `<div class="caveats"><h3>Adoption process &amp; caveats</h3><ul>${r.caveats.map((c) => `<li>${esc(c)}</li>`).join('')}</ul></div>` : ''}
    <div class="pets">${r.pets.map(renderPet).join('')}</div>
  </article>`;
}

function renderPet(p) {
  const img = safeUrl(p.photo) ? `<img src="${esc(p.photo)}" alt="${esc(p.name)}" loading="lazy" />` : `<div class="noimg">${p.species === 'cat' ? '🐱' : p.species === 'rabbit' ? '🐰' : '🐶'}</div>`;
  return `
  <div class="pet">
    ${img}
    <div>
      <h4>${safeUrl(p.url) ? link(p.url, p.name) : esc(p.name)} <span class="pill">${p.matchScore}% match</span></h4>
      <p class="meta">${esc([p.breeds.join(' / '), p.ageGroup, p.sex, p.size].filter(Boolean).join(' · '))}</p>
      ${p.matchReasons.length ? `<p class="reasons">✓ ${p.matchReasons.map(esc).join(' · ')}</p>` : ''}
      ${p.caveats.length ? `<p class="pet-caveats">Note: ${p.caveats.map(esc).join(' · ')}</p>` : ''}
    </div>
  </div>`;
}

loadOptions();
