// src/lib/streak.ts
const KEY = "pardle_streak";

export type StreakData = {
  currentStreak: number;
  maxStreak: number;
  lastPlayedDate: string;
  lastPuzzleNumber: number;
  totalPlayed: number;
  totalSolved: number;
  scoreHistory: Record<string, number>;
};

const defaultData: StreakData = {
  currentStreak: 0,
  maxStreak: 0,
  lastPlayedDate: "",
  lastPuzzleNumber: 0,
  totalPlayed: 0,
  totalSolved: 0,
  scoreHistory: {},
};

export function loadStreak(): StreakData {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return defaultData;
    return { ...defaultData, ...JSON.parse(raw) };
  } catch {
    return defaultData;
  }
}

export function saveStreak(data: StreakData): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(data));
  } catch {
    // localStorage blocked — fail silently
  }
}

export function recordResult(
  solved: boolean,
  puzzleNumber: number,
  scoreLabel: string
): StreakData {
  const current = loadStreak();
  const today = new Date().toISOString().slice(0, 10);

  if (current.lastPuzzleNumber === puzzleNumber) {
    return current;
  }

  const yesterday = new Date();
  yesterday.setDate(yesterday.getDate() - 1);
  const yesterdayISO = yesterday.toISOString().slice(0, 10);

  let newStreak = current.currentStreak;

  if (solved) {
    if (current.lastPlayedDate === yesterdayISO) {
      // Continued the streak
      newStreak = current.currentStreak + 1;
    } else if (current.lastPlayedDate === today) {
      // Already played today — shouldn't happen because of the puzzleNumber check above
      newStreak = current.currentStreak;
    } else {
      // Gap or first play
      newStreak = 1;
    }
  } else {
    // DNF — streak breaks
    newStreak = 0;
  }

  const updated: StreakData = {
    currentStreak: newStreak,
    maxStreak: Math.max(current.maxStreak, newStreak),
    lastPlayedDate: today,
    lastPuzzleNumber: puzzleNumber,
    totalPlayed: current.totalPlayed + 1,
    totalSolved: current.totalSolved + (solved ? 1 : 0),
    scoreHistory: {
      ...current.scoreHistory,
      [scoreLabel]: (current.scoreHistory[scoreLabel] ?? 0) + 1,
    },
  };

  saveStreak(updated);
  return updated;
}

const RESULT_KEY = "pardle_daily_result";

export type DailyResult = {
  puzzleNumber: number;
  solved: boolean;
  guessCount: number;
  finalHintsUsed: number;
  wrongGuesses: { name: string; sgTotal?: string }[];
  scoreLabel: string;
  date: string; // ISO
};

export function saveDailyResult(result: DailyResult): void {
  try {
    localStorage.setItem(RESULT_KEY, JSON.stringify(result));
  } catch {}
}

export function loadDailyResult(): DailyResult | null {
  try {
    const raw = localStorage.getItem(RESULT_KEY);
    if (!raw) return null;
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

export function clearDailyResult(): void {
  try {
    localStorage.removeItem(RESULT_KEY);
  } catch {}
}
