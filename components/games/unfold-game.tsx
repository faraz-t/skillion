"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { accuracyFromError, makeRng } from "@/lib/skillion";
import { boardPoint, clamp, GameBoard } from "./game-board";
import { GameResult } from "./game-result";
import type { GameProps, Outcome, Point } from "./types";

/** A fold line: passes through `p`, with unit normal `n`. */
type Line = { p: Point; n: Point };
type Fold = { line: Line; kept: Point[]; flap: Point[] };

const PAPER = { min: 60, max: 300 };
const HOLE_R = 8;

const FOLD_TIME = 1.5; // seconds per fold while folding
const UNFOLD_TIME = 1.4; // seconds per fold while unfolding
const GUIDE = 0.5; // pause with the crease shown before the flap moves
const MOVE = 0.9; // how long the flap takes to swing over

const dot = (a: Point, b: Point) => a.x * b.x + a.y * b.y;
const sub = (a: Point, b: Point): Point => ({ x: a.x - b.x, y: a.y - b.y });
const ease = (t: number) => t * t * (3 - 2 * t);

function reflect(q: Point, line: Line): Point {
  const s = 2 * dot(sub(q, line.p), line.n);
  return { x: q.x - s * line.n.x, y: q.y - s * line.n.y };
}

/** Where a flap point sits while the flap is `u` of the way folded (0 = flat, 1 = folded over). */
function flapPos(q: Point, line: Line, u: number): Point {
  const s = dot(sub(q, line.p), line.n) * (1 - Math.cos(Math.PI * u));
  return { x: q.x - s * line.n.x, y: q.y - s * line.n.y };
}

function centroid(poly: Point[]): Point {
  return {
    x: poly.reduce((sum, p) => sum + p.x, 0) / poly.length,
    y: poly.reduce((sum, p) => sum + p.y, 0) / poly.length,
  };
}

/** Keep the part of a convex polygon where `side * (q - p) · n >= 0`. */
function clip(poly: Point[], line: Line, side: number): Point[] {
  const EPS = 1e-6;
  const out: Point[] = [];
  for (let i = 0; i < poly.length; i += 1) {
    const a = poly[i];
    const b = poly[(i + 1) % poly.length];
    const da = side * dot(sub(a, line.p), line.n);
    const db = side * dot(sub(b, line.p), line.n);
    if (da >= -EPS) out.push(a);
    if ((da > EPS && db < -EPS) || (da < -EPS && db > EPS)) {
      const t = da / (da - db);
      out.push({ x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t });
    }
  }
  return out.filter((p, i) => {
    const next = out[(i + 1) % out.length];
    return Math.hypot(p.x - next.x, p.y - next.y) > 0.01;
  });
}

/** Lines that fold a convex polygon exactly onto itself (its mirror axes). */
function symmetryAxes(poly: Point[]): Line[] {
  const c = centroid(poly);
  const directions: Point[] = [];
  for (let i = 0; i < poly.length; i += 1) {
    directions.push(sub(poly[i], c));
    const next = poly[(i + 1) % poly.length];
    directions.push(sub({ x: (poly[i].x + next.x) / 2, y: (poly[i].y + next.y) / 2 }, c));
  }
  const axes: Line[] = [];
  for (const d of directions) {
    const length = Math.hypot(d.x, d.y);
    if (length < 1) continue;
    const line: Line = { p: c, n: { x: -d.y / length, y: d.x / length } };
    const symmetric = poly.every((v) => {
      const r = reflect(v, line);
      return poly.some((w) => Math.hypot(w.x - r.x, w.y - r.y) < 0.75);
    });
    if (!symmetric) continue;
    if (axes.some((a) => Math.abs(dot(a.n, line.n)) > 0.999)) continue;
    axes.push(line);
  }
  return axes;
}

/** Whether `q` is inside the convex polygon and at least `margin` from every edge. */
function insideWithMargin(poly: Point[], q: Point, margin: number) {
  let area = 0;
  for (let i = 0; i < poly.length; i += 1) {
    const a = poly[i];
    const b = poly[(i + 1) % poly.length];
    area += a.x * b.y - b.x * a.y;
  }
  const orient = area >= 0 ? 1 : -1;
  for (let i = 0; i < poly.length; i += 1) {
    const a = poly[i];
    const b = poly[(i + 1) % poly.length];
    const length = Math.hypot(b.x - a.x, b.y - a.y);
    const signed = (orient * ((b.x - a.x) * (q.y - a.y) - (b.y - a.y) * (q.x - a.x))) / length;
    if (signed < margin) return false;
  }
  return true;
}

/** Minimum-total-distance matching (Hungarian algorithm); returns the column for each row. */
function assign(cost: number[][]): number[] {
  const n = cost.length;
  const INF = 1e9;
  const u = new Array<number>(n + 1).fill(0);
  const v = new Array<number>(n + 1).fill(0);
  const p = new Array<number>(n + 1).fill(0);
  const way = new Array<number>(n + 1).fill(0);
  for (let i = 1; i <= n; i += 1) {
    p[0] = i;
    let j0 = 0;
    const minv = new Array<number>(n + 1).fill(INF);
    const used = new Array<boolean>(n + 1).fill(false);
    do {
      used[j0] = true;
      const i0 = p[j0];
      let delta = INF;
      let j1 = 0;
      for (let j = 1; j <= n; j += 1) {
        if (used[j]) continue;
        const cur = cost[i0 - 1][j - 1] - u[i0] - v[j];
        if (cur < minv[j]) {
          minv[j] = cur;
          way[j] = j0;
        }
        if (minv[j] < delta) {
          delta = minv[j];
          j1 = j;
        }
      }
      for (let j = 0; j <= n; j += 1) {
        if (used[j]) {
          u[p[j]] += delta;
          v[j] -= delta;
        } else {
          minv[j] -= delta;
        }
      }
      j0 = j1;
    } while (p[j0] !== 0);
    do {
      const j1 = way[j0];
      p[j0] = p[j1];
      j0 = j1;
    } while (j0);
  }
  const answer = new Array<number>(n).fill(-1);
  for (let j = 1; j <= n; j += 1) answer[p[j] - 1] = j - 1;
  return answer;
}

const asPoints = (poly: Point[]) => poly.map((p) => `${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(" ");

export default function UnfoldGame({ difficulty, seed, maxPoints, onComplete }: GameProps) {
  const layout = useMemo(() => {
    const rng = makeRng(`${seed}:unfold:${difficulty}`);
    const folds = 2;
    const holeCount = [2, 3, 2, 2, 3][difficulty] ?? 2;
    const diagonals = difficulty >= 3;

    const square: Point[] = [
      { x: PAPER.min, y: PAPER.min },
      { x: PAPER.max, y: PAPER.min },
      { x: PAPER.max, y: PAPER.max },
      { x: PAPER.min, y: PAPER.max },
    ];

    // Fold along a random mirror axis of the current packet, keeping a random side.
    const sequence: Fold[] = [];
    let packet = square;
    for (let i = 0; i < folds; i += 1) {
      let axes = symmetryAxes(packet);
      if (!diagonals) {
        const straight = axes.filter((a) => Math.abs(a.n.x) < 0.01 || Math.abs(a.n.y) < 0.01);
        if (straight.length > 0) axes = straight;
      }
      const line = axes[Math.floor(rng() * axes.length)];
      const side = rng() < 0.5 ? 1 : -1;
      const kept = clip(packet, line, side);
      const flap = clip(packet, line, -side);
      sequence.push({ line, kept, flap });
      packet = kept;
    }

    // Punch the holes through the folded packet, then work out where they land once opened.
    const unfoldAll = (seeds: Point[]) => {
      let set = seeds;
      for (let i = folds - 1; i >= 0; i -= 1) {
        set = [...set, ...set.map((q) => reflect(q, sequence[i].line))];
      }
      return set;
    };
    const separation = (set: Point[]) => {
      let best = Infinity;
      for (let i = 0; i < set.length; i += 1) {
        for (let j = i + 1; j < set.length; j += 1) {
          best = Math.min(best, Math.hypot(set[i].x - set[j].x, set[i].y - set[j].y));
        }
      }
      return best;
    };
    const xs = packet.map((p) => p.x);
    const ys = packet.map((p) => p.y);
    let holes: Point[] = [];
    for (let attempt = 0; attempt < 2000; attempt += 1) {
      const relax = attempt > 1200 ? 0.7 : 1;
      const candidate: Point[] = [];
      for (let guard = 0; candidate.length < holeCount && guard < 200; guard += 1) {
        const q = {
          x: Math.min(...xs) + rng() * (Math.max(...xs) - Math.min(...xs)),
          y: Math.min(...ys) + rng() * (Math.max(...ys) - Math.min(...ys)),
        };
        if (insideWithMargin(packet, q, 15 * relax)) candidate.push(q);
      }
      if (candidate.length < holeCount) continue;
      if (separation(unfoldAll(candidate)) >= 30 * relax) {
        holes = candidate;
        break;
      }
      holes = candidate;
    }

    // holeSets[s] = holes in the packet after s folds (s = folds → the punched packet).
    const holeSets: Point[][] = new Array(folds + 1);
    holeSets[folds] = holes;
    for (let s = folds; s >= 1; s -= 1) {
      holeSets[s - 1] = [...holeSets[s], ...holeSets[s].map((q) => reflect(q, sequence[s - 1].line))];
    }

    return { folds, sequence, packet, holeSets, square, expected: holeSets[0] };
  }, [seed, difficulty]);

  const K = layout.folds;
  const [phase, setPhase] = useState<"ready" | "folding" | "guessing" | "done">("ready");
  const [clock, setClock] = useState(0);
  const [taps, setTaps] = useState<Point[]>([]);
  const [result, setResult] = useState<(Outcome & { pairs: Array<[Point, Point]> }) | null>(null);
  const frame = useRef<number | null>(null);

  useEffect(() => () => {
    if (frame.current !== null) cancelAnimationFrame(frame.current);
  }, []);

  const run = (duration: number, onEnd: () => void) => {
    const start = performance.now();
    const tick = (now: number) => {
      const t = Math.max(0, (now - start) / 1000);
      setClock(Math.min(t, duration));
      if (t >= duration) {
        frame.current = null;
        onEnd();
        return;
      }
      frame.current = requestAnimationFrame(tick);
    };
    frame.current = requestAnimationFrame(tick);
  };

  const startFolding = () => {
    if (phase !== "ready") return;
    setPhase("folding");
    run(K * FOLD_TIME + 1.1, () => setPhase("guessing"));
  };

  const unfold = () => {
    const truth = layout.expected;
    const cost = truth.map((h) => taps.map((t) => Math.hypot(h.x - t.x, h.y - t.y)));
    const match = assign(cost);
    const pairs: Array<[Point, Point]> = truth.map((h, i) => [h, taps[match[i]]]);
    const misses = pairs.map(([h, t]) => Math.hypot(h.x - t.x, h.y - t.y));
    const accuracy =
      misses.reduce((sum, m) => sum + accuracyFromError(m, 30 - difficulty * 2.5), 0) / misses.length;
    const average = misses.reduce((sum, m) => sum + m, 0) / misses.length;
    const close = misses.filter((m) => m <= 16).length;
    setResult({
      accuracy,
      pairs,
      detail: `${close} of ${truth.length} holes within 16 px. Average miss ${average.toFixed(0)} px.`,
    });
    setPhase("done");
    setClock(0);
    run(K * UNFOLD_TIME + 0.4, () => undefined);
  };

  // ---- what to draw ----------------------------------------------------------------------
  let kept: Point[] = layout.packet;
  let flap: Point[] | null = null;
  let flapLine: Line | null = null;
  let u = 0;
  let guideLine: Line | null = null;
  let keptHoles: Point[] = [];
  let flapHoles: Point[] = [];
  let holeScale = 1;
  let showGhost = true;

  if (phase === "ready") {
    kept = layout.square;
    showGhost = false;
  } else if (phase === "folding") {
    const f = Math.min(K - 1, Math.floor(clock / FOLD_TIME));
    const fold = layout.sequence[f];
    kept = fold.kept;
    flap = fold.flap;
    flapLine = fold.line;
    u = ease(clamp((clock - f * FOLD_TIME - GUIDE) / MOVE, 0, 1));
    if (u < 0.02) guideLine = fold.line;
    if (clock > K * FOLD_TIME + 0.2) {
      flap = null;
      keptHoles = layout.holeSets[K];
      holeScale = ease(clamp((clock - K * FOLD_TIME - 0.2) / 0.4, 0, 1));
    }
    showGhost = true;
  } else if (phase === "guessing") {
    keptHoles = layout.holeSets[K];
  } else if (phase === "done") {
    const j = Math.min(K - 1, Math.floor(clock / UNFOLD_TIME));
    const f = K - 1 - j;
    const fold = layout.sequence[f];
    kept = fold.kept;
    flap = fold.flap;
    flapLine = fold.line;
    u = 1 - ease(clamp((clock - j * UNFOLD_TIME - 0.3) / MOVE, 0, 1));
    keptHoles = layout.holeSets[f + 1];
    flapHoles = keptHoles.map((q) => reflect(q, fold.line));
  }
  const revealed = phase === "done" && clock >= K * UNFOLD_TIME + 0.2;

  const flapPolygon = flap && flapLine ? flap.map((q) => flapPos(q, flapLine, u)) : null;
  const flapShown = flapPolygon && (phase !== "folding" || u < 0.999);

  const addTap = (event: React.PointerEvent<SVGSVGElement>) => {
    const raw = boardPoint(event.currentTarget, event);
    const point = { x: clamp(raw.x, 0, 360), y: clamp(raw.y, 0, 360) };
    const hit = taps.findIndex((t) => Math.hypot(t.x - point.x, t.y - point.y) < 13);
    if (hit >= 0) setTaps(taps.filter((_, i) => i !== hit));
    else if (taps.length < layout.expected.length) setTaps([...taps, point]);
  };

  const board = (
    <GameBoard label="Unfold" onPointerDown={phase === "guessing" ? addTap : undefined}>
      {showGhost && <polygon points={asPoints(layout.square)} className="unfold-ghost" />}

      <polygon points={asPoints(kept)} className="unfold-paper" />
      {keptHoles.map((q, i) => (
        <circle key={`k${i}`} cx={q.x} cy={q.y} r={HOLE_R * holeScale} className="unfold-hole" />
      ))}

      {flapShown && flapPolygon && (
        <g>
          <polygon points={asPoints(flapPolygon)} className={u > 0.5 ? "unfold-paper back" : "unfold-paper"} />
          {phase === "done" &&
            flapLine &&
            flapHoles.map((q, i) => {
              const at = flapPos(q, flapLine, u);
              return <circle key={`f${i}`} cx={at.x} cy={at.y} r={HOLE_R} className="unfold-hole" />;
            })}
        </g>
      )}

      {guideLine && (() => {
        // The crease runs between the kept half's corners that sit on the fold line.
        const onLine = kept.filter((q) => Math.abs(dot(sub(q, guideLine.p), guideLine.n)) < 0.5);
        if (onLine.length < 2) return null;
        const a = onLine[0];
        const b = onLine[onLine.length - 1];
        return <line x1={a.x} y1={a.y} x2={b.x} y2={b.y} className="unfold-guide" />;
      })()}

      {revealed && result &&
        result.pairs.map(([h, t], i) => (
          <line key={`l${i}`} x1={h.x} y1={h.y} x2={t.x} y2={t.y} className="unfold-link" />
        ))}
      {(phase === "guessing" || revealed) &&
        taps.map((t, i) => <circle key={`t${i}`} cx={t.x} cy={t.y} r="5.5" className="unfold-tap" />)}
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

  const total = layout.expected.length;
  const remaining = total - taps.length;
  return (
    <div className="game-content">
      <p className="game-prompt">
        {phase === "ready" && <>A paper is folded, then <strong>{layout.holeSets[K].length} holes</strong> are punched through it.</>}
        {phase === "folding" && <>Watch how it folds…</>}
        {phase === "guessing" && (remaining > 0
          ? <>Tap where all <strong>{total}</strong> holes will be once it’s unfolded. <strong>{remaining}</strong> to go.</>
          : <>Happy with them? Unfold it. Tap a dot to remove it.</>)}
      </p>
      <div className="countdown idle" aria-hidden="true" />
      {board}
      {phase === "guessing" ? (
        <div className="button-row">
          <button
            type="button"
            className="secondary-button"
            disabled={taps.length === 0}
            onClick={() => setTaps(taps.slice(0, -1))}
          >
            Undo
          </button>
          <button type="button" className="primary-button" disabled={remaining > 0} onClick={unfold}>
            Unfold
          </button>
        </div>
      ) : (
        <button
          type="button"
          className="primary-button"
          data-start={phase === "ready" ? "" : undefined}
          disabled={phase !== "ready"}
          onClick={startFolding}
        >
          {phase === "ready" ? "Fold the paper" : "…"}
        </button>
      )}
    </div>
  );
}
