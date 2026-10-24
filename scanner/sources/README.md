# Data sources

A source is a module that exports:

```js
module.exports = {
  name: "my-source",
  // New-construction homes on the market 60+ days in one city ("Austin, TX").
  async listCity(city) { return [{ id, address, city, state, zip, beds, baths, sqft, yearBuilt, price, builder, path }]; },
  // Price history for one home: [[timestampMs, "Listed" | "Price Changed" | "Relisted" | "Sold" | ..., price], ...]
  async history(home) { return [...]; }
};
```

`path` is the listing link. For Redfin it's a site path (`/TX/Austin/.../home/123`); a licensed source can return a full URL instead (the page handles both).

Pick a source with `SOURCE=redfin node scanner/run.js`.

## Options for a public site

| Source | Notes |
| --- | --- |
| `redfin` (included) | Works from a home connection. Redfin's terms prohibit automated collection, and it blocks most cloud IPs. Personal use only. |
| MLS feed via a broker (IDX/VOW) | The licensed path most listing sites use. Comes with display rules (attribution, refresh rates). |
| Zillow Bridge API | MLS data through Bridge Interactive; needs an approved application. |
| ATTOM, Estated, or similar | Paid property data APIs; check that price-change history is included. |
| Builder inventory feeds | Some large builders publish quick-move-in inventory; good coverage of the biggest discounters. |
