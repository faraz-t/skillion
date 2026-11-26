"use client";

import { useMemo, useState } from "react";
import { accuracyFromError, makeRng } from "@/lib/skillion";
import { boardPoint, clamp, GameBoard } from "./game-board";
import { GameResult } from "./game-result";
import type { GameProps, Outcome, Point } from "./types";

const CENTER = { x: 180, y: 180 };
const RADIUS = 180;

function polar(angle: number): Point {
  const radians = (angle - 90) * Math.PI / 180;
  return {
    x: CENTER.x + RADIUS * Math.cos(radians),
    y: CENTER.y + RADIUS * Math.sin(radians),
  };
}

function angleAt(point: Point) {
  const degrees = Math.atan2(point.y - CENTER.y, point.x - CENTER.x) * 180 / Math.PI + 90;
  return ((degrees % 360) + 360) % 360;
}

function wedgePath(angle: number) {
  const start = polar(0);
  const end = polar(angle);
  const largeArc = angle > 180 ? 1 : 0;
  return `M ${CENTER.x} ${CENTER.y} L ${start.x} ${start.y} A ${RADIUS} ${RADIUS} 0 ${largeArc} 1 ${end.x} ${end.y} Z`;
}

export default function PizzaGame({ difficulty, seed, maxPoints, onComplete }: GameProps) {
  const puzzle = useMemo(() => {
    const rng = makeRng(`${seed}:pizza:${difficulty}`);
    const start = 30 + Math.floor(rng() * 121);

    let change: number;
    let direction: "increase" | "decrease";
    const canIncrease = 360 - start >= 15;
    const canDecrease = start >= 15;

    if (canIncrease && (!canDecrease || rng() < 0.5)) {
      direction = "increase";
      const maxChange = Math.min(180, 360 - start);
      change = 15 + Math.floor(rng() * (maxChange - 14));
    } else {
      direction = "decrease";
      const maxChange = Math.min(180, start);
      change = 15 + Math.floor(rng() * (maxChange - 14));
    }

    const target = direction === "increase" ? start + change : start - change;
    return { start, change, direction, target: clamp(target, 0, 360) };
  }, [seed, difficulty]);

  const [slice, setSlice] = useState(puzzle.start);
  const [dragging, setDragging] = useState(false);
  const [result, setResult] = useState<Outcome | null>(null);

  const setFromPointer = (event: React.PointerEvent<SVGSVGElement>) => {
    if (result) return;
    const point = boardPoint(event.currentTarget, event);
    setSlice(clamp(angleAt(point), 1, 359));
  };

  const board = (
    <GameBoard
      label="Pizza"
      onPointerDown={(event) => {
        event.currentTarget.setPointerCapture(event.pointerId);
        setDragging(true);
        setFromPointer(event);
      }}
      onPointerMove={(event) => {
        if (dragging) setFromPointer(event);
      }}
      onPointerUp={() => setDragging(false)}
    >
      <defs>
        <clipPath id="pizza-visible-slice">
          <path d={wedgePath(slice)} />
        </clipPath>
      </defs>
      <g clipPath="url(#pizza-visible-slice)">
        <image
          href="/pizza.png"
          x="0"
          y="0"
          width="360"
          height="360"
          preserveAspectRatio="xMidYMid meet"
          className="pizza-image"
        />
      </g>
      <line
        x1={CENTER.x}
        y1={CENTER.y}
        x2={polar(slice).x}
        y2={polar(slice).y}
        className="pizza-cut"
      />
      {result && (
        <>
          <line
            x1={CENTER.x}
            y1={CENTER.y}
            x2={polar(puzzle.target).x}
            y2={polar(puzzle.target).y}
            className="pizza-target-line"
          />
          <text x="180" y="326" textAnchor="middle" className="board-label" fontSize="13">
            TARGET {puzzle.target}°
          </text>
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
        <strong>{puzzle.direction[0].toUpperCase()}{puzzle.direction.slice(1)}</strong> the slice by <strong>{puzzle.change}°</strong>.
      </p>
      {board}
      <button
        type="button"
        className="primary-button"
        onClick={() => {
          const error = Math.abs(slice - puzzle.target);
          setResult({
            accuracy: accuracyFromError(error, 8 - difficulty * 0.7),
            detail: `Yours was ${slice.toFixed(0)}°. The answer was ${puzzle.target}°.`,
          });
        }}
      >
        Lock in
      </button>
    </div>
  );
}
