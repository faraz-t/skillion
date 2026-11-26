"use client";

import { useMemo, useState } from "react";
import { makeRng } from "@/lib/skillion";
import { clamp, GameBoard } from "./game-board";
import { GameResult } from "./game-result";
import type { GameProps, Outcome } from "./types";

type Direction = 0 | 1 | 2 | 3;
type Mirror = { x: number; y: number; orientation: 0 | 1 };
type Cell = { x: number; y: number };
type Puzzle = {
  size: number;
  startRow: number;
  targetRow: number;
  mirrors: Mirror[];
  solutionMirrors: number;
};

const DX = [1, 0, -1, 0];
const DY = [0, 1, 0, -1];
const REFLECTIONS: Record<0 | 1, Direction[]> = {
  0: [3, 2, 1, 0],
  1: [1, 0, 3, 2],
};
const GRID_X = 36;
const GRID_Y = 42;
const GRID_SIZE = 288;

function mirrorFor(incoming: Direction, outgoing: Direction): 0 | 1 | null {
  for (const orientation of [0, 1] as const) {
    if (REFLECTIONS[orientation][incoming] === outgoing) return orientation;
  }
  return null;
}

function makePuzzle(difficulty: number, seed: string): Puzzle {
  const rng = makeRng(`${seed}:prismatic:${difficulty}`);
  const size = [4, 4, 5, 5, 6][difficulty] ?? 6;
  const minimumTurns = [2, 2, 3, 3, 4][difficulty] ?? 4;
  const decoys = [0, 1, 2, 3, 5][difficulty] ?? 5;
  const firstRow = Math.floor(rng() * size);

  for (let requiredTurns = minimumTurns; requiredTurns >= 2; requiredTurns -= 1) {
    for (let rowOffset = 0; rowOffset < size; rowOffset += 1) {
      const startRow = (firstRow + rowOffset) % size;
      const visited = new Set<string>();
      const pathMirrors = new Map<string, 0 | 1>();
      let targetRow = startRow;

      const findRoute = (x: number, y: number, incoming: Direction, turns: number): boolean => {
        if (x < 0 || x >= size || y < 0 || y >= size) return false;
        const key = `${x},${y}`;
        if (visited.has(key)) return false;
        visited.add(key);

        const exits: Direction[] = [incoming, ((incoming + 1) % 4) as Direction, ((incoming + 3) % 4) as Direction];
        for (let i = exits.length - 1; i > 0; i -= 1) {
          const j = Math.floor(rng() * (i + 1));
          [exits[i], exits[j]] = [exits[j], exits[i]];
        }

        for (const outgoing of exits) {
          const nextTurns = turns + Number(outgoing !== incoming);
          const nextX = x + DX[outgoing];
          const nextY = y + DY[outgoing];
          const mirror = mirrorFor(incoming, outgoing);

          if (nextX === size && nextY >= 0 && nextY < size && nextTurns >= requiredTurns) {
            if (mirror !== null) pathMirrors.set(key, mirror);
            targetRow = nextY;
            return true;
          }
          if (nextX < 0 || nextX >= size || nextY < 0 || nextY >= size) continue;

          if (mirror !== null) pathMirrors.set(key, mirror);
          if (findRoute(nextX, nextY, outgoing, nextTurns)) return true;
          pathMirrors.delete(key);
        }

        visited.delete(key);
        return false;
      };

      if (!findRoute(0, startRow, 0, 0)) continue;

      const routeCells = new Set(visited);
      const mirrors: Mirror[] = [];
      for (const [key, solutionOrientation] of pathMirrors) {
        const [x, y] = key.split(",").map(Number);
        mirrors.push({ x, y, orientation: (1 - solutionOrientation) as 0 | 1 });
      }

      const candidates: Cell[] = [];
      for (let y = 0; y < size; y += 1) {
        for (let x = 0; x < size; x += 1) {
          const key = `${x},${y}`;
          if (!routeCells.has(key)) candidates.push({ x, y });
        }
      }
      for (let i = candidates.length - 1; i > 0; i -= 1) {
        const j = Math.floor(rng() * (i + 1));
        [candidates[i], candidates[j]] = [candidates[j], candidates[i]];
      }
      for (const cell of candidates.slice(0, decoys)) {
        mirrors.push({ ...cell, orientation: rng() < 0.5 ? 0 : 1 });
      }

      return { size, startRow, targetRow, mirrors, solutionMirrors: pathMirrors.size };
    }
  }

  throw new Error("Unable to generate a solvable prism puzzle.");
}

function traceBeam(puzzle: Puzzle, mirrors: Mirror[]) {
  const mirrorAt = new Map(mirrors.map((mirror) => [`${mirror.x},${mirror.y}`, mirror.orientation]));
  const visited = new Set<string>();
  const points: Cell[] = [{ x: -0.25, y: puzzle.startRow + 0.5 }];
  let x = 0;
  let y = puzzle.startRow;
  let direction: Direction = 0;

  for (let step = 0; step < puzzle.size * puzzle.size * 4; step += 1) {
    if (x < 0 || x >= puzzle.size || y < 0 || y >= puzzle.size) {
      points.push({ x: clamp(x, 0, puzzle.size), y: clamp(y + 0.5, 0, puzzle.size) });
      return { points, reached: x === puzzle.size && y === puzzle.targetRow, loop: false };
    }

    const key = `${x},${y},${direction}`;
    if (visited.has(key)) return { points, reached: false, loop: true };
    visited.add(key);
    points.push({ x: x + 0.5, y: y + 0.5 });

    const orientation = mirrorAt.get(`${x},${y}`);
    if (orientation !== undefined) direction = REFLECTIONS[orientation][direction];
    x += DX[direction];
    y += DY[direction];
  }

  return { points, reached: false, loop: true };
}

export default function PrismaticGame({ difficulty, seed, maxPoints, onComplete }: GameProps) {
  const puzzle = useMemo(() => makePuzzle(difficulty, seed), [difficulty, seed]);
  const [orientations, setOrientations] = useState(() => puzzle.mirrors.map((mirror) => mirror.orientation));
  const [rotations, setRotations] = useState(0);
  const [started, setStarted] = useState(false);
  const [hint, setHint] = useState("");
  const [result, setResult] = useState<Outcome | null>(null);
  const mirrors = puzzle.mirrors.map((mirror, index) => ({ ...mirror, orientation: orientations[index] }));
  const beam = traceBeam(puzzle, mirrors);

  const rotateMirror = (index: number) => {
    if (!started || result) return;
    setOrientations((current) => current.map((orientation, i) => (i === index ? (1 - orientation) as 0 | 1 : orientation)));
    setRotations((count) => count + 1);
    setHint("");
  };

  const checkPath = () => {
    if (!beam.reached) {
      setHint(beam.loop ? "The beam loops back. Try another mirror." : "The beam missed the target. Keep adjusting.");
      return;
    }
    const extraRotations = Math.max(0, rotations - puzzle.solutionMirrors);
    const accuracy = Math.max(0.2, 1 - extraRotations / (puzzle.size * 2));
    setResult({
      accuracy,
      detail: `Target reached in ${rotations} ${rotations === 1 ? "rotation" : "rotations"}.`,
    });
  };

  const board = (
    <GameBoard label="Prismatic">
      <g transform={`translate(${GRID_X} ${GRID_Y}) scale(${GRID_SIZE / puzzle.size})`}>
        <polyline
          points={beam.points.map((point) => `${point.x},${point.y}`).join(" ")}
          className={`prism-beam${beam.reached ? " reached" : ""}`}
        />
        {Array.from({ length: puzzle.size * puzzle.size }, (_, index) => {
          const x = index % puzzle.size;
          const y = Math.floor(index / puzzle.size);
          const mirrorIndex = puzzle.mirrors.findIndex((mirror) => mirror.x === x && mirror.y === y);
          const orientation = mirrorIndex >= 0 ? orientations[mirrorIndex] : null;
          return (
            <g
              key={`${x},${y}`}
              className={mirrorIndex >= 0 ? "prism-mirror-control" : undefined}
              role={mirrorIndex >= 0 ? "button" : undefined}
              tabIndex={mirrorIndex >= 0 && !result ? 0 : undefined}
              aria-label={mirrorIndex >= 0 ? `Mirror, row ${y + 1}, column ${x + 1}, ${orientation === 0 ? "slash" : "backslash"}. Rotate 90 degrees.` : undefined}
              aria-pressed={mirrorIndex >= 0 ? orientation === 1 : undefined}
              onClick={mirrorIndex >= 0 ? () => rotateMirror(mirrorIndex) : undefined}
              onKeyDown={mirrorIndex >= 0 ? (event) => {
                if (event.key === "Enter" || event.key === " ") {
                  event.preventDefault();
                  rotateMirror(mirrorIndex);
                }
              } : undefined}
            >
              <rect x={x} y={y} width="1" height="1" className="prism-cell" />
              {mirrorIndex >= 0 && (
                <>
                  <rect x={x + 0.13} y={y + 0.13} width="0.74" height="0.74" className="prism-mirror-tile" />
                  <line
                    x1={x + (orientation === 0 ? 0.26 : 0.74)}
                    y1={y + 0.26}
                    x2={x + (orientation === 0 ? 0.74 : 0.26)}
                    y2={y + 0.74}
                    className="prism-mirror"
                  />
                </>
              )}
            </g>
          );
        })}
        <circle cx="-0.08" cy={puzzle.startRow + 0.5} r="0.11" className="prism-source" />
        <circle cx={puzzle.size + 0.08} cy={puzzle.targetRow + 0.5} r="0.19" className={`prism-target${beam.reached ? " lit" : ""}`} />
        <rect x="0" y="0" width={puzzle.size} height={puzzle.size} className="prism-grid-border" />
      </g>
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
        {started
          ? <>Rotate the mirrors to guide the <strong>beam into the target</strong>.</>
          : <>Turn the mirrors to route the <strong>beam into the target</strong>.</>}
      </p>
      {board}
      <p className="prism-status" aria-live="polite">
        {hint || (started
          ? beam.reached ? "Target reached. Check your path." : `${rotations} ${rotations === 1 ? "rotation" : "rotations"}`
          : `${puzzle.size}×${puzzle.size} grid · tap a mirror to rotate it`)}
      </p>
      <button
        type="button"
        className="primary-button"
        data-start={!started ? "" : undefined}
        onClick={() => {
          if (!started) {
            setStarted(true);
            return;
          }
          checkPath();
        }}
      >
        {started ? "Check path" : "Start"}
      </button>
    </div>
  );
}
