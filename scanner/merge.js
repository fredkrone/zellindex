// Adds today's reading to the history and replaces the home list. Refuses readings that look broken.

const MAX_DAYS = 730;

function check(day) {
  const m = day && day.metrics, problems = [];
  if (!m || !m.date) problems.push("missing metrics");
  else {
    if (m.scanned < 3000) problems.push("core scanned only " + m.scanned);
    if (m.cities < 35) problems.push("core cities only " + m.cities);
    if (m.withHistory < 2000) problems.push("core withHistory only " + m.withHistory);
  }
  if (!Array.isArray(day && day.homes) || day.homes.length < 20) problems.push("home list has " + ((day && day.homes) || []).length + " entries");
  return problems;
}

function merge(prev, day) {
  const problems = check(day);
  if (problems.length) { const e = new Error("NOT SAVED: " + problems.join("; ")); e.problems = problems; throw e; }
  // Per-city stats are kept only on the latest reading (archived separately in site/markets.json).
  const history = ((prev && prev.history) || []).filter(h => h.date !== day.metrics.date).map(h => { const { byCity, ...rest } = h; return rest; });
  history.push(day.metrics);
  history.sort((a, b) => (a.date < b.date ? -1 : 1));
  return {
    updated: day.metrics.date,
    fields: ["address", "city", "state", "zip", "beds", "baths", "sqft", "yearBuilt", "price", "peakPrice", "peakDate", "cuts", "builder", "link", "promo", "scanCity", "community"],
    history: history.slice(-MAX_DAYS),
    homes: day.homes
  };
}

function describe(data) {
  const h = data.history, m = h[h.length - 1], p = h.length > 1 ? h[h.length - 2] : null;
  const d = (k, pct) => p ? " (" + (m[k] - p[k] >= 0 ? "+" : "") + (pct ? (m[k] - p[k]).toFixed(2) + " pts" : m[k] - p[k]) + ")" : "";
  return `${m.date}: typical cut ${m.medianCut}%${d("medianCut", true)}, down 10%+ ${m.down10}${d("down10")}, down 20%+ ${m.down20}${d("down20")}; ${data.homes.length} homes listed; ${h.length} readings`;
}

/** Fold today's outcome updates into the tracked-homes file. */
function mergeResults(prev, updates, date) {
  const byPath = new Map(((prev && prev.homes) || []).map(h => [h.path, h]));
  (updates || []).forEach(h => byPath.set(h.path, Object.assign({}, byPath.get(h.path) || {}, h)));
  const homes = [...byPath.values()].sort((a, b) => (b.pendingDate || b.firstSeen || "").localeCompare(a.pendingDate || a.firstSeen || ""));
  return { updated: date, homes };
}

module.exports = { merge, check, describe, mergeResults };

// CLI: node scanner/merge.js <prev data.json|-> <today.json> <out data.json>
if (require.main === module) {
  const fs = require("fs");
  const [prevPath, todayPath, outPath] = process.argv.slice(2);
  const prev = prevPath && prevPath !== "-" && fs.existsSync(prevPath) ? JSON.parse(fs.readFileSync(prevPath, "utf8")) : null;
  try {
    const out = merge(prev, JSON.parse(fs.readFileSync(todayPath, "utf8")));
    fs.writeFileSync(outPath, JSON.stringify(out));
    console.log(describe(out));
  } catch (e) { console.error(e.message); process.exit(2); }
}
