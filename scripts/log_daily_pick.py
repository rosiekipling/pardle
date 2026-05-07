"""
log_daily_pick.py
-----------------
Logs the daily Pardle pick to data/daily_picks.csv.
Mirrors the JS daily picker logic in Game.tsx.
Run nightly via GitHub Actions after build_players.py.
"""

import csv
import json
from datetime import date, datetime, timezone
from pathlib import Path
from zoneinfo import ZoneInfo

ROOT = Path(__file__).parent.parent
PLAYERS_PATH = ROOT / "src" / "data" / "players.json"
LOG_PATH = ROOT / "data" / "daily_picks.csv"
LOG_PATH.parent.mkdir(parents=True, exist_ok=True)


def daily_pick(picks: list, iso: str) -> dict:
    """Mirror the JS dailyPick logic exactly."""
    h = 2166136261
    for c in iso:
        h ^= ord(c)
        h = (h * 16777619) & 0xFFFFFFFF
    seed = abs(h)

    epoch_day = (datetime.fromisoformat(iso).replace(tzinfo=timezone.utc) -
                 datetime(1970, 1, 1, tzinfo=timezone.utc)).days

    shuffled = list(picks)
    rng = seed
    for i in range(len(shuffled) - 1, 0, -1):
        rng = (rng * 9301 + 49297) % 233280
        j = int((rng / 233280) * (i + 1))
        shuffled[i], shuffled[j] = shuffled[j], shuffled[i]

    return shuffled[epoch_day % len(shuffled)]


def main():
    players = json.loads(PLAYERS_PATH.read_text())
    pool = [p for p in players if p["difficulty"] == "easy"]

    # Use Europe/London "today" to match the in-app logic
    london_today = datetime.now(ZoneInfo("Europe/London")).date().isoformat()
    pick = daily_pick(pool, london_today)

    new_file = not LOG_PATH.exists()
    with open(LOG_PATH, "a", newline="") as f:
        writer = csv.writer(f)
        if new_file:
            writer.writerow([
                "logged_at_utc",
                "puzzle_date",
                "player_id",
                "player_name",
                "difficulty",
                "world_ranking",
                "tour",
                "country",
            ])
        writer.writerow([
            datetime.now(timezone.utc).isoformat(),
            london_today,
            pick["id"],
            pick["name"],
            pick["difficulty"],
            pick.get("form", {}).get("world_ranking", ""),
            pick.get("tour", ""),
            pick.get("country_name", ""),
        ])

    print(f"Logged daily pick: {london_today} → {pick['name']} (id={pick['id']})")


if __name__ == "__main__":
    main()