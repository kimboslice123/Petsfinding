# 🐾 Petsfinding

Petsfinding matches would-be adopters with the rescue groups most likely to have the right pet for them. The adopter enters:

- pet type and preferred breed(s), and whether mixes are OK
- age (baby / young / adult / senior)
- temperament and household fit (good with kids, dogs, or cats, house-trained, calm, active, affectionate, and more)
- ZIP code and how far they're willing to travel

The app searches every configured source and scores each pet. It then ranks the **top 10 rescue groups**, not individual pets. Each group shows its best-matching pets and the **caveats of its adoption process**: home visits, fenced yards, landlord approval, adoption radius, fees, bonded pairs, medical needs, foster-based meetings, and so on.

## Quick start

```bash
npm start          # http://localhost:3000  (Node 20+, no dependencies)
npm test
```

Without API keys the app runs in **demo mode**, using fictional Austin, TX–area rescues. Try ZIP `78701`.

To search real listings, copy `.env.example` to `.env` and add a RescueGroups.org API key.

## Where the data comes from

| Source | How | Status |
|---|---|---|
| **RescueGroups.org** | Official v5 API with radius search by ZIP. Covers thousands of US rescues and shelters. | ✅ Needs a free key: [request one](https://rescuegroups.org/services/adoptable-pet-data-api/) |
| **Individual rescue group sites** | JSON feeds listed in `data/org-feeds.json` | ✅ Add as many as you like (format below) |
| **Petfinder** | Petfinder **shut down its public API on Dec 2, 2025**, and its terms prohibit scraping. | 🔗 The app shows a pre-filled Petfinder search link |
| **Facebook** | Facebook has **no API for searching posts or groups**, and its terms prohibit scraping. | 🔗 Pre-filled Facebook post and group search links, plus each rescue's Facebook page |
| **Adopt-a-Pet** | No public search API | 🔗 Pre-filled search link |

Every source is an adapter in `src/sources/` that returns normalized `{ orgs, pets }` (see `src/model.js`). To add a source, write an adapter and register it in `LIVE_SOURCES` in `src/search.js`. If one source fails, the rest still search, and the UI reports which source failed.

### Adding individual rescue group sites

Add an entry to `data/org-feeds.json`. The URL must return JSON in the same format as `data/sample-listings.json`:

```json
{ "organizations": [ {
    "id": "my-rescue", "name": "My Rescue", "city": "Austin", "state": "TX", "lat": 30.27, "lng": -97.74,
    "website": "...", "facebookUrl": "...",
    "adoptionProcess": "Free text. Caveats are extracted automatically, e.g. 'Home visit and fenced yard required.'",
    "policies": { "homeVisit": true, "adoptionRadiusMiles": 50 },
    "pets": [ { "id": "1", "name": "Rex", "species": "dog", "breed": "Labrador Retriever / Mixed", "age": "Young",
                "energy": "High", "goodWithKids": true, "goodWithDogs": null, "goodWithCats": false,
                "houseTrained": true, "description": "...", "adoptionFee": "$150" } ]
} ] }
```

Many small rescues use platforms that can export listings (Shelterluv, PetPoint, RescueGroups-hosted sites). Before automating collection from any site, get the rescue's permission.

## How matching works (`src/matcher.js`)

Each pet gets a score out of 100:

- **Breed (30):** exact or fuzzy match ("lab" matches "Labrador Retriever"). Partial credit when the breed is the pet's secondary breed. Mixes get a little credit when "mixed OK" is checked.
- **Age (20):** full credit for a selected age, partial credit for an adjacent age group.
- **Temperament (35):** split evenly across the traits the adopter picked. A trait the group hasn't recorded gets 40% credit, so an unrecorded trait doesn't drop the pet.
  If a group has marked a pet **not good with kids, dogs, or cats** and the adopter asked for that, the pet is excluded. That's a safety issue, not a preference.
- **Distance (15):** closer pets score higher. Anything beyond the adopter's travel limit is excluded.

Each group's score blends its best pet, its top-3 average, and how many pets match. A group loses 25 points when its own policy conflicts with the adopter, for example "only adopts within 40 miles" when the adopter is 74 miles away.

## Caveat extraction (`src/caveats.js`)

Caveats come from two places:

- structured policy flags (from feeds)
- rules applied to the group's adoption-process text and each pet's description

Negations are handled, so "no home visit" does not produce "home visit required". Caveats that apply to the whole group appear once on the group card. Pet-specific caveats appear under that pet.

## Project layout

```
src/server.js          HTTP server (static UI + /api/search, /api/options)
src/search.js          runs sources in parallel, merges duplicate orgs, computes distances, ranks
src/matcher.js         pet scoring and org ranking
src/caveats.js         adoption-requirement extraction
src/geo.js             ZIP geocoding (zippopotam.us + offline table) and haversine distance
src/sources/           rescueGroups, orgFeeds, sample, externalLinks
public/                UI (vanilla HTML/CSS/JS, mobile-friendly, dark mode)
data/                  demo listings and the org feed list
test/                  node:test suites
```

## Next steps

- Verify the RescueGroups adapter against a live key. It's built to the published v5 schema and tested with fixtures only.
- Let users save searches and get email alerts when a new matching pet is listed.
- Add an admin page where rescues can register their feed and state their adoption policies directly.
