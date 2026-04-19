"""
fetch_datagolf.py
-----------------
Pulls raw data from Data Golf:
  - get-player-list             — every player on a major tour
  - preds/skill-ratings         — SG breakdowns
  - preds/approach-skill        — approach buckets
  - preds/get-dg-rankings       — current world ranking
  - historical-event-data/events — major championships only, one event at a time

Single-event historical pulls (vs event_id=all) work on the basic plan.
"""

from __future__ import annotations

import json
import os
import sys
import time
from pathlib import Path

import requests
import argparse
from dotenv import load_dotenv

load_dotenv()

API_KEY = os.getenv("DATAGOLF_API_KEY")
if not API_KEY:
    sys.exit("ERROR: DATAGOLF_API_KEY not set.")

BASE_URL = "https://feeds.datagolf.com"
RAW_DIR = Path(__file__).parent.parent / "data" / "raw"
RAW_DIR.mkdir(parents=True, exist_ok=True)

MAJOR_EVENT_IDS = {
    "masters": 14,
    "pga_championship": 33,
    "us_open": 26,
    "open_championship": 100,
}
MAJOR_YEARS = list(range(1995, 2026))




def load_existing_majors() -> dict:
    """Returns a set of (major_name, year) tuples already in the cache."""
    path = RAW_DIR / "majors.json"
    if not path.exists():
        return set()
    try:
        existing = json.loads(path.read_text())
        return {(e["major"], e["year"]) for e in existing}
    except (json.JSONDecodeError, KeyError):
        return set()

def fetch(endpoint: str, params: dict | None = None) -> dict:
    params = params or {}
    params["key"] = API_KEY
    params["file_format"] = "json"
    safe = {k: v for k, v in params.items() if k != "key"}
    url = f"{BASE_URL}/{endpoint}"
    print(f"  → GET {endpoint} {safe}")
    resp = requests.get(url, params=params, timeout=30)
    resp.raise_for_status()
    return resp.json()


def save(name: str, data) -> None:
    path = RAW_DIR / f"{name}.json"
    path.write_text(json.dumps(data, indent=2, default=str))
    print(f"  ✓ Saved {path.name}")


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--force-majors", action="store_true",
                        help="Refetch all majors even if cached")
    args = parser.parse_args()

    print("Fetching Data Golf feeds…\n")

    print("Player list:")
    save("player_list", fetch("get-player-list"))
    time.sleep(1)

    print("\nSkill ratings:")
    save("skill_ratings", fetch("preds/skill-ratings", {"display": "value"}))
    time.sleep(1)

    print("\nApproach skill:")
    save("approach_skill", fetch("preds/approach-skill", {"period": "ytd"}))
    time.sleep(1)

    print("\nDG Rankings:")
    save("dg_rankings", fetch("preds/get-dg-rankings"))
    time.sleep(1)

if __name__ == "__main__":
    main()
