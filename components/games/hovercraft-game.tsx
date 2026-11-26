"use client";

import { useEffect, useMemo, useReducer, useRef, useState } from "react";
import { makeRng } from "@/lib/skillion";
import { clamp, Countdown, GameBoard } from "./game-board";
import { GameResult } from "./game-result";
import type { GameProps, Outcome, Point } from "./types";

const BOX = { x0: 24, y0: 24, x1: 336, y1: 336 };
const CRAFT_R = 8;
const DOT_R = 6;
const GRAVITY = 760;
const JUMP = 270; // upward speed of a tap, flappy-bird style
const TIME = 16; // seconds of flying
const COUNTDOWN = 1.65;

type Pulse = { x: number; y: number; t: number };

type Sim = {
  x: number;
  y: number;
  vy: number;
  dir: 1 | -1;
  t: number; // seconds since begin
  hop: number; // time since last tap (for the thruster glow)
  collected: boolean[];
  pulses: Pulse[];
  trail: Point[];
  done: boolean;
};

export default function HovercraftGame({ difficulty, seed, maxPoints, onComplete }: GameProps) {
  const speed = 125 + difficulty * 18;
  const total = 14 + difficulty * 2;
  const target = Math.ceil(total * 0.75); // collecting this many counts as a full score

  const dots = useMemo<Point[]>(() => {
    const rng = makeRng(`${seed}:hover:${difficulty}`);
    const pts: Point[] = [];
    let guard = 0;
    while (pts.length < total && guard < 2000) {
      guard += 1;
      const p = {
        x: BOX.x0 + 26 + rng() * (BOX.x1 - BOX.x0 - 52),
        y: BOX.y0 + 26 + rng() * (BOX.y1 - BOX.y0 - 52),
      };
      const crowded = pts.some((q) => Math.hypot(q.x - p.x, q.y - p.y) < 34);
      const nearStart = Math.hypot(p.x - (BOX.x0 + CRAFT_R), p.y - 180) < 50;
      if (!crowded && !nearStart) pts.push(p);
    }
    return pts;
  }, [seed, difficulty, total]);

  const sim = useRef<Sim>({
    x: BOX.x0 + CRAFT_R, y: 180, vy: 0, dir: 1, t: 0, hop: 9,
    collected: new Array(total).fill(false), pulses: [], trail: [], done: false,
  });
  const [phase, setPhase] = useState<"ready" | "running" | "done">("ready");
  const [result, setResult] = useState<Outcome | null>(null);
  const [, redraw] = useReducer((n: number) => n + 1, 0);
  const frame = useRef<number | null>(null);
  const phaseRef = useRef(phase);
  phaseRef.current = phase;

  useEffect(() => () => {
    if (frame.current !== null) cancelAnimationFrame(frame.current);
  }, []);

  const hop = () => {
    const s = sim.current;
    if (phaseRef.current !== "running" || s.t < COUNTDOWN || s.done) return;
    s.vy = -JUMP;
    s.hop = 0;
  };

  // Space / up arrow / W hop too.
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.repeat) return;
      if (event.code === "Space" || event.key === "ArrowUp" || event.key.toLowerCase() === "w") {
        event.preventDefault();
        hop();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
    // hop() only touches refs, so registering once is enough.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const finish = () => {
    const s = sim.current;
    s.done = true;
    const got = s.collected.filter(Boolean).length;
    setPhase("done");
    setResult({
      accuracy: clamp(got / target, 0, 1),
      detail: got === total
        ? `Perfect sweep: all ${total} dots collected!`
        : `Collected ${got} of ${total} dots.`,
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
        s.hop += dt;
        s.vy += GRAVITY * dt;
        s.y += s.vy * dt;
        s.x += s.dir * speed * dt;

        // Floor and ceiling are safe: you just rest on the floor or bump off the ceiling.
        if (s.y > BOX.y1 - CRAFT_R) { s.y = BOX.y1 - CRAFT_R; s.vy = 0; }
        if (s.y < BOX.y0 + CRAFT_R) { s.y = BOX.y0 + CRAFT_R; s.vy = Math.max(0, s.vy); }
        // Walls flip the direction of travel.
        if (s.x > BOX.x1 - CRAFT_R) { s.x = BOX.x1 - CRAFT_R; s.dir = -1; }
        if (s.x < BOX.x0 + CRAFT_R) { s.x = BOX.x0 + CRAFT_R; s.dir = 1; }

        s.trail.push({ x: s.x, y: s.y });
        if (s.trail.length > 16) s.trail.shift();

        dots.forEach((dot, i) => {
          if (s.collected[i]) return;
          if (Math.hypot(dot.x - s.x, dot.y - s.y) < CRAFT_R + DOT_R + 1) {
            s.collected[i] = true;
            s.pulses.push({ x: dot.x, y: dot.y, t: s.t });
          }
        });
        s.pulses = s.pulses.filter((p) => s.t - p.t < 0.45);

        if (s.t - COUNTDOWN >= TIME || s.collected.every(Boolean)) {
          redraw();
          finish();
          return;
        }
      }
      redraw();
      frame.current = requestAnimationFrame(tick);
    };
    frame.current = requestAnimationFrame(tick);
  };

  const s = sim.current;
  const got = s.collected.filter(Boolean).length;
  const counting = phase === "running" && s.t < COUNTDOWN;
  const left = Math.max(0, TIME - Math.max(0, s.t - COUNTDOWN));
  const countNumber = Math.max(1, Math.ceil((COUNTDOWN - s.t) / (COUNTDOWN / 3)));

  const board = (
    <GameBoard
      label="Hovercraft"
      onPointerDown={phase === "done" ? undefined : () => {
        if (phaseRef.current === "ready") begin();
        else hop();
      }}
    >
      <rect x={BOX.x0} y={BOX.y0} width={BOX.x1 - BOX.x0} height={BOX.y1 - BOX.y0} className="hover-box" />

      {dots.map((dot, i) => !s.collected[i] && (
        <circle key={i} cx={dot.x} cy={dot.y} r={DOT_R} className="hover-dot" />
      ))}
      {s.pulses.map((p, i) => {
        const age = (s.t - p.t) / 0.45;
        return <circle key={i} cx={p.x} cy={p.y} r={DOT_R + age * 16} className="hover-pulse" style={{ opacity: 1 - age }} />;
      })}

      {s.trail.length > 1 && (
        <polyline points={s.trail.map((p) => `${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(" ")} className="hover-trail" />
      )}
      <g transform={`translate(${s.x.toFixed(1)} ${s.y.toFixed(1)}) scale(${s.dir} 1)`}>
        {s.hop < 0.18 && <ellipse cx="-1" cy="9" rx="5" ry="3" className="hover-puff" />}
        <ellipse cx="0" cy="2" rx="11" ry="5" className="hover-hull" />
        <path d="M-5,0 A5,5 0 0 1 5,0 Z" className="hover-dome" />
        <circle cx="8" cy="2" r="1.6" className="hover-nose" />
      </g>

      {counting && <text x={BOX.x0 + (BOX.x1 - BOX.x0) / 2} y={206} className="conv-count">{countNumber}</text>}
      {phase === "ready" && <text x={180} y={186} className="conv-count small">TAP TO START</text>}
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
          ? <><strong>{got}</strong> / {total} dots · {Math.ceil(left)}s</>
          : <><strong>Tap</strong> to hop. Grab the yellow dots. Space works too.</>}
      </p>
      {phase === "running" && !counting && <Countdown key="t" seconds={TIME} />}
      {board}
      <button type="button" data-start hidden onClick={begin} tabIndex={-1}>Start</button>
    </div>
  );
}
