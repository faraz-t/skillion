"use client";

import type { ReactNode } from "react";
import type { Point } from "./types";

export type BoardPoint = Point;

/**
 * The board is a 360×360 square of game space, but the SVG fills the whole floating card,
 * so there is extra room above (prompt) and below (controls). Games keep drawing in 0–360;
 * the viewBox just reaches past that square.
 */
export const BOARD_TOP = 90;
export const BOARD_BOTTOM = 74;
export const VIEW_HEIGHT = BOARD_TOP + 360 + BOARD_BOTTOM;

export function boardPoint(element: SVGSVGElement, event: React.PointerEvent<SVGSVGElement>): BoardPoint {
  // The screen→viewBox matrix handles the card's size and the extended viewBox for us.
  const matrix = element.getScreenCTM();
  if (matrix) {
    const point = element.createSVGPoint();
    point.x = event.clientX;
    point.y = event.clientY;
    const local = point.matrixTransform(matrix.inverse());
    return { x: local.x, y: local.y };
  }
  const rect = element.getBoundingClientRect();
  return {
    x: ((event.clientX - rect.left) * 360) / rect.width,
    y: ((event.clientY - rect.top) * VIEW_HEIGHT) / rect.height - BOARD_TOP,
  };
}

export const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));

export function formatNumberWords(value: number) {
  const rounded = Number(value.toPrecision(2));
  if (rounded >= 1e9) return `${+(rounded / 1e9).toPrecision(2)} billion`;
  if (rounded >= 1e6) return `${+(rounded / 1e6).toPrecision(2)} million`;
  return `${+(rounded / 1e3).toPrecision(2)} thousand`;
}

/** Thin bar that drains over `seconds` — used when something is only shown briefly. */
export function Countdown({ seconds }: { seconds: number }) {
  return (
    <div className="countdown" aria-hidden="true">
      <i style={{ animationDuration: `${seconds}s` }} />
    </div>
  );
}

export function GameBoard({
  label,
  children,
  onPointerDown,
  onPointerMove,
  onPointerUp,
}: {
  label: string;
  children: ReactNode;
  onPointerDown?: (event: React.PointerEvent<SVGSVGElement>) => void;
  onPointerMove?: (event: React.PointerEvent<SVGSVGElement>) => void;
  onPointerUp?: (event: React.PointerEvent<SVGSVGElement>) => void;
}) {
  return (
    <svg
      className={`game-board${onPointerDown ? " interactive" : ""}`}
      viewBox={`0 ${-BOARD_TOP} 360 ${VIEW_HEIGHT}`}
      role="img"
      aria-label={`${label} game board`}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={onPointerUp}
    >
      {children}
    </svg>
  );
}
