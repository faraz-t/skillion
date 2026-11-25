"use client";

import { useEffect, useReducer, useRef, useState } from "react";
import { BOARD_TOP, clamp, GameBoard, VIEW_HEIGHT } from "./game-board";
import { GameResult } from "./game-result";
import type { GameProps, Outcome } from "./types";

const W = 360;
const VIEW_TOP = -BOARD_TOP;
const VIEW_BOTTOM = VIEW_TOP + VIEW_HEIGHT;
const CY = 180; // centre line of the tunnel
const START_GAP = 250; // gap between roof and ground at the very start
const END_GAP = 22; // gap at which the run counts as "through"
const SHIP_X = 96; // the ship stays here; the tunnel scrolls past it
const R = 5.5; // ship collision radius
const ACCEL = 900; // vertical acceleration while holding (up) / released (down)
const V_MAX = 190;
const COUNTDOWN = 1.65; // seconds of 3-2-1 before the ship is live

// Walls go green -> red as the tunnel closes, like the row locks on the grid.
const PALETTE = ["#77a75b", "#9aa75c", "#c0a45c", "#b87550", "#96483f"];
function wallColor(t: number) {
  const x = clamp(t, 0, 1) * (PALETTE.length - 1);
  const i = Math.min(PALETTE.length - 2, Math.floor(x));
  const f = x - i;
  const a = PALETTE[i].match(/\w\w/g)!.map((h) => parseInt(h, 16));
  const b = PALETTE[i + 1].match(/\w\w/g)!.map((h) => parseInt(h, 16));
  return `rgb(${a.map((v, k) => Math.round(v + (b[k] - v) * f)).join(",")})`;
}

type Sim = {
  y: number;
  vy: number;
  d: number; // distance travelled through the tunnel
  hold: boolean;
  trail: Array<{ x: number; y: number }>;
  t: number; // seconds since begin
  crashed: boolean;
};

export default function ConvergenceGame({ difficulty, maxPoints, onComplete }: GameProps) {
  const speed = 125 + difficulty * 8;
  const slope = 0.085 + difficulty * 0.009; // each wall moves in this many px per px travelled
  const dRef = (START_GAP - END_GAP) / (2 * slope);
  const dFull = START_GAP / (2 * slope);
  const halfGap = (dist: number) => Math.max(0, START_GAP - 2 * slope * Math.max(0, dist)) / 2;

  const sim = useRef<Sim>({ y: CY, vy: 0, d: 0, hold: false, trail: [], t: 0, crashed: false });
  const [phase, setPhase] = useState<"ready" | "running" | "done">("ready");
  const [result, setResult] = useState<Outcome | null>(null);
  const [, redraw] = useReducer((n: number) => n + 1, 0);
  const frame = useRef<number | null>(null);
  const phaseRef = useRef(phase);
  phaseRef.current = phase;

  useEffect(() => () => {
    if (frame.current !== null) cancelAnimationFrame(frame.current);
  }, []);

  // Space / up arrow / W also fly the ship.
  useEffect(() => {
    const set = (down: boolean) => (event: KeyboardEvent) => {
      if (event.code === "Space" || event.key === "ArrowUp" || event.key.toLowerCase() === "w") {
        event.preventDefault();
        sim.current.hold = down;
      }
    };
    const down = set(true);
    const up = set(false);
    window.addEventListener("keydown", down);
    window.addEventListener("keyup", up);
    return () => {
      window.removeEventListener("keydown", down);
      window.removeEventListener("keyup", up);
    };
  }, []);

  const finish = (survived: number, won: boolean) => {
    const progress = clamp(survived / dRef, 0, 1);
    const accuracy = won ? 1 : Math.pow(progress, 2.2);
    setPhase("done");
    setResult({
      accuracy,
      detail: won
        ? "You made it all the way through the tunnel!"
        : `You crashed ${Math.round(progress * 100)}% of the way to the end.`,
    });
  };

  const begin = () => {
    if (phaseRef.current !== "ready") return;
    setPhase("running");
    let last = performance.now();
    const tick = (now: number) => {
      const dt = Math.min(0.032, (now - last) / 1000);
      last = now;
      const s = sim.current;
      s.t += dt;

      if (s.t >= COUNTDOWN) {
        s.vy = clamp(s.vy + (s.hold ? -ACCEL : ACCEL) * dt, -V_MAX, V_MAX);
        s.y += s.vy * dt;
        s.d += speed * dt;

        for (const p of s.trail) p.x -= speed * dt;
        while (s.trail.length && s.trail[0].x < -10) s.trail.shift();
        s.trail.push({ x: SHIP_X, y: s.y });

        const half = halfGap(s.d + R * 0.8);
        if (s.y - R < CY - half || s.y + R > CY + half) {
          s.crashed = true;
          redraw();
          finish(s.d, false);
          return;
        }
        if (s.d >= dRef) {
          redraw();
          finish(s.d, true);
          return;
        }
      }
      redraw();
      frame.current = requestAnimationFrame(tick);
    };
    frame.current = requestAnimationFrame(tick);
  };

  const s = sim.current;
  const progress = clamp(s.d / dRef, 0, 1);
  const counting = phase === "running" && s.t < COUNTDOWN;

  // ---- tunnel geometry for the current frame (screen x -> wall y) ----
  const wallHalf = (x: number) => halfGap(s.d + x - SHIP_X);
  const xs: number[] = [0];
  const bend = SHIP_X - s.d; // where the straight entrance meets the slope
  if (bend > 0 && bend < W) xs.push(bend);
  const apex = SHIP_X + (dFull - s.d); // where the walls meet
  if (apex < W) xs.push(apex);
  else xs.push(W);
  const roof = xs.map((x) => `${x.toFixed(1)},${(CY - wallHalf(x)).toFixed(1)}`);
  const ground = xs.map((x) => `${x.toFixed(1)},${(CY + wallHalf(x)).toFixed(1)}`);
  const closed = apex < W ? ` ${W},${CY}` : "";
  const roofPoly = `0,${VIEW_TOP} ${roof.join(" ")}${closed} ${W},${VIEW_TOP}`;
  const groundPoly = `0,${VIEW_BOTTOM} ${ground.join(" ")}${closed} ${W},${VIEW_BOTTOM}`;
  const edge = wallColor(progress);

  // faint ticks that scroll past, so speed is readable
  const ticks: number[] = [];
  const offset = (((SHIP_X - s.d) % 40) + 40) % 40;
  for (let x = offset; x < W; x += 40) ticks.push(x);

  const angle = (Math.atan2(s.vy, speed) * 180) / Math.PI;
  const countNumber = Math.max(1, Math.ceil((COUNTDOWN - s.t) / (COUNTDOWN / 3)));

  const board = (
    <GameBoard
      label="Convergence"
      onPointerDown={phase === "done" ? undefined : (event) => {
        event.currentTarget.setPointerCapture?.(event.pointerId);
        sim.current.hold = true;
        if (phaseRef.current === "ready") begin();
      }}
      onPointerUp={() => { sim.current.hold = false; }}
    >
      {ticks.map((x) => {
        const h = wallHalf(x);
        return h > 2 ? <line key={x} x1={x} x2={x} y1={CY - h} y2={CY + h} className="conv-tick" /> : null;
      })}
      <polygon points={roofPoly} className="conv-wall" />
      <polygon points={groundPoly} className="conv-wall" />
      <polyline points={roof.join(" ") + closed} className="conv-edge" style={{ stroke: edge }} />
      <polyline points={ground.join(" ") + closed} className="conv-edge" style={{ stroke: edge }} />

      {s.trail.length > 1 && (
        <polyline points={s.trail.map((p) => `${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(" ")} className="conv-trail" />
      )}

      <g transform={`translate(${SHIP_X} ${s.y.toFixed(1)}) rotate(${angle.toFixed(1)})`}>
        {s.hold && !s.crashed && phase === "running" && <polygon points="-6,0 -15,-3 -12,0 -15,3" className="conv-flame" />}
        <polygon points="8,0 -7,-6 -4,0 -7,6" className={`conv-ship${s.crashed ? " crashed" : ""}`} />
      </g>
      {s.crashed && <circle cx={SHIP_X} cy={s.y} r="12" className="conv-boom" />}

      {phase === "ready" && <text x={W / 2} y={CY + 56} className="conv-count small">TAP OR HOLD TO START</text>}
      {counting && <text x={W / 2} y={CY + 22} className="conv-count">{countNumber}</text>}
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
        {phase === "running" && !counting
          ? <>Tunnel <strong>{Math.round(progress * 100)}%</strong> complete</>
          : <><strong>Hold</strong> to fly up, release to drop. Space works too.</>}
      </p>
      {board}
      <button type="button" data-start hidden onClick={begin} tabIndex={-1}>Start</button>
    </div>
  );
}
