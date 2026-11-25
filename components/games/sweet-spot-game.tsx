"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { makeRng } from "@/lib/skillion";
import { GameBoard } from "./game-board";
import { GameResult } from "./game-result";
import type { GameProps, Outcome } from "./types";

const X0 = 30;
const X1 = 330;
const Y = 180;

// Distance from centre (in multiples of the green half-width) -> accuracy.
const CURVE: Array<[number, number]> = [[0, 1], [1, 0.85], [2, 0.55], [3.2, 0.25], [5, 0]];
function scoreAt(units: number) {
  for (let i = 1; i < CURVE.length; i += 1) {
    const [x1, y1] = CURVE[i];
    const [x0, y0] = CURVE[i - 1];
    if (units <= x1) return y0 + ((y1 - y0) * (units - x0)) / (x1 - x0);
  }
  return 0;
}

const triangle = (u: number) => 1 - Math.abs(2 * (u - Math.floor(u)) - 1); // 0 → 1 → 0

export default function SweetSpotGame({ difficulty, seed, maxPoints, onComplete }: GameProps) {
  const centre = useMemo(() => 110 + makeRng(`${seed}:sweet:${difficulty}`)() * 140, [seed, difficulty]);
  const half = 24 - difficulty * 3; // green half-width
  const period = 2.4 - difficulty * 0.25;
  const positionAt = (t: number) => X0 + (X1 - X0) * triangle(t / period);

  const [pos, setPos] = useState(X0);
  const [running, setRunning] = useState(false);
  const [result, setResult] = useState<Outcome | null>(null);
  const startedAt = useRef(0);
  const frame = useRef<number | null>(null);

  useEffect(() => () => {
    if (frame.current !== null) cancelAnimationFrame(frame.current);
  }, []);

  const begin = () => {
    startedAt.current = performance.now();
    setRunning(true);
    const tick = () => {
      setPos(positionAt((performance.now() - startedAt.current) / 1000));
      frame.current = requestAnimationFrame(tick);
    };
    tick();
  };

  const stop = () => {
    if (frame.current !== null) cancelAnimationFrame(frame.current);
    const x = positionAt((performance.now() - startedAt.current) / 1000);
    setPos(x);
    setRunning(false);
    const units = Math.abs(x - centre) / half;
    const zone = units <= 1 ? "green" : units <= 2 ? "light green" : units <= 3.2 ? "yellow" : "red";
    setResult({
      accuracy: scoreAt(units),
      detail: `${zone[0].toUpperCase()}${zone.slice(1)} zone: ${Math.abs(x - centre).toFixed(0)} px from the centre.`,
    });
  };

  const zone = (mult: number, cls: string) => (
    <rect
      x={Math.max(X0, centre - half * mult)}
      y={Y - 28}
      width={Math.min(X1, centre + half * mult) - Math.max(X0, centre - half * mult)}
      height="56"
      className={cls}
    />
  );

  const board = (
    <GameBoard label="Sweet spot" onPointerDown={running ? stop : undefined}>
      <rect x={X0} y={Y - 28} width={X1 - X0} height="56" className="zone-red" />
      {zone(3.2, "zone-yellow")}
      {zone(2, "zone-lime")}
      {zone(1, "zone-green")}
      <line x1={centre} y1={Y - 40} x2={centre} y2={Y + 40} className="board-answer-line" />
      <line x1={X0} y1={Y} x2={X1} y2={Y} className="zone-track" />
      <line x1={pos} y1={Y - 56} x2={pos} y2={Y + 56} className="sweet-marker" />
      <circle cx={pos} cy={Y} r="11" className={`sweet-dot${running ? " live" : ""}`} />
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
      <p className="game-prompt">Stop the dot in the <strong>green zone</strong>. Tap the board or press Stop.</p>
      <div className="countdown idle" aria-hidden="true" />
      {board}
      <button type="button" className="primary-button"
        data-start={!running ? "" : undefined} onClick={running ? stop : begin}>
        {running ? "Stop" : "Start"}
      </button>
    </div>
  );
}
