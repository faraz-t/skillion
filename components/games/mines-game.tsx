"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { makeRng } from "@/lib/skillion";
import { boardPoint, Countdown, GameBoard } from "./game-board";
import { GameResult } from "./game-result";
import type { GameProps, Outcome } from "./types";

type Cell = { r: number; c: number };
type Phase = "ready" | "showing" | "drawing" | "done";

const same = (a: Cell, b: Cell) => a.r === b.r && a.c === b.c;
const key = (cell: Cell) => `${cell.r},${cell.c}`;
const ORIGIN_X = 0;
const ORIGIN_Y = 0;
const SPAN = 360;

/**
 * Carve a winding safe path from start to flag. Every cell gets a random cost and we
 * run Dijkstra over them, so the guaranteed route wanders instead of hugging an edge.
 */
function carveRoute(n: number, start: Cell, flag: Cell, rng: () => number): Cell[] {
  const cost = Array.from({ length: n * n }, () => 1 + rng() * 9);
  const dist = new Array<number>(n * n).fill(Infinity);
  const prev = new Array<number>(n * n).fill(-1);
  const done = new Array<boolean>(n * n).fill(false);
  const idx = (cell: Cell) => cell.r * n + cell.c;
  dist[idx(start)] = 0;
  for (let step = 0; step < n * n; step += 1) {
    let u = -1;
    for (let i = 0; i < n * n; i += 1) if (!done[i] && (u === -1 || dist[i] < dist[u])) u = i;
    if (u === -1 || dist[u] === Infinity) break;
    done[u] = true;
    if (u === idx(flag)) break;
    const r = Math.floor(u / n);
    const c = u % n;
    for (const [dr, dc] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const nr = r + dr;
      const nc = c + dc;
      if (nr < 0 || nr >= n || nc < 0 || nc >= n) continue;
      const v = nr * n + nc;
      if (dist[u] + cost[v] < dist[v]) {
        dist[v] = dist[u] + cost[v];
        prev[v] = u;
      }
    }
  }
  const route: Cell[] = [];
  for (let at = idx(flag); at !== -1; at = prev[at]) route.push({ r: Math.floor(at / n), c: at % n });
  return route.reverse();
}

export default function MinesGame({ difficulty, seed, maxPoints, onComplete }: GameProps) {
  const n = 12 + difficulty; // 12x12 up to 16x16
  const size = SPAN / n;
  const flashFor = 3.2 - difficulty * 0.2;

  const layout = useMemo(() => {
    const rng = makeRng(`${seed}:mines:${difficulty}`);
    const start: Cell = { r: n - 1, c: 0 };
    const flag: Cell = { r: 0, c: n - 1 };
    // Mines go down first, everywhere. Then a random winding route is carved through
    // them, which guarantees the board is solvable without a predictable safe edge.
    const density = 0.4 + difficulty * 0.03;
    const mines = new Set<string>();
    for (let r = 0; r < n; r += 1) {
      for (let c = 0; c < n; c += 1) {
        if (rng() < density) mines.add(`${r},${c}`);
      }
    }
    const route = carveRoute(n, start, flag, rng);
    route.forEach((cell) => mines.delete(key(cell)));
    return { start, flag, route, mines };
  }, [n, seed, difficulty]);

  const [phase, setPhase] = useState<Phase>("ready");
  const [path, setPath] = useState<Cell[]>([layout.start]);
  const [blast, setBlast] = useState<Cell | null>(null);
  const [result, setResult] = useState<Outcome | null>(null);
  const pathRef = useRef<Cell[]>([layout.start]);
  const dragging = useRef(false);
  const timers = useRef<number[]>([]);

  useEffect(() => {
    const pending = timers.current;
    return () => pending.forEach((id) => window.clearTimeout(id));
  }, []);

  const center = (cell: Cell) => ({
    x: ORIGIN_X + (cell.c + 0.5) * size,
    y: ORIGIN_Y + (cell.r + 0.5) * size,
  });

  const finish = (final: Cell[], boom: Cell | null) => {
    setPhase("done");
    dragging.current = false;
    if (boom) setBlast(boom);
    const traveled = Math.max(0, final.length - 1);
    const totalDistance =
      Math.abs(layout.flag.r - layout.start.r) +
      Math.abs(layout.flag.c - layout.start.c);
    const reachedFlag = same(final[final.length - 1], layout.flag);
    const pointOfDeath = boom ?? final[final.length - 1];
    const distanceToFlag =
      Math.abs(layout.flag.r - pointOfDeath.r) +
      Math.abs(layout.flag.c - pointOfDeath.c);
    const accuracy = reachedFlag ? 1 : Math.max(0, 1 - distanceToFlag / totalDistance);
    const traveledText = `${traveled} ${traveled === 1 ? "tile" : "tiles"}`;
    const distanceText = `${distanceToFlag} ${distanceToFlag === 1 ? "tile" : "tiles"}`;
    const detail = reachedFlag
      ? `You reached the flag after ${traveledText}.`
      : boom
        ? `Boom! You were ${distanceText} from the flag when you hit a mine.`
        : `You stopped ${distanceText} from the flag.`;
    timers.current.push(window.setTimeout(() => setResult({ accuracy, detail }), boom ? 900 : 450));
  };

  const startFlash = () => {
    setPhase("showing");
    timers.current.push(window.setTimeout(() => setPhase("drawing"), flashFor * 1000));
  };

  const extend = (event: React.PointerEvent<SVGSVGElement>) => {
    const p = boardPoint(event.currentTarget, event);
    const target: Cell = {
      r: Math.floor((p.y - ORIGIN_Y) / size),
      c: Math.floor((p.x - ORIGIN_X) / size),
    };
    if (target.r < 0 || target.r >= n || target.c < 0 || target.c >= n) return;
    const next = [...pathRef.current];
    let boom: Cell | null = null;
    for (let guard = 0; guard < 40 && !same(next[next.length - 1], target); guard += 1) {
      const cur = next[next.length - 1];
      const dr = target.r - cur.r;
      const dc = target.c - cur.c;
      const step: Cell = Math.abs(dr) >= Math.abs(dc)
        ? { r: cur.r + Math.sign(dr), c: cur.c }
        : { r: cur.r, c: cur.c + Math.sign(dc) };
      if (next.length >= 2 && same(step, next[next.length - 2])) {
        next.pop(); // dragging back over the path undoes it
        continue;
      }
      if (next.some((cell) => same(cell, step))) break;
      if (layout.mines.has(key(step))) {
        boom = step;
        break;
      }
      next.push(step);
      if (same(step, layout.flag)) break;
    }
    pathRef.current = next;
    setPath(next);
    if (boom) finish(next, boom);
    else if (same(next[next.length - 1], layout.flag)) finish(next, null);
  };

  const showMines = phase === "showing" || phase === "done" || Boolean(result);
  const head = center(path[path.length - 1]);

  const board = (
    <GameBoard
      label="Minefield"
      onPointerDown={phase === "drawing" ? (event) => {
        event.currentTarget.setPointerCapture(event.pointerId);
        const p = boardPoint(event.currentTarget, event);
        // Only pick the line up when the press is close to its current end.
        if (Math.hypot(p.x - head.x, p.y - head.y) <= Math.max(size * 1.6, 28)) {
          dragging.current = true;
          extend(event);
        }
      } : undefined}
      onPointerMove={phase === "drawing" ? (event) => {
        if (dragging.current && event.buttons) extend(event);
      } : undefined}
      onPointerUp={() => { dragging.current = false; }}
    >
      {Array.from({ length: n * n }, (_, i) => {
        const cell = { r: Math.floor(i / n), c: i % n };
        const isMine = layout.mines.has(key(cell));
        const { x, y } = center(cell);
        return (
          <g key={i}>
            <rect
              x={x - size / 2}
              y={y - size / 2}
              width={size}
              height={size}
              className={`mine-cell${same(cell, layout.start) ? " start" : ""}`}
            />
            {isMine && showMines && (
              <g className="bomb">
                <circle cx={x} cy={y} r={size * 0.24} />
                <line x1={x - size * 0.34} y1={y} x2={x + size * 0.34} y2={y} />
                <line x1={x} y1={y - size * 0.34} x2={x} y2={y + size * 0.34} />
              </g>
            )}
          </g>
        );
      })}
      {(() => {
        const flag = center(layout.flag);
        return <text x={flag.x} y={flag.y + size * 0.25} textAnchor="middle" className="start-text" fontSize={size * 0.7}>⚑</text>;
      })()}
      {result && layout.route.length > 1 && (
        <polyline
          points={layout.route.map((cell) => `${center(cell).x},${center(cell).y}`).join(" ")}
          className="safe-route"
        />
      )}
      {(() => {
        const s = center(layout.start);
        return <text x={s.x} y={s.y + 5} textAnchor="middle" className="start-text">{path.length === 1 ? "▲" : ""}</text>;
      })()}
      {path.length > 1 && (
        <polyline points={path.map((cell) => `${center(cell).x},${center(cell).y}`).join(" ")} className="board-path" />
      )}
      {phase === "drawing" && <circle cx={head.x} cy={head.y} r={size * 0.2} className="board-accent-dot head-pulse" />}
      {blast && (
        <g className="blast">
          <circle cx={center(blast).x} cy={center(blast).y} r={size * 0.42} />
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
        {phase === "showing" && <>Memorize where the mines are…</>}
        {phase === "drawing" && <>Travel to the top-right flag. Don’t hit a mine.</>}
        {phase === "done" && <>{blast ? "Boom." : "Done."}</>}
      </p>
      {phase === "showing" ? <Countdown seconds={flashFor} /> : <div className="countdown idle" aria-hidden="true" />}
      {board}
      <button
        type="button"
        className="primary-button"
        data-start={phase === "ready" ? "" : undefined}
        disabled={phase === "showing" || phase === "done"}
        onClick={() => (phase === "ready" ? startFlash() : finish(pathRef.current, null))}
      >
        {phase === "ready" ? "Reveal the mines" : phase === "drawing" ? "Stop here" : "…"}
      </button>
    </div>
  );
}
