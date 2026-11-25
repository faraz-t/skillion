"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { accuracyFromError, makeRng } from "@/lib/skillion";
import { GameBoard } from "./game-board";
import { GameResult } from "./game-result";
import type { GameProps, Outcome } from "./types";

export default function TempoGame({ difficulty, seed, maxPoints, onComplete }: GameProps) {
  const target = useMemo(() => {
    const rng = makeRng(`${seed}:tempo:${difficulty}`);
    let value: number;
    if (difficulty === 0) {
      value = 1 + Math.floor(rng() * 4); // 1–4, but 1 is excluded below
    } else if (difficulty === 1) {
      value = 1 + Math.floor(rng() * 8) / 2; // 1–4.5 in 0.5 steps
    } else {
      const lo = [0, 0, 0.8, 0.6, 0.5][difficulty] ?? 0.5;
      const hi = [0, 0, 4.8, 5, 5][difficulty] ?? 5;
      value = Math.round((lo + rng() * (hi - lo)) * 10) / 10;
    }
    if (value === 1) {
      value = rng() < 0.5 ? 0.8 : 1.2;
    }
    return value;
  }, [seed, difficulty]);
  const need = Math.max(5, Math.min(14, Math.ceil(target * 4) + 1));

  const [taps, setTaps] = useState<number[]>([]);
  const [lightOn, setLightOn] = useState(false);
  const [result, setResult] = useState<(Outcome & { times: number[] }) | null>(null);
  const tapsRef = useRef<number[]>([]);
  const finished = useRef(false);

  const tap = useCallback(() => {
    if (finished.current) return;
    const next = [...tapsRef.current, performance.now()];
    tapsRef.current = next;
    setTaps(next);
    if (next.length < need) return;
    finished.current = true;
    const span = (next[next.length - 1] - next[0]) / 1000;
    const rate = (next.length - 1) / span;
    setResult({
      times: next.map((t) => (t - next[0]) / 1000),
      accuracy: accuracyFromError(Math.abs(rate - target) / target, 0.3 - difficulty * 0.04),
      detail: `You averaged ${rate.toFixed(2)} taps per second. The target was ${target.toFixed(1)}.`,
    });
  }, [need, target, difficulty]);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.code !== "Space" || event.repeat) return;
      event.preventDefault();
      tap();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [tap]);

  useEffect(() => {
    if (result) return;
    let offTimer: number | null = null;
    const interval = window.setInterval(() => {
      setLightOn(true);
      if (offTimer !== null) window.clearTimeout(offTimer);
      offTimer = window.setTimeout(() => setLightOn(false), 140);
    }, 1000);
    return () => {
      window.clearInterval(interval);
      if (offTimer !== null) window.clearTimeout(offTimer);
    };
  }, [result]);

  const ring = (i: number) => {
    const a = (i / need) * Math.PI * 2 - Math.PI / 2;
    return { x: 180 + Math.cos(a) * 150, y: 180 + Math.sin(a) * 150 };
  };

  let board;
  if (result) {
    // Timeline: ideal beat (grey) vs. your taps (orange).
    const idealSpan = (need - 1) / target;
    const span = Math.max(idealSpan, result.times[result.times.length - 1]);
    const x = (t: number) => 30 + (t / span) * 300;
    board = (
      <GameBoard label="Tempo">
        <text x="30" y="108" className="board-label" fontSize="13">TARGET BEAT · {target.toFixed(1)}/s</text>
        <line x1="30" y1="135" x2="330" y2="135" className="board-guide-line" />
        {Array.from({ length: need }, (_, i) => (
          <line key={i} x1={x(i / target)} y1="120" x2={x(i / target)} y2="150" className="board-answer-line" />
        ))}
        <text x="30" y="228" className="board-label" fontSize="13">YOUR TAPS</text>
        <line x1="30" y1="255" x2="330" y2="255" className="board-guide-line" />
        {result.times.map((t, i) => (
          <line key={i} x1={x(t)} y1="240" x2={x(t)} y2="270" className="board-accent-line" />
        ))}
      </GameBoard>
    );
  } else {
    board = (
      <GameBoard label="Tempo" onPointerDown={() => tap()}>
        <circle cx="330" cy="30" r="7" className={lightOn ? "tempo-light on" : "tempo-light"} />
        {Array.from({ length: need }, (_, i) => (
          <circle key={i} cx={ring(i).x} cy={ring(i).y} r="5" className={i < taps.length ? "board-accent-dot" : "tempo-pip"} />
        ))}
        <circle cx="180" cy="180" r="92" className="tempo-pad" />
        {taps.length > 0 && <circle key={taps.length} cx="180" cy="180" r="92" className="tap-pulse" />}
        <text x="180" y="204" textAnchor="middle" className="board-question" fontSize="52">{taps.length === 0 ? "TAP" : `${taps.length}/${need}`}</text>
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
        Tap the circle at <strong>{target.toFixed(1)} taps per second</strong>. Use the flashing light as a guide: it flashes once per second.
      </p>
      <div className="countdown idle" aria-hidden="true" />
      {board}
    </div>
  );
}
