"""
fetch_datagolf.py
-----------------
Pulls raw data from the Data Golf API and saves it as JSON in /data/raw/.

Only hits what we need for the game. Runs nightly via GitHub Actions.

Endpoints used:
  - /get-player-list              — every player on a major tour since 2018
  - /preds/skill-ratings          — SG breakdowns per player
  - /preds/approach-skill         — approach stats by yardage bucket (optional/bonus)

Data Golf rate limit: 45 requests/minute. We only make ~3 requests, so no concern.
"""

from __future__ import annotations

import json
import os
import sys
import time
from pathlib import Path

import requests
from dotenv import load_dotenv

load_dotenv()

API_KEY = os.getenv("DATAGOLF_API_KEY")
if not API_KEY:
    sys.exit("ERROR: DATAGOLF_API_KEY not set. Check your .env file or GitHub secrets.")

BASE_URL = "https://feeds.datagolf.com"
RAW_DIR = Path(__file__).parent.parent / "data" / "raw"
RAW_DIR.mkdir(parents=True, exist_ok=True)


def fetch(endpoint: str, params: dict | None = None) -> dict:
    """Make a GET request to Data Golf and return parsed JSON."""
    params = params or {}
    params["key"] = API_KEY
    params["file_format"] = "json"

    url = f"{BASE_URL}/{endpoint}"
    print(f"  → GET {endpoint} {params}")

    resp = requests.get(url, params=params, timeout=30)
    resp.raise_for_status()
    return resp.json()


def save(name: str, data: dict) -> None:
    """Write JSON to data/raw/<name>.json."""
    path = RAW_DIR / f"{name}.json"
    path.write_text(json.dumps(data, indent=2))
    print(f"  ✓ Saved {path.relative_to(Path.cwd()) if Path.cwd() in path.parents else path}")


def main() -> None:
    print("Fetching Data Golf feeds…")

    # 1. Full player list (IDs, country, amateur status)
    players = fetch("get-player-list")
    save("player_list", players)
    time.sleep(1)

    # 2. Skill ratings — SG values + ranks per player
    #    display=value gives us the actual SG numbers (not just ranks)
    skill_ratings = fetch("preds/skill-ratings", {"display": "value"})
    save("skill_ratings", skill_ratings)
    time.sleep(1)

    # 3. Approach skill — bonus, for tougher clues later
    approach = fetch("preds/approach-skill", {"period": "ytd"})
    save("approach_skill", approach)

    print("Done.")


if __name__ == "__main__":
    main()
