"use client";

import { useEffect, useId, useMemo, useRef, useState } from "react";
import { accuracyFromError, makeRng } from "@/lib/skillion";
import { clamp, GameBoard } from "./game-board";
import { GameResult } from "./game-result";
import type { GameProps, Outcome } from "./types";

const CX = 180;
const TOP = 74;
const BOTTOM = 336;
const HEIGHT = BOTTOM - TOP;
const SLICES = 220;
const NOZZLE_Y = -26;
const FLOW_SWING = 0.45;

/** Catmull-Rom through the control radii; `u` runs 0 (base) → 1 (rim). */
function radiusAt(ctrl: number[], u: number) {
  const segments = ctrl.length - 1;
  const f = clamp(u, 0, 1) * segments;
  const i = Math.min(segments - 1, Math.floor(f));
  const t = f - i;
  const p0 = ctrl[Math.max(0, i - 1)];
  const p1 = ctrl[i];
  const p2 = ctrl[i + 1];
  const p3 = ctrl[Math.min(segments, i + 2)];
  const t2 = t * t;
  const t3 = t2 * t;
  const value =
    0.5 *
    (2 * p1 +
      (-p0 + p2) * t +
      (2 * p0 - 5 * p1 + 4 * p2 - p3) * t2 +
      (-p0 + 3 * p1 - 3 * p2 + p3) * t3);
  return clamp(value, 9, 100);
}

/** y-coordinate of the water surface when the glass holds `fraction` of its volume. */
function levelY(cum: number[], fraction: number) {
  if (fraction <= 0) return BOTTOM;
  if (fraction >= 1) return TOP;
  let lo = 0;
  let hi = cum.length - 1;
  while (hi - lo > 1) {
    const mid = (lo + hi) >> 1;
    if (cum[mid] < fraction) lo = mid;
    else hi = mid;
  }
  const span = cum[hi] - cum[lo];
  const frac = span > 0 ? (fraction - cum[lo]) / span : 0;
  return BOTTOM - ((lo + frac) / SLICES) * HEIGHT;
}

function wavePath(y: number, t: number, amplitude: number) {
  let d = `M ${CX - 120} ${y.toFixed(1)}`;
  for (let x = CX - 120; x <= CX + 120; x += 6) {
    d += ` L ${x} ${(y + amplitude * Math.sin(x * 0.07 + t * 5)).toFixed(1)}`;
  }
  return d;
}

export default function FillGame({ difficulty, seed, maxPoints, onComplete }: GameProps) {
  const clipId = `fill-clip-${useId().replace(/[^a-zA-Z0-9]/g, "")}`;
  const gradId = `${clipId}-water`;

  const glass = useMemo(() => {
    const rng = makeRng(`${seed}:fill:${difficulty}`);
    const points = 4 + difficulty;
    let ctrl: number[] = [];
    for (let attempt = 0; attempt < 40; attempt += 1) {
      ctrl = Array.from({ length: points }, () => 18 + rng() * 74);
      ctrl[points - 1] = Math.max(ctrl[points - 1], 38); // the stream always fits through the rim
      if (Math.max(...ctrl) - Math.min(...ctrl) >= 34) break;
    }

    const radii: number[] = [];
    for (let k = 0; k <= SLICES; k += 1) radii.push(radiusAt(ctrl, k / SLICES));

    // Volume of revolution: area of each slice is proportional to r².
    const cum = [0];
    for (let k = 1; k <= SLICES; k += 1) {
      const r = radiusAt(ctrl, (k - 0.5) / SLICES);
      cum.push(cum[k - 1] + r * r);
    }
    const total = cum[SLICES];
    for (let k = 0; k <= SLICES; k += 1) cum[k] /= total;

    const yOf = (k: number) => BOTTOM - (k / SLICES) * HEIGHT;
    const left = radii.map((r, k) => `${(CX - r).toFixed(1)} ${yOf(k).toFixed(1)}`);
    const right = radii.map((r, k) => `${(CX + r).toFixed(1)} ${yOf(k).toFixed(1)}`);
    // Open outline (no lid on the rim) and a closed shape for clipping the water.
    const outline = `M ${[...left].reverse().join(" L ")} L ${right.join(" L ")}`;
    const closed = `${outline} Z`;
    const shine = `M ${radii
      .map((r, k) => ({ r, k }))
      .filter(({ k }) => k > 14 && k < SLICES - 10)
      .map(({ r, k }) => `${(CX - r + 9).toFixed(1)} ${yOf(k).toFixed(1)}`)
      .join(" L ")}`;

    return {
      cum,
      outline,
      closed,
      shine,
      target: (4 + Math.floor(rng() * 13)) / 20, // 20% … 80%
      fillTime: 6.8 - difficulty * 0.35,
      period: 1.7 + rng() * 0.8,
      phase: rng() * Math.PI * 2,
    };
  }, [seed, difficulty]);

  const [phase, setPhase] = useState<"ready" | "waiting" | "pouring" | "done">("ready");
  const [view, setView] = useState({ vol: 0, t: 0, rate: 1 });
  const [result, setResult] = useState<(Outcome & { vol: number }) | null>(null);
  const volRef = useRef(0);
  const frame = useRef<number | null>(null);
  const startTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => () => {
    if (frame.current !== null) cancelAnimationFrame(frame.current);
    if (startTimer.current !== null) clearTimeout(startTimer.current);
  }, []);

  const finish = () => {
    if (frame.current !== null) cancelAnimationFrame(frame.current);
    frame.current = null;
    const vol = volRef.current;
    const error = Math.abs(vol - glass.target);
    const overflow = vol >= 1;
    setPhase("done");
    setResult({
      vol,
      accuracy: accuracyFromError(error, 0.1 - difficulty * 0.008),
      detail: overflow
        ? `Overflowed... the target was ${Math.round(glass.target * 100)}%.`
        : `You stopped at ${Math.round(vol * 100)}% full. The target was ${Math.round(glass.target * 100)}%.`,
    });
  };

  const begin = () => {
    if (phase !== "ready") return;
    setPhase("waiting");
    startTimer.current = setTimeout(() => {
      startTimer.current = null;
      startPouring();
    }, 1200);
  };

  const startPouring = () => {
    setPhase("pouring");
    const start = performance.now();
    let last = start;
    const tick = (now: number) => {
      const dt = clamp((now - last) / 1000, 0, 0.05);
      last = now;
      const t = Math.max(0, (now - start) / 1000);
      const swing = 1 + FLOW_SWING * Math.sin((2 * Math.PI * t) / glass.period + glass.phase);
      volRef.current = Math.min(1, volRef.current + (swing * dt) / glass.fillTime);
      setView({ vol: volRef.current, t, rate: swing });
      if (volRef.current >= 1) {
        finish();
        return;
      }
      frame.current = requestAnimationFrame(tick);
    };
    frame.current = requestAnimationFrame(tick);
  };

  const pouring = phase === "pouring";
  const surfaceY = levelY(glass.cum, view.vol);
  const hasWater = view.vol > 0;
  const amplitude = pouring ? 2.4 : 1;
  const wave = wavePath(surfaceY, view.t, amplitude);
  const streamLength = Math.max(0, surfaceY - NOZZLE_Y);
  const streamWidth = 2 + view.rate * 2.4;

  const board = (
    <GameBoard label="Waterfall" onPointerDown={pouring ? finish : undefined}>
      <defs>
        <clipPath id={clipId}>
          <path d={glass.closed} />
        </clipPath>
        <linearGradient id={gradId} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#62b8ff" />
          <stop offset="1" stopColor="#1f5fd6" />
        </linearGradient>
      </defs>

      <path d={glass.closed} className="fill-glass-body" />

      {hasWater && (
        <g clipPath={`url(#${clipId})`}>
          <path d={`${wave} L ${CX + 120} ${BOTTOM + 12} L ${CX - 120} ${BOTTOM + 12} Z`} fill={`url(#${gradId})`} opacity="0.88" />
          <path d={wave} className="fill-surface" />
        </g>
      )}

      <path d={glass.shine} className="fill-shine" />
      <path d={glass.outline} className="fill-glass" />

      {pouring && (
        <g>
          <line x1={CX} y1={NOZZLE_Y} x2={CX} y2={surfaceY} className="fill-stream" strokeWidth={streamWidth} />
          {Array.from({ length: 6 }, (_, i) => {
            const y = NOZZLE_Y + ((view.t * 320 + (i * streamLength) / 6) % Math.max(streamLength, 1));
            return <circle key={i} cx={CX + Math.sin(i * 2.1) * 0.8} cy={y} r={streamWidth * 0.62} className="fill-drop" />;
          })}
          {[0, 1, 2, 3].map((i) => {
            const dir = i % 2 === 0 ? -1 : 1;
            const lift = Math.abs(Math.sin(view.t * 11 + i * 1.7));
            return (
              <circle
                key={`splash-${i}`}
                cx={CX + dir * (5 + lift * 9 + i * 2)}
                cy={surfaceY - 2 - lift * (7 + i)}
                r={1.7}
                className="fill-drop"
                opacity={0.9 - lift * 0.4}
              />
            );
          })}
        </g>
      )}

      {result && (
        <g>
          <line x1="24" y1={levelY(glass.cum, glass.target)} x2="336" y2={levelY(glass.cum, glass.target)} className="board-dashed" />
          <text x="336" y={levelY(glass.cum, glass.target) - 6} textAnchor="end" className="board-label" fontSize="12">
            TARGET {Math.round(glass.target * 100)}%
          </text>
          <text x="24" y={surfaceY - 8} textAnchor="start" className="fill-you-label" fontSize="12">
            YOU {Math.round(result.vol * 100)}%
          </text>
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
        Stop the pour when the glass holds <strong>{Math.round(glass.target * 100)}%</strong> of its volume (not its height).
      </p>
      <div className="countdown idle" aria-hidden="true" />
      {board}
      <button
        type="button"
        className="primary-button"
        data-start={phase === "ready" ? "" : undefined}
        disabled={phase === "waiting"}
        onClick={pouring ? finish : begin}
      >
        {pouring ? "Stop" : phase === "waiting" ? "Get ready…" : "Pour"}
      </button>
    </div>
  );
}
