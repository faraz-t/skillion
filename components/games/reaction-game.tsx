"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { makeRng } from "@/lib/skillion";
import { boardPoint, clamp, GameBoard } from "./game-board";
import { GameResult } from "./game-result";
import type { GameProps, Outcome } from "./types";

const FLASHES = 10;
const TILE_SIZE = 120;
const TILE_KEYS = ["1", "2", "3", "q", "w", "e", "a", "s", "d"];

export default function ReactionGame({ difficulty, seed, maxPoints, onComplete }: GameProps) {
  const setup = useMemo(() => {
    const rng = makeRng(`${seed}:reaction:${difficulty}`);
    const tiles: number[] = [];
    const delays: number[] = [];
    let previous = -1;
    for (let i = 0; i < FLASHES; i += 1) {
      let tile = Math.floor(rng() * 9);
      while (tile === previous) tile = Math.floor(rng() * 9);
      tiles.push(tile);
      delays.push(350 + Math.floor(rng() * 550));
      previous = tile;
    }
    return { tiles, delays };
  }, [seed, difficulty]);
  const sequence = setup.tiles;

  const [phase, setPhase] = useState<"ready" | "running" | "done">("ready");
  const [active, setActive] = useState<number | null>(null);
  const [trial, setTrial] = useState(0);
  const [times, setTimes] = useState<number[]>([]);
  const [result, setResult] = useState<Outcome | null>(null);
  const timesRef = useRef<number[]>([]);
  const shownAt = useRef(0);
  const timer = useRef<number | null>(null);
  const scheduleFlashRef = useRef<(index: number) => void>(() => undefined);

  useEffect(() => () => {
    if (timer.current !== null) window.clearTimeout(timer.current);
  }, []);

  const finish = useCallback((reactionTimes: number[]) => {
    const average = reactionTimes.reduce((sum, time) => sum + time, 0) / reactionTimes.length;
    let accuracy: number;
    if (average <= 300) {
      accuracy = 1;
    } else if (average <= 450) {
      const progress = (average - 300) / 150;
      const smooth = progress * progress * (3 - 2 * progress);
      accuracy = 1 - 0.5 * smooth;
    } else if (average <= 700) {
      const progress = (average - 450) / 250;
      const smooth = progress * progress * (3 - 2 * progress);
      accuracy = 0.5 - 0.25 * smooth;
    } else if (average <= 1500) {
      const progress = (average - 700) / 800;
      const smooth = progress * progress * (3 - 2 * progress);
      accuracy = 0.25 * (1 - smooth);
    } else {
      accuracy = 0;
    }
    setPhase("done");
    setActive(null);
    setResult({
      accuracy,
      detail: `Average reaction time: ${Math.round(average)} ms across ${reactionTimes.length} flashes.`,
    });
  }, []);

  const scheduleFlash = useCallback((index: number) => {
    setActive(null);
    timer.current = window.setTimeout(() => {
      if (index >= FLASHES) return;
      shownAt.current = performance.now();
      setActive(sequence[index]);
      timer.current = window.setTimeout(() => {
        timesRef.current = [...timesRef.current, 1500];
        setTimes(timesRef.current);
        setActive(null);
        const next = index + 1;
        setTrial(next);
        if (next >= FLASHES) finish(timesRef.current);
        else scheduleFlashRef.current(next);
      }, 1500);
    }, setup.delays[index]);
  }, [finish, sequence, setup.delays]);

  useEffect(() => {
    scheduleFlashRef.current = scheduleFlash;
  }, [scheduleFlash]);

  const registerHit = useCallback((tile: number) => {
    if (phase !== "running" || active === null || tile !== active) return;
    if (timer.current !== null) window.clearTimeout(timer.current);
    const reaction = Math.max(1, performance.now() - shownAt.current);
    timesRef.current = [...timesRef.current, reaction];
    setTimes(timesRef.current);
    setActive(null);
    const next = trial + 1;
    setTrial(next);
    if (next >= FLASHES) finish(timesRef.current);
    else scheduleFlashRef.current(next);
  }, [active, finish, phase, trial]);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.repeat) return;
      const tile = TILE_KEYS.indexOf(event.key.toLowerCase());
      if (tile < 0) return;
      event.preventDefault();
      registerHit(tile);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [registerHit]);

  const start = () => {
    timesRef.current = [];
    setTimes([]);
    setTrial(0);
    setPhase("running");
    scheduleFlash(0);
  };

  const hitTile = (event: React.PointerEvent<SVGSVGElement>) => {
    if (phase !== "running" || active === null) return;
    const point = boardPoint(event.currentTarget, event);
    const column = clamp(Math.floor(point.x / TILE_SIZE), 0, 2);
    const row = clamp(Math.floor(point.y / TILE_SIZE), 0, 2);
    registerHit(row * 3 + column);
  };

  const board = (
    <GameBoard label="Reaction" onPointerDown={phase === "running" ? hitTile : undefined}>
      {Array.from({ length: 9 }, (_, tile) => {
        const row = Math.floor(tile / 3);
        const column = tile % 3;
        return (
          <g key={tile}>
            <rect
              x={column * TILE_SIZE}
              y={row * TILE_SIZE}
              width={TILE_SIZE}
              height={TILE_SIZE}
              className={`reaction-tile${active === tile ? " active" : ""}`}
            />
            <text
              x={column * TILE_SIZE + TILE_SIZE / 2}
              y={row * TILE_SIZE + TILE_SIZE / 2 + 7}
              textAnchor="middle"
              className={`reaction-key${active === tile ? " active" : ""}`}
            >
              {TILE_KEYS[tile].toUpperCase()}
            </text>
          </g>
        );
      })}
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
        {phase === "ready"
          ? <>Click 10 flashes as quickly as you can.</>
          : <>Flash <strong>{trial + 1}</strong> of <strong>{FLASHES}</strong>{times.length > 0 ? ` - last: ${Math.round(times[times.length - 1])} ms` : ""}</>}
      </p>
      <div className="countdown idle" aria-hidden="true" />
      {board}
      <button type="button" className="primary-button" data-start={phase === "ready" ? "" : undefined} disabled={phase === "running"} onClick={start}>
        {phase === "ready" ? "Start" : "React"}
      </button>
    </div>
  );
}
