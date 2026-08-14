# Startstar Wire

A live-updating, bilingual (Persian/English) headline feed at `news.startstar.ir`, pulled
from a fixed list of independent, high-reliability publishers. Every headline is tagged with:

- **Publisher credential + logo** — a reliability tier sourced from independent media
  evaluators (Ad Fontes Media, Media Bias/Fact Check, AllSides), shown next to the
  publisher's own favicon and brand color for quick visual recognition.
- **Fact-check stamp** — a best-effort lookup against
  [Google's Fact Check Tools API](https://toolbox.google.com/factcheck/apis), surfacing an
  existing ClaimReview if one exists for that headline. Most fresh headlines won't have a
  match yet — that's the expected, normal case, not a bug.

## Bilingual structure (and why it's two pages, not a JS toggle)

```
index.html      -- Persian (fa, RTL) -- canonical root URL, primary SEO target
en/index.html   -- English (en, LTR) -- alternate version
```

Each is a real, separately-crawlable URL with its own `<title>`, meta description, Open
Graph tags and `hreflang` alternate links pointing at the other. This is deliberate: a
single page that swaps text client-side with JavaScript is much weaker for Persian SEO,
because search engines index what's actually present in the page (and its `lang`/`dir`
attributes) rather than what a script injects after a button click. `sitemap.xml` lists
both URLs with their hreflang pairing; `robots.txt` points crawlers at it.

**What is and isn't translated:** all interface chrome (filters, methodology panel, About
section, footer) is fully translated. Headlines themselves stay in the language they were
published in (English, since all current sources are English-language outlets) — the
`fact_check` and `reliability` ratings apply to the specific claim as published, and
auto-translating headlines risks quietly distorting the exact wording those ratings are
about. If you later add Persian-language sources, they'll display in their original Farsi
the same way English ones display in English.

Shared logic lives in `assets/style.css` (with `[dir="rtl"]` and `[lang="fa"]` overrides,
plus Vazirmatn for Persian UI text) and `assets/app.js` (reads `document.documentElement.lang`
to pick the small dictionary needed for *dynamic* strings only — timestamps, stamp labels —
since static chrome text already lives correctly-translated in each HTML file).

## Publisher logos and colors

Cards show each publisher's real favicon (fetched live via Google's public favicon service,
`s2/favicons?domain=...`) plus a small accent in that publisher's brand color, both sourced
from `scripts/publishers.json`. If a favicon fails to load, the image element is removed and
a colored monogram (`BBC`, `NPR`, etc.) takes its place — the card never breaks. Brand colors
are approximate visual accents for quick recognition, not official reproductions of
trademarked logo artwork, which is why actual logo image files aren't bundled in this repo.

## How the fetch pipeline works

```
scripts/publishers.json   -- static list of the 10 sources: RSS feed, brand color, domain,
                              Persian name, reliability tier + source
scripts/fetch_news.py     -- pulls each RSS feed, dedupes, queries the Fact Check API,
                              writes data/news.json (now including publisher_meta per item
                              so the front end never needs a second request)
data/news.json            -- generated data file both index.html and en/index.html read
.github/workflows/fetch-news.yml -- runs every 15 minutes, commits the refreshed file
```

The front end polls `/data/news.json` every 60 seconds client-side, so once the Action
commits a refreshed file, visitors see new items without reloading the page.

## SEO checklist already wired in

- Separate canonical URLs per language with reciprocal `hreflang` tags (`fa`, `en`,
  `x-default`).
- Persian-first: the root URL (`/`) is the Persian page, matching the `.ir` domain and
  primary audience.
- Real, static, crawlable Persian body copy (`About` + `Sources` sections) — not just
  translated button labels. This is the single biggest lever for actually ranking on
  Persian queries, since search engines weight substantial on-page text, not UI chrome.
- `sitemap.xml` + `robots.txt` pointing at it.
- Per-page `<title>`, meta description, canonical link, Open Graph + `og:locale` /
  `og:locale:alternate`, and a minimal `WebSite` JSON-LD block (deliberately *not* a
  per-headline `NewsArticle` schema, since that data changes every 15 minutes and stale
  structured data can hurt more than it helps — the static About/Sources content carries
  the SEO weight instead).
- Semantic heading structure (`h1` wordmark, `h2` section headings including a
  visually-hidden one above the live feed, `h2` per headline nested under it).
- `<noscript>` fallback messaging for the JS-dependent live feed.

## One-time setup

1. **Get a Google Fact Check Tools API key** (free): enable the "Fact Check Tools API" in
   the [Google Cloud Console](https://console.cloud.google.com/apis/library/factchecktools.googleapis.com)
   for any GCP project, then create an API key under Credentials.
2. **Add it as a repo secret**: Settings → Secrets and variables → Actions → New repository
   secret → name it `GOOGLE_FACT_CHECK_API_KEY`.
3. **Enable GitHub Pages**: Settings → Pages → Build and deployment → Deploy from a branch →
   `main` / `/ (root)`. `.nojekyll` tells Pages to serve everything as-is.
4. **Domain**: `CNAME` already contains `news.startstar.ir` — set a DNS `CNAME` record for
   `news` pointing at `<yourusername>.github.io`, same pattern as `startstar.ir` itself.
5. **Run it once manually**: Actions tab → "Fetch News" → Run workflow, so `data/news.json`
   has content before your first visit.
6. Once it's live, submit `sitemap.xml` in Google Search Console (and Yandex/Bing Webmaster
   Tools, both still meaningfully used for Persian-language search) for both properties.

## Known limitations, on purpose

- **Reuters and AP have no free public RSS.** Listed in `publishers.json` for completeness
  (`"rss": null`); `fetch_news.py` skips them cleanly rather than breaking.
- **The Fact Check API mostly matches claims that have already gone viral and been
  reviewed**, not breaking headlines minutes old. Expect most items to sit at "Unreviewed."
- **RSS feed paths drift over time.** Parse failures are caught and logged per-feed instead
  of crashing the whole run — worth spot-checking `publishers.json` every few months.
- **Headlines aren't translated** (see "Bilingual structure" above for why that's
  intentional, not a gap).

## Local development

```bash
pip install -r requirements.txt
GOOGLE_FACT_CHECK_API_KEY=your_key python scripts/fetch_news.py
python -m http.server 8000   # then open http://localhost:8000/ (fa) or /en/ (en)
```
