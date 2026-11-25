"use client";

import { useMemo, useState } from "react";
import { accuracyFromError, makeRng } from "@/lib/skillion";
import { boardPoint, clamp, formatNumberWords, GameBoard } from "./game-board";
import { GameResult } from "./game-result";
import type { GameProps, Outcome } from "./types";

export default function NumberLineGame({ seed, maxPoints, onComplete }: GameProps) {
  const rng = useMemo(() => makeRng(`${seed}:number-line:4`), [seed]);
  const target = useMemo(() => Number((10 ** (3.4 + rng() * 5.2)).toPrecision(2)), [rng]);
  const [position, setPosition] = useState<number | null>(null);
  const [result, setResult] = useState<Outcome | null>(null);
  const targetX = 30 + ((Math.log10(target) - 3) / 6) * 300;

  const board = (
    <GameBoard
      label="Number line"
      onPointerDown={result ? undefined : (event) => {
        event.currentTarget.setPointerCapture(event.pointerId);
        setPosition(clamp(boardPoint(event.currentTarget, event).x, 30, 330));
      }}
      onPointerMove={result ? undefined : (event) => {
        if (event.buttons) setPosition(clamp(boardPoint(event.currentTarget, event).x, 30, 330));
      }}
    >
      <line x1="30" y1="185" x2="330" y2="185" className="board-guide-line" />
      {Array.from({ length: 2 }, (_, index) => (
        <line key={index} x1={30 + index * 300} y1="175" x2={30 + index * 300} y2="195" className="board-guide-line" />
      ))}
      {result && (
        <>
          <line x1={targetX} y1="145" x2={targetX} y2="225" className="board-answer-line" />
          <text x={clamp(targetX, 50, 310)} y="135" textAnchor="middle" className="board-label" fontSize="14">{formatNumberWords(target)}</text>
        </>
      )}
      {position !== null && <line x1={position} y1="145" x2={position} y2="225" className="board-accent-line" />}
      <text x="30" y="220" textAnchor="middle" className="board-label">1K</text>
      <text x="330" y="220" textAnchor="middle" className="board-label">1B</text>
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
      <p className="game-prompt">Place <strong>{formatNumberWords(target)}</strong> on the line.</p>
      {board}
      <button
        type="button"
        className="primary-button"
        disabled={position === null}
        onClick={() => {
          if (position === null) return;
          const placed = 10 ** (3 + ((position - 30) / 300) * 6);
          const error = Math.abs(Math.log10(placed) - Math.log10(target));
          setResult({
            accuracy: accuracyFromError(error, 0.4),
            detail: `You entered ${formatNumberWords(placed)}. The answer was ${formatNumberWords(target)}.`,
          });
        }}
      >
        Lock in
      </button>
    </div>
  );
}
