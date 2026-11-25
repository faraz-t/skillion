"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { accuracyFromError, makeRng } from "@/lib/skillion";
import { boardPoint, clamp, GameBoard } from "./game-board";
import { GameResult } from "./game-result";
import type { GameProps, Outcome } from "./types";

const XL = 18;
const XR = 342;
const FLOOR = 330;
const GRAVITY = 300;

const fold = (x: number) => {
  const w = XR - XL;
  const u = (((x - XL) % (2 * w)) + 2 * w) % (2 * w);
  return XL + (u <= w ? u : 2 * w - u);
};

export default function LandingGame({ difficulty, seed, maxPoints, onComplete }: GameProps) {
  const flight = useMemo(() => {
    const rng = makeRng(`${seed}:landing:${difficulty}`);
    const bounces = [0, 1, 1, 2, 3][difficulty] ?? 1;
    const y0 = 60 + rng() * 80;
    const vy = -(40 + rng() * 110);
    const tEnd = (-vy + Math.sqrt(vy * vy + 2 * GRAVITY * (FLOOR - y0))) / GRAVITY;
    const dir = rng() < 0.5 ? -1 : 1;
    const run = bounces * (XR - XL) + 40 + rng() * 240;
    // Without bounces, make sure the ball stays in the box on its way across.
    const x0 = bounces === 0
      ? (dir > 0 ? XL + 20 + rng() * (XR - XL - run - 40) : XR - 20 - rng() * (XR - XL - run - 40))
      : XL + 30 + rng() * (XR - XL - 60);
    return { x0, y0, vx: (dir * run) / tEnd, vy, tEnd, visible: tEnd * (0.55 - difficulty * 0.08) };
  }, [seed, difficulty]);

  const at = (t: number) => ({
    x: fold(flight.x0 + flight.vx * t),
    y: flight.y0 + flight.vy * t + 0.5 * GRAVITY * t * t,
  });
  const trail = (until: number, steps = 48) =>
    Array.from({ length: steps + 1 }, (_, i) => at((until * i) / steps));

  const [phase, setPhase] = useState<"ready" | "flying" | "guessing">("ready");
  const [elapsed, setElapsed] = useState(0);
  const [guessX, setGuessX] = useState<number | null>(null);
  const [result, setResult] = useState<(Outcome & { landing: number }) | null>(null);
  const frame = useRef<number | null>(null);

  useEffect(() => () => {
    if (frame.current !== null) cancelAnimationFrame(frame.current);
  }, []);

  const launch = () => {
    setPhase("flying");
    const t0 = performance.now();
    const tick = (now: number) => {
      const t = (now - t0) / 1000;
      if (t >= flight.visible) {
        setElapsed(flight.visible);
        setPhase("guessing");
        return;
      }
      setElapsed(t);
      frame.current = requestAnimationFrame(tick);
    };
    frame.current = requestAnimationFrame(tick);
  };

  const ball = at(elapsed);
  const place = (event: React.PointerEvent<SVGSVGElement>) =>
    setGuessX(clamp(boardPoint(event.currentTarget, event).x, XL, XR));
  const landing = at(flight.tEnd).x;

  const board = (
    <GameBoard
      label="Crash Landing"
      onPointerDown={phase === "guessing" && !result ? (event) => {
        event.currentTarget.setPointerCapture(event.pointerId);
        place(event);
      } : undefined}
      onPointerMove={phase === "guessing" && !result ? (event) => {
        if (event.buttons) place(event);
      } : undefined}
    >
      <line x1={XL} y1="10" x2={XL} y2={FLOOR} className="wall-line" />
      <line x1={XR} y1="10" x2={XR} y2={FLOOR} className="wall-line" />
      <line x1={XL} y1={FLOOR} x2={XR} y2={FLOOR} className="floor-line" />
      {Array.from({ length: 9 }, (_, i) => (
        <line key={i} x1={XL + (i * (XR - XL)) / 8} y1={FLOOR} x2={XL + (i * (XR - XL)) / 8} y2={FLOOR + 8} className="board-guide-line" />
      ))}
      {phase !== "ready" && !result && (
        <polyline points={trail(elapsed).map((p) => `${p.x},${p.y}`).join(" ")} className="board-dashed" />
      )}
      {result && (
        <>
          <polyline points={trail(flight.tEnd, 90).map((p) => `${p.x},${p.y}`).join(" ")} className="board-dashed" />
          <polyline points={trail(flight.visible, 40).map((p) => `${p.x},${p.y}`).join(" ")} className="board-path thin" />
          <circle cx={landing} cy={FLOOR} r="9" className="board-answer-dot" />
        </>
      )}
      {guessX !== null && (
        <g>
          <line x1={guessX} y1={FLOOR - 16} x2={guessX} y2={FLOOR + 14} className="board-accent-line" />
          <polygon points={`${guessX - 8},${FLOOR - 28} ${guessX + 8},${FLOOR - 28} ${guessX},${FLOOR - 14}`} className="board-accent-dot" />
        </g>
      )}
      {phase === "ready" && (
        <>
          <circle cx={flight.x0} cy={flight.y0} r="8" className="ball" />
        </>
      )}
      {phase === "flying" && <circle cx={ball.x} cy={ball.y} r="8" className="ball" />}
      {phase === "guessing" && !result && (
        <circle cx={ball.x} cy={ball.y} r="8" className="ball ghost" />
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
        {phase === "ready" && <>Watch the ball’s flight. It vanishes mid-air.</>}
        {phase === "flying" && <>Watch the path…</>}
        {phase === "guessing" && <>Tap or drag along the <strong>floor</strong> to mark where it lands.</>}
      </p>
      <div className="countdown idle" aria-hidden="true" />
      {board}
      <button
        type="button"
        className="primary-button"
        data-start={phase === "ready" ? "" : undefined}
        disabled={phase === "flying" || (phase === "guessing" && guessX === null)}
        onClick={() => {
          if (phase === "ready") {
            launch();
            return;
          }
          if (guessX === null) return;
          const error = Math.abs(guessX - landing);
          setResult({
            landing,
            accuracy: accuracyFromError(error, 70 - difficulty * 9),
            detail: `You were ${error.toFixed(0)} px (${((error / (XR - XL)) * 100).toFixed(1)}% of the floor) from where it landed.`,
          });
        }}
      >
        {phase === "ready" ? "Launch" : phase === "flying" ? "Watch…" : "Lock in"}
      </button>
    </div>
  );
}
