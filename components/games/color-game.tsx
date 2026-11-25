"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { accuracyFromError, makeRng } from "@/lib/skillion";
import { boardPoint, clamp, Countdown, GameBoard } from "./game-board";
import { GameResult } from "./game-result";
import type { GameProps, Outcome } from "./types";

type Hsv = { h: number; s: number; v: number };

function toRgb({ h, s, v }: Hsv): [number, number, number] {
  const f = (n: number) => {
    const k = (n + h / 60) % 6;
    return v - v * s * Math.max(0, Math.min(k, 4 - k, 1));
  };
  return [f(5) * 255, f(3) * 255, f(1) * 255];
}

const hex = (hsv: Hsv) => `#${toRgb(hsv).map((c) => Math.round(c).toString(16).padStart(2, "0")).join("")}`;

function toOklab(hsv: Hsv): [number, number, number] {
  const [r, g, b] = toRgb(hsv).map((c) => {
    const x = c / 255;
    return x <= 0.04045 ? x / 12.92 : ((x + 0.055) / 1.055) ** 2.4;
  });
  const l = Math.cbrt(0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b);
  const m = Math.cbrt(0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b);
  const s = Math.cbrt(0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b);
  return [
    0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s,
    1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s,
    0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s,
  ];
}

const SV = { x: 24, y: 24, w: 312, h: 216 };
const HUE = { x: 24, y: 262, w: 312, h: 26 };

export default function ColorGame({ difficulty, seed, maxPoints, onComplete }: GameProps) {
  const target = useMemo<Hsv>(() => {
    const rng = makeRng(`${seed}:color:${difficulty}`);
    const sLo = 0.5 - difficulty * 0.08;
    const sHi = 1 - difficulty * 0.1;
    return { h: Math.floor(rng() * 360), s: sLo + rng() * (sHi - sLo), v: 0.35 + rng() * 0.6 };
  }, [seed, difficulty]);

  const showFor = 2.6 - difficulty * 0.4;
  const [phase, setPhase] = useState<"ready" | "showing" | "guessing">("ready");
  const [guess, setGuess] = useState<Hsv>({ h: 200, s: 0.5, v: 0.5 });
  const [touched, setTouched] = useState(false);
  const [result, setResult] = useState<Outcome | null>(null);
  const region = useRef<"sv" | "hue" | null>(null);
  const timer = useRef<number | null>(null);

  useEffect(() => () => {
    if (timer.current !== null) window.clearTimeout(timer.current);
  }, []);

  const update = (event: React.PointerEvent<SVGSVGElement>) => {
    const p = boardPoint(event.currentTarget, event);
    if (region.current === "sv") {
      setGuess((g) => ({ ...g, s: clamp((p.x - SV.x) / SV.w, 0, 1), v: 1 - clamp((p.y - SV.y) / SV.h, 0, 1) }));
    } else if (region.current === "hue") {
      setGuess((g) => ({ ...g, h: clamp((p.x - HUE.x) / HUE.w, 0, 1) * 359.9 }));
    }
    setTouched(true);
  };

  const readable = (c: Hsv) => (toOklab(c)[0] > 0.62 ? "#0b0b0c" : "#f3ece2");
  let board;
  if (result) {
    board = (
      <GameBoard label="Color match">
        <rect x="0" y="-90" width="180" height="524" fill={hex(target)} />
        <rect x="180" y="-90" width="180" height="524" fill={hex(guess)} />
        <text x="90" y="40" textAnchor="middle" className="swatch-label" fill={readable(target)}>TARGET</text>
        <text x="270" y="40" textAnchor="middle" className="swatch-label" fill={readable(guess)}>YOURS</text>
        <text x="90" y="336" textAnchor="middle" className="swatch-hex" fill={readable(target)}>{hex(target)}</text>
        <text x="270" y="336" textAnchor="middle" className="swatch-hex" fill={readable(guess)}>{hex(guess)}</text>
      </GameBoard>
    );
  } else if (phase === "showing") {
    board = (
      <GameBoard label="Color match">
        <rect x="0" y="-90" width="360" height="524" fill={hex(target)} />
      </GameBoard>
    );
  } else if (phase === "guessing") {
    board = (
      <GameBoard
        label="Color match"
        onPointerDown={(event) => {
          event.currentTarget.setPointerCapture(event.pointerId);
          const p = boardPoint(event.currentTarget, event);
          region.current = p.y < 250 ? "sv" : p.y < 304 ? "hue" : null;
          update(event);
        }}
        onPointerMove={(event) => {
          if (event.buttons) update(event);
        }}
        onPointerUp={() => { region.current = null; }}
      >
        <defs>
          <linearGradient id="sv-white" x1="0" y1="0" x2="1" y2="0">
            <stop offset="0" stopColor="#fff" />
            <stop offset="1" stopColor="#fff" stopOpacity="0" />
          </linearGradient>
          <linearGradient id="sv-black" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stopColor="#000" stopOpacity="0" />
            <stop offset="1" stopColor="#000" />
          </linearGradient>
          <linearGradient id="hue-bar" x1="0" y1="0" x2="1" y2="0">
            {[0, 60, 120, 180, 240, 300, 360].map((h) => (
              <stop key={h} offset={h / 360} stopColor={hex({ h: h % 360, s: 1, v: 1 })} />
            ))}
          </linearGradient>
        </defs>
        <rect x={SV.x} y={SV.y} width={SV.w} height={SV.h} fill={hex({ h: guess.h, s: 1, v: 1 })} />
        <rect x={SV.x} y={SV.y} width={SV.w} height={SV.h} fill="url(#sv-white)" />
        <rect x={SV.x} y={SV.y} width={SV.w} height={SV.h} fill="url(#sv-black)" />
        <circle cx={SV.x + guess.s * SV.w} cy={SV.y + (1 - guess.v) * SV.h} r="9" className="picker-knob" />
        <rect x={HUE.x} y={HUE.y} width={HUE.w} height={HUE.h} fill="url(#hue-bar)" />
        <rect x={HUE.x + (guess.h / 360) * HUE.w - 4} y={HUE.y - 4} width="8" height={HUE.h + 8} className="picker-hue-knob" />
        <rect x={SV.x} y="314" width={SV.w} height="30" fill={hex(guess)} className="picker-preview" />
      </GameBoard>
    );
  } else {
    board = (
      <GameBoard label="Color match">
        {null}
      </GameBoard>
    );
  }

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
        {phase === "guessing"
          ? <>Recreate the color you saw.</>
          : <>Remember this <strong>color</strong>. It disappears fast.</>}
      </p>
      {phase === "showing" ? <Countdown seconds={showFor} /> : <div className="countdown idle" aria-hidden="true" />}
      {board}
      <button
        type="button"
        className="primary-button"
        data-start={phase === "ready" ? "" : undefined}
        disabled={phase === "showing" || (phase === "guessing" && !touched)}
        onClick={() => {
          if (phase === "ready") {
            setPhase("showing");
            timer.current = window.setTimeout(() => setPhase("guessing"), showFor * 1000);
            return;
          }
          const a = toOklab(target);
          const b = toOklab(guess);
          const distance = Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);
          setResult({
            accuracy: accuracyFromError(distance, 0.22 - difficulty * 0.02),
            detail: `Color distance: ${(distance * 100).toFixed(1)} (lower is closer). The target hex was ${hex(target)}, and you entered ${hex(guess)}.`,
          });
        }}
      >
        {phase === "ready" ? "Show the color" : phase === "guessing" ? "Lock in" : "Memorize…"}
      </button>
    </div>
  );
}
