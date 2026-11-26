"use client";

import { useEffect, useReducer, useRef, useState } from "react";
import { clamp, GameBoard } from "./game-board";
import { GameResult } from "./game-result";
import type { GameProps, Outcome } from "./types";

const FIELD_WIDTH = 13; // lane width, in blocks
const MAX_DROPS = 10; // rows to stack to reach the top
const UNIT = 24; // px per block
const FIELD_X = (360 - FIELD_WIDTH * UNIT) / 2;
const FIELD_Y = 48;
const START_WIDTH = 7;
const BASE_ROW = MAX_DROPS;
const PERFECT = 0.15; // a drop this close to dead-centre snaps into place and costs no width

// The tower goes green -> red as it climbs, like the row locks on the grid.
const PALETTE = ["#77a75b", "#9aa75c", "#c0a45c", "#b87550", "#96483f"];
function layerColor(index: number) {
  const x = clamp(index / MAX_DROPS, 0, 1) * (PALETTE.length - 1);
  const i = Math.min(PALETTE.length - 2, Math.floor(x));
  const f = x - i;
  const a = PALETTE[i].match(/\w\w/g)!.map((h) => parseInt(h, 16));
  const b = PALETTE[i + 1].match(/\w\w/g)!.map((h) => parseInt(h, 16));
  return `rgb(${a.map((v, k) => Math.round(v + (b[k] - v) * f)).join(",")})`;
}

type Layer = { x: number; width: number; perfect: boolean };
type Debris = { x: number; width: number; row: number; drop: number; vy: number; life: number; color: string };
type Sim = {
  tower: Layer[];
  x: number;
  dir: 1 | -1;
  moving: boolean;
  done: boolean;
  perfects: number;
  debris: Debris[];
  failedX: number | null;
};

function accuracyFor(height: number, width: number) {
  const widthRatio = width / START_WIDTH;
  if (height >= MAX_DROPS) {
    return 0.55 + 0.45 * widthRatio ** 2;
  }
  const progress = height / MAX_DROPS;
  return 0.5 * progress ** 3 * widthRatio ** 1.5;
}

export default function PillarGame({ difficulty, maxPoints, onComplete }: GameProps) {
  const sim = useRef<Sim>({
    tower: [{ x: (FIELD_WIDTH - START_WIDTH) / 2, width: START_WIDTH, perfect: false }],
    x: 0,
    dir: 1,
    moving: false,
    done: false,
    perfects: 0,
    debris: [],
    failedX: null,
  });
  const [phase, setPhase] = useState<"ready" | "running" | "done">("ready");
  const [result, setResult] = useState<Outcome | null>(null);
  const [, redraw] = useReducer((n: number) => n + 1, 0);
  const frame = useRef<number | null>(null);
  const phaseRef = useRef(phase);
  phaseRef.current = phase;

  useEffect(() => () => {
    if (frame.current !== null) cancelAnimationFrame(frame.current);
    frame.current = null;
  }, []);

  /** One loop drives the sliding block and the falling off-cuts, and stops once nothing is moving. */
  const run = () => {
    if (frame.current !== null) return;
    let last = performance.now();
    const tick = (now: number) => {
      const dt = Math.min(0.05, (now - last) / 1000);
      last = now;
      const s = sim.current;

      if (s.moving) {
        const top = s.tower[s.tower.length - 1];
        const height = s.tower.length - 1;
        const speed = 6 + difficulty * 1.1 + height * 0.55;
        const maxX = FIELD_WIDTH - top.width;
        let next = s.x + s.dir * speed * dt;
        if (next >= maxX) {
          next = maxX;
          s.dir = -1;
        } else if (next <= 0) {
          next = 0;
          s.dir = 1;
        }
        s.x = next;
      }

      for (const piece of s.debris) {
        piece.vy += 70 * dt;
        piece.drop += piece.vy * dt;
        piece.life -= dt * 1.8;
      }
      s.debris = s.debris.filter((piece) => piece.life > 0);

      redraw();
      if (s.moving || s.debris.length > 0) {
        frame.current = requestAnimationFrame(tick);
      } else {
        frame.current = null;
      }
    };
    frame.current = requestAnimationFrame(tick);
  };

  const begin = () => {
    if (phaseRef.current !== "ready") return;
    const s = sim.current;
    s.moving = true;
    s.x = 0;
    s.dir = 1;
    setPhase("running");
    run();
  };

  const finish = (height: number, width: number, won: boolean) => {
    const s = sim.current;
    s.moving = false;
    s.done = true;
    const accuracy = accuracyFor(height, width);
    const perfects = s.perfects > 0 ? ` ${s.perfects} perfect ${s.perfects === 1 ? "drop" : "drops"}.` : "";
    setPhase("done");
    setResult({
      accuracy,
      detail: won
        ? `You reached the top with a ${width.toFixed(2)} block wide tower.`
        : `The tower fell at height ${height}. Its top row was ${width.toFixed(2)} blocks wide.${perfects}`,
    });
    redraw();
  };

  const drop = () => {
    const s = sim.current;
    if (!s.moving || s.done) return;

    const previous = s.tower[s.tower.length - 1];
    const height = s.tower.length - 1;
    const width = previous.width;
    const x = clamp(s.x, 0, FIELD_WIDTH - width);
    const row = BASE_ROW - s.tower.length;
    const left = Math.max(x, previous.x);
    const right = Math.min(x + width, previous.x + previous.width);
    const overlap = right - left;

    if (overlap <= 0) {
      s.failedX = x;
      finish(height, width, false);
      return;
    }

    const nextHeight = height + 1;
    const color = layerColor(nextHeight);
    if (Math.abs(x - previous.x) <= PERFECT) {
      s.tower.push({ x: previous.x, width, perfect: true });
      s.perfects += 1;
    } else {
      s.tower.push({ x: left, width: overlap, perfect: false });
      // The overhang falls away. Only one side can overhang, since both rows are the same width.
      const cutX = x < previous.x ? x : right;
      s.debris.push({ x: cutX, width: width - overlap, row, drop: 0, vy: 0, life: 1, color });
    }

    if (nextHeight >= MAX_DROPS) {
      finish(nextHeight, s.tower[s.tower.length - 1].width, true);
      return;
    }

    // Each new row enters from the side the last one didn't.
    const newWidth = s.tower[s.tower.length - 1].width;
    const fromRight = nextHeight % 2 === 1;
    s.x = fromRight ? FIELD_WIDTH - newWidth : 0;
    s.dir = fromRight ? -1 : 1;
    redraw();
    run();
  };

  // Tap, Space, Enter or the down arrow all drop the row. Before the run starts they start it.
  const act = () => {
    if (phaseRef.current === "ready") begin();
    else if (phaseRef.current === "running") drop();
  };

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.repeat) return;
      if (event.code === "Space" || event.key === "Enter" || event.key === "ArrowDown") {
        event.preventDefault();
        act();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
    // act() only touches refs, so registering once is enough.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const s = sim.current;
  const top = s.tower[s.tower.length - 1];
  const height = s.tower.length - 1;
  const nextRow = BASE_ROW - s.tower.length;
  const laneRight = FIELD_X + FIELD_WIDTH * UNIT;
  const guideBottom = FIELD_Y + (nextRow + 1) * UNIT;

  const board = (
    <GameBoard label="Pillar" onPointerDown={phase === "done" ? undefined : act}>
      <text x="30" y="24" className="board-hud">HEIGHT {height}/{MAX_DROPS}</text>
      <text x="330" y="24" textAnchor="end" className="board-hud">WIDTH {top.width.toFixed(2)}/{START_WIDTH}</text>

      <rect x={FIELD_X} y={FIELD_Y} width={FIELD_WIDTH * UNIT} height={MAX_DROPS * UNIT} className="pillar-lane" />
      <line x1={FIELD_X} y1={FIELD_Y} x2={laneRight} y2={FIELD_Y} className="pillar-goal" />
      <line x1={FIELD_X} y1={FIELD_Y + MAX_DROPS * UNIT} x2={laneRight} y2={FIELD_Y + MAX_DROPS * UNIT} className="pillar-ground" />

      {/* Faint rails up from the top row, so the gap to line up with is easy to see. */}
      {!s.done && (
        <>
          <line x1={FIELD_X + top.x * UNIT} x2={FIELD_X + top.x * UNIT} y1={FIELD_Y} y2={guideBottom} className="pillar-guide" />
          <line x1={FIELD_X + (top.x + top.width) * UNIT} x2={FIELD_X + (top.x + top.width) * UNIT} y1={FIELD_Y} y2={guideBottom} className="pillar-guide" />
        </>
      )}

      {s.tower.map((layer, index) => (
        <rect
          key={index}
          x={FIELD_X + layer.x * UNIT}
          y={FIELD_Y + (BASE_ROW - index) * UNIT}
          width={layer.width * UNIT}
          height={UNIT}
          className={`pillar-block${layer.perfect && phase !== "done" ? " perfect" : ""}`}
          style={{ fill: layerColor(index) }}
        />
      ))}

      {s.debris.map((piece, index) => (
        <rect
          key={index}
          x={FIELD_X + piece.x * UNIT}
          y={FIELD_Y + (piece.row + piece.drop) * UNIT}
          width={piece.width * UNIT}
          height={UNIT}
          className="pillar-debris"
          style={{ fill: piece.color, opacity: clamp(piece.life, 0, 1) * 0.8 }}
        />
      ))}

      {s.failedX !== null && (
        <rect
          x={FIELD_X + s.failedX * UNIT}
          y={FIELD_Y + nextRow * UNIT}
          width={top.width * UNIT}
          height={UNIT}
          className="pillar-block failed"
        />
      )}
      {s.moving && !s.done && (
        <rect
          x={FIELD_X + s.x * UNIT}
          y={FIELD_Y + nextRow * UNIT}
          width={top.width * UNIT}
          height={UNIT}
          className="pillar-block moving"
        />
      )}

      {phase === "ready" && (
        <text x="180" y={FIELD_Y + nextRow * UNIT + UNIT / 2 + 4} className="pillar-hint">TAP TO START</text>
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
        Tap to <strong>drop</strong> the sliding row. <strong>Overhangs are cut off</strong>; miss completely and the run ends.
      </p>
      {board}
      <button type="button" data-start hidden onClick={begin} tabIndex={-1}>Start</button>
    </div>
  );
}
