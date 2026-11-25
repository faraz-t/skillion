"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { accuracyFromError, makeRng } from "@/lib/skillion";
import { Countdown, GameBoard } from "./game-board";
import { GameResult } from "./game-result";
import type { GameProps, Outcome } from "./types";

export default function CountGame({ difficulty, seed, maxPoints, onComplete }: GameProps) {
  const rng = useMemo(() => makeRng(`${seed}:count:${difficulty}`), [seed, difficulty]);
  const movingCount = useMemo(() => 5 + Math.floor(rng() * 36), [rng]);
  const stillCount = useMemo(() => 5 + Math.floor(rng() * 36), [rng]);
  const movingDots = useMemo(
    () => Array.from({ length: movingCount }, () => ({
      x: 24 + rng() * 312,
      y: 24 + rng() * 312,
    })),
    [movingCount, rng],
  );
  const stillDots = useMemo(
    () => Array.from({ length: stillCount }, () => ({
      x: 24 + rng() * 312,
      y: 24 + rng() * 312,
    })),
    [stillCount, rng],
  );
  const velocities = useMemo(
    () => movingDots.map(() => {
      const angle = rng() * Math.PI * 2;
      const speed = 38 + difficulty * 6 + rng() * 24;
      return { x: Math.cos(angle) * speed, y: Math.sin(angle) * speed };
    }),
    [movingDots, rng, difficulty],
  );
  const [phase, setPhase] = useState<"ready" | "showing" | "guessing" | "done">("ready");
  const [movingGuess, setMovingGuess] = useState("");
  const [stillGuess, setStillGuess] = useState("");
  const [movingPositions, setMovingPositions] = useState(movingDots);
  const [result, setResult] = useState<Outcome | null>(null);
  const revealTimeout = useRef<number | null>(null);
  const showFor = Math.max(2400, 4000 - difficulty * 400);

  useEffect(() => () => {
    if (revealTimeout.current !== null) window.clearTimeout(revealTimeout.current);
  }, []);

  useEffect(() => {
    if (phase !== "showing") return;
    let frame = 0;
    let previous = performance.now();
    const tick = (now: number) => {
      const dt = Math.min(0.032, (now - previous) / 1000);
      previous = now;
      setMovingPositions((positions) => positions.map((dot, index) => {
        let x = dot.x + velocities[index].x * dt;
        let y = dot.y + velocities[index].y * dt;
        if (x < 8 || x > 352) {
          velocities[index].x *= -1;
          x = Math.max(8, Math.min(352, x));
        }
        if (y < 8 || y > 352) {
          velocities[index].y *= -1;
          y = Math.max(8, Math.min(352, y));
        }
        return { x, y };
      }));
      frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [phase, velocities]);

  const handleAction = () => {
    if (phase === "ready") {
      setPhase("showing");
      revealTimeout.current = window.setTimeout(() => setPhase("guessing"), showFor);
      return;
    }
    if (phase === "guessing") {
      const movingValue = Number.parseInt(movingGuess, 10);
      const stillValue = Number.parseInt(stillGuess, 10);
      if (Number.isNaN(movingValue) || Number.isNaN(stillValue)) return;
      const movingAccuracy = accuracyFromError(Math.abs(movingValue - movingCount) / movingCount, 0.25);
      const stillAccuracy = accuracyFromError(Math.abs(stillValue - stillCount) / stillCount, 0.25);
      const accuracy = (movingAccuracy + stillAccuracy) / 2;
      setPhase("done");
      setResult({
        accuracy,
        detail: `You said: ${movingValue} moving, ${stillValue} still. Answer: ${movingCount} moving, ${stillCount} still.`,
      });
    }
  };

  const board = (
    <GameBoard label="Count">
      {(phase === "showing" || result) &&
        movingPositions.map((dot, index) => (
          <circle key={`moving-${index}`} cx={dot.x} cy={dot.y} r={5} className="board-accent-dot" />
        ))}
      {(phase === "showing" || result) &&
        stillDots.map((dot, index) => (
          <circle key={`still-${index}`} cx={dot.x} cy={dot.y} r={5} className="dot-accent" />
        ))}
      {phase === "guessing" && (
        <text x="180" y="205" textAnchor="middle" className="board-question">?</text>
      )}
    </GameBoard>
  );

  if (result) {
    return (
      <GameResult
        accuracy={result.accuracy}
        maxPoints={maxPoints}
        detail={result.detail}
        board={board}
        onDone={() => onComplete(result.accuracy, result.detail)}
      />
    );
  }

  return (
    <div className="game-content">
      <p className="game-prompt">Pay attention!</p>
      {phase === "showing" ? <Countdown seconds={showFor / 1000} /> : <div className="countdown idle" aria-hidden="true" />}
      {board}
      {phase === "guessing" && (
        <div className="input-pair">
          <input
            className="guess-input"
            type="number"
            inputMode="numeric"
            placeholder="Moving"
            autoFocus
            value={movingGuess}
            onChange={(event) => setMovingGuess(event.target.value)}
            onKeyDown={(event) => { if (event.key === "Enter") handleAction(); }}
          />
          <input
            className="guess-input"
            type="number"
            inputMode="numeric"
            placeholder="Still"
            value={stillGuess}
            onChange={(event) => setStillGuess(event.target.value)}
            onKeyDown={(event) => { if (event.key === "Enter") handleAction(); }}
          />
        </div>
      )}
      <button
        type="button"
        className="primary-button"
        data-start={phase === "ready" ? "" : undefined}
        disabled={(phase === "showing") || (phase === "guessing" && (movingGuess === "" || stillGuess === ""))}
        onClick={handleAction}
      >
        {phase === "ready" ? "Show the dots" : phase === "guessing" ? "Lock in" : "Watch…"}
      </button>
    </div>
  );
}
