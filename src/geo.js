const EARTH_RADIUS_MILES = 3958.8;

/** Great-circle distance in miles between two {lat, lng} points. */
export function haversineMiles(a, b) {
  if (!a || !b || a.lat == null || b.lat == null) return null;
  const toRad = (d) => (d * Math.PI) / 180;
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * EARTH_RADIUS_MILES * Math.asin(Math.sqrt(h));
}

// Offline fallback so the demo works without network access.
const KNOWN_ZIPS = {
  '78701': { lat: 30.2711, lng: -97.7437, city: 'Austin', state: 'TX' },
  '78745': { lat: 30.2064, lng: -97.796, city: 'Austin', state: 'TX' },
  '78613': { lat: 30.5052, lng: -97.8203, city: 'Cedar Park', state: 'TX' },
  '78660': { lat: 30.4394, lng: -97.62, city: 'Pflugerville', state: 'TX' },
  '78664': { lat: 30.514, lng: -97.668, city: 'Round Rock', state: 'TX' },
  '78626': { lat: 30.6388, lng: -97.6777, city: 'Georgetown', state: 'TX' },
  '78602': { lat: 30.1105, lng: -97.3153, city: 'Bastrop', state: 'TX' },
  '78666': { lat: 29.8833, lng: -97.9414, city: 'San Marcos', state: 'TX' },
  '78130': { lat: 29.6995, lng: -98.1245, city: 'New Braunfels', state: 'TX' },
  '78205': { lat: 29.4241, lng: -98.4936, city: 'San Antonio', state: 'TX' },
  '76513': { lat: 31.056, lng: -97.4645, city: 'Belton', state: 'TX' },
  '76701': { lat: 31.5493, lng: -97.1467, city: 'Waco', state: 'TX' },
  '77002': { lat: 29.756, lng: -95.365, city: 'Houston', state: 'TX' },
};

const cache = new Map();

/** Resolve a US ZIP code to coordinates. Uses zippopotam.us, falling back to a bundled table. */
export async function geocodeZip(zip, { fetchImpl = globalThis.fetch, timeoutMs = 5000 } = {}) {
  const clean = String(zip || '').trim().slice(0, 5);
  if (!/^\d{5}$/.test(clean)) throw new Error('Please enter a valid 5-digit US ZIP code.');
  if (cache.has(clean)) return cache.get(clean);
  if (KNOWN_ZIPS[clean]) {
    const hit = { zip: clean, ...KNOWN_ZIPS[clean] };
    cache.set(clean, hit);
    return hit;
  }
  try {
    const res = await fetchImpl(`https://api.zippopotam.us/us/${clean}`, {
      signal: AbortSignal.timeout(timeoutMs),
    });
    if (res.ok) {
      const body = await res.json();
      const place = body.places?.[0];
      if (place) {
        const hit = {
          zip: clean,
          lat: Number(place.latitude),
          lng: Number(place.longitude),
          city: place['place name'],
          state: place['state abbreviation'],
        };
        cache.set(clean, hit);
        return hit;
      }
    }
  } catch {
    // fall through
  }
  // Unknown ZIP: live sources (e.g. RescueGroups) can still radius-search by postal code.
  return { zip: clean, lat: null, lng: null, city: null, state: null };
}
