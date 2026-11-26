"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { makeRng } from "@/lib/skillion";
import { GameBoard } from "./game-board";
import { GameResult } from "./game-result";
import type { GameProps, Outcome, Point } from "./types";

/**
 * Directions are 0 = right, 1 = down, 2 = left, 3 = up (y grows downward, like the screen).
 * Orientation 0 is a "/" mirror and orientation 1 is a "\" mirror.
 */
type Direction = 0 | 1 | 2 | 3;
type Orientation = 0 | 1;
type Mirror = { x: number; y: number; orientation: Orientation };
type Cell = { x: number; y: number };
type Puzzle = {
  size: number;
  startRow: number;
  targetRow: number;
  /** The mirrors as the player first sees them (every mirror on the route starts wrong). */
  mirrors: Mirror[];
  /** The orientation each mirror needs for the route to work (decoys are simply left as they are). */
  solved: Orientation[];
  /** Fewest rotations that can solve it: one per mirror on the route. */
  par: number;
};

const DX = [1, 0, -1, 0];
const DY = [0, 1, 0, -1];
// What a beam travelling in direction [i] turns into after hitting each kind of mirror.
//   "/"  sends right -> up, down -> left, left -> down, up -> right
//   "\"  sends right -> down, down -> right, left -> up, up -> left
const REFLECTIONS: Record<Orientation, Direction[]> = {
  0: [3, 2, 1, 0],
  1: [1, 0, 3, 2],
};

// Board layout (game space is 360 wide; the grid is centred on y = 180 like the other games).
const GRID_X = 40;
const GRID_Y = 46;
const GRID_SIZE = 280;
const PORT_GAP = 18; // distance from the grid edge to the emitter / target centre
const TARGET_R = 9;
const LOCK_DELAY = 750; // ms the green beam is shown before the result appears

function mirrorFor(incoming: Direction, outgoing: Direction): Orientation | null {
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
      const pathMirrors = new Map<string, Orientation>();
      let targetRow = startRow;

      // Random self-avoiding walk from the left edge to the right edge.
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
      const solved: Orientation[] = [];
      for (const [key, solution] of pathMirrors) {
        const [x, y] = key.split(",").map(Number);
        mirrors.push({ x, y, orientation: (1 - solution) as Orientation });
        solved.push(solution);
      }

      const candidates: Cell[] = [];
      for (let y = 0; y < size; y += 1) {
        for (let x = 0; x < size; x += 1) {
          if (!routeCells.has(`${x},${y}`)) candidates.push({ x, y });
        }
      }
      for (let i = candidates.length - 1; i > 0; i -= 1) {
        const j = Math.floor(rng() * (i + 1));
        [candidates[i], candidates[j]] = [candidates[j], candidates[i]];
      }
      for (const cell of candidates.slice(0, decoys)) {
        const orientation: Orientation = rng() < 0.5 ? 0 : 1;
        mirrors.push({ ...cell, orientation });
        solved.push(orientation);
      }

      return { size, startRow, targetRow, mirrors, solved, par: pathMirrors.size };
    }
  }

  throw new Error("Unable to generate a solvable prism puzzle.");
}

type Trace = {
  /** Beam polyline in board coordinates, from the emitter to wherever it ends. */
  points: Point[];
  reached: boolean;
  loop: boolean;
  /** Where a beam that left the grid in the wrong place came out. */
  miss: Point | null;
};

function traceBeam(puzzle: Puzzle, orientations: Orientation[]): Trace {
  const { size, startRow, targetRow } = puzzle;
  const cell = GRID_SIZE / size;
  const mirrorAt = new Map(puzzle.mirrors.map((mirror, i) => [`${mirror.x},${mirror.y}`, orientations[i]]));
  const visited = new Set<string>();
  const centre = (x: number, y: number): Point => ({ x: GRID_X + (x + 0.5) * cell, y: GRID_Y + (y + 0.5) * cell });
  const points: Point[] = [{ x: GRID_X - PORT_GAP, y: GRID_Y + (startRow + 0.5) * cell }];

  let x = 0;
  let y = startRow;
  let direction: Direction = 0;

  for (let step = 0; step < size * size * 4 + 4; step += 1) {
    if (x < 0 || x >= size || y < 0 || y >= size) {
      // The beam has left the grid. Back up to the cell it left from and run it out to the edge.
      const lastX = x - DX[direction];
      const lastY = y - DY[direction];
      const from = centre(lastX, lastY);
      const edge = { x: from.x + DX[direction] * cell * 0.5, y: from.y + DY[direction] * cell * 0.5 };
      if (x === size && y === targetRow) {
        points.push(edge, { x: GRID_X + GRID_SIZE + PORT_GAP, y: edge.y });
        return { points, reached: true, loop: false, miss: null };
      }
      points.push(edge);
      return { points, reached: false, loop: false, miss: edge };
    }

    const key = `${x},${y},${direction}`;
    if (visited.has(key)) return { points, reached: false, loop: true, miss: null };
    visited.add(key);

    points.push(centre(x, y));
    const orientation = mirrorAt.get(`${x},${y}`);
    if (orientation !== undefined) direction = REFLECTIONS[orientation][direction];
    x += DX[direction];
    y += DY[direction];
  }

  return { points, reached: false, loop: true, miss: null };
}

export default function PrismaticGame({ difficulty, seed, maxPoints, onComplete }: GameProps) {
  const puzzle = useMemo(() => makePuzzle(difficulty, seed), [difficulty, seed]);
  const { size, par } = puzzle;
  const cell = GRID_SIZE / size;

  // Each mirror remembers how many quarter-turns it has had. The angle is derived from that, so a
  // mirror always spins the same way (clockwise) and the CSS transition shows a real 90° turn.
  const [turns, setTurns] = useState<number[]>(() => puzzle.mirrors.map((mirror) => mirror.orientation));
  const [rotations, setRotations] = useState(0);
  const [confirmingGiveUp, setConfirmingGiveUp] = useState(false);
  const [result, setResult] = useState<Outcome | null>(null);
  const giveUpTimer = useRef<number | null>(null);

  const orientations = turns.map((count) => (count % 2) as Orientation);
  const beam = traceBeam(puzzle, orientations);
  const solvedNow = beam.reached && rotations > 0;

  useEffect(() => () => {
    if (giveUpTimer.current !== null) window.clearTimeout(giveUpTimer.current);
  }, []);

  // As soon as the beam lands in the target, hold the green beam for a beat, then score it.
  useEffect(() => {
    if (!solvedNow || result) return;
    const timeout = window.setTimeout(() => {
      const extra = Math.max(0, rotations - par);
      const accuracy = Math.max(0.2, 1 - extra / (size * 2));
      setResult({
        accuracy,
        detail: extra === 0
          ? `Target reached in ${rotations} ${rotations === 1 ? "rotation" : "rotations"}, the fewest possible.`
          : `Target reached in ${rotations} rotations. The fewest possible was ${par}.`,
      });
    }, LOCK_DELAY);
    return () => window.clearTimeout(timeout);
  }, [solvedNow, result, rotations, par, size]);

  const rotateMirror = (index: number) => {
    if (result) return;
    setTurns((current) => current.map((count, i) => (i === index ? count + 1 : count)));
    setRotations((count) => count + 1);
    setConfirmingGiveUp(false);
  };

  const giveUp = () => {
    if (result) return;
    if (!confirmingGiveUp) {
      setConfirmingGiveUp(true);
      if (giveUpTimer.current !== null) window.clearTimeout(giveUpTimer.current);
      giveUpTimer.current = window.setTimeout(() => setConfirmingGiveUp(false), 2500);
      return;
    }
    // Show the answer on the result board: turn every wrong mirror once more.
    setTurns((current) => current.map((count, i) => (count % 2 === puzzle.solved[i] ? count : count + 1)));
    setResult({ accuracy: 0, detail: "You gave up. Here is the route the beam needed." });
  };

  const portY = GRID_Y + (puzzle.startRow + 0.5) * cell;
  const targetY = GRID_Y + (puzzle.targetRow + 0.5) * cell;
  const lit = beam.reached;
  const beamPoints = beam.points.map((point) => `${point.x.toFixed(1)},${point.y.toFixed(1)}`).join(" ");
  const bar = cell * 0.3; // half-length of a mirror

  const board = (
    <GameBoard label="Prismatic">
      <text x="30" y="24" className="board-hud">MOVES {rotations}</text>
      <text x="330" y="24" textAnchor="end" className="board-hud">PAR {par}</text>

      {Array.from({ length: size * size }, (_, index) => {
        const x = index % size;
        const y = Math.floor(index / size);
        return (
          <rect key={`${x},${y}`} x={GRID_X + x * cell} y={GRID_Y + y * cell} width={cell} height={cell} className="prism-cell" />
        );
      })}
      <rect x={GRID_X} y={GRID_Y} width={GRID_SIZE} height={GRID_SIZE} className="prism-frame" />

      <polyline points={beamPoints} className={`prism-beam-soft${lit ? " reached" : ""}`} />
      <polyline points={beamPoints} className={`prism-beam${lit ? " reached" : ""}`} />

      {puzzle.mirrors.map((mirror, index) => {
        const orientation = orientations[index];
        const cx = GRID_X + (mirror.x + 0.5) * cell;
        const cy = GRID_Y + (mirror.y + 0.5) * cell;
        const angle = -45 + 90 * turns[index];
        return (
          <g
            key={`${mirror.x},${mirror.y}`}
            className="prism-mirror-control"
            role="button"
            tabIndex={result ? -1 : 0}
            aria-label={`Mirror, row ${mirror.y + 1}, column ${mirror.x + 1}, ${orientation === 0 ? "slash" : "backslash"}. Rotate 90 degrees.`}
            onClick={() => rotateMirror(index)}
            onKeyDown={(event) => {
              if (event.key === "Enter" || event.key === " ") {
                event.preventDefault();
                rotateMirror(index);
              }
            }}
          >
            <rect
              x={GRID_X + mirror.x * cell + cell * 0.1}
              y={GRID_Y + mirror.y * cell + cell * 0.1}
              width={cell * 0.8}
              height={cell * 0.8}
              className="prism-mirror-tile"
            />
            <g className="prism-mirror" style={{ transform: `translate(${cx}px, ${cy}px) rotate(${angle}deg)` }}>
              <line x1={-bar} y1="0" x2={bar} y2="0" className="prism-mirror-bar" />
            </g>
          </g>
        );
      })}

      {beam.miss && (
        <g className="prism-miss" transform={`translate(${beam.miss.x} ${beam.miss.y})`}>
          <path d="M-5 -5L5 5M5 -5L-5 5" />
        </g>
      )}

      <rect x={GRID_X - PORT_GAP - 5} y={portY - 5} width="10" height="10" className="prism-source" />
      <circle cx={GRID_X + GRID_SIZE + PORT_GAP} cy={targetY} r={TARGET_R} className={`prism-target${lit ? " lit" : ""}`} />
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
        Tap the mirrors to <strong>rotate</strong> them. Guide the <strong>beam into the target</strong>.
      </p>
      {board}
      {/* A run can't be restarted or closed, so a stuck player needs a way out. */}
      <div className="button-row single">
        <button type="button" className="secondary-button" onClick={giveUp}>
          {confirmingGiveUp ? "Tap again to give up" : "Give up"}
        </button>
      </div>
    </div>
  );
}
