"""
scrape_wikipedia_dobs.py
------------------------
Pulls player dates-of-birth from Wikipedia and builds player_bio.json.

Strategy:
  1. Read players from src/data/players.json
  2. For each player, query Wikipedia for "<Name> (golfer)" — falls back to just "<Name>"
  3. Fetch the page wikitext (only need the infobox section)
  4. Extract DOB from the {{birth date and age|YYYY|MM|DD}} template
  5. Write results to scripts/player_bio.json

Manual verification advised for:
  - Common names (John Smith → may hit the wrong page)
  - Non-English-alphabet names (Å, é, etc.) — Wikipedia redirects usually handle this
  - Players without dedicated Wikipedia pages (rookies, low-ranked LIV/DPWT pros)

The script is idempotent: rerun it and it'll fill in any players that were missed
previously without overwriting existing entries (unless --force is passed).

Usage:
  python scrape_wikipedia_dobs.py          # incremental, only fetches missing
  python scrape_wikipedia_dobs.py --force  # refetches everything
"""

from __future__ import annotations

import argparse
import json
import re
import sys
import time
from pathlib import Path
from typing import Optional

import requests

ROOT = Path(__file__).parent.parent
PLAYERS_PATH = ROOT / "src" / "data" / "players.json"
BIO_PATH = Path(__file__).parent.parent / "data" / "player_bio.json"

WIKI_API = "https://en.wikipedia.org/w/api.php"
HEADERS = {"User-Agent": "guess-the-golfer/1.0 (rosiedata.com)"}

# Regex matches {{birth date and age|1996|6|21}} and variants
# Handles: {{birth date|...}}, {{Birth date and age|...}}, extra whitespace, df/mf flags
BIRTH_DATE_RE = re.compile(
    r"\{\{\s*[Bb]irth[ _]date(?:[ _]and[ _]age)?\s*\|"
    r"(?:\s*df\s*=\s*[yn]+\s*\|)?"
    r"(?:\s*mf\s*=\s*[yn]+\s*\|)?"
    r"\s*(\d{4})\s*\|\s*(\d{1,2})\s*\|\s*(\d{1,2})",
)


def flip_name(name: str) -> str:
    """Data Golf returns 'Surname, Firstname'. Wikipedia wants 'Firstname Surname'."""
    if "," in name:
        surname, firstname = [p.strip() for p in name.split(",", 1)]
        return f"{firstname} {surname}"
    return name


def search_page_title(name: str) -> Optional[str]:
    """
    Find the best Wikipedia page title for a golfer.
    Tries "<Name> (golfer)" first, then plain "<Name>" as a fallback.
    """
    flipped = flip_name(name)

    for query in [f"{flipped} (golfer)", f"{flipped} golfer", flipped]:
        params = {
            "action": "query",
            "format": "json",
            "list": "search",
            "srsearch": query,
            "srlimit": 3,
        }
        try:
            r = requests.get(WIKI_API, params=params, headers=HEADERS, timeout=15)
            r.raise_for_status()
            hits = r.json().get("query", {}).get("search", [])
            if hits:
                # Prefer a result whose title contains "golfer" if available
                for h in hits:
                    if "golfer" in h["title"].lower():
                        return h["title"]
                return hits[0]["title"]
        except requests.RequestException as e:
            print(f"  ⚠ search failed for '{query}': {e}")
            continue
    return None


def fetch_wikitext(title: str) -> Optional[str]:
    """Fetch the wikitext of a Wikipedia page (only the lead section, where infobox lives)."""
    params = {
        "action": "parse",
        "format": "json",
        "page": title,
        "prop": "wikitext",
        "section": 0,  # lead section only — infobox is here
    }
    try:
        r = requests.get(WIKI_API, params=params, headers=HEADERS, timeout=15)
        r.raise_for_status()
        return r.json().get("parse", {}).get("wikitext", {}).get("*")
    except requests.RequestException as e:
        print(f"  ⚠ wikitext fetch failed for '{title}': {e}")
        return None


def parse_dob(wikitext: str) -> Optional[str]:
    """Extract DOB from the first {{birth date...}} template in the wikitext."""
    m = BIRTH_DATE_RE.search(wikitext)
    if not m:
        return None
    y, mo, d = m.groups()
    try:
        return f"{int(y):04d}-{int(mo):02d}-{int(d):02d}"
    except ValueError:
        return None


def load_existing_bio() -> dict:
    if BIO_PATH.exists():
        return json.loads(BIO_PATH.read_text())
    return {}


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--force", action="store_true",
                        help="Refetch even for players already in player_bio.json")
    parser.add_argument("--limit", type=int, default=None,
                        help="Only process the first N players (for testing)")
    args = parser.parse_args()

    if not PLAYERS_PATH.exists():
        sys.exit(f"ERROR: {PLAYERS_PATH} not found. Run build_players.py first.")

    players = json.loads(PLAYERS_PATH.read_text())
    bio = load_existing_bio()

    if args.limit:
        players = players[: args.limit]

    print(f"Processing {len(players)} players…")
    found, missing = 0, 0

    for i, p in enumerate(players, 1):
        dg_id = str(p["id"])
        name = p["name"]

        # Skip if we already have a DOB and --force isn't set
        if not args.force and bio.get(dg_id, {}).get("dob"):
            continue

        print(f"[{i}/{len(players)}] {name}")

        title = search_page_title(name)
        if not title:
            print(f"  ✗ no Wikipedia page found")
            missing += 1
            bio.setdefault(dg_id, {})["wiki_status"] = "not_found"
            continue

        wikitext = fetch_wikitext(title)
        if not wikitext:
            print(f"  ✗ couldn't fetch wikitext for '{title}'")
            missing += 1
            continue

        dob = parse_dob(wikitext)
        if dob:
            print(f"  ✓ {dob}  (via '{title}')")
            bio[dg_id] = {"dob": dob, "wiki_title": title}
            found += 1
        else:
            print(f"  ✗ no DOB found on '{title}'")
            missing += 1
            bio.setdefault(dg_id, {})["wiki_title"] = title
            bio[dg_id]["wiki_status"] = "no_dob_found"

        # Be polite to Wikipedia's servers
        time.sleep(0.5)

        # Save incrementally every 20 players so a crash doesn't lose progress
        if i % 20 == 0:
            BIO_PATH.write_text(json.dumps(bio, indent=2, sort_keys=True))

    BIO_PATH.write_text(json.dumps(bio, indent=2, sort_keys=True))
    print(f"\nDone. Found {found} DOBs, {missing} missing.")
    print(f"Wrote {BIO_PATH}")
    print(f"\nReview any 'wiki_status' entries manually — those need your attention.")


if __name__ == "__main__":
    main()
