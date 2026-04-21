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

const PAR_GUESSES = 3;

const norm = (s: string) => s.toLowerCase().replace(/[,.]/g, "").trim();

function getInitials(name: string): string {
  if (name.includes(",")) {
    const [surname, firstname] = name.split(",").map((s) => s.trim());
    return `${firstname[0]}. ${surname[0]}.`;
  }
  const parts = name.split(" ");
  return parts.map((p) => `${p[0]}.`).join(" ");
}

function displayName(name: string): string {
  if (name.includes(",")) {
    const [surname, firstname] = name.split(",").map((s) => s.trim());
    return `${firstname} ${surname}`;
  }
  return name;
}

function formatValue(value: string | undefined | null): React.ReactNode {
  if (!value) return "—";
  const [main, compare] = value.split("||");

  const renderWithSigns = (s: string) => {
    const parts = s.split(/([+\-])/);
    return parts.map((p, i) =>
      p === "+" || p === "-" ? (
        <span key={i} className="sign">{p}</span>
      ) : (
        <span key={i} className="num">{p}</span>
      )
    );
  };

  return (
    <>
      {renderWithSigns(main)}
      {compare && (
        <span className="compare">
          {renderWithSigns(compare)}
        </span>
      )}
    </>
  );
}

function ShareCard({
  puzzleN,
  scoreLabel,
  finalHintsUsed,
  guessCount,
  solved,
}: {
  puzzleN: number;
  scoreLabel: string;
  finalHintsUsed: number;
  guessCount: number;
  solved: boolean;
}) {
  const totalSlots = HINT_ORDER.length + 1;
  const actions: string[] = [];
  for (let i = 0; i < finalHintsUsed; i++) actions.push("🟧");
  if (solved) actions.push("🟩");
  while (actions.length < totalSlots) actions.push("⬜");

  return (
    <div
      id="share-card"
      style={{
        width: 1080,
        height: 1080,
        background: "#fff0f0",
        color: "#363334",
        padding: 100,
        display: "flex",
        flexDirection: "column",
        justifyContent: "space-between",
        fontFamily: "'Fraunces', serif",
        boxSizing: "border-box",
      }}
    >
      <div style={{
        fontFamily: "'Archivo', sans-serif",
        fontWeight: 700,
        fontSize: 26,
        letterSpacing: "0.3em",
        textTransform: "uppercase",
        color: "rgba(54, 51, 52, 0.6)",
      }}>
        The Caddie Desk · Pardle No. {String(puzzleN).padStart(3, "0")}
      </div>

      <div>
        <div style={{
          fontFamily: "'Fraunces', serif",
          fontWeight: 700,
          fontStyle: "italic",
          fontSize: 220,
          lineHeight: 0.9,
          letterSpacing: "-0.03em",
        }}>
          {scoreLabel}
        </div>
        <div style={{
          fontSize: 120,
          lineHeight: 1.2,
          marginTop: 48,
          letterSpacing: "0.04em",
        }}>
          {actions.join("")}
        </div>
      </div>

      <div>
        <div style={{
          fontFamily: "'Fraunces', serif",
          fontStyle: "italic",
          fontSize: 44,
          color: "rgba(54, 51, 52, 0.7)",
          marginBottom: 28,
        }}>
          {finalHintsUsed} hint{finalHintsUsed !== 1 ? "s" : ""} · {guessCount} guess{guessCount !== 1 ? "es" : ""}
        </div>
        <div style={{
          fontFamily: "'Archivo', sans-serif",
          fontWeight: 700,
          fontSize: 30,
          letterSpacing: "0.2em",
          textTransform: "uppercase",
          color: "#363334",
        }}>
          pardle.caddiedesk.com
        </div>
      </div>
    </div>
  );
}

export default function Game() {
  const [overrideSeed, setOverrideSeed] = useState(0);
  const [difficultyFilter, setDifficultyFilter] = useState<
    "easy" | "medium" | "hard" | "all"
  >("easy");
  const [tourFilter, setTourFilter] = useState<
    "all" | "PGA" | "EURO" | "LIV"
  >("all");

  const target = useMemo<Player>(() => {
    let pool = difficultyFilter === "all"
      ? players
      : players.filter((p) => p.difficulty === difficultyFilter);

    if (tourFilter !== "all") {
      pool = pool.filter((p) => p.tour === tourFilter);
    }

    const picks = pool.length ? pool : players;

    if (overrideSeed === 0) {
      const iso = new Date().toISOString().slice(0, 10);
      const hash = iso.split("").reduce((h, c) => h + c.charCodeAt(0), 0);
      return picks[hash % picks.length];
    }
    return picks[Math.floor(Math.random() * picks.length)];
  }, [overrideSeed, difficultyFilter, tourFilter]);

  const puzzleN = useMemo(() => puzzleNumber(), []);
  const allNames = useMemo(() => players.map((p) => p.name), []);

  const [revealedHints, setRevealedHints] = useState<Set<HintKey>>(new Set());
  const [finalHintsUsed, setFinalHintsUsed] = useState(0);
  const [lastRevealed, setLastRevealed] = useState<HintKey | null>(null);
  const [guess, setGuess] = useState("");
  const [guessCount, setGuessCount] = useState(0);
  const [wrongGuesses, setWrongGuesses] = useState<Player[]>([]);
  const [solved, setSolved] = useState(false);
  const [gaveUp, setGaveUp] = useState(false);
  const [feedback, setFeedback] = useState<{
    text: string;
    tone: "correct" | "wrong" | "";
  }>({ text: "", tone: "" });
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

  const totalCost = done ? finalHintsUsed : revealedHints.size;
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

    const newGuessCount = guessCount + 1;
    setGuessCount(newGuessCount);

    if (norm(guess) === norm(target.name)) {
      const actualHintsUsed = revealedHints.size;
      setSolved(true);
      setFinalHintsUsed(actualHintsUsed);
      setRevealedHints(new Set(HINT_ORDER));

      const hintLine = actualHintsUsed
        ? ` and ${actualHintsUsed} caddie hint${actualHintsUsed > 1 ? "s" : ""}`
        : "";
      setFeedback({
        text: `Got it in ${newGuessCount} guess${newGuessCount === 1 ? "" : "es"}${hintLine}.`,
        tone: "correct",
      });
    } else {
      const guessedPlayer = players.find(
        (p) => norm(p.name) === norm(guess)
      );
      if (guessedPlayer) {
        setWrongGuesses((prev) => [...prev, guessedPlayer]);
      }

      setFeedback({
        text: `Not ${displayName(guess.trim())}. Reload the swing — here's another clue.`,
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
    setFinalHintsUsed(revealedHints.size);
    setRevealedHints(new Set(HINT_ORDER));
    setFeedback({
      text: "No shame. The leaderboard always waits for round two.",
      tone: "wrong",
    });
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
    setFinalHintsUsed(0);
    setLastRevealed(null);
    setGuess("");
    setGuessCount(0);
    setWrongGuesses([]);
    setSolved(false);
    setGaveUp(false);
    setFeedback({ text: "", tone: "" });
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

  function handleTourChange(newTour: typeof tourFilter) {
    setTourFilter(newTour);
    resetGameState();
    setOverrideSeed((s) => s + 1);
  }

  function handleShare() {
    const scoreEmoji: Record<string, string> = {
      "Hole in One": "✨⛳✨",
      "Eagle": "⛳️",
      "Birdie": "🟢",
      "Par": "🟡",
      "Bogey": "🟠",
      "Double Bogey": "🟠",
      "Triple Bogey": "🔴",
      "Picked up": "⚫",
      "DNF": "❌",
    };

    const emoji = scoreEmoji[scoreLabel] ?? "⛳";
    const totalSlots = HINT_ORDER.length + 1;

    const actions: string[] = [];
    for (let i = 0; i < finalHintsUsed; i++) actions.push("🟧");
    if (solved) actions.push("🟩");
    while (actions.length < totalSlots) actions.push("⬜");
    const row = actions.slice(0, totalSlots).join("");

    const hintLabel = finalHintsUsed === 1 ? "1 hint" : `${finalHintsUsed} hints`;
    const guessLabel = guessCount === 1 ? "1 guess" : `${guessCount} guesses`;

    const text = [
      `Pardle #${puzzleN} · ${emoji} ${scoreLabel}`,
      `${row} · ${hintLabel} · ${guessLabel}`,
      `pardle.caddiedesk.com`,
    ].join("\n");

    navigator.clipboard.writeText(text);
    setFeedback({
      text: "Copied to clipboard — paste it wherever you like.",
      tone: "correct",
    });
  }

  async function handleShareImage() {
    const node = document.getElementById("share-card");
    if (!node) return;
  
    try {
      // Wait for fonts to be ready
      await document.fonts.ready;
  
      // Generate PNG from the hidden share card
      const { toPng } = await import("html-to-image");
      const dataUrl = await toPng(node, {
        width: 1080,
        height: 1080,
        pixelRatio: 1,
      });
  
      // Convert to Blob so we can share it as a file
      const blob = await (await fetch(dataUrl)).blob();
      const file = new File([blob], `pardle-${puzzleN}.png`, { type: "image/png" });
  
      if (navigator.canShare?.({ files: [file] })) {
        await navigator.share({
          files: [file],
          title: `Pardle #${puzzleN}`,
          text: `${scoreLabel} · ${finalHintsUsed} hints, ${guessCount} guesses`,
        });
        setFeedback({ text: "Shared!", tone: "correct" });
      } else {
        setFeedback({
          text: "Image sharing isn't supported here. Try the Copy button.",
          tone: "wrong",
        });
      }
    } catch (err) {
      console.error("Share failed:", err);
      setFeedback({
        text: "Couldn't share image — use the Copy button instead.",
        tone: "wrong",
      });
    }
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
      <div style={{
        position: "absolute",
        left: -99999,
        top: 0,
        pointerEvents: "none",
        opacity: 0,
      }}>
        <ShareCard
          puzzleN={puzzleN}
          scoreLabel={scoreLabel}
          finalHintsUsed={finalHintsUsed}
          guessCount={guessCount}
          solved={solved}
        />
      </div>
      <div className="masthead">
        <div className="issue">
          Vol. I — No. {String(puzzleN).padStart(3, "0")}
        </div>
        <div className="date">{today} / The Caddie Desk</div>
      </div>

      <div className="title-bar">
        <div className="kicker-above">The Caddie Desk</div>
        <h1 className="logo">
          Par<em>dle</em>
        </h1>
        <div className="tagline">
          <span>A daily scorecard.</span>{" "}
          <span>Name the Tour pro.</span>
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
            <div className="score-label">Guesses</div>
            <div className="score-val">{guessCount}</div>
          </div>
          <div className="score-row">
            <div className="score-label">Hints Used</div>
            <div className="score-val">{totalCost}</div>
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
          </div>
          <h2 className="headline">
            Who <em>scored</em> these stats?
          </h2>
          <p className="dek">
            Six stats, one Tour pro. Read the clues and make your call. Each
            additional caddie hint costs you a stroke.
          </p>

          <div className="stats-grid">
            {STAT_ORDER.map((key) => (
              <div key={key} className="stat">
                <div className="stat-label">{key}</div>
                <div className="stat-value">
                  {formatValue(target.stats[key as keyof typeof target.stats])}
                </div>
              </div>
            ))}
          </div>

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
                  <div className="stat-label">{HINT_LABELS[key]}</div>
                  <div className="stat-value">{getHintValue(key)}</div>
                </button>
              );
            })}
          </div>

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
                placeholder={done ? "Puzzle complete" : "type a name"}
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

            {wrongGuesses.length > 0 && (
              <div className="guess-list">
                <div className="kicker" style={{ marginBottom: 4 }}>Previous guesses</div>
                <div className="guess-list-sub">
                  Values show each player's SG: Total — higher is better.
                </div>
                {wrongGuesses.map((p, i) => (
                  <div key={i} className="guess-row">
                    <span className="guess-name">{p.name}</span>
                    <span className="guess-sg">
                      <span className="guess-sg-label">SG:</span>
                      {formatValue(p.stats["SG: Total"])}
                    </span>
                  </div>
                ))}
              </div>
            )}

            <div className={`feedback ${feedback.tone}`}>{feedback.text}</div>
          </div>

          {done && (
            <div className="reveal-card">
              <div className="kicker">The Answer</div>
              <div className="name">{target.name}</div>
              <div style={{
                fontFamily: "Fraunces, serif",
                fontStyle: "italic",
                fontSize: 13,
                opacity: 0.8,
              }}>
                {target.continent && <>{target.continent} · </>}
                {target.country_name && <>{target.country_name} · </>}
                {target.age && <>age {target.age} · </>}
                Difficulty: {target.difficulty}
              </div>

              <div style={{ display: "flex", gap: 10, justifyContent: "center", marginTop: 16 }}>
                <button className="share-btn" onClick={handleShare}>
                  Copy Text
                </button>
                {typeof navigator !== "undefined" && "share" in navigator && (
                  <button className="share-btn" onClick={handleShareImage}>
                    Share Image
                  </button>
                )}
              </div>
            </div>
          )}
        </section>

        {/* RIGHT — Testing only (hidden in production) */}
        <aside className="col">
          {import.meta.env.DEV && (
            <div className="testing-block">
              <div className="kicker">Testing</div>

              <label className="testing-label">Difficulty</label>
              <select
                className="testing-select"
                value={difficultyFilter}
                onChange={(e) => handleDifficultyChange(e.target.value as typeof difficultyFilter)}
              >
                <option value="easy">Easy only</option>
                <option value="medium">Medium only</option>
                <option value="hard">Hard only</option>
                <option value="all">All players</option>
              </select>

              <label className="testing-label">Tour</label>
              <select
                className="testing-select"
                value={tourFilter}
                onChange={(e) => handleTourChange(e.target.value as typeof tourFilter)}
              >
                <option value="all">All tours</option>
                <option value="PGA">PGA Tour</option>
                <option value="EURO">DP World Tour</option>
                <option value="LIV">LIV Golf</option>
              </select>

              <button
                className="btn secondary"
                onClick={handleNewPuzzle}
                style={{ marginTop: 10, fontSize: 10, width: "100%" }}
              >
                🧪 New Random Puzzle
              </button>
            </div>
          )}
        </aside>
      </div>

      <footer>
        <div>Data via Data Golf</div>
        <div>Come back tomorrow for a new round</div>
      </footer>
    </div>
  );
}
