// Redfin source. Uses Redfin's public web endpoints, the same ones its site calls.
// Caveats: Redfin's terms prohibit automated collection, and it blocks most cloud/datacenter IPs.
// Keep this for personal, local runs; swap in a licensed source for anything public (see ../sources/README.md).

const BASE = "https://www.redfin.com";
const HEADERS = { "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130 Safari/537.36", "Accept": "application/json,text/plain,*/*" };
const parse = s => JSON.parse(s.replace(/^\{\}&&/, ""));
const get = async path => {
  const r = await fetch(BASE + path, { headers: HEADERS });
  if (r.status === 429 || r.status === 403) { const e = new Error("blocked " + r.status); e.blocked = true; throw e; }
  if (!r.ok) throw new Error("HTTP " + r.status + " " + path);
  return parse(await r.text());
};

/** New-construction listings on market 60+ days in one city. Returns normalized homes. */
async function listCity(city) {
  const a = await get("/stingray/do/location-autocomplete?location=" + encodeURIComponent(city) + "&v=2");
  const row = a.payload.sections.flatMap(s => s.rows).find(r => r.type === "2");
  if (!row) throw new Error("city not found: " + city);
  const id = row.id.split("_")[1];
  const g = await get(`/stingray/api/gis?al=1&num_homes=5000&ord=redfin-recommended-asc&page_number=1&region_id=${id}&region_type=6&sf=1,2,3,5,6,7&status=9&uipt=1,2,3&v=8`);
  return (g.payload.homes || [])
    .filter(x => x.isNewConstruction && x.listingType !== 5 && [1, 2, 3].includes(x.uiPropertyType) && (x.dom && x.dom.value) >= 60)
    .map(x => {
      const street = x.streetLine.value, unit = x.unitNumber && x.unitNumber.value;
      return {
        id: String(x.propertyId),
        address: unit && !street.includes(unit) ? street + " " + unit : street,
        city: x.city, state: x.state, zip: x.zip,
        beds: x.beds ?? null, baths: x.baths ?? null,
        sqft: (x.sqFt && x.sqFt.value) || null,
        yearBuilt: (x.yearBuilt && x.yearBuilt.value) || null,
        price: x.price && x.price.value,
        builder: (x.newConstructionCommunityInfo && x.newConstructionCommunityInfo.builderName) || null,
        path: x.url
      };
    });
}

/** Price history events for one home: [timestampMs, description, price]. */
async function history(home) {
  const j = await get("/stingray/api/home/details/belowTheFold?propertyId=" + home.id + "&accessLevel=1");
  return ((j.payload.propertyHistoryInfo && j.payload.propertyHistoryInfo.events) || []).map(e => [e.eventDate, e.eventDescription, e.price]);
}

module.exports = { name: "redfin", listCity, history };
