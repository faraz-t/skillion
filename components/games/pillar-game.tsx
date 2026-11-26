"use client";

import { useEffect, useRef, useState } from "react";
import { clamp, GameBoard } from "./game-board";
import { GameResult } from "./game-result";
import type { GameProps, Outcome } from "./types";

const FIELD_WIDTH = 13;
const MAX_DROPS = 10;
const UNIT = 24;
const FIELD_X = (360 - FIELD_WIDTH * UNIT) / 2;
const FIELD_Y = 48;
const START_WIDTH = 7;
const BASE_ROW = MAX_DROPS;

type Layer = { x: number; width: number; row: number };
type PillarResult = Outcome & {
  height: number;
  width: number;
  failedX: number | null;
};

function accuracyFor(height: number, width: number) {
  const widthRatio = width / START_WIDTH;
  if (height >= MAX_DROPS) {
    return 0.55 + 0.45 * widthRatio ** 2;
  }
  const progress = height / MAX_DROPS;
  return 0.5 * progress ** 3 * widthRatio ** 1.5;
}

export default function PillarGame({ difficulty, maxPoints, onComplete }: GameProps) {
  const [tower, setTower] = useState<Layer[]>([
    { x: (FIELD_WIDTH - START_WIDTH) / 2, width: START_WIDTH, row: BASE_ROW },
  ]);
  const [blockX, setBlockX] = useState(0);
  const [moving, setMoving] = useState(false);
  const [drops, setDrops] = useState(0);
  const [result, setResult] = useState<PillarResult | null>(null);
  const blockXRef = useRef(0);
  const directionRef = useRef(1);
  const frameRef = useRef<number | null>(null);
  const lastFrameRef = useRef<number | null>(null);

  const width = tower[tower.length - 1].width;
  const height = tower.length - 1;
  const nextRow = BASE_ROW - tower.length;

  useEffect(() => () => {
    if (frameRef.current !== null) cancelAnimationFrame(frameRef.current);
  }, []);

  const beginMotion = (blockWidth: number, stackHeight: number) => {
    setMoving(true);
    lastFrameRef.current = null;
    const tick = (now: number) => {
      if (lastFrameRef.current === null) lastFrameRef.current = now;
      const elapsed = Math.min((now - lastFrameRef.current) / 1000, 0.05);
      lastFrameRef.current = now;
      const speed = 6 + difficulty * 1.1 + stackHeight * 0.55;
      let next = blockXRef.current + directionRef.current * speed * elapsed;
      const maxX = FIELD_WIDTH - blockWidth;
      if (next >= maxX) {
        next = maxX;
        directionRef.current = -1;
      } else if (next <= 0) {
        next = 0;
        directionRef.current = 1;
      }
      blockXRef.current = next;
      setBlockX(next);
      frameRef.current = requestAnimationFrame(tick);
    };
    frameRef.current = requestAnimationFrame(tick);
  };

  const start = () => {
    if (moving || result) return;
    beginMotion(width, height);
  };

  const stop = () => {
    if (!moving || result) return;
    if (frameRef.current !== null) cancelAnimationFrame(frameRef.current);
    frameRef.current = null;
    setMoving(false);
    const landedX = clamp(blockXRef.current, 0, FIELD_WIDTH - width);
    const previous = tower[tower.length - 1];
    const left = Math.max(landedX, previous.x);
    const right = Math.min(landedX + width, previous.x + previous.width);
    const overlap = right - left;

    if (overlap <= 0) {
      const accuracy = accuracyFor(height, width);
      setResult({
        accuracy,
        height,
        width,
        failedX: landedX,
        detail: `The tower fell at height ${height}. Its top row was ${width} blocks wide.`,
      });
      return;
    }

    const nextTower = [...tower, { x: left, width: overlap, row: nextRow }];
    const nextHeight = height + 1;
    setTower(nextTower);
    setDrops(nextHeight);

    if (nextHeight >= MAX_DROPS) {
      const accuracy = accuracyFor(nextHeight, overlap);
      setResult({
        accuracy,
        height: nextHeight,
        width: overlap,
        failedX: null,
        detail: `You reached the top with a ${overlap.toFixed(2)}-block-wide tower.`,
      });
      return;
    }

    const nextMaxX = FIELD_WIDTH - overlap;
    const startAtRight = nextHeight % 2 === 1;
    const nextX = startAtRight ? nextMaxX : 0;
    blockXRef.current = nextX;
    setBlockX(nextX);
    directionRef.current = startAtRight ? -1 : 1;
    beginMotion(overlap, nextHeight);
  };

  const board = (
    <GameBoard label="Pillar" onPointerDown={moving ? stop : undefined}>
      <text x="30" y="24" className="board-label">
        HEIGHT {Math.min(height, MAX_DROPS)}/{MAX_DROPS}
      </text>
      <text x="330" y="24" textAnchor="end" className="board-label">
        WIDTH {width.toFixed(2)}/{START_WIDTH}
      </text>
      <rect
        x={FIELD_X}
        y={FIELD_Y}
        width={FIELD_WIDTH * UNIT}
        height={MAX_DROPS * UNIT}
        className="pillar-lane"
      />
      <line
        x1={FIELD_X}
        y1={FIELD_Y + MAX_DROPS * UNIT}
        x2={FIELD_X + FIELD_WIDTH * UNIT}
        y2={FIELD_Y + MAX_DROPS * UNIT}
        className="pillar-ground"
      />
      {tower.map((layer, index) => (
        <rect
          key={`${layer.row}-${index}`}
          x={FIELD_X + layer.x * UNIT}
          y={FIELD_Y + layer.row * UNIT}
          width={layer.width * UNIT}
          height={UNIT}
          className={`pillar-block${index === tower.length - 1 ? " top" : ""}`}
        />
      ))}
      {result && result.failedX !== null && (
        <rect
          x={FIELD_X + result.failedX * UNIT}
          y={FIELD_Y + nextRow * UNIT}
          width={width * UNIT}
          height={UNIT}
          className="pillar-block failed"
        />
      )}
      {moving && !result && (
        <rect
          x={FIELD_X + blockX * UNIT}
          y={FIELD_Y + nextRow * UNIT}
          width={width * UNIT}
          height={UNIT}
          className="pillar-block moving"
        />
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
        Drop the moving row onto the tower. <strong>Overhangs are cut off</strong>; miss completely and the run ends.
      </p>
      {board}
      <p className="pillar-status" aria-live="polite">
        {moving
          ? "Tap the board or press Drop"
          : `${drops} ${drops === 1 ? "row" : "rows"} stacked · tower narrows with each overhang`}
      </p>
      <button
        type="button"
        className="primary-button"
        data-start={!moving ? "" : undefined}
        onClick={moving ? stop : start}
      >
        {moving ? "Drop" : "Start"}
      </button>
    </div>
  );
}
