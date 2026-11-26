"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { accuracyFromError, makeRng } from "@/lib/skillion";
import { GameBoard } from "./game-board";
import { GameResult } from "./game-result";
import type { GameProps, Outcome } from "./types";

export default function TimerGame({ difficulty, seed, maxPoints, onComplete }: GameProps) {
  const targetTime = useMemo(() => {
    const rng = makeRng(`${seed}:timer:${difficulty}`);
    return 5 + Math.floor(rng() * 101) / 10;
  }, [seed, difficulty]);
  const [startedAt, setStartedAt] = useState<number | null>(null);
  const [display, setDisplay] = useState("0.00");
  const [displayOpacity, setDisplayOpacity] = useState(1);
  const frame = useRef<number | null>(null);
  const [result, setResult] = useState<Outcome | null>(null);

  useEffect(() => () => {
    if (frame.current !== null) cancelAnimationFrame(frame.current);
  }, []);

  const handleAction = () => {
    if (startedAt === null) {
      const start = performance.now();
      setStartedAt(start);
      const tick = () => {
        const elapsed = (performance.now() - start) / 1000;
        setDisplay(elapsed.toFixed(2));
        setDisplayOpacity(elapsed <= 2 ? 1 : Math.max(0, 1 - (elapsed - 2) / 2));
        frame.current = requestAnimationFrame(tick);
      };
      tick();
      return;
    }
    if (frame.current !== null) cancelAnimationFrame(frame.current);
    const elapsed = (performance.now() - startedAt) / 1000;
    const error = Math.abs(elapsed - targetTime);
    setDisplay(elapsed.toFixed(2));
    setDisplayOpacity(1);
    setResult({
      accuracy: accuracyFromError(error, 0.3 + 0.05 * targetTime),
      detail: `Stopped at ${elapsed.toFixed(2)} s. The target was ${targetTime.toFixed(1)} s.`,
    });
  };

  const running = startedAt !== null && !result;
  const board = (
    <GameBoard label="Stopwatch" onPointerDown={running ? handleAction : undefined}>
      <circle cx="180" cy="180" r="135" className="board-guide" />
      <text x="180" y="200" textAnchor="middle" className="board-question" style={{ opacity: displayOpacity }}>{display}</text>
      {result && (
        <text x="180" y="248" textAnchor="middle" className="board-label" fontSize="18">TARGET {targetTime.toFixed(1)} s</text>
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
      <p className="game-prompt">Start the clock, then stop it at exactly <strong>{targetTime.toFixed(1)}</strong> seconds.</p>
      {board}
      <button type="button" className="primary-button"
        data-start={startedAt === null ? "" : undefined} onClick={handleAction}>
        {startedAt === null ? "Start" : "Stop"}
      </button>
    </div>
  );
}
