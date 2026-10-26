// Turns raw listings + price histories into the daily reading and the "biggest markdowns" list.
// Pure functions: no network, so they work with any data source (Redfin today, a licensed feed later).

const DAY = 24 * 60 * 60 * 1000;
const HISTORY_WINDOW = DAY * 365 * 2.3; // only look back ~2.3 years for a listing's high

const median = a => {
  const s = a.slice().sort((p, q) => p - q);
  if (!s.length) return 0;
  return s.length % 2 ? s[(s.length - 1) / 2] : (s[s.length / 2 - 1] + s[s.length / 2]) / 2;
};

/**
 * Build a cleaned price series for one listing and measure its markdown from the high.
 * @param {number} current  current asking price
 * @param {Array<[number, string, number|null]>} events  [timestampMs, description, price]
 *        descriptions like "Listed", "Price Changed", "Relisted", "Sold (MLS)", "Listing Removed"
 * @param {number} now  timestamp for "today"
 */
function analyzeHistory(current, events, now = Date.now()) {
  if (!current || current < 100000) return null;
  const cutoff = now - HISTORY_WINDOW;
  const newestFirst = events.filter(e => !/rent/i.test(e[1])).sort((a, b) => b[0] - a[0]);

  // Current listing cycle: everything since the last sale (or the window start).
  const cycle = [];
  for (const e of newestFirst) { if (/sold/i.test(e[1]) || e[0] < cutoff) break; cycle.push(e); }
  const priced = cycle.filter(e => e[2] && /^(listed|price changed|relisted)$/i.test(e[1])).reverse();

  // One price per day (lowest wins: duplicate feeds often post a base price and a discounted one).
  const byDay = {};
  priced.forEach(e => { const d = new Date(e[0]).toISOString().slice(0, 10); byDay[d] = Math.min(byDay[d] ?? Infinity, e[2]); });
  let s = Object.entries(byDay).sort((a, b) => (a[0] < b[0] ? -1 : 1)).map(([d, p]) => ({ d, p }));
  s.push({ d: "now", p: current });

  // Remove one-point spikes (data-entry typos like an extra zero).
  for (let k = 0; k < 3; k++) {
    s = s.filter((o, i) => {
      if (o.d === "now") return true;
      const a = s[i - 1], b = s[i + 1];
      if (!a || !b) return true;
      return !((o.p > a.p * 1.12 && o.p > b.p * 1.12) || (o.p < a.p / 1.12 && o.p < b.p / 1.12));
    });
  }
  if (s.length < 3) return null;

  let hiI = 0;
  s.forEach((o, i) => { if (o.d !== "now" && o.p > s[hiI].p) hiI = i; });
  const hi = s[hiI];

  let downs = 0, ups = 0, maxDrop = 0, maxRise = 0;
  for (let i = 1; i < s.length; i++) {
    const ch = (s[i].p - s[i - 1].p) / s[i - 1].p;
    if (ch < 0) { downs++; maxDrop = Math.max(maxDrop, -ch); }
    if (i > hiI && ch > 0.03) { ups++; maxRise = Math.max(maxRise, ch); }
  }
  // Feed flip-flop: falls 5%+ below the high, then returns to within 3% of it.
  let dipped = false, bounce = false;
  for (let i = hiI + 1; i < s.length; i++) {
    if (s[i].p <= hi.p * 0.95) dipped = true;
    else if (dipped && s[i].p >= hi.p * 0.97) bounce = true;
  }
  return { pct: (hi.p - current) / hi.p * 100, high: hi.p, highDate: hi.d, current, downs, ups, maxDrop, maxRise, bounce };
}

// Incentive wording from a listing description: rate buydowns, closing-cost credits, cash toward the purchase.
const PROMO = /(\d(?:\.\d+)?\s?%\s*(?:fixed\s*|interest\s*)*rate|rate\s*buy\s*-?\s*downs?|buy\s*-?\s*downs?|closing\s*costs?|flex\s*cash|incentives?|seller\s*(?:credit|concession)s?|lender\s*credit|special\s*financing|below[- ]market\s*rate|\$\s?[\d,.]+k?\s*(?:off|toward|towards|in\s*savings|credit|flex))/i;
function promo(text) {
  if (!text) return null;
  const parts = String(text).replace(/\s+/g, " ").split(/(?<=[.!?])\s+|\s[*|•~]\s|\s-\s(?=[A-Z$0-9])/);
  const hits = parts.filter(t => PROMO.test(t)).map(t => t.replace(/^[\s*•~|!-]+|[\s*•~|]+$/g, "").trim()).filter(t => t.length > 6);
  if (!hits.length) return null;
  let out = hits.join(" · ");
  if (out.length > 220) out = out.slice(0, 217).replace(/\s\S*$/, "") + "…";
  return out;
}

// What happened to a home after it first appeared on the list: still for sale, under contract, sold, or pulled.
const isoDay = t => new Date(t).toISOString().slice(0, 10);
function outcome(entry, ev) {
  const since = Date.parse(entry.firstSeen + "T00:00:00Z") - 3 * 864e5;
  const evs = ev.filter(e => e[0] >= since && !/rent/i.test(e[1])).sort((a, b) => a[0] - b[0]);
  let status = "active", pendingDate = null, soldDate = null, soldPrice = null, offDate = null, lastList = entry.lastList || entry.priceSeen;
  let mlsSold = null, prSold = null;
  for (const [t, d, p] of evs) {
    const day = isoDay(t);
    if (/^sold/i.test(d)) { status = "sold"; soldDate = soldDate || day; if (p) { if (/mls/i.test(d)) mlsSold = p; else prSold = p; } continue; }
    if (status === "sold") continue;
    if (/pending|contingent/i.test(d)) { if (status !== "pending") pendingDate = day; status = "pending"; }
    else if (/^(listed|relisted)$/i.test(d)) { status = "active"; pendingDate = null; offDate = null; if (p) lastList = p; }
    else if (/price changed/i.test(d)) { if (p) lastList = p; if (status === "off") { status = "active"; offDate = null; } }
    else if (/listing removed|delisted/i.test(d)) { if (status !== "pending") { status = "off"; offDate = day; } }
  }
  soldPrice = mlsSold || prSold;
  // A public-record price far from the asking price is usually a bulk or land transfer, not this sale.
  if (soldPrice && (soldPrice < lastList * 0.6 || soldPrice > lastList * 1.4)) soldPrice = null;
  if (status === "sold" && !pendingDate) pendingDate = entry.pendingDate || null;
  return { status, pendingDate, soldDate, soldPrice, offDate, lastList };
}

/** Headline numbers for a set of analyzed listings. */
function summarize(rows) {
  const valid = rows.filter(r => r.pct < 60); // >60% off is almost always a data error
  const cut = valid.filter(r => r.pct > 0).map(r => r.pct);
  return {
    withHistory: valid.length,
    cutCount: cut.length,
    medianCut: +median(cut).toFixed(2),
    down10: valid.filter(r => r.pct >= 10).length,
    down20: valid.filter(r => r.pct >= 20).length
  };
}

// Unfinished projects (structural shells, permits-and-lot sales) aren't move-in homes.
const SHELL = /(structural shell|shell (home|only|in place)|decided not to complete|not to complete|unfinished (home|house|project|construction|build)|incomplete (home|construction)|current stage of completion|finish (this|the) (home|house|project)|complete the (construction|project|build)|take over (the )?(project|construction|build)|active (building )?permits|transferable permits|sold as[- ]is|being sold as[- ]is|lot with (active )?permits)/i;

/** Is this a believable builder markdown (steady step-downs, no feed glitches, a finished home)? */
function isListable(r) {
  return r.pct >= 12 && r.pct < 55 && r.downs >= 3 && r.ups <= 1 &&
    r.maxDrop <= 0.28 && r.maxRise <= 0.15 && !r.bounce && !SHELL.test(r.home.remarks || "") &&
    (!r.home.yearBuilt || r.home.yearBuilt >= 2023);
}

/** Top 40 overall plus the top 10 in each state, biggest markdown first. */
function pickHomes(rows, { overall = 40, perState = 10 } = {}) {
  const cand = rows.filter(isListable).sort((a, b) => b.pct - a.pct);
  const pick = new Map();
  cand.slice(0, overall).forEach(r => pick.set(r.home.id, r));
  const count = {};
  cand.forEach(r => { count[r.home.state] = count[r.home.state] || 0; if (count[r.home.state] < perState) { count[r.home.state]++; pick.set(r.home.id, r); } });
  return [...pick.values()].sort((a, b) => b.pct - a.pct).map(r => [
    r.home.address, r.home.city, r.home.state, r.home.zip, r.home.beds, r.home.baths, r.home.sqft,
    r.home.yearBuilt, r.current, r.high, r.highDate, r.downs, r.home.builder, r.home.path,
    promo(r.home.remarks), r.city || null, r.home.community || null
  ]);
}

/**
 * Build the day's output from analyzed rows.
 * @param rows  [{...analyzeHistory(), home: {id, address, city, state, zip, beds, baths, sqft, yearBuilt, builder, path}, core: bool}]
 */
function buildDay(rows, { date, scannedCore, scannedAll, coreCities, allCities, cityNames = [], cityErrors = [] }) {
  const byState = {};
  [...new Set(rows.map(r => r.home.state))].sort().forEach(st => {
    const rs = rows.filter(r => r.home.state === st);
    byState[st] = Object.assign({ scanned: rs.length }, summarize(rs));
  });
  const byCity = {};
  cityNames.forEach(c => {
    const rs = rows.filter(r => r.city === c);
    if (!rs.length) return;
    const sm = summarize(rs);
    byCity[c] = Object.assign({ scanned: rs.length }, sm, {
      cutShare: sm.withHistory ? +(sm.cutCount / sm.withHistory * 100).toFixed(1) : 0,
      medianDom: rs.some(r => r.home.dom) ? median(rs.map(r => r.home.dom).filter(Boolean)) : null,
      medianPrice: median(rs.map(r => r.current))
    });
  });
  const metrics = Object.assign({ date, scanned: scannedCore }, summarize(rows.filter(r => r.core)), {
    cities: coreCities,
    all: Object.assign({ cities: allCities, scanned: scannedAll }, summarize(rows)),
    byState, byCity, cityErrors
  });
  return { date, metrics, homes: pickHomes(rows) };
}

module.exports = { analyzeHistory, summarize, isListable, pickHomes, buildDay, median, promo, outcome };
