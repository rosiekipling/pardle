"""
build_players.py
----------------
Builds players.json with two form stats derived from non-skill data:

  - world_ranking — current OWGR rank (from preds/get-dg-rankings)
  - best_major    — best ever finish at a major (Masters/PGA/US Open/Open)
"""

from __future__ import annotations

import json
from datetime import date
from pathlib import Path

import numpy as np
import pandas as pd

ROOT = Path(__file__).parent.parent
RAW_DIR = ROOT / "data" / "raw"
OUT_PATH = ROOT / "src" / "data" / "players.json"
OUT_PATH.parent.mkdir(parents=True, exist_ok=True)
BIO_PATH = ROOT / "data" / "player_bio.json"

TOUR_AVG_DRIVING_DIST = 299.0
TOUR_AVG_DRIVING_ACC = 0.61

STAT_COLUMNS = [
    ("driving_dist", "Driving Distance", "dual_dist"),
    ("driving_acc",  "Driving Accuracy", "dual_acc"),
    ("sg_ott",       "SG: Off the Tee",  "{:+.2f}"),
    ("sg_app",       "SG: Approach",     "{:+.2f}"),
    ("sg_arg",       "SG: Around Green", "{:+.2f}"),
    ("sg_putt",      "SG: Putting",      "{:+.2f}"),
    ("sg_total",     "SG: Total",        "{:+.2f}"),
]

MAJOR_PRETTY = {
    "masters": "the Masters",
    "pga_championship": "the PGA Championship",
    "us_open": "the U.S. Open",
    "open_championship": "the Open Championship",
}


def compute_age(dob_str):
    if not dob_str:
        return None
    dob = date.fromisoformat(dob_str)
    today = date.today()
    return today.year - dob.year - ((today.month, today.day) < (dob.month, dob.day))


def load_bio() -> dict:
    if BIO_PATH.exists():
        return json.loads(BIO_PATH.read_text())
    return {}


# -- Form stat extractors -----------------------------------------------------

def load_world_rankings() -> dict:
    raw = json.loads((RAW_DIR / "dg_rankings.json").read_text())
    rankings = raw.get("rankings", raw)
    return {r["dg_id"]: r.get("owgr_rank") for r in rankings}


# -- Difficulty + formatting --------------------------------------------------

def compute_difficulty(df: pd.DataFrame) -> pd.Series:
    ranked = df["sg_total"].rank(ascending=False, method="first")
    tiers = []
    for r in ranked:
        if r <= 30:
            tiers.append("easy")
        elif r <= 80:
            tiers.append("medium")
        else:
            tiers.append("hard")
    return pd.Series(tiers, index=df.index)


def format_stat(value, fmt: str) -> str:
    if pd.isna(value):
        return "—"
    if fmt == "dual_dist":
        absolute = TOUR_AVG_DRIVING_DIST + value
        return f"{absolute:.1f} yds ({value:+.1f})"
    if fmt == "dual_acc":
        absolute = TOUR_AVG_DRIVING_ACC + value
        return f"{absolute:.1%} ({value:+.1%})"
    return fmt.format(value)


# -- Main build ---------------------------------------------------------------

def build() -> None:
    print("Loading raw data…")
    skill = json.loads((RAW_DIR / "skill_ratings.json").read_text())
    plist = json.loads((RAW_DIR / "player_list.json").read_text())
    majors_json = json.loads((RAW_DIR / "majors.json").read_text())
    countries = json.loads((ROOT / "data" / "countries.json").read_text())
    bio = load_bio()

    skill_df = pd.DataFrame(skill.get("players", skill))
    plist_df = pd.DataFrame(plist)

    print(f"  {len(skill_df)} skill_ratings rows / {len(plist_df)} player_list rows")

    print("\nComputing form stats…")
    # majors_df = extract_majors(majors_json)
    # print(f"  {len(majors_df)} major-finish rows from {len(majors_json)} events")
    # best_majors = compute_best_major(majors_df)
    world_rankings = load_world_rankings()

    df = skill_df.merge(plist_df[["dg_id", "country", "amateur"]], on="dg_id", how="left")
    required = ["sg_ott", "sg_app", "sg_arg", "sg_putt", "sg_total"]
    df = df.dropna(subset=["sg_total"])
    df = df[df[required].notna().sum(axis=1) == len(required)].reset_index(drop=True)
    df = df.nlargest(75, "sg_total").reset_index(drop=True)
    print(f"\n  {len(df)} players after filtering")

    df["difficulty"] = compute_difficulty(df)

    out = []
    for _, row in df.iterrows():
        dg_id = int(row["dg_id"])

        stats = {label: format_stat(row.get(col), fmt) for col, label, fmt in STAT_COLUMNS}

        country_name = row.get("country")
        info = countries.get(country_name, {"continent": None})

        player_bio = bio.get(str(dg_id), {})
        age = compute_age(player_bio.get("dob"))

        wr = world_rankings.get(dg_id)

        out.append({
            "id": dg_id,
            "name": row["player_name"],
            "country_name": country_name,
            "continent": info["continent"],
            "age": age,
            "amateur": bool(row.get("amateur", 0)),
            "difficulty": row["difficulty"],
            "stats": stats,
            "form": {
                        "world_ranking": int(wr) if wr else None,
                    },
            "raw": {col: (float(row[col]) if pd.notna(row.get(col)) else None)
                    for col, _, _ in STAT_COLUMNS},
        })

    out.sort(key=lambda p: p["raw"]["sg_total"] or -99, reverse=True)
    OUT_PATH.write_text(json.dumps(out, indent=2))
    print(f"\nWrote {len(out)} players to {OUT_PATH.relative_to(ROOT)}")

    # Sanity warnings
    missing_continent = sorted(set(p["country_name"] for p in out if p["continent"] is None))
    missing_age = [p["name"] for p in out if p["age"] is None]
    # missing_major = [p["name"] for p in out if not p["form"]["best_major"]]
    missing_ranking = [p["name"] for p in out if not p["form"]["world_ranking"]]

    if missing_continent:
        print(f"  ⚠ countries missing from countries.json: {missing_continent}")
    if missing_age:
        print(f"  ⚠ {len(missing_age)} players missing DOB: {missing_age[:5]}…")
    # if missing_major:
    #     print(f"  ⚠ {len(missing_major)} players with no major-history finish")
    if missing_ranking:
        print(f"  ⚠ {len(missing_ranking)} players with no world ranking")


if __name__ == "__main__":
    build()
