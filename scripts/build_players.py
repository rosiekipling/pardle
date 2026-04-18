"""
build_players.py
----------------
Transforms raw Data Golf JSON into a clean players.json for the React app.

Input:  /data/raw/*.json
Output: /src/data/players.json

Steps:
  1. Load skill_ratings + player_list
  2. Join on dg_id
  3. Filter to players with enough data (SG total exists)
  4. Compute difficulty score — z-distance from the median player
  5. Write compact JSON with only the columns the app needs
"""

from __future__ import annotations

import json
from pathlib import Path
from datetime import date

import numpy as np
import pandas as pd

ROOT = Path(__file__).parent.parent
RAW_DIR = ROOT / "data" / "raw"
OUT_PATH = ROOT / "src" / "data" / "players.json"
OUT_PATH.parent.mkdir(parents=True, exist_ok=True)
BIO_PATH = ROOT / "data" / "player_bio.json"

# Stats we want to show in the game, in the order they reveal
# Key = column in skill_ratings JSON, Label = what the user sees
STAT_COLUMNS = [
    ("driving_dist", "Driving Distance", "{:.1f} yds"),
    ("driving_acc",  "Driving Accuracy", "{:.1%}"),
    # ("gir",          "GIR",              "{:.1%}"),
    ("sg_ott",       "SG: Off the Tee",  "{:+.2f}"),
    ("sg_app",       "SG: Approach",     "{:+.2f}"),
    ("sg_arg",       "SG: Around Green", "{:+.2f}"),
    ("sg_putt",      "SG: Putting",      "{:+.2f}"),
    ("sg_total",     "SG: Total",        "{:+.2f}"),
]

# Stats used for the distinctiveness / difficulty calculation
DIFFICULTY_STATS = ["sg_ott", "sg_app", "sg_arg", "sg_putt", "driving_dist"]


def load_raw() -> tuple[pd.DataFrame, pd.DataFrame]:
    skill = json.loads((RAW_DIR / "skill_ratings.json").read_text())
    plist = json.loads((RAW_DIR / "player_list.json").read_text())

    # Data Golf returns these as { ..., "players": [ {...}, {...} ] }
    skill_df = pd.DataFrame(skill.get("players", skill))
    plist_df = pd.DataFrame(plist)

    return skill_df, plist_df

def load_bio() -> dict:
    if BIO_PATH.exists():
        return json.loads(BIO_PATH.read_text())
    return {}

def compute_age(dob_str: str | None) -> int | None:
    if not dob_str:
        return None
    dob = date.fromisoformat(dob_str)
    today = date.today()
    return today.year - dob.year - ((today.month, today.day) < (dob.month, dob.day))

def compute_difficulty(df: pd.DataFrame) -> pd.Series:
    """
    Distance from the centroid = distinctiveness.
    Big distance → easy to guess (e.g. DeChambeau is an outlier on distance).
    Small distance → hard to guess (average player).
    Returns a tier: 'easy' / 'medium' / 'hard'.
    """
    stats = df[DIFFICULTY_STATS].copy()
    # Standardise
    z = (stats - stats.mean()) / stats.std()
    # Euclidean distance from origin (the median player in z-space)
    dist = np.sqrt((z ** 2).sum(axis=1))
    # Bucket into tiers by quantile
    tiers = pd.qcut(
        dist, q=[0, 0.33, 0.66, 1.0],
        labels=["hard", "medium", "easy"],
    )
    return tiers.astype(str)


def format_stat(value, fmt: str) -> str:
    if pd.isna(value):
        return "—"
    return fmt.format(value)


def build() -> None:
    print("Loading raw data…")
    skill_df, plist_df = load_raw()
    countries = json.loads((ROOT / "data" / "countries.json").read_text())
    bio = load_bio()

    print(f"  {len(skill_df)} rows in skill_ratings")
    print(f"  {len(plist_df)} rows in player_list")

    # Join on dg_id (Data Golf's stable player ID)
    df = skill_df.merge(
        plist_df[["dg_id", "country", "amateur"]],
        on="dg_id",
        how="left",
    )

    # Keep only players with a complete SG total (filters retirees / low-sample)
    df = df.dropna(subset=["sg_total"]).reset_index(drop=True)
    print(f"  {len(df)} players after filtering")

    # Keep only players with reasonably complete stats
    required = ["driving_dist", "driving_acc",
                # "gir",
                "sg_ott", "sg_app", "sg_arg", "sg_putt", "sg_total"]
    df = df.dropna(subset=["sg_total"])
    df = df[df[required].notna().sum(axis=1) >= 7].reset_index(drop=True)

    # Keep the top N most recognisable players by SG: Total
    # Tweak this number — 150 is a reasonable starting pool for a daily puzzle
    df = df.nlargest(150, "sg_total").reset_index(drop=True)
    print(f"  {len(df)} players after filtering")


    # Compute difficulty
    df["difficulty"] = compute_difficulty(df)

    # Build the output shape
    out = []
    for _, row in df.iterrows():
        stats = {}
        for col, label, fmt in STAT_COLUMNS:
            stats[label] = format_stat(row.get(col), fmt)

        # Country lookup
        country_name = row.get("country")
        info = countries.get(country_name, {"continent": None})

        # Bio lookup (keyed by dg_id as a string)
        player_bio = bio.get(str(int(row["dg_id"])), {})
        age = compute_age(player_bio.get("dob"))

        out.append({
            "id": int(row["dg_id"]),
            "name": row["player_name"],
            "country_name": country_name,
            "continent": info["continent"],
            "age": age,
            "amateur": bool(row.get("amateur", 0)),
            "difficulty": row["difficulty"],
            "stats": stats,
            "raw": {col: (float(row[col]) if pd.notna(row.get(col)) else None)
                    for col, _, _ in STAT_COLUMNS},
        })

    # Sort by SG total descending (so the app sees elite players first)
    out.sort(key=lambda p: p["raw"]["sg_total"] or -99, reverse=True)

    OUT_PATH.write_text(json.dumps(out, indent=2))
    print(f"Wrote {len(out)} players to {OUT_PATH.relative_to(ROOT)}")

    # Print a quick sanity check
    easy_count = sum(1 for p in out if p["difficulty"] == "easy")
    med_count  = sum(1 for p in out if p["difficulty"] == "medium")
    hard_count = sum(1 for p in out if p["difficulty"] == "hard")
    print(f"  Difficulty split — easy: {easy_count}, medium: {med_count}, hard: {hard_count}")

    # Show which players are missing lookup data
    missing_continent = [p["country_name"] for p in out if p["continent"] is None]
    missing_age = [p["name"] for p in out if p["age"] is None]
    if missing_continent:
        unique = sorted(set(missing_continent))
        print(f"  ⚠ {len(unique)} countries missing from countries.json: {unique}")
    if missing_age:
        print(f"  ⚠ {len(missing_age)} players missing DOB: {missing_age[:5]}{'…' if len(missing_age) > 5 else ''}")

if __name__ == "__main__":
    build()
