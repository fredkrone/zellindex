#!/usr/bin/env node
// Builds the weekly "house of the week" email from site/data.json, plus the week's market note
// (site/weekly/<monday>.json) when one has been written.
//
//   node scanner/weekly-email.js           write email-preview.md; with BUTTONDOWN_API_KEY also create it in Buttondown
//   node scanner/weekly-email.js --pick    print the home that would be featured and its market numbers (JSON)
//
// With BUTTONDOWN_API_KEY the email is created as a DRAFT; BUTTONDOWN_SEND=1 sends it instead.

const fs = require("fs");
const path = require("path");

const ROOT = path.join(__dirname, "..");
const SITE = "https://fredkrone.github.io/zellindex/";
const DATA = path.join(ROOT, "site", "data.json");
const MARKETS = path.join(ROOT, "site", "markets.json");
const FEATURED = path.join(ROOT, "site", "featured.json");
const RESULTS = path.join(ROOT, "site", "results.json");
const WEEKLY = path.join(ROOT, "site", "weekly");
const REPEAT_WEEKS = 8; // don't feature the same home twice within this many weeks

const RATINGS = {
  1: "Alive and well",
  2: "Under the weather",
  3: "Terminally ill",
  4: "In the ground",
  5: "Resurrecting"
};
const RATING_HELP = {
  1: "Few builders cutting, and cuts are small.",
  2: "Cuts are spreading, but most are modest.",
  3: "Deep, widespread cuts that are still getting deeper.",
  4: "Cuts are deep but have stopped deepening. Likely near the bottom.",
  5: "Cuts are shrinking after a deep slump. The bottom may be in."
};

const money = n => "$" + Math.round(n).toLocaleString("en-US");
const short = n => n >= 1e6 ? "$" + (n / 1e6).toFixed(2).replace(/\.?0+$/, "") + "M" : "$" + Math.round(n / 1000) + "k";
const num = n => Number(n).toLocaleString("en-US");
const title = s => s && s === s.toUpperCase() ? s.toLowerCase().replace(/\b\w/g, c => c.toUpperCase()) : s;
const MON = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
const when = d => { const [y, m] = d.split("-"); return MON[+m - 1] + " " + y; };
const link = p => /^https?:/.test(p) ? p : "https://www.redfin.com" + p;
const zillow = h => "https://www.zillow.com/homes/" + encodeURIComponent((h.address.replace("#", "Unit ") + " " + h.city + " " + h.state + " " + h.zip).replace(/\s+/g, "-")) + "_rb/";
const pacificToday = () => new Date().toLocaleDateString("en-CA", { timeZone: "America/Los_Angeles" });
const addDays = (d, n) => { const t = new Date(d + "T12:00:00Z"); t.setUTCDate(t.getUTCDate() + n); return t.toISOString().slice(0, 10); };
const gauge = r => "■".repeat(r) + "□".repeat(5 - r);

function load() {
  const data = JSON.parse(fs.readFileSync(DATA, "utf8"));
  const homes = data.homes.map(a => ({
    address: a[0], city: a[1], state: a[2], zip: a[3], beds: a[4], baths: a[5], sqft: a[6], year: a[7],
    price: a[8], peak: a[9], peakDate: a[10], cuts: a[11], builder: title(a[12]), path: a[13],
    promo: a[14] || null, scanCity: a[15] || null, community: a[16] || null
  })).map(h => Object.assign(h, { off: h.peak - h.price, pct: (h.peak - h.price) / h.peak * 100 }))
    .sort((a, b) => b.pct - a.pct);
  const featured = fs.existsSync(FEATURED) ? JSON.parse(fs.readFileSync(FEATURED, "utf8")) : [];
  const markets = fs.existsSync(MARKETS) ? JSON.parse(fs.readFileSync(MARKETS, "utf8")) : { days: [] };
  const results = fs.existsSync(RESULTS) ? JSON.parse(fs.readFileSync(RESULTS, "utf8")) : { homes: [] };
  return { data, homes, featured, markets, results };
}

function pick(homes, featured, today) {
  const cutoff = addDays(today, -REPEAT_WEEKS * 7);
  const recent = new Set(featured.filter(f => f.date >= cutoff).map(f => f.path));
  return homes.find(h => !recent.has(h.path)) || homes[0];
}

/** Market numbers for the city the home was found in: today, plus 7 and 28 days ago when archived. */
function marketStats(ctx, cityKey) {
  if (!cityKey) return null;
  const latest = ctx.data.history[ctx.data.history.length - 1];
  const now = latest && latest.byCity && latest.byCity[cityKey];
  if (!now) return null;
  const days = (ctx.markets.days || []).filter(d => d.byCity && d.byCity[cityKey]);
  const ago = n => { const target = addDays(latest.date, -n); const d = days.filter(x => x.date <= target).pop(); return d ? Object.assign({ date: d.date }, d.byCity[cityKey]) : null; };
  const share = s => s && s.withHistory ? s.down10 / s.withHistory * 100 : null;
  return { city: cityKey, date: latest.date, now, week: ago(7), month: ago(28), down10Share: share(now), down10ShareMonth: share(ago(28)) };
}

/** Rating from the numbers alone; the weekly note can override it with judgment and research. */
function autoRating(m) {
  if (!m) return null;
  const cut = m.now.medianCut, s10 = m.down10Share;
  let r = cut < 3 && s10 < 10 ? 1 : cut < 6 && s10 < 25 ? 2 : 3;
  if (m.month) {
    const dCut = cut - m.month.medianCut, dS10 = s10 - m.down10ShareMonth;
    if (m.month.medianCut >= 5 && dCut <= -0.75) r = 5;
    else if (r >= 2 && cut >= 4.5 && dCut <= 0.25 && dS10 <= 1) r = 4;
  }
  return r;
}

function findNote(today) {
  if (!fs.existsSync(WEEKLY)) return null;
  const notes = fs.readdirSync(WEEKLY).filter(f => /^\d{4}-\d{2}-\d{2}\.json$/.test(f)).sort()
    .map(f => JSON.parse(fs.readFileSync(path.join(WEEKLY, f), "utf8")))
    .filter(n => n.forDate >= addDays(today, -3) && n.forDate <= addDays(today, 1));
  return notes.pop() || null;
}

function trendLine(history) {
  const last = history[history.length - 1];
  const weekAgo = history.slice().reverse().find(h => (new Date(last.date) - new Date(h.date)) / 864e5 >= 6) || null;
  const fmt = (k, pct) => {
    if (!weekAgo) return "";
    const d = last[k] - weekAgo[k];
    if (Math.abs(d) < 1e-9) return " (unchanged on the week)";
    return " (" + (d > 0 ? "up " : "down ") + (pct ? Math.abs(d).toFixed(2) + " pts" : num(Math.abs(d))) + " on the week)";
  };
  return [
    `- **Typical cut:** ${(+last.medianCut).toFixed(1)}%${fmt("medianCut", true)}`,
    `- **Homes 10%+ below their peak:** ${num(last.down10)}${fmt("down10")}`,
    `- **Homes 20%+ below their peak:** ${num(last.down20)}${fmt("down20")}`
  ].join("\n") + (weekAgo ? "" : "\n\n_Week-over-week changes start once there's a full week of readings._");
}

function marketSection(h, m, note) {
  const rating = note && note.rating ? note.rating : autoRating(m);
  if (!rating && !note) return "";
  const where = (note && note.market) || (m && m.city) || `${h.city}, ${h.state}`;
  const why = (note && note.ratingWhy) || RATING_HELP[rating];
  const lines = [`### The market: ${where}`, "", `**Grave-dancing rating: ${rating}/5, ${RATINGS[rating]}** ${gauge(rating)}`, `_${why}_`, ""];
  if (note && note.writeup) lines.push(note.writeup.trim(), "");
  if (note && note.bottom) lines.push(`**Has it hit bottom?** ${note.bottom.trim()}`, "");
  if (m) {
    const n = m.now, ch = (a, b, pct) => b == null ? "" : ` (${a - b >= 0 ? "up" : "down"} ${pct ? Math.abs(a - b).toFixed(1) + " pts" : num(Math.abs(a - b))} in 4 weeks)`;
    lines.push(`New homes on the market 60+ days in ${m.city}, from today's scan:`, "");
    lines.push(`- **Typical cut from peak:** ${(+n.medianCut).toFixed(1)}%${m.month ? ch(n.medianCut, m.month.medianCut, true) : ""}`);
    lines.push(`- **Down 10% or more:** ${num(n.down10)} of ${num(n.withHistory)} homes (${m.down10Share.toFixed(0)}%)`);
    lines.push(`- **Down 20% or more:** ${num(n.down20)}${m.month ? ch(n.down20, m.month.down20) : ""}`);
    if (n.medianDom) lines.push(`- **Typical time on market:** ${num(n.medianDom)} days`);
    lines.push("");
  }
  if (note && Array.isArray(note.sources) && note.sources.length) {
    lines.push("_Sources: " + note.sources.map(s => `[${s.title}](${s.url})`).join(" · ") + "_", "");
  }
  return lines.join("\n");
}

/** Homes from the list that went under contract or sold in the past week. */
function outcomesSection(ctx, today) {
  const since = addDays(today, -7);
  const homes = (ctx.results.homes || []);
  const recent = homes.filter(h => (h.status === "sold" && h.soldDate >= since) || (h.status === "pending" && h.pendingDate >= since))
    .sort((a, b) => ((b.soldDate || b.pendingDate) || "").localeCompare((a.soldDate || a.pendingDate) || ""));
  const all = homes.filter(h => h.status === "pending" || h.status === "sold");
  if (!recent.length && !all.length) return "";
  const pct = h => ((h.peak - (h.soldPrice || h.lastList)) / h.peak * 100).toFixed(0);
  const line = h => {
    const where = `[${h.a}, ${h.c}, ${h.s}](${link(h.path)})`;
    const bld = h.bld ? ` (${title(h.bld)})` : "";
    if (h.status === "sold") return `- **Sold:** ${where}${bld}` + (h.soldPrice ? ` for ${money(h.soldPrice)}, ${pct(h)}% below its ${short(h.peak)} peak` : `, price not disclosed; last asking ${money(h.lastList)}, ${pct(h)}% below peak`);
    return `- **Under contract:** ${where}${bld} at ${money(h.lastList)} asking, ${pct(h)}% below its ${short(h.peak)} peak`;
  };
  const out = ["### Out of the graveyard", ""];
  if (recent.length) out.push(`Homes from our list that found a buyer this week:`, "", ...recent.slice(0, 6).map(line), "");
  else out.push("No new contracts on homes from our list this week.", "");
  out.push(`So far, ${all.length} of the ${num(homes.length)} homes we've listed ${all.length === 1 ? "has" : "have"} gone under contract or sold. [See them all](${SITE}#results)`, "");
  return out.join("\n");
}

function build(ctx) {
  const today = pacificToday();
  const note = findNote(today);
  let h = note && note.house ? ctx.homes.find(x => x.path === note.house.path) : null;
  const usedNote = !!h;
  if (!h) h = pick(ctx.homes, ctx.featured, ctx.data.updated);
  const m = marketStats(ctx, h.scanCity);
  const others = ctx.homes.filter(x => x !== h).slice(0, 4);
  const facts = [h.beds != null && h.beds + " bd", h.baths != null && h.baths + " ba", h.sqft && num(h.sqft) + " sq ft", h.year && "built " + h.year].filter(Boolean).join(" · ");
  const builder = (usedNote && note.builder) || (h.builder ? h.builder + (h.community ? `, ${h.community}` : "") : "Custom or small builder");
  const incentives = (usedNote && note.incentives) || h.promo || "None listed. Ask anyway: most builders right now are offering rate buydowns or closing-cost help on homes that have sat this long.";
  const rating = (usedNote && note.rating) || autoRating(m);
  const subject = `House of the week: ${h.pct.toFixed(0)}% off in ${h.city}, ${h.state}` + (rating ? ` (${RATINGS[rating].toLowerCase()})` : "");

  const body = `## ${h.address}, ${h.city}, ${h.state}

**${money(h.price)}**, down from **${money(h.peak)}** in ${when(h.peakDate)}. That's **${short(h.off)} (${h.pct.toFixed(1)}%) off** its peak asking price, after ${h.cuts} price cuts.

${facts}

- **Builder:** ${builder}
- **Incentives:** ${incentives}

[See the listing](${link(h.path)}) · [On Zillow](${zillow(h)})

${marketSection(h, m, usedNote ? note : null)}
${outcomesSection(ctx, today)}
---

### Are builder cuts spreading nationally?

Every morning we rescan the same 40 cities where builders are cutting most.

${trendLine(ctx.data.history)}

### Also deep in the graveyard

${others.map(o => `- **${o.pct.toFixed(0)}% off:** [${o.address}, ${o.city}, ${o.state}](${link(o.path)}), now ${short(o.price)} (was ${short(o.peak)})`).join("\n")}

[See all ${ctx.homes.length} homes on the list](${SITE})

---

_Grave-dancing ratings: 1 alive and well · 2 under the weather · 3 terminally ill · 4 in the ground · 5 resurrecting. They rate the local market for new homes, based on how hard builders are cutting and how the wider market is holding up, not a forecast of where prices go next. A big drop can also mean the first ask was too high, so compare with recent sales nearby. Not financial advice._
`;
  return { subject, body, house: h, today, rating, market: m };
}

if (require.main === module) (async () => {
  const ctx = load();

  if (process.argv.includes("--pick")) {
    const h = pick(ctx.homes, ctx.featured, ctx.data.updated);
    const m = marketStats(ctx, h.scanCity);
    console.log(JSON.stringify({ house: h, market: m, autoRating: autoRating(m), dataDate: ctx.data.updated }, null, 1));
    return;
  }

  const email = build(ctx);
  fs.writeFileSync(path.join(ROOT, "email-preview.md"), `# ${email.subject}\n\n${email.body}`);
  console.log("Subject:", email.subject);

  const key = process.env.BUTTONDOWN_API_KEY;
  if (!key) { console.log("No BUTTONDOWN_API_KEY set; wrote email-preview.md only."); return; }

  const send = process.env.BUTTONDOWN_SEND === "1";
  const r = await fetch("https://api.buttondown.com/v1/emails", {
    method: "POST",
    headers: { "Authorization": "Token " + key, "Content-Type": "application/json" },
    body: JSON.stringify({ subject: email.subject, body: email.body, status: send ? "about_to_send" : "draft" })
  });
  if (!r.ok) { console.error("Buttondown error", r.status, await r.text()); process.exit(1); }
  console.log(send ? "Sent via Buttondown." : "Draft created in Buttondown; review and send it there.");

  ctx.featured.push({ date: email.today, path: email.house.path, address: email.house.address, city: email.house.city, state: email.house.state, rating: email.rating || null });
  fs.writeFileSync(FEATURED, JSON.stringify(ctx.featured, null, 1));
})().catch(e => { console.error(e); process.exit(1); });

module.exports = { autoRating, RATINGS };
