// src/components/Game.tsx
import { useState, useMemo, useRef, useEffect } from "react";
import players from "../data/players.json";
import { puzzleNumber } from "../lib/dailyPlayer";
import "./Game.css";

type Player = (typeof players)[number];

const STAT_ORDER = [
  "SG: Total",
  "Driving Distance",
  "Driving Accuracy",
  "SG: Approach",
  "SG: Around Green",
  "SG: Putting",
];

const HINT_ORDER = [
  "worldRanking",
  "age",
  "continent",
  "country",
  "initials",
] as const;

type HintKey = (typeof HINT_ORDER)[number];

const HINT_LABELS: Record<HintKey, string> = {
  worldRanking: "World Ranking",
  age: "Age",
  country: "Country",
  continent: "Continent",
  initials: "Initials",
};

const PAR_GUESSES = 4;

const norm = (s: string) => s.toLowerCase().replace(/[,.]/g, "").trim();

function getInitials(name: string): string {
  if (name.includes(",")) {
    const [surname, firstname] = name.split(",").map((s) => s.trim());
    return `${firstname[0]}. ${surname[0]}.`;
  }
  const parts = name.split(" ");
  return parts.map((p) => `${p[0]}.`).join(" ");
}

export default function Game() {
  const [overrideSeed, setOverrideSeed] = useState(0);
  const [difficultyFilter, setDifficultyFilter] = useState<
    "easy" | "medium" | "hard" | "all"
  >("easy");

  const target = useMemo<Player>(() => {
    const pool =
      difficultyFilter === "all"
        ? players
        : players.filter((p) => p.difficulty === difficultyFilter);
    const picks = pool.length ? pool : players;

    if (overrideSeed === 0) {
      const iso = new Date().toISOString().slice(0, 10);
      const hash = iso.split("").reduce((h, c) => h + c.charCodeAt(0), 0);
      return picks[hash % picks.length];
    }
    return picks[Math.floor(Math.random() * picks.length)];
  }, [overrideSeed, difficultyFilter]);

  const puzzleN = useMemo(() => puzzleNumber(), []);
  const allNames = useMemo(() => players.map((p) => p.name), []);

  const [revealedHints, setRevealedHints] = useState<Set<HintKey>>(new Set());
  const [lastRevealed, setLastRevealed] = useState<HintKey | null>(null);
  const [guess, setGuess] = useState("");
  const [solved, setSolved] = useState(false);
  const [gaveUp, setGaveUp] = useState(false);
  const [feedback, setFeedback] = useState<{
    text: string;
    tone: "correct" | "wrong" | "";
  }>({ text: "", tone: "" });
  const [wrongCount, setWrongCount] = useState(0);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [activeSuggestion, setActiveSuggestion] = useState(0);

  const inputRef = useRef<HTMLInputElement>(null);
  const done = solved || gaveUp;

  const suggestions = useMemo(() => {
    if (!guess) return [];
    const q = norm(guess);
    return allNames.filter((n) => norm(n).includes(q)).slice(0, 6);
  }, [guess, allNames]);

  function getHintValue(key: HintKey): string {
    switch (key) {
      case "worldRanking":
        return target.form?.world_ranking
          ? `World No. ${target.form.world_ranking}`
          : "—";
      case "age":
        return target.age ? `${target.age}` : "—";
      case "country":
        return target.country_name ?? "—";
      case "continent":
        return target.continent ?? "—";
      case "initials":
        return getInitials(target.name);
    }
  }

  const nextHint: HintKey | null = useMemo(() => {
    return HINT_ORDER.find((h) => !revealedHints.has(h)) ?? null;
  }, [revealedHints]);

  function revealNextHint() {
    if (!nextHint || done) return;
    setRevealedHints((prev) => new Set(prev).add(nextHint));
    setLastRevealed(nextHint);
    setTimeout(() => setLastRevealed(null), 500);
  }

  const totalCost = revealedHints.size;
  const scoreLabel = !done
    ? "Live"
    : !solved
    ? "DNF"
    : totalCost === 0
    ? "Hole in One"
    : totalCost === PAR_GUESSES - 2
    ? "Eagle"
    : totalCost === PAR_GUESSES - 1
    ? "Birdie"
    : totalCost === PAR_GUESSES
    ? "Par"
    : totalCost === PAR_GUESSES + 1
    ? "Bogey"
    : totalCost === PAR_GUESSES + 2
    ? "Double Bogey"
    : totalCost === PAR_GUESSES + 3
    ? "Triple Bogey"
    : "Picked up";

  function handleSubmit() {
    if (done || !guess.trim()) return;
    if (norm(guess) === norm(target.name)) {
      setSolved(true);
      const hintLine = revealedHints.size
        ? ` and ${revealedHints.size} caddie hint${
            revealedHints.size > 1 ? "s" : ""
          }`
        : "";
      setFeedback({
        text: `Got it in ${wrongCount + 1} guess${
          wrongCount === 0 ? "" : "es"
        }${hintLine}.`,
        tone: "correct",
      });
    } else {
      setWrongCount((c) => c + 1);
      setFeedback({
        text: `Not ${guess.trim()}. Reload the swing — here's another clue.`,
        tone: "wrong",
      });
      revealNextHint();
    }
    setGuess("");
    setShowSuggestions(false);
  }

  function handleGiveUp() {
    if (done) return;
    setGaveUp(true);
    setFeedback({
      text: "No shame. The leaderboard always waits for round two.",
      tone: "wrong",
    });
    setRevealedHints(new Set(HINT_ORDER));
  }

  function handlePickSuggestion(name: string) {
    setGuess(name);
    setShowSuggestions(false);
    inputRef.current?.focus();
  }

  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === "Enter") {
      if (showSuggestions && suggestions[activeSuggestion]) {
        handlePickSuggestion(suggestions[activeSuggestion]);
      } else {
        handleSubmit();
      }
    } else if (e.key === "ArrowDown" && showSuggestions) {
      e.preventDefault();
      setActiveSuggestion((i) => Math.min(i + 1, suggestions.length - 1));
    } else if (e.key === "ArrowUp" && showSuggestions) {
      e.preventDefault();
      setActiveSuggestion((i) => Math.max(i - 1, 0));
    } else if (e.key === "Escape") {
      setShowSuggestions(false);
    }
  }

  function resetGameState() {
    setRevealedHints(new Set());
    setLastRevealed(null);
    setGuess("");
    setSolved(false);
    setGaveUp(false);
    setFeedback({ text: "", tone: "" });
    setWrongCount(0);
    setShowSuggestions(false);
  }

  function handleNewPuzzle() {
    resetGameState();
    setOverrideSeed((s) => s + 1);
  }

  function handleDifficultyChange(newDifficulty: typeof difficultyFilter) {
    setDifficultyFilter(newDifficulty);
    resetGameState();
    setOverrideSeed((s) => s + 1);
  }

  function handleShare() {
    const guessLine = "❌".repeat(wrongCount) + (solved ? "✅" : "");
    const hintsLine = revealedHints.size
      ? ` ${"💡".repeat(revealedHints.size)}`
      : "";
    const text = `Pardle #${puzzleN} — ${scoreLabel}
${guessLine}${hintsLine}
rosiedata.com/pardle`;
    navigator.clipboard.writeText(text);
    setFeedback({
      text: "Copied to clipboard — paste it wherever you like.",
      tone: "correct",
    });
  }

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  const today = new Date().toLocaleDateString("en-GB", {
    weekday: "long",
    day: "numeric",
    month: "long",
  });

  return (
    <div className="wrap">
      <div className="masthead">
        <div className="issue">
          Vol. I — No. {String(puzzleN).padStart(3, "0")}
        </div>
        <div className="date">{today} / The Fairway Desk</div>
      </div>

      <div className="title-bar">
        <div className="kicker-above">The Fairway Desk</div>
        <h1 className="logo">
          Par<em>dle</em>
        </h1>
        <div className="tagline">
          A daily scorecard. Name the Tour pro from their numbers.
        </div>
      </div>

      <div className="main">
        {/* LEFT — Scorecard */}
        <aside className="col">
          <div className="kicker">The Scorecard</div>

          <div className="score-row">
            <div className="score-label">Puzzle</div>
            <div className="score-val">#{puzzleN}</div>
          </div>
          <div className="score-row">
            <div className="score-label">Wrong Guesses</div>
            <div className="score-val accent">{wrongCount}</div>
          </div>
          <div className="score-row">
            <div className="score-label">Hints Used</div>
            <div className="score-val">{revealedHints.size}</div>
          </div>
          <div className="score-row">
            <div className="score-label">Par</div>
            <div className="score-val">{PAR_GUESSES}</div>
          </div>

          <div className="clues-count">
            <div className="big" style={{ fontSize: 36, lineHeight: 1.1 }}>
              {scoreLabel}
            </div>
            <div className="lbl">Current Score</div>
          </div>
        </aside>

        {/* CENTRE */}
        <section className="col">
          <div className="player-num">
            ◆ Mystery Player No. {String(puzzleN).padStart(3, "0")}
            <span className={`difficulty-badge ${target.difficulty}`}>
              {target.difficulty}
            </span>
          </div>
          <h2 className="headline">
            Who <em>scored</em> these stats?
          </h2>
          <p className="dek">
            Six stats, one Tour pro. Read the numbers and make your call. Each
            wrong guess costs you a stroke and unlocks a caddie hint — or spend
            one early to skip ahead.
          </p>

          {/* Stats grid — fully visible */}
          <div className="stats-grid">
            {STAT_ORDER.map((key) => (
              <div key={key} className="stat">
                <div className="stat-label">{key}</div>
                <div className="stat-value">
                  {target.stats[key as keyof typeof target.stats] ?? "—"}
                </div>
              </div>
            ))}
          </div>

          {/* Caddie Hints — sequential reveal, same visual style */}
          <div className="kicker" style={{ marginTop: 28 }}>
            Caddie Hints
          </div>
          <div className="stats-grid hints-grid">
            {HINT_ORDER.map((key) => {
              const shown = revealedHints.has(key);
              const isNext = nextHint === key;
              const isNew = lastRevealed === key;
              const isLocked = !shown && !isNext;

              return (
                <button
                  key={key}
                  type="button"
                  className={`stat hint-stat ${shown ? "" : "hidden"} ${
                    isNew ? "revealing" : ""
                  } ${isLocked ? "locked" : ""}`}
                  onClick={() => {
                    if (isNext && !done) revealNextHint();
                  }}
                  disabled={done || (!isNext && !shown)}
                  title={
                    isLocked
                      ? "Reveal earlier hints first"
                      : isNext
                      ? "Tap to reveal (costs 1 stroke)"
                      : ""
                  }
                >
                  <div className="stat-label">
                    {HINT_LABELS[key]}
                    {isNext && !shown && (
                      <span className="hint-tap-prompt"> · tap</span>
                    )}
                  </div>
                  <div className="stat-value">
                    {shown ? getHintValue(key) : "— — —"}
                  </div>
                </button>
              );
            })}
          </div>

          {/* Guess input + actions */}
          <div className="kicker" style={{ marginTop: 28 }}>
            Your Guess
          </div>
          <div className="guess-area">
            <div className="search-box">
              <input
                ref={inputRef}
                type="text"
                value={guess}
                onChange={(e) => {
                  setGuess(e.target.value);
                  setShowSuggestions(true);
                  setActiveSuggestion(0);
                }}
                onKeyDown={handleKeyDown}
                onFocus={() => setShowSuggestions(true)}
                onBlur={() => setTimeout(() => setShowSuggestions(false), 150)}
                placeholder={done ? "Puzzle complete" : "Type a name…"}
                disabled={done}
                autoComplete="off"
              />
              {showSuggestions && suggestions.length > 0 && (
                <div className="suggestions">
                  {suggestions.map((name, i) => (
                    <div
                      key={name}
                      className={`suggestion-item ${
                        i === activeSuggestion ? "active" : ""
                      }`}
                      onMouseDown={(e) => e.preventDefault()}
                      onClick={() => handlePickSuggestion(name)}
                    >
                      {name}
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div className="action-row">
              <button className="btn" onClick={handleSubmit} disabled={done || !guess.trim()}>
                Submit Guess
              </button>
              <button
                className="btn reveal"
                onClick={revealNextHint}
                disabled={done || !nextHint}
              >
                Reveal Hint
              </button>
              <button className="btn reveal" onClick={handleGiveUp} disabled={done}>
                Give Up
              </button>
            </div>

            <div className={`feedback ${feedback.tone}`}>{feedback.text}</div>
          </div>

          {done && (
            <div className="reveal-card">
              <div className="kicker">The Answer</div>
              <div className="name">{target.name}</div>
              <div
                style={{
                  fontFamily: "Fraunces, serif",
                  fontStyle: "italic",
                  fontSize: 13,
                  opacity: 0.8,
                }}
              >
                {target.continent && <>{target.continent} · </>}
                {target.country_name && <>{target.country_name} · </>}
                {target.age && <>age {target.age} · </>}
                Difficulty: {target.difficulty}
              </div>
              <button className="share-btn" onClick={handleShare}>
                Share Result
              </button>
            </div>
          )}
        </section>

        {/* RIGHT — Testing only */}
        <aside className="col">
          <div className="testing-block" style={{ marginTop: 0 }}>
            <div className="kicker">Testing</div>
            <label className="testing-label">Difficulty</label>
            <select
              className="testing-select"
              value={difficultyFilter}
              onChange={(e) =>
                handleDifficultyChange(
                  e.target.value as typeof difficultyFilter
                )
              }
            >
              <option value="easy">Easy only</option>
              <option value="medium">Medium only</option>
              <option value="hard">Hard only</option>
              <option value="all">All players</option>
            </select>
            <button
              className="btn secondary"
              onClick={handleNewPuzzle}
              style={{ marginTop: 10, fontSize: 10, width: "100%" }}
            >
              🧪 New Random Puzzle
            </button>
          </div>
        </aside>
      </div>

      <footer>
        <div>
          Data via Data Golf
        </div>
        <div>Come back tomorrow for a new round</div>
      </footer>
    </div>
  );
}
