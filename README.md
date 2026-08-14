# Startstar Wire

A live-updating headline feed at `news.startstar.ir`, pulled from a fixed list of
independent, high-reliability publishers, with each headline tagged by:

- **Publisher credential** — a reliability tier sourced from independent media evaluators
  (Ad Fontes Media, Media Bias/Fact Check, AllSides), not invented by this project.
- **Fact-check stamp** — a best-effort lookup against
  [Google's Fact Check Tools API](https://toolbox.google.com/factcheck/apis), surfacing an
  existing ClaimReview if one exists for that headline. Most fresh headlines won't have a
  match yet — that's the expected, normal case, not a bug.

## How it works

```
scripts/publishers.json   -- static list of the 10 sources + their RSS feeds + reliability data
scripts/fetch_news.py     -- pulls each RSS feed, dedupes, queries the Fact Check API, writes data/news.json
data/news.json            -- generated data file the front end reads (do not hand-edit)
index.html                -- the GitHub Pages front end (single file, no build step)
.github/workflows/fetch-news.yml -- runs fetch_news.py every 15 minutes and commits the result
```

The front end polls `data/news.json` every 60 seconds client-side, so once the Action commits
a refreshed file, visitors see new items without reloading the page.

## One-time setup

1. **Get a Google Fact Check Tools API key** (free): enable the "Fact Check Tools API" in the
   [Google Cloud Console](https://console.cloud.google.com/apis/library/factchecktools.googleapis.com)
   for any GCP project, then create an API key under Credentials.
2. **Add it as a repo secret**: Settings → Secrets and variables → Actions → New repository
   secret → name it `GOOGLE_FACT_CHECK_API_KEY`.
3. **Enable GitHub Pages**: Settings → Pages → Build and deployment → Deploy from a branch →
   `main` / `/ (root)`. The included `.nojekyll` file tells Pages to serve the files as-is.
4. **Point your domain**: add a `CNAME` file containing `news.startstar.ir` at the repo root,
   and set a `CNAME` DNS record for `news` pointing at `<yourusername>.github.io` (same pattern
   you already used for `startstar.ir` itself).
5. **Run it once manually**: Actions tab → "Fetch News" → Run workflow, so `data/news.json`
   has content before your first visit.

## Known limitations, on purpose

- **Reuters and AP have no free public RSS.** They're listed in `publishers.json` for
  completeness (`"rss": null`) but `fetch_news.py` skips them. Wiring in a paid API or licensed
  feed later just means filling in that field.
- **The Fact Check API mostly matches claims that have already gone viral and been reviewed**,
  not breaking headlines minutes old. Expect most items to sit at "Unreviewed" — that's the
  API being honest, not the feature being broken.
- **RSS feed paths do change** over time on the publisher side. `fetch_news.py` catches and logs
  parse failures per-feed instead of crashing the whole run, so one broken feed won't take down
  the others — but it's worth spot-checking `publishers.json` every few months.

## Local development

```bash
pip install -r requirements.txt
GOOGLE_FACT_CHECK_API_KEY=your_key python scripts/fetch_news.py
python -m http.server 8000   # then open http://localhost:8000
```
