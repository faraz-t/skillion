"use client";

import { useEffect, useMemo, useState } from "react";
import { accuracyFromError, makeRng } from "@/lib/skillion";
import { boardPoint, clamp, Countdown, GameBoard } from "./game-board";
import { GameResult } from "./game-result";
import type { GameProps, Outcome, Point } from "./types";

const SHAPES: string[][] = [
  ["square"],
  ["square", "triangle"],
  ["triangle", "circle"],
  ["pentagon", "circle", "hexagon"],
  ["hexagon", "pentagon", "circle"],
];
const SIDES: Record<string, number> = { triangle: 3, square: 4, pentagon: 5, hexagon: 6 };
const REF_Y = 36;
const OWN_Y = 58;
const TOP = 84; // drawing area starts below the two rulers

function length(points: Point[], closed: boolean) {
  let total = 0;
  for (let i = 1; i < points.length; i += 1) total += Math.hypot(points[i].x - points[i - 1].x, points[i].y - points[i - 1].y);
  if (closed && points.length > 1) total += Math.hypot(points[0].x - points[points.length - 1].x, points[0].y - points[points.length - 1].y);
  return total;
}

function lineDistance(p: Point, a: Point, b: Point) {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const len = Math.hypot(dx, dy);
  if (len === 0) return Math.hypot(p.x - a.x, p.y - a.y);
  return Math.abs(dy * p.x - dx * p.y + b.x * a.y - b.y * a.x) / len;
}

function rdp(points: Point[], tolerance: number): Point[] {
  if (points.length < 3) return points;
  let worst = 0;
  let index = 0;
  for (let i = 1; i < points.length - 1; i += 1) {
    const d = lineDistance(points[i], points[0], points[points.length - 1]);
    if (d > worst) {
      worst = d;
      index = i;
    }
  }
  if (worst <= tolerance) return [points[0], points[points.length - 1]];
  return [...rdp(points.slice(0, index + 1), tolerance).slice(0, -1), ...rdp(points.slice(index), tolerance)];
}

/** Corner points of a closed freehand loop (collinear vertices dropped). */
function corners(points: Point[], tolerance: number) {
  let far = 0;
  let best = 0;
  points.forEach((p, i) => {
    const d = Math.hypot(p.x - points[0].x, p.y - points[0].y);
    if (d > best) {
      best = d;
      far = i;
    }
  });
  const a = rdp(points.slice(0, far + 1), tolerance);
  const b = rdp([...points.slice(far), points[0]], tolerance);
  let poly = [...a.slice(0, -1), ...b.slice(0, -1)];
  for (let pass = 0; pass < 3; pass += 1) {
    poly = poly.filter((p, i) => {
      const prev = poly[(i + poly.length - 1) % poly.length];
      const next = poly[(i + 1) % poly.length];
      let turn = Math.atan2(next.y - p.y, next.x - p.x) - Math.atan2(p.y - prev.y, p.x - prev.x);
      while (turn > Math.PI) turn -= Math.PI * 2;
      while (turn < -Math.PI) turn += Math.PI * 2;
      return Math.abs(turn) > 0.45;
    });
  }
  return poly;
}

function evaluate(points: Point[], shape: string, target: number, difficulty: number) {
  const raw = length(points, true);
  const gap = Math.hypot(points[0].x - points[points.length - 1].x, points[0].y - points[points.length - 1].y);
  const closedness = gap <= Math.max(24, raw * 0.18) ? 1 : 0.8;
  let perimeter = raw;
  let fit = 1;
  let note = "";
  let outline: Point[] = points;

  const sides = SIDES[shape];
  if (sides) {
    const poly = corners(points, Math.max(8, raw * 0.04));
    perimeter = length(poly, true);
    outline = poly;
    const off = Math.abs(poly.length - sides);
    fit = off === 0 ? 1 : off === 1 ? 0.85 : off === 2 ? 0.65 : 0.45;
    if (off > 0) note = ` Your shape had ${poly.length} corners, not ${sides}.`;
  } else {
    const cx = points.reduce((s, p) => s + p.x, 0) / points.length;
    const cy = points.reduce((s, p) => s + p.y, 0) / points.length;
    const radii = points.map((p) => Math.hypot(p.x - cx, p.y - cy));
    const mean = radii.reduce((s, r) => s + r, 0) / radii.length;
    const spread = Math.sqrt(radii.reduce((s, r) => s + (r - mean) ** 2, 0) / radii.length) / mean;
    fit = spread < 0.08 ? 1 : spread < 0.15 ? 0.85 : spread < 0.25 ? 0.65 : 0.45;
    if (fit < 1) note = " That wasn’t very round.";
  }
  if (closedness < 1) note += " The loop wasn’t closed.";

  const error = Math.abs(perimeter - target) / target;
  const accuracy = fit * closedness * accuracyFromError(error, 0.3 - difficulty * 0.025);
  const sign = perimeter >= target ? "longer" : "shorter";
  return {
    accuracy,
    outline,
    perimeter,
    detail: `Your ${shape} was ${(error * 100).toFixed(0)}% ${sign} than the line.${note}`,
  };
}

export default function PerimeterGame({ difficulty, seed, maxPoints, onComplete }: GameProps) {
  const { shape, target } = useMemo(() => {
    const rng = makeRng(`${seed}:perimeter:${difficulty}`);
    const options = SHAPES[difficulty] ?? SHAPES[0];
    return { shape: options[Math.floor(rng() * options.length)], target: 200 + Math.floor(rng() * 130) };
  }, [seed, difficulty]);

  const refSeconds = difficulty >= 3 ? 3.2 - (difficulty - 3) * 0.8 : null;
  const [refVisible, setRefVisible] = useState(true);
  const [stroke, setStroke] = useState<Point[]>([]);
  const [result, setResult] = useState<(Outcome & { outline: Point[]; perimeter: number }) | null>(null);

  useEffect(() => {
    if (refSeconds === null) return;
    const id = window.setTimeout(() => setRefVisible(false), refSeconds * 1000);
    return () => window.clearTimeout(id);
  }, [refSeconds]);

  const drawn = stroke.length > 1 ? length(stroke, false) : 0;
  const rulerX = (len: number) => 180 - len / 2;
  const scale = result ? Math.min(1, 320 / Math.max(target, result.perimeter)) : 1;

  const board = (
    <GameBoard
      label="Perimeter"
      onPointerDown={result ? undefined : (event) => {
        event.currentTarget.setPointerCapture(event.pointerId);
        const p = boardPoint(event.currentTarget, event);
        setStroke([{ x: clamp(p.x, 8, 352), y: clamp(p.y, TOP, 352) }]);
      }}
      onPointerMove={result ? undefined : (event) => {
        if (!event.buttons) return;
        const raw = boardPoint(event.currentTarget, event);
        const p = { x: clamp(raw.x, 8, 352), y: clamp(raw.y, TOP, 352) };
        setStroke((prev) => {
          const last = prev[prev.length - 1];
          if (!last || prev.length > 900 || Math.hypot(p.x - last.x, p.y - last.y) < 3) return prev;
          return [...prev, p];
        });
      }}
    >
      <rect
        x="8"
        y={TOP}
        width="344"
        height={352 - TOP}
        className="board-dashed"
        pointerEvents="none"
      />
      {(refVisible || result) && (
        <g>
          <line x1={rulerX(target * scale)} y1={REF_Y} x2={rulerX(target * scale) + target * scale} y2={REF_Y} className="board-answer-line" />
          <line x1={rulerX(target * scale)} y1={REF_Y - 7} x2={rulerX(target * scale)} y2={REF_Y + 7} className="board-answer-line" />
          <line x1={rulerX(target * scale) + target * scale} y1={REF_Y - 7} x2={rulerX(target * scale) + target * scale} y2={REF_Y + 7} className="board-answer-line" />
        </g>
      )}
      {result && (
        <g>
          <line x1={rulerX(result.perimeter * scale)} y1={OWN_Y} x2={rulerX(result.perimeter * scale) + result.perimeter * scale} y2={OWN_Y} className="board-accent-line" strokeWidth="3" />
          <text x="344" y={REF_Y - 10} textAnchor="end" className="board-label" fontSize="11">TARGET</text>
          <text x="344" y={OWN_Y + 20} textAnchor="end" className="board-label" fontSize="11">YOUR PERIMETER</text>
        </g>
      )}
      {stroke.length > 1 && (
        <polyline points={stroke.map((p) => `${p.x},${p.y}`).join(" ")} className={`board-path thin${result ? " faded" : ""}`} />
      )}
      {result && (
        <polygon points={result.outline.map((p) => `${p.x},${p.y}`).join(" ")} className="board-outline" />
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
      <p className="game-prompt">Draw a <strong>{shape}</strong> whose perimeter matches the length of the line.</p>
      {refSeconds !== null && refVisible ? <Countdown seconds={refSeconds} /> : <div className="countdown idle" aria-hidden="true" />}
      {board}
      <div className="button-row">
        <button type="button" className="secondary-button" disabled={stroke.length === 0} onClick={() => setStroke([])}>Clear</button>
        <button
          type="button"
          className="primary-button"
          disabled={drawn < 60}
          onClick={() => {
            const outcome = evaluate(stroke, shape, target, difficulty);
            setResult(outcome);
          }}
        >
          Lock in
        </button>
      </div>
    </div>
  );
}
