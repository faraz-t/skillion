"use client";

import { useEffect, useId, useMemo, useRef, useState } from "react";
import { accuracyFromError, makeRng } from "@/lib/skillion";
import { boardPoint, clamp, GameBoard } from "./game-board";
import { GameResult } from "./game-result";
import type { GameProps, Outcome, Point } from "./types";

const SIZE = 360;
const SPEED = 320; // px per second the ring travels
const PINGS = 3;
const TILE_SIZE = 40;

type Ping = Point & { echo: number; t0: number };

export default function SonarGame({ difficulty, seed, maxPoints, onComplete }: GameProps) {
  const clipId = `sonar-clip-${useId().replace(/[^a-zA-Z0-9]/g, "")}`;

  const setup = useMemo(() => {
    const rng = makeRng(`${seed}:sonar:${difficulty}`);
    const gauss = () => {
      const u = Math.max(1e-6, rng());
      return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * rng());
    };
    return {
      target: { x: 40 + rng() * (SIZE - 80), y: 40 + rng() * (SIZE - 80) },
      noise: Array.from({ length: PINGS }, gauss),
      sigma: 0.04 + difficulty * 0.012,
    };
  }, [seed, difficulty]);

  const [pings, setPings] = useState<Ping[]>([]);
  const [clock, setClock] = useState(0);
  const [guess, setGuess] = useState<Point | null>(null);
  const [result, setResult] = useState<Outcome | null>(null);
  const pingsRef = useRef<Ping[]>([]);
  const frame = useRef<number | null>(null);
  const dragging = useRef(false);

  useEffect(() => () => {
    if (frame.current !== null) cancelAnimationFrame(frame.current);
  }, []);

  const loop = (now: number) => {
    setClock(now);
    const busy = pingsRef.current.some((p) => (now - p.t0) / 1000 < p.echo / SPEED);
    frame.current = busy ? requestAnimationFrame(loop) : null;
  };

  const sendPing = (point: Point) => {
    const index = pingsRef.current.length;
    if (index >= PINGS) return;
    const distance = Math.hypot(point.x - setup.target.x, point.y - setup.target.y);
    const echo = Math.max(5, distance * (1 + setup.sigma * setup.noise[index]));
    const ping: Ping = { ...point, echo, t0: performance.now() };
    pingsRef.current = [...pingsRef.current, ping];
    setPings(pingsRef.current);
    if (frame.current === null) frame.current = requestAnimationFrame(loop);
  };

  const place = (event: React.PointerEvent<SVGSVGElement>) => {
    const raw = boardPoint(event.currentTarget, event);
    const point = { x: clamp(raw.x, 0, SIZE), y: clamp(raw.y, 0, SIZE) };
    if (pings.length < PINGS) {
      if (raw.x < 0 || raw.x > SIZE || raw.y < 0 || raw.y > SIZE) return;
      sendPing(point);
    } else {
      setGuess(point);
    }
  };

  const lockIn = () => {
    if (!guess) return;
    const miss = Math.hypot(guess.x - setup.target.x, guess.y - setup.target.y);
    const accuracy = accuracyFromError(miss, 40 - difficulty * 3);
    setResult({
      accuracy,
      detail: `Your guess was ${miss.toFixed(0)} px from the target.`,
    });
  };

  const board = (
    <GameBoard
      label="Echolocation"
      onPointerDown={!result
        ? (event) => {
            event.currentTarget.setPointerCapture(event.pointerId);
            dragging.current = pings.length >= PINGS;
            place(event);
          }
        : undefined}
      onPointerMove={!result
        ? (event) => {
            if (dragging.current && event.buttons) place(event);
          }
        : undefined}
      onPointerUp={() => {
        dragging.current = false;
      }}
    >
      <defs>
        <clipPath id={clipId}>
          <rect x="0" y="0" width={SIZE} height={SIZE} />
        </clipPath>
      </defs>

      <rect x="0" y="0" width={SIZE} height={SIZE} className="sonar-field" />
      {Array.from({ length: 8 }, (_, i) => (
        <g key={i} className="sonar-grid">
          <line x1={(i + 1) * 40} y1="0" x2={(i + 1) * 40} y2={SIZE} />
          <line x1="0" y1={(i + 1) * 40} x2={SIZE} y2={(i + 1) * 40} />
        </g>
      ))}

      <g clipPath={`url(#${clipId})`}>
        {pings.map((ping, index) => {
          const age = Math.max(0, (clock - ping.t0) / 1000);
          const travel = age * SPEED;
          const arrived = travel >= ping.echo;
          const head = Math.min(ping.echo, travel);
          return (
            <g key={index} className="sonar-ping">
              {!arrived && head > 1 && (
                <>
                  <circle cx={ping.x} cy={ping.y} r={head} className="sonar-ring head" />
                  {head > 16 && <circle cx={ping.x} cy={ping.y} r={head - 14} className="sonar-ring trail" opacity="0.5" />}
                  {head > 32 && <circle cx={ping.x} cy={ping.y} r={head - 28} className="sonar-ring trail" opacity="0.22" />}
                </>
              )}
              <circle cx={ping.x} cy={ping.y} r="4" className="sonar-origin" />
              {arrived && (
                <text
                  x={ping.x + 10}
                  y={ping.y - 10}
                  className="board-label"
                  fontSize="12"
                >
                  {(ping.echo / TILE_SIZE).toFixed(1)} tiles
                </text>
              )}
            </g>
          );
        })}
      </g>

      {result && (
        <g>
          <line
            x1={guess?.x ?? 0}
            y1={guess?.y ?? 0}
            x2={setup.target.x}
            y2={setup.target.y}
            className="board-dashed"
          />
          <g className="sonar-target">
            <circle cx={setup.target.x} cy={setup.target.y} r="10" />
            <line x1={setup.target.x - 15} y1={setup.target.y} x2={setup.target.x + 15} y2={setup.target.y} />
            <line x1={setup.target.x} y1={setup.target.y - 15} x2={setup.target.x} y2={setup.target.y + 15} />
          </g>
        </g>
      )}

      {guess && <circle cx={guess.x} cy={guess.y} r="7" className="sonar-guess" />}
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

  const left = PINGS - pings.length;
  return (
    <div className="game-content">
      <p className="game-prompt">
        {left > 0
          ? <>Tap to send a ping (<strong>{left}</strong> left). Read the distance to the hidden target in Tiles.</>
          : guess
            ? <>Drag to adjust the <strong>red dot</strong>, then lock it in.</>
            : <>Out of pings. Tap where you think the <strong>target</strong> is.</>}
      </p>
      <div className="countdown idle" aria-hidden="true" />
      {board}
      <button type="button" className="primary-button" disabled={!guess} onClick={lockIn}>
        {left > 0 ? `${left} ping${left === 1 ? "" : "s"} left` : "Lock in guess"}
      </button>
    </div>
  );
}
