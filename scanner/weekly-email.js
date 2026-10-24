#!/usr/bin/env node
// Builds the weekly "house of the week" email from site/data.json.
// Without BUTTONDOWN_API_KEY it only writes a preview (email-preview.md).
// With the key it creates the email in Buttondown as a DRAFT for you to review and send;
// set BUTTONDOWN_SEND=1 to send it immediately instead.

const fs = require("fs");
const path = require("path");

const SITE = "https://fredkrone.github.io/zellindex/";
const DATA = path.join(__dirname, "..", "site", "data.json");
const FEATURED = path.join(__dirname, "..", "site", "featured.json");
const REPEAT_WEEKS = 8; // don't feature the same home twice within this many weeks

const money = n => "$" + Math.round(n).toLocaleString("en-US");
const short = n => n >= 1e6 ? "$" + (n / 1e6).toFixed(2).replace(/\.?0+$/, "") + "M" : "$" + Math.round(n / 1000) + "k";
const title = s => s && s === s.toUpperCase() ? s.toLowerCase().replace(/\b\w/g, c => c.toUpperCase()) : s;
const MON = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
const when = d => { const [y, m] = d.split("-"); return MON[+m - 1] + " " + y; };
const link = p => /^https?:/.test(p) ? p : "https://www.redfin.com" + p;
const zillow = h => "https://www.zillow.com/homes/" + encodeURIComponent((h.address.replace("#", "Unit ") + " " + h.city + " " + h.state + " " + h.zip).replace(/\s+/g, "-")) + "_rb/";

function load() {
  const data = JSON.parse(fs.readFileSync(DATA, "utf8"));
  const homes = data.homes.map(a => ({ address: a[0], city: a[1], state: a[2], zip: a[3], beds: a[4], baths: a[5], sqft: a[6], year: a[7], price: a[8], peak: a[9], peakDate: a[10], cuts: a[11], builder: title(a[12]), path: a[13] }))
    .map(h => Object.assign(h, { off: h.peak - h.price, pct: (h.peak - h.price) / h.peak * 100 }))
    .sort((a, b) => b.pct - a.pct);
  const featured = fs.existsSync(FEATURED) ? JSON.parse(fs.readFileSync(FEATURED, "utf8")) : [];
  return { data, homes, featured };
}

function pick(homes, featured, today) {
  const cutoff = new Date(today); cutoff.setDate(cutoff.getDate() - REPEAT_WEEKS * 7);
  const recent = new Set(featured.filter(f => new Date(f.date) >= cutoff).map(f => f.path));
  return homes.find(h => !recent.has(h.path)) || homes[0];
}

function trendLine(history) {
  const last = history[history.length - 1];
  const weekAgo = history.slice().reverse().find(h => (new Date(last.date) - new Date(h.date)) / 864e5 >= 6) || null;
  const fmt = (k, pct) => {
    if (!weekAgo) return "";
    const d = last[k] - weekAgo[k];
    if (Math.abs(d) < 1e-9) return " (unchanged on the week)";
    return " (" + (d > 0 ? "up " : "down ") + (pct ? Math.abs(d).toFixed(2) + " pts" : Math.abs(d).toLocaleString("en-US")) + " on the week)";
  };
  return [
    `- **Typical cut:** ${(+last.medianCut).toFixed(1)}%${fmt("medianCut", true)}`,
    `- **Homes 10%+ below their peak:** ${last.down10.toLocaleString("en-US")}${fmt("down10")}`,
    `- **Homes 20%+ below their peak:** ${last.down20.toLocaleString("en-US")}${fmt("down20")}`
  ].join("\n") + (weekAgo ? "" : "\n\n_Week-over-week changes start once there's a full week of readings._");
}

function build({ data, homes, featured }) {
  const today = data.updated;
  const h = pick(homes, featured, today);
  const others = homes.filter(x => x !== h).slice(0, 4);
  const facts = [h.beds != null && h.beds + " bd", h.baths != null && h.baths + " ba", h.sqft && h.sqft.toLocaleString("en-US") + " sq ft", h.year && "built " + h.year].filter(Boolean).join(" · ");
  const subject = `House of the week: ${h.pct.toFixed(0)}% off in ${h.city}, ${h.state}`;
  const body = `## ${h.address}, ${h.city}, ${h.state}

**${money(h.price)}**, down from **${money(h.peak)}** in ${when(h.peakDate)}. That's **${short(h.off)} (${h.pct.toFixed(1)}%) off** its peak asking price, after ${h.cuts} price cuts.

${facts}${h.builder ? " · " + h.builder : ""}

[See the listing](${link(h.path)}) · [On Zillow](${zillow(h)})

---

### Are builder cuts spreading?

Every morning we rescan the same 40 cities where builders are cutting most.

${trendLine(data.history)}

### Also deep in the graveyard

${others.map(o => `- **${o.pct.toFixed(0)}% off:** [${o.address}, ${o.city}, ${o.state}](${link(o.path)}), now ${short(o.price)} (was ${short(o.peak)})`).join("\n")}

[See all ${homes.length} homes on the list](${SITE})

---

_A big drop can mean the first ask was too high, not that the house is cheap. Compare with recent sales nearby, and ask the builder about incentives on top of the price. Not financial advice._
`;
  return { subject, body, house: h, today };
}

(async () => {
  const ctx = load();
  const email = build(ctx);
  fs.writeFileSync(path.join(__dirname, "..", "email-preview.md"), `# ${email.subject}\n\n${email.body}`);
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

  ctx.featured.push({ date: email.today, path: email.house.path, address: email.house.address, city: email.house.city, state: email.house.state });
  fs.writeFileSync(FEATURED, JSON.stringify(ctx.featured, null, 1));
})().catch(e => { console.error(e); process.exit(1); });
