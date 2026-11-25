"use client";

import { useMemo, useState } from "react";
import { accuracyFromError, makeRng } from "@/lib/skillion";
import { boardPoint, GameBoard } from "./game-board";
import { GameResult } from "./game-result";
import type { GameProps, Outcome, Point } from "./types";

function polygonArea(points: Point[]) {
  let area = 0;
  for (let i = 0; i < points.length; i += 1) {
    const next = points[(i + 1) % points.length];
    area += points[i].x * next.y - next.x * points[i].y;
  }
  return Math.abs(area) / 2;
}

function clipPolygon(poly: Point[], p1: Point, p2: Point) {
  const dx = p2.x - p1.x;
  const dy = p2.y - p1.y;
  const side = (point: Point) => dx * (point.y - p1.y) - dy * (point.x - p1.x);
  const output: Point[] = [];
  for (let i = 0; i < poly.length; i += 1) {
    const a = poly[i];
    const b = poly[(i + 1) % poly.length];
    const sa = side(a);
    const sb = side(b);
    if (sa >= 0) output.push(a);
    if ((sa >= 0) !== (sb >= 0)) {
      const t = sa / (sa - sb);
      output.push({ x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t });
    }
  }
  return output;
}

/**
 * Random simple polygon: scatter vertices at jittered angles around a centre with random
 * radii, then join them in angular order. That yields a random (often concave) outline
 * that can never cross itself, then it is scaled/offset to a random spot on the board.
 */
function randomPolygon(rng: () => number, vertexCount: number): Point[] {
  const spin = rng() * Math.PI * 2;
  const raw = Array.from({ length: vertexCount }, (_, i) => {
    const angle = spin + ((i + 0.1 + rng() * 0.8) / vertexCount) * Math.PI * 2;
    const radius = 0.3 + rng() * 0.7;
    return { x: Math.cos(angle) * radius, y: Math.sin(angle) * radius };
  });
  const xs = raw.map((p) => p.x);
  const ys = raw.map((p) => p.y);
  const minX = Math.min(...xs);
  const maxX = Math.max(...xs);
  const minY = Math.min(...ys);
  const maxY = Math.max(...ys);
  const fit = (300 * (0.8 + rng() * 0.2)) / Math.max(maxX - minX, maxY - minY);
  const offsetX = 180 - ((minX + maxX) / 2) * fit + (rng() - 0.5) * 20;
  const offsetY = 180 - ((minY + maxY) / 2) * fit + (rng() - 0.5) * 20;
  return raw.map((p) => ({ x: p.x * fit + offsetX, y: p.y * fit + offsetY }));
}

export default function SplitGame({ difficulty, seed, maxPoints, onComplete }: GameProps) {
  const { target, polygon } = useMemo(() => {
    const rng = makeRng(`${seed}:split:${difficulty}`);
    const vertexCount = 3 + Math.floor(rng() * (5 + difficulty)); // 3..7 up to 3..11
    const targetPercent = 5 + Math.floor(rng() * 46); // 5%..50%
    return { target: targetPercent, polygon: randomPolygon(rng, vertexCount) };
  }, [seed, difficulty]);
  const totalArea = useMemo(() => polygonArea(polygon), [polygon]);
  const [a, setA] = useState<Point | null>(null);
  const [b, setB] = useState<Point | null>(null);
  const [result, setResult] = useState<(Outcome & { piece: Point[] }) | null>(null);

  const board = (
    <GameBoard
      label="Split"
      onPointerDown={result ? undefined : (event) => {
        event.currentTarget.setPointerCapture(event.pointerId);
        const point = boardPoint(event.currentTarget, event);
        setA(point);
        setB(point);
      }}
      onPointerMove={result ? undefined : (event) => {
        if (event.buttons && a) setB(boardPoint(event.currentTarget, event));
      }}
    >
      <polygon
        points={polygon.map((point) => `${point.x},${point.y}`).join(" ")}
        className="board-shape"
      />
      {result && result.piece.length > 2 && (
        <polygon points={result.piece.map((point) => `${point.x},${point.y}`).join(" ")} className="board-piece" />
      )}
      {a && b && <line x1={a.x} y1={a.y} x2={b.x} y2={b.y} className="board-accent-line" />}
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
      <p className="game-prompt">Drag to draw one straight line that cuts off <strong>{target}%</strong> of the shape.</p>
      {board}
      <button
        type="button"
        className="primary-button"
        disabled={!a || !b}
        onClick={() => {
          if (!a || !b) return;
          const length = Math.hypot(b.x - a.x, b.y - a.y);
          if (length < 14) return;
          const first = clipPolygon(polygon, a, b);
          const second = clipPolygon(polygon, b, a);
          const firstArea = polygonArea(first);
          const secondArea = polygonArea(second);
          const fraction = Math.min(firstArea, secondArea) / totalArea;
          const actualPercent = fraction * 100;
          setResult({
            piece: firstArea <= secondArea ? first : second,
            accuracy: accuracyFromError(Math.abs(actualPercent - target), 8 - difficulty),
            detail: `Your line cut off ${actualPercent.toFixed(1)}%. The answer was ${target}%.`,
          });
        }}
      >
        Lock in
      </button>
    </div>
  );
}
