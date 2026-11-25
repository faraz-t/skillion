"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { accuracyFromError, makeRng } from "@/lib/skillion";
import { GameBoard } from "./game-board";
import { GameResult } from "./game-result";
import type { GameProps, Outcome } from "./types";

const CX = 180;
const CY = 192;
const R = 128;

const at = (angle: number, radius: number) => ({
  x: CX + radius * Math.sin((angle * Math.PI) / 180),
  y: CY - radius * Math.cos((angle * Math.PI) / 180),
});

export default function WheelGame({ difficulty, seed, maxPoints, onComplete }: GameProps) {
  const slots = [16, 20, 24, 28, 32][difficulty] ?? 24;
  const slotAngle = 360 / slots;

  const spin = useMemo(() => {
    const rng = makeRng(`${seed}:wheel:${difficulty}`);
    return {
      // degrees per second; sign is the spin direction
      speed: (300 + difficulty * 70 + rng() * 60) * (rng() < 0.5 ? 1 : -1),
      blackout: 2.5 + rng() * 2.5,
    };
  }, [seed, difficulty]);

  const [phase, setPhase] = useState<"ready" | "spinning" | "guessing">("ready");
  const [angle, setAngle] = useState(0);
  const [pick, setPick] = useState<number | null>(null);
  const [winner, setWinner] = useState<number | null>(null);
  const [blackoutAngle, setBlackoutAngle] = useState(0);
  const [result, setResult] = useState<Outcome | null>(null);
  const frame = useRef<number | null>(null);

  useEffect(() => () => {
    if (frame.current !== null) cancelAnimationFrame(frame.current);
  }, []);

  const start = () => {
    setPhase("spinning");
    const t0 = performance.now();
    const tick = (now: number) => {
      const t = (now - t0) / 1000;
      const nextAngle = spin.speed * t;
      if (t >= spin.blackout) {
        const normalized = ((nextAngle % 360) + 360) % 360;
        const localPointer = (360 - normalized) % 360;
        const frameWinner = Math.floor(localPointer / slotAngle) % slots;
        setWinner(frameWinner);
        setBlackoutAngle(nextAngle);
        setPhase("guessing");
        return;
      }
      setAngle(nextAngle);
      frame.current = requestAnimationFrame(tick);
    };
    frame.current = requestAnimationFrame(tick);
  };

  const hidden = phase === "guessing" && !result;
  const shownAngle = result ? blackoutAngle : angle;

  const board = (
    <GameBoard label="The Wheel">
      {!hidden ? (
        <g transform={`rotate(${shownAngle} ${CX} ${CY})`}>
          {Array.from({ length: slots }, (_, i) => {
            const a = at(i * slotAngle, R);
            const b = at((i + 1) * slotAngle, R);
            const label = at((i + 0.5) * slotAngle, R * 0.82);
            const cls = result && winner !== null && i === winner ? "wheel-win" : result && i === pick ? "wheel-pick" : i % 2 ? "wheel-b" : "wheel-a";
            return (
              <g key={i}>
                <path d={`M ${CX} ${CY} L ${a.x} ${a.y} A ${R} ${R} 0 0 1 ${b.x} ${b.y} Z`} className={cls} />
                <text
                  x={label.x}
                  y={label.y}
                  textAnchor="middle"
                  dominantBaseline="central"
                  transform={`rotate(${(i + 0.5) * slotAngle} ${label.x} ${label.y})`}
                  className="wheel-text"
                  fontSize={slots > 28 ? 10 : slots > 20 ? 12 : 14}
                >
                  {i + 1}
                </text>
              </g>
            );
          })}
          <circle cx={CX} cy={CY} r="12" className="wheel-hub" />
        </g>
      ) : (
        <g>
          <circle cx={CX} cy={CY} r={R} className="wheel-dark" />
          <circle cx={CX} cy={CY} r={R} className="wheel-dark-ring" />
          <text x={CX} y={CY + 14} textAnchor="middle" className="board-question">?</text>
        </g>
      )}
      <circle cx={CX} cy={CY} r={R} className="wheel-rim" />
      <polygon points={`${CX - 11},${CY - R - 20} ${CX + 11},${CY - R - 20} ${CX},${CY - R + 4}`} className="wheel-pointer" />
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
        {phase === "ready" && <>The wheel goes dark at a random moment. Pay close attention.</>}
        {phase === "spinning" && <>Watch the wheel…</>}
        {phase === "guessing" && <>Where did it stop? <strong>Pick a slot</strong>.</>}
      </p>
      {board}
      {phase === "guessing" && (
        <div className="chip-grid" role="group" aria-label="Choose a slot">
          {Array.from({ length: slots }, (_, i) => (
            <button
              key={i}
              type="button"
              className={`chip${pick === i ? " selected" : ""}`}
              onClick={() => setPick(i)}
            >
              {i + 1}
            </button>
          ))}
        </div>
      )}
      <button
        type="button"
        className="primary-button"
        data-start={phase === "ready" ? "" : undefined}
        disabled={phase === "spinning" || (phase === "guessing" && pick === null)}
        onClick={() => {
          if (phase === "ready") {
            start();
            return;
          }
          if (pick === null) return;
          if (winner === null) return;
          const gap = Math.abs(pick - winner);
          const off = Math.min(gap, slots - gap);
          setResult({
            accuracy: accuracyFromError(off, Math.max(1.5, slots * 0.22)),
            detail: off === 0
              ? `Perfect! It stopped on ${winner + 1}.`
              : `It stopped on ${winner + 1}. You said ${pick + 1}.`,
          });
        }}
      >
        {phase === "ready" ? "Spin" : phase === "spinning" ? "Watch…" : "Lock in"}
      </button>
    </div>
  );
}
