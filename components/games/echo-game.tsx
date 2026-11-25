"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { accuracyFromError, makeRng } from "@/lib/skillion";
import { boardPoint, clamp, Countdown, GameBoard } from "./game-board";
import { GameResult } from "./game-result";
import type { GameProps, Outcome, Point } from "./types";

const STEP = 4.5; // px between squiggle samples
const CHUNKS = 22; // the trail is drawn as this many segments, each a little fainter

/** A smooth random wander: heading changes by a damped random walk and steers away from walls. */
function makeSquiggle(rng: () => number, count: number, difficulty: number): Point[] {
  const points: Point[] = [];
  let x = 90 + rng() * 180;
  let y = 90 + rng() * 180;
  let heading = rng() * Math.PI * 2;
  let omega = 0;
  const turn = 0.17 + difficulty * 0.015;
  for (let i = 0; i < count; i += 1) {
    points.push({ x, y });
    omega = omega * 0.92 + (rng() - 0.5) * turn;
    const edge = Math.max(Math.abs(x - 180), Math.abs(y - 180));
    if (edge > 120) {
      let diff = Math.atan2(180 - y, 180 - x) - heading;
      diff = Math.atan2(Math.sin(diff), Math.cos(diff));
      omega += clamp(diff, -1, 1) * 0.05 * Math.min(1, (edge - 120) / 40);
    }
    heading += omega;
    x = clamp(x + Math.cos(heading) * STEP, 12, 348);
    y = clamp(y + Math.sin(heading) * STEP, 12, 348);
  }
  return points;
}

function resample(points: Point[], spacing: number): Point[] {
  if (points.length < 2) return points;
  const out: Point[] = [points[0]];
  let prev = points[0];
  let need = spacing;
  for (let i = 1; i < points.length; i += 1) {
    const next = points[i];
    let d = Math.hypot(next.x - prev.x, next.y - prev.y);
    while (d >= need) {
      const t = need / d;
      prev = { x: prev.x + (next.x - prev.x) * t, y: prev.y + (next.y - prev.y) * t };
      out.push(prev);
      d = Math.hypot(next.x - prev.x, next.y - prev.y);
      need = spacing;
    }
    need -= d;
    prev = next;
  }
  return out;
}

function meanNearest(from: Point[], to: Point[]) {
  let total = 0;
  for (const a of from) {
    let best = Infinity;
    for (const b of to) {
      const d = (a.x - b.x) ** 2 + (a.y - b.y) ** 2;
      if (d < best) best = d;
    }
    total += Math.sqrt(best);
  }
  return total / Math.max(1, from.length);
}

function strokeLength(points: Point[]) {
  let total = 0;
  for (let i = 1; i < points.length; i += 1) {
    total += Math.hypot(points[i].x - points[i - 1].x, points[i].y - points[i - 1].y);
  }
  return total;
}

const asPoints = (points: Point[]) => points.map((p) => `${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(" ");

export default function EchoGame({ difficulty, seed, maxPoints, onComplete }: GameProps) {
  const squiggle = useMemo(() => {
    const rng = makeRng(`${seed}:echo:${difficulty}`);
    const count = 150 + difficulty * 30;
    const trail = Math.round(count * (0.62 - difficulty * 0.08));
    const speed = 210 + difficulty * 10; // px per second
    const pointsPerSecond = speed / STEP;
    return {
      points: makeSquiggle(rng, count, difficulty),
      trail,
      pointsPerSecond,
      seconds: (count + trail) / pointsPerSecond,
    };
  }, [seed, difficulty]);

  const [phase, setPhase] = useState<"ready" | "showing" | "drawing" | "done">("ready");
  const [head, setHead] = useState(0);
  const [stroke, setStroke] = useState<Point[]>([]);
  const [result, setResult] = useState<Outcome | null>(null);
  const strokeRef = useRef<Point[]>([]);
  const drawing = useRef(false);
  const frame = useRef<number | null>(null);

  useEffect(() => () => {
    if (frame.current !== null) cancelAnimationFrame(frame.current);
  }, []);

  const watch = () => {
    if (phase !== "ready") return;
    setPhase("showing");
    const start = performance.now();
    const tick = (now: number) => {
      const t = Math.max(0, (now - start) / 1000);
      setHead(t * squiggle.pointsPerSecond);
      if (t >= squiggle.seconds) {
        setPhase("drawing");
        frame.current = null;
        return;
      }
      frame.current = requestAnimationFrame(tick);
    };
    frame.current = requestAnimationFrame(tick);
  };

  const addPoint = (event: React.PointerEvent<SVGSVGElement>) => {
    const raw = boardPoint(event.currentTarget, event);
    const point = { x: clamp(raw.x, 0, 360), y: clamp(raw.y, 0, 360) };
    const last = strokeRef.current[strokeRef.current.length - 1];
    if (last && Math.hypot(point.x - last.x, point.y - last.y) < 3) return;
    strokeRef.current = [...strokeRef.current, point];
    setStroke(strokeRef.current);
  };

  const lockIn = () => {
    const mine = resample(stroke, 5);
    const original = resample(squiggle.points, 5);
    const error = (meanNearest(original, mine) + meanNearest(mine, original)) / 2;
    const accuracy = accuracyFromError(error, 26 - difficulty * 2);
    setPhase("done");
    setResult({
      accuracy,
      detail: `Your line strayed ${error.toFixed(0)} px from the original on average.`,
    });
  };

  // The trail: the visible slice of the squiggle, split into chunks that brighten toward the head.
  const trailChunks: Array<{ key: number; points: Point[]; frac: number }> = [];
  if (phase === "showing") {
    const tail = Math.max(0, head - squiggle.trail);
    const first = Math.ceil(tail);
    const last = Math.min(squiggle.points.length - 1, Math.floor(head));
    const visible = squiggle.points.slice(first, last + 1);
    if (visible.length > 1) {
      const size = Math.max(2, Math.ceil(visible.length / CHUNKS));
      for (let c = 0; c * size < visible.length - 1; c += 1) {
        const piece = visible.slice(c * size, (c + 1) * size + 1);
        const middle = first + c * size + piece.length / 2;
        trailChunks.push({ key: c, points: piece, frac: clamp((middle - tail) / squiggle.trail, 0, 1) });
      }
    }
  }
  const headPoint = squiggle.points[Math.min(squiggle.points.length - 1, Math.floor(head))];
  const showHead = phase === "showing" && head < squiggle.points.length;

  const board = (
    <GameBoard
      label="Mirroring"
      onPointerDown={phase === "drawing"
        ? (event) => {
            event.currentTarget.setPointerCapture(event.pointerId);
            drawing.current = true;
            strokeRef.current = [];
            setStroke([]);
            addPoint(event);
          }
        : undefined}
      onPointerMove={phase === "drawing"
        ? (event) => {
            if (drawing.current && event.buttons) addPoint(event);
          }
        : undefined}
      onPointerUp={() => {
        drawing.current = false;
      }}
    >
      <rect x="0" y="0" width="360" height="360" className="echo-field" />

      {trailChunks.map((chunk) => (
        <polyline
          key={chunk.key}
          points={asPoints(chunk.points)}
          className="echo-trail"
          strokeWidth={1.5 + chunk.frac * 3.5}
          opacity={Math.pow(chunk.frac, 1.4)}
        />
      ))}
      {showHead && <circle cx={headPoint.x} cy={headPoint.y} r="5.5" className="echo-head" />}

      {result && <polyline points={asPoints(squiggle.points)} className="echo-original" />}
      {stroke.length > 1 && <polyline points={asPoints(stroke)} className="board-path thin" />}
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

  const longEnough = strokeLength(stroke) >= 80;
  return (
    <div className="game-content">
      <p className="game-prompt">
        {phase === "ready" && <>A line moves on a random path. Redraw it from memory.</>}
        {phase === "showing" && <>Watch the line…</>}
        {phase === "drawing" && <>Draw the line where it was, in one stroke.</>}
      </p>
      {phase === "showing" ? <Countdown seconds={squiggle.seconds} /> : <div className="countdown idle" aria-hidden="true" />}
      {board}
      {phase === "drawing" ? (
        <div className="button-row">
          <button
            type="button"
            className="secondary-button"
            disabled={stroke.length === 0}
            onClick={() => {
              strokeRef.current = [];
              setStroke([]);
            }}
          >
            Clear
          </button>
          <button type="button" className="primary-button" disabled={!longEnough} onClick={lockIn}>
            Lock in
          </button>
        </div>
      ) : (
        <button
          type="button"
          className="primary-button"
          data-start={phase === "ready" ? "" : undefined}
          disabled={phase !== "ready"}
          onClick={watch}
        >
          {phase === "ready" ? "Watch the line" : "…"}
        </button>
      )}
    </div>
  );
}
