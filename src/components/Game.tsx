// src/components/Game.tsx
import { useState, useMemo, useRef, useEffect } from "react";
import players from "../data/players.json";
import { getDailyPlayer, puzzleNumber } from "../lib/dailyPlayer";
import "./Game.css";

type Player = (typeof players)[number];

const REVEAL_ORDER = [
  "SG: Total",
  "SG: Approach",
  "SG: Off the Tee",
  "SG: Putting",
  "SG: Around Green",
  "Driving Distance",
];

const STARTING_REVEALED = 3;

const norm = (s: string) => s.toLowerCase().replace(/[,.]/g, "").trim();

type HintKey = "age" | "continent" | "country";

export default function Game() {
  const [overrideSeed, setOverrideSeed] = useState(0);
  const target = useMemo<Player>(() => {
    if (overrideSeed === 0) return getDailyPlayer();
    return players[Math.floor(Math.random() * players.length)];
  }, [overrideSeed]);
  const puzzleN = useMemo(() => puzzleNumber(), []);
  const allNames = useMemo(() => players.map((p) => p.name), []);

  const [revealed, setRevealed] = useState<Set<string>>(
    () => new Set(REVEAL_ORDER.slice(0, STARTING_REVEALED))
  );
  const [lastRevealed, setLastRevealed] = useState<string | null>(null);
  const [hintsUsed, setHintsUsed] = useState<Set<HintKey>>(new Set());
  const [guess, setGuess] = useState("");
  const [solved, setSolved] = useState(false);
  const [gaveUp, setGaveUp] = useState(false);
  const [feedback, setFeedback] = useState<{ text: string; tone: "correct" | "wrong" | "" }>({
    text: "",
    tone: "",
  });
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

  const hasContinent = Boolean(target.continent);
  const hasCountry = Boolean(target.country_name);
  const hasAge = Boolean(target.age);

  const countryLocked = hasContinent && !hintsUsed.has("continent");

  function useHint(key: HintKey) {
    if (done || hintsUsed.has(key)) return;
    if (key === "country" && countryLocked) return;
    setHintsUsed((prev) => new Set(prev).add(key));
  }

  function revealNext() {
    const next = REVEAL_ORDER.find((k) => !revealed.has(k));
    if (!next) return;
    setRevealed((prev) => new Set(prev).add(next));
    setLastRevealed(next);
    setTimeout(() => setLastRevealed(null), 500);
  }

  function handleSubmit() {
    if (done || !guess.trim()) return;
    if (norm(guess) === norm(target.name)) {
      setSolved(true);
      const hintSuffix = hintsUsed.size
        ? ` + ${hintsUsed.size} hint${hintsUsed.size > 1 ? "s" : ""}`
        : "";
      setFeedback({
        text: `On the green in regulation. ${revealed.size} ${
          revealed.size === 1 ? "clue" : "clues"
        } used${hintSuffix}.`,
        tone: "correct",
      });
    } else {
      setWrongCount((c) => c + 1);
      setFeedback({
        text: `Not ${guess.trim()}. Reload the swing — here's another clue.`,
        tone: "wrong",
      });
      revealNext();
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
    setRevealed(new Set(REVEAL_ORDER));
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

  function handleNewPuzzle() {
    setRevealed(new Set(REVEAL_ORDER.slice(0, STARTING_REVEALED)));
    setLastRevealed(null);
    setHintsUsed(new Set());
    setGuess("");
    setSolved(false);
    setGaveUp(false);
    setFeedback({ text: "", tone: "" });
    setWrongCount(0);
    setShowSuggestions(false);
    setOverrideSeed((s) => s + 1);
  }

  function handleShare() {
    const emoji = solved ? "⛳" : "❌";
    const cluesLine = Array.from({ length: REVEAL_ORDER.length }, (_, i) => {
      if (i < STARTING_REVEALED) return "🟦";
      if (i < revealed.size) return solved ? "🟨" : "⬜";
      return "⬜";
    }).join("");
    const hintsLine = hintsUsed.size ? ` · ${"💡".repeat(hintsUsed.size)}` : "";
    const text = `Pardle #${puzzleN} ${emoji}
${cluesLine}${hintsLine} ${solved ? `${revealed.size} clues` : "DNF"}
rosiedata.com/pardle`;
    navigator.clipboard.writeText(text);
    setFeedback({ text: "Copied to clipboard — paste it wherever you like.", tone: "correct" });
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
        <div className="issue">Vol. I — No. {String(puzzleN).padStart(3, "0")}</div>
        <div className="date">{today} / The Fairway Desk</div>
      </div>

      <div className="title-bar">
        <div className="kicker-above">The Fairway Desk</div>
        <h1 className="logo">Par<em>dle</em></h1>
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
            <div className="score-val">{hintsUsed.size}</div>
          </div>
          <div className="score-row">
            <div className="score-label">Status</div>
            <div className="score-val">{done ? (solved ? "Won" : "DNF") : "Live"}</div>
          </div>

          <div className="clues-count">
            <div className="big">{revealed.size}</div>
            <div className="lbl">Clues Shown</div>
          </div>
        </aside>

        {/* CENTRE — Primary game flow */}
        <section className="col">
          <div className="player-num">
            ◆ Mystery Player No. {String(puzzleN).padStart(3, "0")}
            <span className={`difficulty-badge ${target.difficulty}`}>{target.difficulty}</span>
          </div>
          <h2 className="headline">
            Who <em>scored</em> these stats?
          </h2>
          <p className="dek">
            Stats reveal one at a time. Each wrong guess unlocks another.
            Stuck? Spend a hint.
          </p>

          {/* Stats grid */}
          <div className="stats-grid">
            {REVEAL_ORDER.map((key) => {
              const shown = revealed.has(key);
              const isNew = lastRevealed === key;
              return (
                <div
                  key={key}
                  className={`stat ${shown ? "" : "hidden"} ${isNew ? "revealing" : ""}`}
                >
                  <div className="stat-label">{key}</div>
                  <div className="stat-value">
                    {shown ? target.stats[key as keyof typeof target.stats] ?? "—" : "— — —"}
                  </div>
                </div>
              );
            })}
          </div>


          {/* Guess input + primary actions */}
          <div className="kicker" style={{ marginTop: 24 }}>Your Guess</div>
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
                      className={`suggestion-item ${i === activeSuggestion ? "active" : ""}`}
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
                className="btn secondary"
                onClick={revealNext}
                disabled={done || revealed.size >= REVEAL_ORDER.length}
              >
                Reveal Clue
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

        {/* RIGHT — Caddie Hints */}
        <aside className="col">
          {(hasContinent || hasCountry || hasAge) && (
            <div className="hints-block">
              <div className="kicker">Caddie Hints</div>

              {hasAge && (
                <button
                  className={`hint-tile ${hintsUsed.has("age") ? "used" : ""}`}
                  onClick={() => useHint("age")}
                  disabled={done}
                >
                  <div className="hint-label">Age</div>
                  <div className="hint-value">
                    {hintsUsed.has("age") ? target.age : "Tap to reveal"}
                  </div>
                </button>
              )}

              {hasContinent && (
                <button
                  className={`hint-tile ${hintsUsed.has("continent") ? "used" : ""}`}
                  onClick={() => useHint("continent")}
                  disabled={done}
                >
                  <div className="hint-label">Continent</div>
                  <div className="hint-value">
                    {hintsUsed.has("continent") ? target.continent : "Tap to reveal"}
                  </div>
                </button>
              )}

              {hasCountry && (
                <button
                  className={`hint-tile ${
                    hintsUsed.has("country") ? "used" : ""
                  } ${countryLocked ? "locked" : ""}`}
                  onClick={() => useHint("country")}
                  disabled={done || countryLocked}
                  title={countryLocked ? "Reveal continent first" : ""}
                >
                  <div className="hint-label">
                    Country{" "}
                    {countryLocked && <span className="lock">· locked</span>}
                  </div>
                  <div className="hint-value">
                    {hintsUsed.has("country")
                      ? target.country_name
                      : countryLocked
                      ? "Reveal continent first"
                      : "Tap to reveal"}
                  </div>
                </button>
              )}

              <p className="hint-footnote">
                Each hint costs a point. Continent unlocks country.
              </p>
            </div>
          )}

          <button
            className="btn secondary"
            onClick={handleNewPuzzle}
            style={{ marginTop: 32, opacity: 0.4, fontSize: 10, width: "100%" }}
          >
            🧪 New Random Puzzle (testing)
          </button>
        </aside>
      </div>

      <footer>
        <div>
          Pressed in North Yorkshire <span className="flag-dot"></span> Data via Data Golf
        </div>
        <div>Come back tomorrow for a new round</div>
      </footer>
    </div>
  );
}
