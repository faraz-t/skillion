"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { FastForward } from "lucide-react";
import { makeRng } from "@/lib/skillion";
import { boardPoint, clamp, GameBoard } from "./game-board";
import { GameResult } from "./game-result";
import type { GameProps, Outcome, Point } from "./types";

const BOX = { min: 48, max: 312 };
const SAFE_MARGIN = 22;
const SAFE_BOX = { min: BOX.min + SAFE_MARGIN, max: BOX.max - SAFE_MARGIN };

type Laser = {
  position: Point;
  previous: Point;
  direction: Point;
  speed: number;
  path: Point[];
};

type Arrow = {
  source: Point;
  target: Point;
  direction: Point;
};

function distanceToSegment(p: Point, a: Point, b: Point) {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const lengthSquared = dx * dx + dy * dy;
  if (lengthSquared === 0) return Math.hypot(p.x - a.x, p.y - a.y);
  const t = clamp(((p.x - a.x) * dx + (p.y - a.y) * dy) / lengthSquared, 0, 1);
  return Math.hypot(p.x - (a.x + t * dx), p.y - (a.y + t * dy));
}

function pointAtBoxEntry(source: Point, direction: Point): Point {
  const candidates: number[] = [];
  if (direction.x > 0) candidates.push((BOX.min - source.x) / direction.x);
  if (direction.x < 0) candidates.push((BOX.max - source.x) / direction.x);
  if (direction.y > 0) candidates.push((BOX.min - source.y) / direction.y);
  if (direction.y < 0) candidates.push((BOX.max - source.y) / direction.y);

  let entry: Point | null = null;
  let nearest = Infinity;
  for (const candidate of candidates) {
    if (candidate < 0 || candidate >= nearest) continue;
    const point = {
      x: source.x + direction.x * candidate,
      y: source.y + direction.y * candidate,
    };
    if (
      point.x >= BOX.min - 0.01 && point.x <= BOX.max + 0.01 &&
      point.y >= BOX.min - 0.01 && point.y <= BOX.max + 0.01
    ) {
      nearest = candidate;
      entry = point;
    }
  }
  return entry ?? source;
}

export default function LazersGame({ difficulty, seed, maxPoints, onComplete }: GameProps) {
  const maxSurvival = 18 - difficulty * 1.5;
  const setup = useMemo(() => {
    const rng = makeRng(`${seed}:lazers:${difficulty}`);
    const count = 3 + difficulty + Math.floor(rng() * 2);
    const arrows: Arrow[] = [];

    for (let i = 0; i < count; i += 1) {
      const side = i % 4;
      let source: Point;
      if (side === 0) source = { x: 18, y: 75 + rng() * 210 };
      else if (side === 1) source = { x: 342, y: 75 + rng() * 210 };
      else if (side === 2) source = { x: 75 + rng() * 210, y: 18 };
      else source = { x: 75 + rng() * 210, y: 342 };

      const target = {
        x: BOX.min + rng() * (BOX.max - BOX.min),
        y: BOX.min + rng() * (BOX.max - BOX.min),
      };
      const dx = target.x - source.x;
      const dy = target.y - source.y;
      const length = Math.hypot(dx, dy);
      arrows.push({ source, target, direction: { x: dx / length, y: dy / length } });
    }

    return { arrows, count };
  }, [seed, difficulty]);

  const [phase, setPhase] = useState<"ready" | "running" | "done">("ready");
  const [cursor, setCursor] = useState<Point | null>(null);
  const [laserPaths, setLaserPaths] = useState<Point[][]>([]);
  const [hit, setHit] = useState<Point | null>(null);
  const [result, setResult] = useState<Outcome | null>(null);
  const [canSkip, setCanSkip] = useState(false);
  const lasersRef = useRef<Laser[]>([]);
  const cursorRef = useRef<Point | null>(null);
  const frameRef = useRef<number | null>(null);
  const startedAt = useRef(0);

  useEffect(() => () => {
    if (frameRef.current !== null) cancelAnimationFrame(frameRef.current);
  }, []);

  const begin = (point: Point) => {
    if (phase !== "ready") return;
    cursorRef.current = point;
    setCursor(point);
    setPhase("running");
    startedAt.current = performance.now();

    const baseSpeed = 58 + difficulty * 10;
    lasersRef.current = setup.arrows.map((arrow, index) => {
      const entry = pointAtBoxEntry(arrow.source, arrow.direction);
      return {
        position: { ...entry },
        previous: { ...entry },
        direction: arrow.direction,
        speed: baseSpeed + index * 7,
        path: [{ ...entry }],
      };
    });
    setLaserPaths(lasersRef.current.map((laser) => laser.path));

    let previous = performance.now();
    let maxPointsReached = false;
    const tick = (now: number) => {
      const dt = Math.min(0.032, (now - previous) / 1000);
      previous = now;
      const survived = (now - startedAt.current) / 1000;
      if (!maxPointsReached && survived >= maxSurvival) {
        maxPointsReached = true;
        setCanSkip(true);
      }
      let collision: Point | null = null;

      for (const laser of lasersRef.current) {
        laser.previous = { ...laser.position };
        laser.position = {
          x: laser.position.x + laser.direction.x * laser.speed * dt,
          y: laser.position.y + laser.direction.y * laser.speed * dt,
        };

        if (laser.position.x <= BOX.min) {
          laser.position.x = BOX.min;
          laser.direction.x = Math.abs(laser.direction.x);
          laser.path.push({ ...laser.position });
        } else if (laser.position.x >= BOX.max) {
          laser.position.x = BOX.max;
          laser.direction.x = -Math.abs(laser.direction.x);
          laser.path.push({ ...laser.position });
        }
        if (laser.position.y <= BOX.min) {
          laser.position.y = BOX.min;
          laser.direction.y = Math.abs(laser.direction.y);
          laser.path.push({ ...laser.position });
        } else if (laser.position.y >= BOX.max) {
          laser.position.y = BOX.max;
          laser.direction.y = -Math.abs(laser.direction.y);
          laser.path.push({ ...laser.position });
        }

        if (
          cursorRef.current &&
          distanceToSegment(cursorRef.current, laser.previous, laser.position) <= 9
        ) {
          collision = { ...laser.position };
          break;
        }
      }

      setLaserPaths(lasersRef.current.map((laser) => [...laser.path, laser.position]));

      if (collision) {
        setPhase("done");
        setHit(collision);
        setResult({
          accuracy: clamp(survived / maxSurvival, 0, 1),
          detail: `You survived ${survived.toFixed(1)} seconds before getting hit.`,
        });
        return;
      }
      frameRef.current = requestAnimationFrame(tick);
    };
    frameRef.current = requestAnimationFrame(tick);
  };

  const skipAfterMaxPoints = () => {
    if (!canSkip || phase !== "running") return;
    if (frameRef.current !== null) cancelAnimationFrame(frameRef.current);
    setPhase("done");
    setResult({
      accuracy: 1,
      detail: `You survived ${maxSurvival.toFixed(1)} seconds and reached the maximum points.`,
    });
  };

  const board = (
    <GameBoard
      label="Lazer Tag"
      onPointerDown={phase === "ready"
        ? (event) => {
            event.currentTarget.setPointerCapture(event.pointerId);
            const point = boardPoint(event.currentTarget, event);
            if (
              point.x < SAFE_BOX.min || point.x > SAFE_BOX.max ||
              point.y < SAFE_BOX.min || point.y > SAFE_BOX.max
            ) return;
            begin({ x: clamp(point.x, SAFE_BOX.min, SAFE_BOX.max), y: clamp(point.y, SAFE_BOX.min, SAFE_BOX.max) });
          }
        : undefined}
    >
      <rect
        x={BOX.min + 1}
        y={BOX.min + 1}
        width={BOX.max - BOX.min - 2}
        height={BOX.max - BOX.min - 2}
        className="lazers-danger-margin"
      />
      <rect
        x={SAFE_BOX.min}
        y={SAFE_BOX.min}
        width={SAFE_BOX.max - SAFE_BOX.min}
        height={SAFE_BOX.max - SAFE_BOX.min}
        className="lazers-safe-area"
      />
      <rect x={BOX.min} y={BOX.min} width={BOX.max - BOX.min} height={BOX.max - BOX.min} className="lazers-box" />

      {phase === "ready" && setup.arrows.map((arrow, index) => {
        const angle = Math.atan2(arrow.direction.y, arrow.direction.x) * 180 / Math.PI;
        return (
          <g key={index} className="lazer-arrow">
            <line
              x1={arrow.source.x}
              y1={arrow.source.y}
              x2={arrow.target.x}
              y2={arrow.target.y}
            />
            <polygon
              points="0,-10 22,0 0,10"
              transform={`translate(${arrow.target.x - arrow.direction.x * 11} ${arrow.target.y - arrow.direction.y * 11}) rotate(${angle})`}
            />
          </g>
        );
      })}

      {laserPaths.map((path, index) => {
        const head = path[path.length - 1];
        if (!head) return null;
        return (
          <g key={`beam-${index}`} className="lazer-beam">
            {path.slice(1).map((point, pointIndex) => {
              const previous = path[pointIndex];
              return (
                <line
                  key={pointIndex}
                  x1={previous.x}
                  y1={previous.y}
                  x2={point.x}
                  y2={point.y}
                />
              );
            })}
            <circle cx={head.x} cy={head.y} r="5" />
          </g>
        );
      })}
      {hit && <circle cx={hit.x} cy={hit.y} r="8" className="lazer-hit" />}
      {phase === "running" && cursor && (
        <g>
          <circle cx={cursor.x} cy={cursor.y} r="8" className="lazer-cursor" />
          <circle cx={cursor.x} cy={cursor.y} r="3" className="lazer-cursor-core" />
        </g>
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
        {phase === "ready"
          ? <>Click inside the inner box to begin. The red margin is off-limits.</>
          : canSkip
            ? <>Maximum points reached. Skip when you’re ready.</>
            : <>Good luck!</>}
      </p>
      {board}
      {canSkip && phase === "running" && (
        <div className="button-row single">
          <button type="button" className="secondary-button" onClick={skipAfterMaxPoints}>
            <FastForward size={16} aria-hidden="true" />
            Skip
          </button>
        </div>
      )}
    </div>
  );
}
