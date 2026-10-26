const test = require("node:test");
const assert = require("node:assert");
const { analyzeHistory, summarize, isListable } = require("../scanner/analyze");

const NOW = Date.parse("2026-10-24T12:00:00Z");
const d = s => Date.parse(s + "T12:00:00Z");

test("steady step-downs measure from the high and are listable", () => {
  const ev = [
    [d("2026-04-27"), "Listed", 765000], [d("2026-06-09"), "Price Changed", 699975],
    [d("2026-07-01"), "Price Changed", 595000], [d("2026-08-01"), "Price Changed", 529550],
    [d("2026-08-24"), "Price Changed", 479900], [d("2026-09-25"), "Price Changed", 419900]
  ];
  const r = analyzeHistory(419900, ev, NOW);
  assert.equal(r.high, 765000);
  assert.ok(Math.abs(r.pct - 45.1) < 0.1);
  assert.ok(isListable(Object.assign(r, { home: { yearBuilt: 2026 } })));
});

test("a one-day typo spike is ignored", () => {
  const ev = [[d("2026-03-01"), "Listed", 500000], [d("2026-04-01"), "Price Changed", 5000000], [d("2026-05-01"), "Price Changed", 480000]];
  const r = analyzeHistory(470000, ev, NOW);
  assert.equal(r.high, 500000);
});

test("history before the last sale is ignored", () => {
  const ev = [[d("2023-01-01"), "Listed", 57000], [d("2023-04-21"), "Sold (MLS)", 45000], [d("2026-08-07"), "Listed", 499000], [d("2026-09-06"), "Price Changed", 400000]];
  const r = analyzeHistory(310000, ev, NOW);
  assert.equal(r.high, 499000);
});

test("a feed that flips back to its old price is not listable", () => {
  const ev = [[d("2026-01-01"), "Listed", 541400], [d("2026-02-01"), "Price Changed", 459000], [d("2026-03-01"), "Price Changed", 455000], [d("2026-04-01"), "Price Changed", 541400], [d("2026-04-20"), "Price Changed", 541400], [d("2026-05-01"), "Price Changed", 379000], [d("2026-06-01"), "Price Changed", 369000]];
  const r = analyzeHistory(339000, ev, NOW);
  assert.equal(isListable(Object.assign(r, { home: { yearBuilt: 2025 } })), false);
});

test("summary counts cut depths and drops implausible >60% rows", () => {
  const s = summarize([{ pct: 0 }, { pct: 5 }, { pct: 12 }, { pct: 25 }, { pct: 90 }]);
  assert.deepEqual(s, { withHistory: 4, cutCount: 3, medianCut: 12, down10: 2, down20: 1 });
});

test("incentive wording is pulled from listing descriptions", () => {
  const { promo } = require("../scanner/analyze");
  assert.match(promo("Ready now. 2.99% Rates (5.80% APR) * + $10,000 Toward Closing Costs! Big yard."), /2\.99% Rates.*Closing Costs/);
  assert.equal(promo("Over $50,000 in upgrades and a huge yard."), null);
  assert.equal(promo(null), null);
});

test("unfinished construction projects are not listable", () => {
  const ev = [[Date.parse("2026-04-27T12:00:00Z"), "Listed", 765000], [Date.parse("2026-06-09T12:00:00Z"), "Price Changed", 699975], [Date.parse("2026-07-01T12:00:00Z"), "Price Changed", 595000], [Date.parse("2026-08-01T12:00:00Z"), "Price Changed", 529550]];
  const r = analyzeHistory(419900, ev, Date.parse("2026-10-24T12:00:00Z"));
  assert.equal(isListable(Object.assign({}, r, { home: { yearBuilt: 2026, remarks: "Gulf-Access Lot with Active Permits & Structural Shell Already in Place!" } })), false);
  assert.equal(isListable(Object.assign({}, r, { home: { yearBuilt: 2026, remarks: "Move-in ready lakefront pool home." } })), true);
});

test("an unfinished basement does not make a home unlistable", () => {
  const ev = [[Date.parse("2026-04-27T12:00:00Z"), "Listed", 765000], [Date.parse("2026-06-09T12:00:00Z"), "Price Changed", 699975], [Date.parse("2026-07-01T12:00:00Z"), "Price Changed", 595000], [Date.parse("2026-08-01T12:00:00Z"), "Price Changed", 529550]];
  const r = analyzeHistory(419900, ev, Date.parse("2026-10-24T12:00:00Z"));
  assert.equal(isListable(Object.assign({}, r, { home: { yearBuilt: 2026, remarks: "Deluxe bath with double sinks; an unfinished basement; a covered patio." } })), true);
  assert.equal(isListable(Object.assign({}, r, { home: { yearBuilt: 2026, remarks: "NEW CONSTRUCTION OPPORTUNITY – SOLD AS-IS AT CURRENT STAGE OF COMPLETION." } })), false);
});

test("outcomes: contract, sale with price, sale without price, relist", () => {
  const { outcome } = require("../scanner/analyze");
  const t = d => Date.parse(d + "T12:00:00Z");
  const base = { firstSeen: "2026-10-24", priceSeen: 500000, lastList: 500000 };
  let o = outcome(base, [[t("2026-10-30"), "Price Changed", 480000], [t("2026-11-04"), "Pending", null]]);
  assert.deepEqual([o.status, o.pendingDate, o.lastList], ["pending", "2026-11-04", 480000]);
  o = outcome(base, [[t("2026-11-04"), "Pending", null], [t("2026-12-01"), "Sold (MLS)", 470000]]);
  assert.deepEqual([o.status, o.soldDate, o.soldPrice], ["sold", "2026-12-01", 470000]);
  o = outcome(base, [[t("2026-11-04"), "Pending", null], [t("2026-12-01"), "Sold (MLS)", null]]);
  assert.deepEqual([o.status, o.soldPrice], ["sold", null]);
  o = outcome(base, [[t("2026-11-04"), "Pending", null], [t("2026-11-20"), "Relisted", null]]);
  assert.equal(o.status, "active");
  o = outcome(base, [[t("2025-01-01"), "Sold (Public Records)", 90000]]);
  assert.equal(o.status, "active");
});
