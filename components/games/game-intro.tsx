"use client";

import type { CSSProperties } from "react";
import { Play } from "lucide-react";
import { formatPoints, type GameType } from "@/lib/skillion";
import { GAME_INFO } from "./game-info";

export function CloseIcon() {
  return (
    <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" aria-hidden="true">
      <path d="M6 6l12 12M18 6L6 18" />
    </svg>
  );
}

// Same colours as the row locks on the main grid, green (easy) to deep red (hard).
const ROW_COLORS = ["#77a75b", "#9aa75c", "#c0a45c", "#b87550", "#96483f", "#5f2021"];

/**
 * Pre-game screen. Mirrors the main menu: a gradient "tile" up top carrying the title,
 * a ruled micro-label strip, flat edges, and a full-width start bar at the bottom.
 */
export function GameIntro({
  type,
  name,
  maxPoints,
  gridPosition,
  row = 0,
  onStart,
  onClose,
}: {
  type: GameType;
  name: string;
  maxPoints: number;
  gridPosition: number | null;
  /** Grid row the game sits in (0–4, 5 = finale). */
  row?: number;
  onStart: () => void;
  onClose: () => void;
}) {
  const info = GAME_INFO[type];
  const title = name.toUpperCase();
  // Shrink long names so the title always fits on one line.
  const titleSize = Math.min(14, 84 / (title.length * 0.7));
  return (
    <div
      className="stage-intro"
      style={{ "--title-size": `${titleSize}cqw` } as CSSProperties}
    >
      <div className="stage-hero">
        <div className="stage-hero-meta">
          <span>
            <i aria-hidden="true">✶</i>
            {gridPosition === null ? "Finale" : `${gridPosition} / 25`}
          </span>
        </div>
        <button type="button" className="stage-close intro" onClick={onClose} aria-label="Close">
          <CloseIcon />
        </button>
        <h2 id="game-title" className="stage-title">{title}</h2>
      </div>

      <div className="stage-body">
        <p className="stage-copy">
          <svg className="stage-info-icon" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" aria-hidden="true">
            <circle cx="10" cy="10" r="7.5" />
            <path d="M10 9v5M10 6h.01" />
          </svg>
          {info.how}
        </p>

        {type !== "luck" && (
          <div className="stage-facts">
            <div>
              <span className="stage-fact-label">Max Points</span>
              <span className="stage-fact-value">{formatPoints(maxPoints)}</span>
            </div>
            <div>
              {row < 5 ? (
                <span className="stage-fact-value stage-pips" aria-label={`Row ${row + 1} of 5`}>
                  <span className="pips" aria-hidden="true">
                    {ROW_COLORS.slice(0, 5).map((c, i) => (
                      <b key={c} className={i <= row ? "on" : ""} style={{ "--pip": c } as CSSProperties} />
                    ))}
                  </span>
                  <em>Row {row + 1}</em>
                </span>
              ) : (
                <>
                  <span className="stage-fact-label">Stage</span>
                  <span className="stage-fact-value">Finale</span>
                </>
              )}
            </div>
          </div>
        )}

        <button type="button" className="stage-start" onClick={onStart} aria-label={`Start ${name}`} autoFocus>
          <span>PLAY</span>
          <span className="stage-start-arrow" aria-hidden="true"><Play size={14} fill="currentColor" /></span>
        </button>
      </div>
    </div>
  );
}
