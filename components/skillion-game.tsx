"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import {
  FINALE_GAME,
  FINALE_VALUE,
  GAME_POOL,
  UNLOCK_THRESHOLDS,
  buildDailyGames,
  formatPoints,
  getDailySeed,
  ROW_VALUES,
  TITLE,
  type CellResult,
  type GameDefinition,
} from "@/lib/skillion";
import { GAME_COMPONENTS, type AnyGameType } from "./games/game-registry";
import { GameIntro } from "./games/game-intro";

function shortPoints(value: number) {
  return value >= 1000 ? `${+(value / 1000).toFixed(1)}k` : String(value);
}

function rowOf(index: number) {
  return index < 25 ? Math.floor(index / 5) : 5;
}

function maxOf(index: number) {
  return index < 25 ? ROW_VALUES[rowOf(index)] : FINALE_VALUE;
}

function difficultyOf(index: number) {
  return index < 25 ? rowOf(index) : 4;
}

export default function SkillionGame() {
  const [seed, setSeed] = useState("");
  const [gridOrder, setGridOrder] = useState(0);
  const runSeed = seed ? `${seed}:order-${gridOrder}` : "";
  const storageKey = `skillion-${TITLE}-v2-${runSeed}`;
  const games = useMemo(
    () => (runSeed ? buildDailyGames(runSeed) : []),
    [runSeed],
  );
  const [cells, setCells] = useState<Array<CellResult | null>>(() => new Array(26).fill(null));
  const [activeIndex, setActiveIndex] = useState<number | null>(null);
  // false = pre-game intro screen, true = the game itself is running.
  const [playing, setPlaying] = useState(false);
  const stageRef = useRef<HTMLDivElement>(null);
  const [confirmingReset, setConfirmingReset] = useState(false);
  const resetTimer = useRef<number | null>(null);

  useEffect(() => () => {
    if (resetTimer.current !== null) window.clearTimeout(resetTimer.current);
  }, []);

  // Escape closes the intro (never a running game, so a game can't be restarted for another
  // attempt); the page behind the stage doesn't scroll while it's open.
  useEffect(() => {
    if (activeIndex === null) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape" && !playing) {
        setActiveIndex(null);
      }
    };
    window.addEventListener("keydown", onKey);
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = previous;
    };
  }, [activeIndex, playing]);

  // Starting from the intro screen also presses the game's own "start" button (Show the dots,
  // Spin, Launch…), so the player doesn't have to press start twice.
  useEffect(() => {
    if (!playing) return;
    const frame = requestAnimationFrame(() => {
      stageRef.current?.querySelector<HTMLButtonElement>("[data-start]")?.click();
    });
    return () => cancelAnimationFrame(frame);
  }, [playing, activeIndex]);

  const openGame = (index: number) => {
    setPlaying(false);
    setActiveIndex(index);
  };

  useEffect(() => {
    const timeout = window.setTimeout(() => setSeed(getDailySeed()), 0);
    return () => window.clearTimeout(timeout);
  }, []);

  useEffect(() => {
    if (!runSeed) return;
    const timeout = window.setTimeout(() => {
      try {
        const saved = JSON.parse(localStorage.getItem(storageKey) ?? "null");
        if (Array.isArray(saved) && saved.length === 26) setCells(saved);
      } catch {
        // Progress remains in memory if browser storage is unavailable.
      }
    }, 0);
    return () => window.clearTimeout(timeout);
  }, [runSeed, storageKey]);

  const total = cells.reduce((sum, cell) => sum + (cell?.points ?? 0), 0);
  const isUnlocked = (row: number) => total >= UNLOCK_THRESHOLDS[row];
  const isOpen = (index: number) => !cells[index] && isUnlocked(rowOf(index));
  const complete = !cells.some((cell, index) => !cell && isOpen(index));

  const resetProgress = () => {
    if (resetTimer.current !== null) window.clearTimeout(resetTimer.current);
    // First press arms the button, second press (within 3s) actually erases progress.
    if (!confirmingReset) {
      setConfirmingReset(true);
      resetTimer.current = window.setTimeout(() => setConfirmingReset(false), 3000);
      return;
    }
    setConfirmingReset(false);
    const next = new Array<CellResult | null>(26).fill(null);
    setCells(next);
    setGridOrder((order) => order + 1);
    setActiveIndex(null);
    try {
      for (let i = localStorage.length - 1; i >= 0; i -= 1) {
        const key = localStorage.key(i);
        if (key?.startsWith(`skillion-${TITLE}-`)) localStorage.removeItem(key);
      }
    } catch {
      // The in-memory reset still completes if browser storage is unavailable.
    }
  };

  const saveResult = (index: number, accuracy: number) => {
    const points = Math.round((maxOf(index) * accuracy) / 10) * 10;
    const next = [...cells];
    next[index] = { points, accuracy };
    setCells(next);
    try {
      localStorage.setItem(storageKey, JSON.stringify(next));
    } catch {
      // Scoring should continue even if storage is unavailable.
    }
    setActiveIndex(null);
  };

  const activeGame: GameDefinition | null =
    activeIndex === null
      ? null
      : activeIndex === 25
        ? FINALE_GAME
        : games[activeIndex];

  const shareText = `SKILLION ${seed}\n${Array.from({ length: 5 }, (_, row) =>
    Array.from({ length: 5 }, (_, column) => {
      const cell = cells[row * 5 + column];
      if (!cell) return "⬛";
      if (cell.accuracy >= 0.8) return "🟩";
      if (cell.accuracy >= 0.45) return "🟨";
      return "🟥";
    }).join("")
  ).join("\n")}\n${formatPoints(total)} / 1,000,000`;

  const ActiveGameComponent = activeGame ? GAME_COMPONENTS[activeGame.type as AnyGameType] : null;

  return (
    <main className="game-wrap">
      <header className="game-header">
        <div className="brand-line">
          <span className="brand-mark" aria-hidden="true">✶</span>
          <h1>SKILLION</h1>
          <span className="brand-mark" aria-hidden="true">✶</span>
        </div>
        <div className="game-meta">
          <span>Daily {seed}</span>
          <span><strong>{formatPoints(total)}</strong> / 1,000,000</span>
        </div>
      </header>

      {complete && (
        <section className="game-end" aria-live="polite">
          <pre className="share-result">{shareText}</pre>
          <button
            type="button"
            className="primary-button"
            onClick={() => void navigator.clipboard?.writeText(shareText)}
          >
            Copy result
          </button>
        </section>
      )}

      <section className="game-grid" aria-label="Daily game grid">
        {Array.from({ length: 6 }, (_, row) => (
          <div className="game-row" key={row}>
            <div
              className={`row-lock row-lock-${row}${isUnlocked(row) ? " row-lock-open" : ""}`}
              title="Score needed to unlock this row"
            >
              <span className="lock-icon" aria-hidden="true" />
              <span className="lock-label">{shortPoints(UNLOCK_THRESHOLDS[row])}</span>
            </div>
            {row < 5
              ? Array.from({ length: 5 }, (_, column) => {
                  const index = row * 5 + column;
                  const game = games[index] ?? GAME_POOL[index % GAME_POOL.length];
                  const open = isOpen(index);
                  const result = cells[index];
                  const state = result ? "done" : open ? "open" : "locked";
                  return (
                    <button
                      type="button"
                      key={index}
                      className={`game-tile ${state}`}
                      style={{
                        "--image-x": `${column * 25}%`,
                        "--image-y": `${row * 25}%`,
                      } as React.CSSProperties}
                      disabled={!open}
                      onClick={() => openGame(index)}
                      title={`${game.name}: up to ${formatPoints(maxOf(index))} points`}
                    >
                      <span className="tile-name">{game.name}</span>
                      <span className="tile-score">
                        {result ? shortPoints(result.points) : "–"}
                        <i>/{shortPoints(maxOf(index))}</i>
                      </span>
                    </button>
                  );
                })
              : (() => {
                  const open = isOpen(25);
                  const result = cells[25];
                  return (
                    <button
                      type="button"
                      className={`game-tile finale ${result ? "done" : open ? "open" : "locked"}`}
                      disabled={!open}
                      onClick={() => openGame(25)}
                    >
                      <span className="tile-name">{FINALE_GAME.name}</span>
                    </button>
                  );
                })()}
          </div>
        ))}
      </section>

      <footer className="game-footer">
        <button
          type="button"
          className={`reset-button${confirmingReset ? " confirming" : ""}`}
          onClick={resetProgress}
        >
          {confirmingReset ? "tap again" : "reset"}
        </button>
      </footer>

      {activeIndex !== null && activeGame && ActiveGameComponent && (
        <div
          className="game-modal"
          role="dialog"
          aria-modal="true"
          aria-label={activeGame.name}
          onPointerDown={(event) => {
            // Tapping outside the card closes the intro, but not a game that has started.
            if (event.target === event.currentTarget && !playing) setActiveIndex(null);
          }}
        >
          <div className="stage" ref={stageRef}>
            {playing ? (
              <>
                <ActiveGameComponent
                  key={`${runSeed}:cell-${activeIndex}`}
                  difficulty={difficultyOf(activeIndex)}
                  seed={`${runSeed}:cell-${activeIndex}`}
                  maxPoints={maxOf(activeIndex)}
                  onComplete={(accuracy) => saveResult(activeIndex, accuracy)}
                />
              </>
            ) : (
              <GameIntro
                type={activeGame.type}
                name={activeGame.name}
                maxPoints={maxOf(activeIndex)}
                gridPosition={activeIndex < 25 ? activeIndex + 1 : null}
                row={rowOf(activeIndex)}
                onStart={() => setPlaying(true)}
                onClose={() => setActiveIndex(null)}
              />
            )}
          </div>
        </div>
      )}
    </main>
  );
}
