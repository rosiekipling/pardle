"""
check_ages.py
-------------
Sanity check player ages.
Reads player_bio.json and players.json, computes age from DOB,
and flags anything that looks wrong.
"""

import json
from datetime import date
from pathlib import Path

ROOT = Path(__file__).parent.parent
BIO_PATH = ROOT / "data" / "player_bio.json"
PLAYERS_PATH = ROOT / "src" / "data" / "players.json"


def compute_age(dob_str: str | None):
    if not dob_str:
        return None
    try:
        dob = date.fromisoformat(dob_str)
    except ValueError:
        return None
    today = date.today()
    return today.year - dob.year - ((today.month, today.day) < (dob.month, dob.day))


def main():
    bio = json.loads(BIO_PATH.read_text())
    players = json.loads(PLAYERS_PATH.read_text())

    rows = []
    for p in players:
        dg_id = str(p["id"])
        bio_entry = bio.get(dg_id, {})
        dob = bio_entry.get("dob")
        wiki = bio_entry.get("wiki_title", "")
        age_from_bio = compute_age(dob)
        age_in_players = p.get("age")

        flags = []
        if dob is None:
            flags.append("NO_DOB")
        if age_from_bio is None:
            flags.append("BAD_DOB_FORMAT")
        elif age_from_bio < 18:
            flags.append("TOO_YOUNG")
        elif age_from_bio > 65:
            flags.append("TOO_OLD")
        if age_from_bio is not None and age_in_players is not None and age_from_bio != age_in_players:
            flags.append("AGE_MISMATCH")

        rows.append({
            "name": p["name"],
            "dg_id": dg_id,
            "dob": dob or "—",
            "age": age_from_bio,
            "wiki": wiki,
            "flags": ", ".join(flags) if flags else "",
        })

    # Sort by age descending so old/odd ones surface first
    rows.sort(key=lambda r: -(r["age"] or 0))

    # Print as a readable table
    print(f"{'Name':<28} {'DOB':<12} {'Age':>4} {'Flags':<20} {'Wiki'}")
    print("-" * 110)
    for r in rows:
        age_str = str(r["age"]) if r["age"] is not None else "—"
        print(f"{r['name']:<28} {r['dob']:<12} {age_str:>4} {r['flags']:<20} {r['wiki']}")

    # Summary counts
    total = len(rows)
    flagged = [r for r in rows if r["flags"]]
    print(f"\nTotal: {total}, flagged: {len(flagged)}")
    if flagged:
        print("\nFlagged players:")
        for r in flagged:
            print(f"  {r['name']:<28} {r['dob']:<12} {r['age']!s:>4}  ({r['flags']})")


if __name__ == "__main__":
    main()