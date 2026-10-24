#!/usr/bin/env node
// Daily scan: list new-construction homes, read their price histories, update site/data.json.
// Usage: SOURCE=redfin node scanner/run.js [--out site/data.json] [--concurrency 6]

const fs = require("fs");
const path = require("path");
const { CORE, EXTRA } = require("./cities");
const { analyzeHistory, buildDay } = require("./analyze");
const { merge, describe } = require("./merge");

const args = process.argv.slice(2);
const opt = (name, dflt) => { const i = args.indexOf("--" + name); return i >= 0 ? args[i + 1] : dflt; };
const OUT = path.resolve(opt("out", path.join(__dirname, "..", "site", "data.json")));
const CONCURRENCY = +opt("concurrency", 6);
const source = require("./sources/" + (process.env.SOURCE || "redfin"));
const sleep = ms => new Promise(r => setTimeout(r, ms));
const log = (...a) => console.log(new Date().toISOString().slice(11, 19), ...a);

async function withRetry(fn, tries = 4) {
  for (let i = 0; ; i++) {
    try { return await fn(); }
    catch (e) { if (i >= tries - 1) throw e; await sleep(e.blocked ? 5000 * (i + 1) : 1000); }
  }
}

(async () => {
  log(`source: ${source.name}`);
  const homes = new Map(), cityErrors = [];
  const cities = CORE.map(c => [c, true]).concat(EXTRA.map(c => [c, false]));
  for (const [city, core] of cities) {
    try {
      for (const h of await withRetry(() => source.listCity(city))) {
        const prev = homes.get(h.id);
        if (!prev) homes.set(h.id, { home: h, core });
        else if (core) prev.core = true;
      }
    } catch (e) { cityErrors.push(city); log("city failed:", city, e.message); }
  }
  const queue = [...homes.values()];
  log(`${queue.length} homes to check`);

  const rows = [];
  let next = 0, done = 0, errors = 0;
  async function worker() {
    while (next < queue.length) {
      const item = queue[next++];
      try {
        const events = await withRetry(() => source.history(item.home));
        const r = analyzeHistory(item.home.price, events);
        if (r) rows.push(Object.assign(r, { home: item.home, core: item.core }));
      } catch (e) { errors++; }
      if (++done % 1000 === 0) log(`${done}/${queue.length} checked`);
    }
  }
  await Promise.all(Array.from({ length: CONCURRENCY }, worker));
  log(`checked ${done}, errors ${errors}`);

  const date = new Date().toLocaleDateString("en-CA", { timeZone: "America/Los_Angeles" });
  const day = buildDay(rows, {
    date,
    scannedCore: queue.filter(q => q.core).length,
    scannedAll: queue.length,
    coreCities: CORE.length - cityErrors.filter(c => CORE.includes(c)).length,
    allCities: cities.length - cityErrors.length,
    cityErrors
  });

  const prev = fs.existsSync(OUT) ? JSON.parse(fs.readFileSync(OUT, "utf8")) : null;
  const data = merge(prev, day); // throws "NOT SAVED: ..." if the scan looks broken
  fs.writeFileSync(OUT, JSON.stringify(data));
  log(describe(data));
})().catch(e => { console.error(e.message || e); process.exit(1); });
