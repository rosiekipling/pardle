"""
scrape_wikipedia_dobs.py  (v2 — with verification)
---------------------------------------------------
Pulls player DOBs from Wikipedia, with a much stricter matching step:
after fetching a candidate page, it verifies the page's wikitext actually
mentions the player's surname. If not, it moves to the next candidate or
marks the player as unresolved.

Usage:
  python scrape_wikipedia_dobs.py              # fetch only missing entries
  python scrape_wikipedia_dobs.py --force      # refetch everything
  python scrape_wikipedia_dobs.py --refetch-suspects
                                               # refetch only entries whose
                                               # wiki_title doesn't contain surname
"""

from __future__ import annotations

import argparse
import json
import re
import sys
import time
import unicodedata
from pathlib import Path
from typing import Optional

import requests

ROOT = Path(__file__).parent.parent
PLAYERS_PATH = ROOT / "src" / "data" / "players.json"
BIO_PATH = ROOT / "data" / "player_bio.json"

WIKI_API = "https://en.wikipedia.org/w/api.php"
HEADERS = {"User-Agent": "guess-the-golfer/1.1 (rosiedata.com)"}

BIRTH_DATE_RE = re.compile(
    r"\{\{\s*[Bb]irth[ _]date(?:[ _]and[ _]age)?\s*\|"
    r"(?:\s*df\s*=\s*[yn]+\s*\|)?"
    r"(?:\s*mf\s*=\s*[yn]+\s*\|)?"
    r"\s*(\d{4})\s*\|\s*(\d{1,2})\s*\|\s*(\d{1,2})",
)


def deaccent(s: str) -> str:
    """Strip accents so 'Åberg' matches 'Aberg', 'García' matches 'Garcia'."""
    return "".join(
        c for c in unicodedata.normalize("NFD", s) if unicodedata.category(c) != "Mn"
    )


def get_surname(name: str) -> str:
    if "," in name:
        return name.split(",")[0].strip()
    parts = name.split()
    return parts[-1] if parts else name


def search_candidates(query: str, limit: int = 5) -> list[str]:
    params = {
        "action": "query",
        "format": "json",
        "list": "search",
        "srsearch": query,
        "srlimit": limit,
    }
    try:
        r = requests.get(WIKI_API, params=params, headers=HEADERS, timeout=15)
        r.raise_for_status()
        return [h["title"] for h in r.json().get("query", {}).get("search", [])]
    except requests.RequestException:
        return []


def fetch_wikitext(title: str) -> Optional[str]:
    params = {
        "action": "parse",
        "format": "json",
        "page": title,
        "prop": "wikitext",
        "section": 0,
    }
    try:
        r = requests.get(WIKI_API, params=params, headers=HEADERS, timeout=15)
        r.raise_for_status()
        return r.json().get("parse", {}).get("wikitext", {}).get("*")
    except requests.RequestException:
        return None


def parse_dob(wikitext: str) -> Optional[str]:
    m = BIRTH_DATE_RE.search(wikitext)
    if not m:
        return None
    y, mo, d = m.groups()
    try:
        return f"{int(y):04d}-{int(mo):02d}-{int(d):02d}"
    except ValueError:
        return None


def verify_match(wikitext: str, firstname: str, surname: str) -> bool:
    """Check the wikitext actually mentions this player by surname + firstname."""
    text = deaccent(wikitext).lower()
    sur = deaccent(surname).lower()
    first = deaccent(firstname).lower()
    if sur not in text:
        return False
    if len(first) >= 4 and first not in text:
        return False
    return True


def find_player(firstname: str, surname: str) -> tuple[Optional[str], Optional[str]]:
    full = f"{firstname} {surname}"
    queries = [
        f"{full} (golfer)",
        f"{full} golfer PGA",
        f"{full} golfer",
        full,
    ]

    tried = set()
    for q in queries:
        for title in search_candidates(q):
            if title in tried:
                continue
            tried.add(title)

            wikitext = fetch_wikitext(title)
            if not wikitext:
                continue

            if not verify_match(wikitext, firstname, surname):
                continue

            dob = parse_dob(wikitext)
            if dob:
                return title, dob

            return title, None

    return None, None


def load_bio() -> dict:
    if BIO_PATH.exists():
        return json.loads(BIO_PATH.read_text())
    return {}


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--force", action="store_true")
    parser.add_argument("--refetch-suspects", action="store_true",
                        help="Refetch entries where wiki_title doesn't match surname")
    parser.add_argument("--limit", type=int, default=None)
    args = parser.parse_args()

    if not PLAYERS_PATH.exists():
        sys.exit(f"ERROR: {PLAYERS_PATH} not found. Run build_players.py first.")

    players = json.loads(PLAYERS_PATH.read_text())
    bio = load_bio()

    if args.limit:
        players = players[: args.limit]

    def needs_fetch(dg_id: str, name: str) -> bool:
        entry = bio.get(dg_id, {})
        if args.force:
            return True
        if not entry.get("dob"):
            return True
        if args.refetch_suspects:
            wiki = entry.get("wiki_title", "")
            surname = deaccent(get_surname(name)).lower()
            if surname not in deaccent(wiki).lower():
                return True
        return False

    to_process = [p for p in players if needs_fetch(str(p["id"]), p["name"])]
    print(f"Processing {len(to_process)} players (of {len(players)} total)…\n")

    found, missing = 0, 0

    for i, p in enumerate(to_process, 1):
        dg_id = str(p["id"])
        name = p["name"]
        firstname, surname = "", name
        if "," in name:
            surname, firstname = [x.strip() for x in name.split(",", 1)]

        print(f"[{i}/{len(to_process)}] {name}")

        title, dob = find_player(firstname, surname)
        if title and dob:
            print(f"  ✓ {dob}  (via '{title}')")
            bio[dg_id] = {"dob": dob, "wiki_title": title}
            found += 1
        elif title:
            print(f"  ⚠ found page '{title}' but no DOB in infobox")
            bio[dg_id] = {"wiki_title": title, "wiki_status": "no_dob_found"}
            missing += 1
        else:
            print(f"  ✗ no verified match found")
            bio[dg_id] = {"wiki_status": "not_found"}
            missing += 1

        time.sleep(0.5)

        if i % 20 == 0:
            BIO_PATH.write_text(json.dumps(bio, indent=2, sort_keys=True))

    BIO_PATH.write_text(json.dumps(bio, indent=2, sort_keys=True))
    print(f"\nDone. Found {found} DOBs, {missing} unresolved.")
    print(f"Wrote {BIO_PATH}")


if __name__ == "__main__":
    main()