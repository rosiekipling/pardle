// src/lib/dailyPlayer.ts
// Deterministic daily puzzle selection — every visitor sees the same player
// on the same date (UTC), which is what makes Wordle-style games shareable.

import players from "../data/players.json";

export type Player = (typeof players)[number];

/** Simple string hash → integer (djb2). */
function hash(s: string): number {
  let h = 5381;
  for (let i = 0; i < s.length; i++) {
    h = ((h << 5) + h) + s.charCodeAt(i);
    h = h & h; // keep 32-bit
  }
  return Math.abs(h);
}

/** Progressive weekly difficulty: easy → hard across Mon–Sun. */
function difficultyForDay(dayOfWeek: number): "easy" | "medium" | "hard" {
  // 0 = Sunday, 1 = Monday, ...
  if (dayOfWeek === 1 || dayOfWeek === 2) return "easy";
  if (dayOfWeek === 3 || dayOfWeek === 4 || dayOfWeek === 5) return "medium";
  return "hard"; // Sat + Sun
}

/**
 * Returns the player for a given date.
 * @param date - defaults to today (UTC).
 */
export function getDailyPlayer(date: Date = new Date()): Player {
  const iso = date.toISOString().slice(0, 10); // "YYYY-MM-DD"
  const tier = difficultyForDay(date.getUTCDay());

  const pool = players.filter((p) => p.difficulty === tier);
  const picks = pool.length ? pool : players; // fallback if a tier is empty
  const idx = hash(iso) % picks.length;
  return picks[idx];
}

/** Puzzle number, counting from the launch date. */
export function puzzleNumber(date: Date = new Date(), launch = "2026-01-01"): number {
  const one = new Date(launch).getTime();
  const now = date.getTime();
  return Math.floor((now - one) / 86_400_000) + 1;
}
