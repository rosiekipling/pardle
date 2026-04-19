"""Spot-check player_bio.json for likely wrong Wikipedia matches."""
import json
from pathlib import Path

ROOT = Path(__file__).parent.parent

bio = json.loads((ROOT / "data" / "player_bio.json").read_text())
players = json.loads((ROOT / "src" / "data" / "players.json").read_text())
id_to_name = {str(p["id"]): p["name"] for p in players}

print("Checking for suspect Wikipedia matches…\n")

count = 0
for dg_id, entry in bio.items():
    name = id_to_name.get(dg_id)
    if not name:
        continue  # player no longer in top 150, skip
    wiki = entry.get("wiki_title", "")
    if not wiki:
        continue
    surname = name.split(",")[0].strip().lower()
    if surname not in wiki.lower():
        print(f"  SUSPECT: {name:40}  ←→  wiki: {wiki}")
        count += 1

print(f"\n{count} suspect entries flagged. Review manually in data/player_bio.json.")