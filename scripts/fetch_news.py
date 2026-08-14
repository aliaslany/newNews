#!/usr/bin/env python3
"""
Fetches the latest headlines from the publishers configured in
scripts/publishers.json, best-effort checks each new headline against
Google's Fact Check Tools API, and writes the merged result to
data/news.json for the GitHub Pages front end to read.

Run manually with:
    GOOGLE_FACT_CHECK_API_KEY=xxxx python scripts/fetch_news.py

In CI, GOOGLE_FACT_CHECK_API_KEY comes from a repo secret (see
.github/workflows/fetch-news.yml). The script degrades gracefully if
it's missing: items are still fetched, just marked "unavailable" for
fact-check status instead of failing the whole run.
"""
import hashlib
import json
import os
import sys
import time
from datetime import datetime, timezone
from pathlib import Path

import feedparser
import requests

ROOT = Path(__file__).resolve().parent.parent
PUBLISHERS_PATH = ROOT / "scripts" / "publishers.json"
DATA_PATH = ROOT / "data" / "news.json"

MAX_ITEMS_PER_FEED = 8       # newest N entries pulled per publisher per run
MAX_STORED_ITEMS = 200       # cap on data/news.json so it doesn't grow forever
FACT_CHECK_TIMEOUT = 8
FACT_CHECK_URL = "https://factchecktools.googleapis.com/v1alpha1/claims:search"


def load_json(path, default):
    if path.exists():
        with open(path, "r", encoding="utf-8") as f:
            return json.load(f)
    return default


def save_json(path, data):
    path.parent.mkdir(parents=True, exist_ok=True)
    with open(path, "w", encoding="utf-8") as f:
        json.dump(data, f, ensure_ascii=False, indent=2)


def make_id(url, title):
    return hashlib.sha1(f"{url}|{title}".encode("utf-8")).hexdigest()[:16]


def fetch_publisher_items(publisher):
    rss_url = publisher.get("rss")
    if not rss_url:
        return []
    try:
        parsed = feedparser.parse(rss_url)
    except Exception as exc:
        print(f"[warn] could not parse feed for {publisher['id']}: {exc}", file=sys.stderr)
        return []

    if getattr(parsed, "bozo", False) and not parsed.entries:
        print(f"[warn] empty/broken feed for {publisher['id']}: {rss_url}", file=sys.stderr)
        return []

    items = []
    for entry in parsed.entries[:MAX_ITEMS_PER_FEED]:
        title = (entry.get("title") or "").strip()
        link = (entry.get("link") or "").strip()
        if not title or not link:
            continue
        published = entry.get("published") or entry.get("updated") or ""
        items.append({
            "id": make_id(link, title),
            "title": title,
            "url": link,
            "published_raw": published,
            "source_id": publisher["id"],
            "source_name": publisher["name"],
        })
    return items


def query_fact_check(title, api_key):
    """Best-effort claim lookup. Most fresh headlines will have no
    ClaimReview yet -- that's the expected/normal result, not an error.
    We only ever surface a verdict when a real fact-checker's review
    actually exists for a matching claim."""
    if not api_key:
        return {"status": "unavailable", "matches": []}

    params = {"query": title, "languageCode": "en", "key": api_key}
    try:
        resp = requests.get(FACT_CHECK_URL, params=params, timeout=FACT_CHECK_TIMEOUT)
        resp.raise_for_status()
        payload = resp.json()
    except Exception as exc:
        print(f"[warn] fact-check lookup failed for {title[:60]!r}: {exc}", file=sys.stderr)
        return {"status": "error", "matches": []}

    matches = []
    for claim in payload.get("claims", [])[:3]:
        for review in claim.get("claimReview", []):
            matches.append({
                "publisher": review.get("publisher", {}).get("name", "Unknown"),
                "rating": review.get("textualRating", "Unrated"),
                "url": review.get("url"),
            })

    status = "reviewed" if matches else "no_match"
    return {"status": status, "matches": matches}


def main():
    api_key = os.environ.get("GOOGLE_FACT_CHECK_API_KEY", "")
    if not api_key:
        print("[info] GOOGLE_FACT_CHECK_API_KEY not set -- items will be stored "
              "with fact_check.status = 'unavailable'.", file=sys.stderr)

    registry = load_json(PUBLISHERS_PATH, {"publishers": []})
    publishers = registry["publishers"]
    store = load_json(DATA_PATH, {"generated_at": None, "items": []})
    existing_ids = {item["id"] for item in store["items"]}

    pending = []
    for publisher in publishers:
        for raw in fetch_publisher_items(publisher):
            if raw["id"] in existing_ids:
                continue
            pending.append((raw, publisher))
            existing_ids.add(raw["id"])  # avoid dupes within the same run too

    added = 0
    for raw, publisher in pending:
        fact_check = query_fact_check(raw["title"], api_key)
        record = {
            **raw,
            "fetched_at": datetime.now(timezone.utc).isoformat(),
            "reliability": publisher.get("reliability", {}),
            "publisher_meta": {
                "name_fa": publisher.get("name_fa"),
                "abbr": publisher.get("abbr"),
                "domain": publisher.get("domain"),
                "color": publisher.get("color"),
            },
            "fact_check": fact_check,
        }
        store["items"].insert(0, record)
        added += 1
        if api_key:
            time.sleep(0.3)  # stay polite to the Fact Check API's rate limit

    store["items"] = store["items"][:MAX_STORED_ITEMS]
    store["generated_at"] = datetime.now(timezone.utc).isoformat()
    save_json(DATA_PATH, store)
    print(f"Added {added} new item(s). Total stored: {len(store['items'])}.")


if __name__ == "__main__":
    main()
