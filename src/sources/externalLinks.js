/**
 * Petfinder shut down its public API (Dec 2025) and Facebook has no API for
 * searching group/page posts, and both prohibit scraping in their terms. So
 * instead of pulling their data, we hand the adopter pre-filled searches.
 */
export function externalSearchLinks(prefs) {
  const species = prefs.species && prefs.species !== 'any' ? prefs.species : 'pet';
  const breed = prefs.breeds?.[0] || '';
  const plural = species === 'pet' ? 'pets' : `${species}s`;
  const q = (s) => encodeURIComponent(s.trim().replace(/\s+/g, ' '));
  const fbQuery = `${breed} ${species} adoption rescue ${prefs.origin?.city || prefs.zip || ''}`;

  const links = [
    {
      site: 'Petfinder',
      description: 'Largest US adoption listing site (search it directly — no public API)',
      url: `https://www.petfinder.com/search/${plural}-for-adoption/us/?location=${q(prefs.zip || '')}&distance=${prefs.maxDistance || 50}${breed ? `&breed[]=${q(breed)}` : ''}`,
    },
    {
      site: 'Facebook posts',
      description: 'Rescues often post urgent/courtesy listings on Facebook first',
      url: `https://www.facebook.com/search/posts/?q=${q(fbQuery)}`,
    },
    {
      site: 'Facebook groups',
      description: 'Local rehoming & rescue groups',
      url: `https://www.facebook.com/search/groups/?q=${q(`${species} rescue ${prefs.origin?.city || ''}`)}`,
    },
    {
      site: 'Adopt-a-Pet',
      description: 'Another large shelter/rescue listing network',
      url: `https://www.adoptapet.com/${species === 'pet' ? 'pet' : species}-adoption/search?location=${q(prefs.zip || '')}&radius=${prefs.maxDistance || 50}`,
    },
  ];
  return links;
}
