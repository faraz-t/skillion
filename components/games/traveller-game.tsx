"use client";

import { useMemo, useRef, useState } from "react";
import { accuracyFromError, makeRng } from "@/lib/skillion";
import { boardPoint, GameBoard } from "./game-board";
import { GameResult } from "./game-result";
import type { GameProps, Outcome, Point } from "./types";

type Cell = { r: number; c: number };

const GRID = 20;
const CELL = 360 / GRID;
const center = (cell: Cell): Point => ({
  x: (cell.c + 0.5) * CELL,
  y: (cell.r + 0.5) * CELL,
});

const key = (cell: Cell) => `${cell.r},${cell.c}`;

function optimalOpenTour(points: Point[]): Point[] {
  const n = points.length;
  if (n < 2) return points;
  const size = 1 << n;
  const dp = Array.from({ length: size }, () => Array(n).fill(Infinity));
  const parent = Array.from({ length: size }, () => Array(n).fill(-1));

  for (let i = 0; i < n; i += 1) dp[1 << i][i] = 0;
  for (let mask = 1; mask < size; mask += 1) {
    for (let last = 0; last < n; last += 1) {
      if (!((mask >> last) & 1) || !Number.isFinite(dp[mask][last])) continue;
      for (let next = 0; next < n; next += 1) {
        if ((mask >> next) & 1) continue;
        const distance =
          dp[mask][last] +
          Math.hypot(points[next].x - points[last].x, points[next].y - points[last].y);
        const nextMask = mask | (1 << next);
        if (distance < dp[nextMask][next]) {
          dp[nextMask][next] = distance;
          parent[nextMask][next] = last;
        }
      }
    }
  }

  let last = 0;
  for (let i = 1; i < n; i += 1) {
    if (dp[size - 1][i] < dp[size - 1][last]) last = i;
  }
  const reverse: number[] = [];
  let mask = size - 1;
  while (last !== -1) {
    reverse.push(last);
    const previous = parent[mask][last];
    mask ^= 1 << last;
    last = previous;
  }
  return reverse.reverse().map((index) => points[index]);
}

function pathLength(path: Point[]) {
  let total = 0;
  for (let i = 1; i < path.length; i += 1) {
    total += Math.hypot(path[i].x - path[i - 1].x, path[i].y - path[i - 1].y);
  }
  return total;
}

export default function TravellerGame({ difficulty, seed, maxPoints, onComplete }: GameProps) {
  const layout = useMemo(() => {
    const rng = makeRng(`${seed}:traveller:${difficulty}`);
    const count = 10 + Math.floor(rng() * 5);
    const used = new Set<string>();
    const cells: Cell[] = [];
    while (cells.length < count) {
      const cell = {
        r: 1 + Math.floor(rng() * (GRID - 2)),
        c: 1 + Math.floor(rng() * (GRID - 2)),
      };
      if (used.has(key(cell))) continue;
      used.add(key(cell));
      cells.push(cell);
    }
    const points = cells.map(center);
    return {
      cells,
      optimal: optimalOpenTour(points),
      optimalLength: pathLength(optimalOpenTour(points)),
    };
  }, [seed, difficulty]);

  const [stroke, setStroke] = useState<Point[]>([]);
  const [visited, setVisited] = useState<Set<string>>(new Set());
  const [result, setResult] = useState<Outcome | null>(null);
  const drawing = useRef(false);
  const strokeRef = useRef<Point[]>([]);

  const strokeLength = pathLength(stroke);
  const complete = visited.size === layout.cells.length && stroke.length > 1;

  const addStrokePoint = (event: React.PointerEvent<SVGSVGElement>) => {
    if (result) return;
    const point = boardPoint(event.currentTarget, event);
    if (point.x < 0 || point.x > 360 || point.y < 0 || point.y > 360) return;

    const previous = strokeRef.current[strokeRef.current.length - 1] ?? null;
    if (previous && Math.hypot(point.x - previous.x, point.y - previous.y) < 3) return;
    const nextStroke = [...strokeRef.current, point];
    strokeRef.current = nextStroke;
    setStroke(nextStroke);

    setVisited((current) => {
      const next = new Set(current);
      const start = previous ?? point;
      const dx = point.x - start.x;
      const dy = point.y - start.y;
      const distance = Math.hypot(dx, dy);
      const steps = Math.max(1, Math.ceil(distance / (CELL * 0.25)));
      for (let step = 0; step <= steps; step += 1) {
        const sample = {
          x: start.x + (dx * step) / steps,
          y: start.y + (dy * step) / steps,
        };
        const cellKey = `${Math.floor(sample.y / CELL)},${Math.floor(sample.x / CELL)}`;
        if (layout.cells.some((cell) => key(cell) === cellKey)) next.add(cellKey);
      }
      return next;
    });
  };

  const board = (
    <GameBoard
      label="Traveller"
      onPointerDown={(event) => {
        event.currentTarget.setPointerCapture(event.pointerId);
        if (result) return;
        drawing.current = true;
        strokeRef.current = [];
        setStroke([]);
        setVisited(new Set());
        addStrokePoint(event);
      }}
      onPointerMove={(event) => {
        if (drawing.current && event.buttons) addStrokePoint(event);
      }}
      onPointerUp={() => {
        drawing.current = false;
      }}
    >
      {Array.from({ length: GRID + 1 }, (_, index) => (
        <g key={index}>
          <line
            x1={index * CELL}
            y1="0"
            x2={index * CELL}
            y2="360"
            className="traveller-grid-line"
          />
          <line
            x1="0"
            y1={index * CELL}
            x2="360"
            y2={index * CELL}
            className="traveller-grid-line"
          />
        </g>
      ))}

      {layout.cells.map((cell, index) => {
        const visitedCell = visited.has(key(cell));
        return (
          <rect
            key={key(cell)}
            x={cell.c * CELL}
            y={cell.r * CELL}
            width={CELL}
            height={CELL}
            className={visitedCell ? "traveller-point visited" : "traveller-point"}
          >
            <title>{index + 1}</title>
          </rect>
        );
      })}

      {stroke.length > 1 && (
        <polyline
          points={stroke.map((point) => `${point.x},${point.y}`).join(" ")}
          className="traveller-route"
        />
      )}

      {result && (
        <polyline
          points={layout.optimal.map((point) => `${point.x},${point.y}`).join(" ")}
          className="traveller-optimal"
        />
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
        Visit every <strong>colored tile</strong>. Draw the <strong>shortest route</strong> you can.
      </p>
      {board}
      <div className="button-row">
        <button
          type="button"
          className="secondary-button"
          disabled={stroke.length === 0}
          onClick={() => {
            strokeRef.current = [];
            setStroke([]);
            setVisited(new Set());
          }}
        >
          Clear
        </button>
        <button
          type="button"
          className="primary-button"
          disabled={!complete}
          onClick={() => {
            const ratio = layout.optimalLength / Math.max(strokeLength, layout.optimalLength);
            const accuracy = accuracyFromError(1 - ratio, 0.14);
            setResult({
              accuracy,
              detail: `Your route was ${strokeLength.toFixed(0)} px. The computer's route was ${layout.optimalLength.toFixed(0)} px.`,
            });
          }}
        >
          Lock in
        </button>
      </div>
    </div>
  );
}
