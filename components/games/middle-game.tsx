"use client";

import { useMemo, useState } from "react";
import { accuracyFromError, makeRng } from "@/lib/skillion";
import { boardPoint, GameBoard } from "./game-board";
import { GameResult } from "./game-result";
import type { GameProps, Outcome, Point } from "./types";

type Ball = Point & { r: number };

/** Bigger circles count for more (mass ∝ area). Set false to use plain circle centres. */
const WEIGHTED = true;

const MARGIN = 18;

function gaussian(rng: () => number) {
  return Math.sqrt(-2 * Math.log(1 - rng())) * Math.cos(2 * Math.PI * rng());
}

/** Small circles form a few tight clusters, with a little scatter around them. */
function makeBalls(rng: () => number, count: number): Ball[] {
  const clusterCount = 3 + Math.floor(rng() * 3);
  const clusters = Array.from({ length: clusterCount }, () => ({
    x: 55 + rng() * 250,
    y: 55 + rng() * 250,
    spread: 8 + rng() * 12,
  }));
  const balls: Ball[] = [];
  for (let i = 0; i < count; i += 1) {
    const clustered = rng() < 0.78;
    const r = 3.5 + rng() * 3.5;
    let placed: Ball | null = null;
    for (let attempt = 0; attempt < 180 && !placed; attempt += 1) {
      let x: number;
      let y: number;
      if (clustered) {
        const c = clusters[Math.floor(rng() * clusters.length)];
        x = c.x + gaussian(rng) * c.spread;
        y = c.y + gaussian(rng) * c.spread;
      } else {
        x = MARGIN + rng() * (360 - MARGIN * 2);
        y = MARGIN + rng() * (360 - MARGIN * 2);
      }
      if (x < MARGIN || x > 360 - MARGIN || y < MARGIN || y > 360 - MARGIN) continue;
      if (balls.some((b) => Math.hypot(b.x - x, b.y - y) < b.r + r + 3)) continue;
      placed = { x, y, r };
    }
    if (placed) balls.push(placed);
  }
  return balls;
}

export default function MiddleGame({ difficulty, seed, maxPoints, onComplete }: GameProps) {
  const { balls, center } = useMemo(() => {
    const rng = makeRng(`${seed}:middle:${difficulty}`);
    const count = 18 + difficulty * 2 + Math.floor(rng() * 4);
    const list = makeBalls(rng, count);
    let mass = 0;
    let cx = 0;
    let cy = 0;
    for (const b of list) {
      const m = WEIGHTED ? b.r * b.r : 1;
      mass += m;
      cx += b.x * m;
      cy += b.y * m;
    }
    return { balls: list, center: { x: cx / mass, y: cy / mass } };
  }, [seed, difficulty]);

  const [marker, setMarker] = useState<Point | null>(null);
  const [result, setResult] = useState<Outcome | null>(null);

  const board = (
    <GameBoard
      label="Gravity"
      onPointerDown={result ? undefined : (event) => {
        event.currentTarget.setPointerCapture(event.pointerId);
        setMarker(boardPoint(event.currentTarget, event));
      }}
      onPointerMove={result ? undefined : (event) => {
        if (event.buttons) setMarker(boardPoint(event.currentTarget, event));
      }}
    >
      {balls.map((b, i) => (
        <circle key={i} cx={b.x} cy={b.y} r={b.r} className="dot-accent" fillOpacity={0.85} />
      ))}
      {result && (
        <>
          <circle cx={center.x} cy={center.y} r="9" className="board-answer-ring" />
          {marker && <line x1={marker.x} y1={marker.y} x2={center.x} y2={center.y} className="board-answer-line" strokeDasharray="4 5" />}
        </>
      )}
      {marker && (
        <>
          <line x1={marker.x - 9} y1={marker.y} x2={marker.x + 9} y2={marker.y} className="board-accent-line" />
          <line x1={marker.x} y1={marker.y - 9} x2={marker.x} y2={marker.y + 9} className="board-accent-line" />
        </>
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
      <p className="game-prompt">
        Tap the <strong>center of gravity</strong> of the circles.
      </p>
      {board}
      <button
        type="button"
        className="primary-button"
        disabled={!marker}
        onClick={() => {
          if (!marker) return;
          const error = Math.hypot(marker.x - center.x, marker.y - center.y);
          setResult({
            accuracy: accuracyFromError(error, 26 - difficulty * 3),
            detail: `Your mark was ${(error / 3.6).toFixed(1)}% of the board off the true center of gravity.`,
          });
        }}
      >
        Lock in
      </button>
    </div>
  );
}
