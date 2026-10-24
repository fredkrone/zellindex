# Grave Dancing

Grave dancing is buying from a seller who has to sell. This project finds new-construction homes whose asking price has fallen furthest from its peak, and tracks whether builder price cuts are spreading.

**What it shows**
- **The list:** active new homes with the deepest markdowns from their highest asking price, linked to the listing and to Zillow.
- **The trend:** three numbers recorded every day, always from the same 40 cities so days compare.
  - The typical (median) cut among homes that have been cut
  - How many homes are 10%+ below their peak
  - How many are 20%+ below their peak

## Layout

```
site/            the web page (static: index.html + data.json)
scanner/
  run.js         daily scan: list homes → read price histories → update site/data.json
  analyze.js     the math: markdown from the high, glitch filters, daily summary, list picks
  merge.js       adds today's reading to history; refuses readings that look broken
  weekly-email.js  builds the weekly email from site/data.json
  cities.js      CORE (trend, never edit) and EXTRA (coverage, safe to add) cities
  sources/       data sources; see sources/README.md
test/            node --test unit tests for the math
.github/workflows/
  pages.yml      publishes site/ to GitHub Pages on every push to main
  weekly-email.yml  Monday "house of the week" email via Buttondown
  scan.yml       daily scan in GitHub Actions (off until a licensed source is set)
```

## Run it

Requires Node 20+. No dependencies.

```sh
npm test                 # check the math
SOURCE=redfin npm run scan   # ~30 min; updates site/data.json
npm run serve            # view at http://localhost:8080
```

## Switching on analytics and the weekly email

Both are off until configured, so the site works without them.

1. **Analytics (GoatCounter, free):** create a site at goatcounter.com, then set `goatcounter: "<your code>"` in the `window.SITE` block near the top of `site/index.html`. It counts page views, email signups and listing clicks. No cookie banner needed.
2. **Email signup (Buttondown):** create an account at buttondown.com, then set `buttondown: "<your username>"` in the same block. The signup form appears on the page.
3. **Weekly email:** add a repository secret `BUTTONDOWN_API_KEY` (Buttondown → Settings → API). Every Monday the *Weekly email* workflow creates a "house of the week" draft in Buttondown for you to review and send. Add a repository variable `BUTTONDOWN_SEND` = `1` to send automatically. Preview it any time with `node scanner/weekly-email.js` (writes `email-preview.md`).

## How the markdown is measured

For each home on the market 60+ days, take its price history since it was last sold (or the last ~2 years), keep one price per day (the lowest, since duplicate feeds often post a base price and a discounted one), and drop one-day spikes from typos. The markdown is the drop from the highest remaining price to today's price.

A home makes **the list** only if it looks like a real builder markdown: 12–55% off, at least three step-downs, no single drop over 28%, no bounce back up over 15%, never returning to its old high after a cut, and built 2023 or later.

## Data source

The bundled `redfin` source works from a home internet connection, but Redfin's terms prohibit automated collection and it blocks most cloud servers. Use it for personal runs only. For a public site, plug in a licensed source (MLS feed through a broker, Zillow's Bridge API, or a property-data API); see `scanner/sources/README.md`. Then set the `SOURCE` repository variable to turn on the daily GitHub Actions scan.

Not financial advice.
