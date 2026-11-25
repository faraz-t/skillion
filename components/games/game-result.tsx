"use client";

import { useEffect, useState, type ReactNode } from "react";
import { formatPoints } from "@/lib/skillion";

type Tone = "good" | "ok" | "bad";

/** [label, tone, number of ✶ earned] */
function verdictOf(accuracy: number): [string, Tone, number] {
  if (accuracy >= 0.97) return ["Perfect", "good", 3];
  if (accuracy >= 0.85) return ["Excellent", "good", 2];
  if (accuracy >= 0.65) return ["Good", "good", 1];
  if (accuracy >= 0.45) return ["Close", "ok", 0];
  if (accuracy >= 0.15) return ["Off the mark", "bad", 0];
  return ["Miss", "bad", 0];
}

export function GameResult({
  accuracy,
  maxPoints,
  detail,
  onDone,
  board,
}: {
  accuracy: number;
  maxPoints: number;
  detail: string;
  onDone: () => void;
  /** The game's board with the answer revealed, shown above the score. */
  board?: ReactNode;
}) {
  const points = Math.round((maxPoints * accuracy) / 10) * 10;
  const [displayed, setDisplayed] = useState(0);
  const [, tone] = verdictOf(accuracy);

  useEffect(() => {
    const duration = 650;
    const start = performance.now();
    let frame = 0;
    const tick = (now: number) => {
      const progress = Math.min(1, (now - start) / duration);
      setDisplayed(Math.round(points * (1 - Math.pow(1 - progress, 3))));
      if (progress < 1) frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [points]);

  return (
    <div className="game-result-card" aria-live="polite">
      {board}
      {/* One box holds the score, what happened, and the accuracy meter. */}
      <div className="result-panel">
        <div className="result-panel-row">
          <div className="game-result-points">+{formatPoints(displayed)}</div>
          <p className="game-result-detail">{detail}</p>
        </div>
        <div className="result-meter" aria-hidden="true">
          <i className={`tone-${tone}`} style={{ width: `${Math.round(accuracy * 100)}%` }} />
        </div>
      </div>
      <button type="button" className="primary-button" onClick={onDone}>Done</button>
    </div>
  );
}
