"use client";

import { useEffect, useRef, useState } from "react";
import { TITLE, formatPoints } from "@/lib/skillion";
import { GameBoard } from "./game-board";
import type { GameProps } from "./types";

const POCKETS = [
  0, 32, 15, 19, 4, 21, 2, 25, 17, 34, 6, 27, 13, 36, 11, 30, 8, 23, 10, 5, 24, 16, 33, 1, 20, 14,
  31, 9, 22, 18, 29, 7, 28, 12, 35, 3, 26,
];
const REDS = new Set([1, 3, 5, 7, 9, 12, 14, 16, 18, 19, 21, 23, 25, 27, 30, 32, 34, 36]);
const COLORS = ["red", "green", "black"] as const;
const COLOR_NAME = { red: "Red", black: "Black", green: "Green" } as const;
const PAYOUT = { red: 2, black: 2, green: 36 } as const;
const ODDS = { red: "1:1", black: "1:1", green: "35:1" } as const;
const CX = 180;
const CY = 150;
const R = 124;
const HUB = 52;
const SLOT = 360 / POCKETS.length;
const SPIN_MS = 4200;

type Color = (typeof COLORS)[number];
type Spin = { number: number; color: Color; bet: number; on: Color; net: number };
type Saved = {
  initial: number;
  balance: number;
  wagered: number;
  history: number[];
  last: Spin | null;
};

const fresh = (initial: number): Saved => ({
  initial,
  balance: initial,
  wagered: 0,
  history: [],
  last: null,
});

const colorOf = (number: number): Color =>
  number === 0 ? "green" : REDS.has(number) ? "red" : "black";

const at = (angle: number, radius: number) => ({
  x: CX + radius * Math.sin((angle * Math.PI) / 180),
  y: CY - radius * Math.cos((angle * Math.PI) / 180),
});

function randomPocket() {
  const cryptoApi = globalThis.crypto;
  if (cryptoApi?.getRandomValues) {
    const range = 2 ** 32;
    const limit = Math.floor(range / POCKETS.length) * POCKETS.length;
    const value = new Uint32Array(1);
    do {
      cryptoApi.getRandomValues(value);
    } while (value[0] >= limit);
    return POCKETS[value[0] % POCKETS.length];
  }
  return POCKETS[Math.floor(Math.random() * POCKETS.length)];
}

function readSaved(key: string, initial: number): Saved {
  const raw = localStorage.getItem(key);
  if (!raw) return fresh(initial);
  const saved: unknown = JSON.parse(raw);
  const validLast = (value: unknown): value is Spin | null => {
    if (value === null) return true;
    if (typeof value !== "object" || value === null) return false;
    const spin = value as Record<string, unknown>;
    if (typeof spin.number !== "number" || !Number.isInteger(spin.number) || !POCKETS.includes(spin.number)) return false;
    if (spin.color !== colorOf(spin.number)) return false;
    if (typeof spin.on !== "string" || !COLORS.includes(spin.on as Color)) return false;
    if (typeof spin.bet !== "number" || !Number.isSafeInteger(spin.bet) || spin.bet < 1) return false;
    return typeof spin.net === "number" && Number.isSafeInteger(spin.net);
  };
  if (
    typeof saved === "object" &&
    saved !== null &&
    "initial" in saved &&
    typeof saved.initial === "number" &&
    saved.initial === initial &&
    "balance" in saved &&
    typeof saved.balance === "number" &&
    Number.isSafeInteger(saved.balance) &&
    saved.balance >= 0 &&
    "wagered" in saved &&
    typeof saved.wagered === "number" &&
    Number.isSafeInteger(saved.wagered) &&
    saved.wagered >= 0 &&
    "history" in saved &&
    Array.isArray(saved.history) &&
    saved.history.every((number: unknown) =>
      typeof number === "number" && Number.isInteger(number) && POCKETS.includes(number)
    ) &&
    "last" in saved &&
    validLast(saved.last)
  ) {
    return saved as Saved;
  }
  return fresh(initial);
}

function wedgePath(index: number) {
  const start = at(index * SLOT, R);
  const end = at((index + 1) * SLOT, R);
  return `M ${CX} ${CY} L ${start.x} ${start.y} A ${R} ${R} 0 0 1 ${end.x} ${end.y} Z`;
}

export default function LuckGame({ maxPoints: initial, seed, onComplete }: GameProps) {
  const storageKey = `skillion-${TITLE}-v2-${seed}:luck`;
  const [saved, setSaved] = useState<Saved | null>(null);
  const [betInput, setBetInput] = useState("10");
  const [spinning, setSpinning] = useState(false);
  const [spinAngle, setSpinAngle] = useState(0);
  const [storageError, setStorageError] = useState("");
  const angleRef = useRef(0);
  const spinTimer = useRef<number | null>(null);

  useEffect(() => {
    const timeout = window.setTimeout(() => {
      try {
        const restored = readSaved(storageKey, initial);
        setSaved(restored);
        if (restored.last) {
          const index = POCKETS.indexOf(restored.last.number);
          const settledAngle = -(index + 0.5) * SLOT;
          angleRef.current = settledAngle;
          setSpinAngle(settledAngle);
        }
      } catch (error) {
        console.error("Could not load LUCK progress.", error);
        setStorageError("Saved roulette progress could not be loaded. Reset daily progress to try again.");
      }
    }, 0);
    return () => {
      window.clearTimeout(timeout);
      if (spinTimer.current !== null) window.clearTimeout(spinTimer.current);
    };
  }, [initial, storageKey]);

  const persist = (next: Saved) => {
    try {
      localStorage.setItem(storageKey, JSON.stringify(next));
      setSaved(next);
      return true;
    } catch (error) {
      console.error("Could not save LUCK progress.", error);
      setStorageError("Your bet could not be saved, so it was not placed.");
      return false;
    }
  };

  const placeBet = (color: Color) => {
    if (!saved || spinning || storageError) return;
    const bet = Number(betInput);
    if (!Number.isSafeInteger(bet) || bet < 1 || bet > saved.balance) return;

    const number = randomPocket();
    const resultColor = colorOf(number);
    const won = resultColor === color;
    const balance = won
      ? Math.min(Number.MAX_SAFE_INTEGER, saved.balance + bet * (PAYOUT[color] - 1))
      : saved.balance - bet;
    const net = balance - saved.balance;
    const next: Saved = {
      ...saved,
      balance,
      wagered: saved.wagered + bet,
      history: [...saved.history, number].slice(-8),
      last: { number, color: resultColor, bet, on: color, net },
    };

    if (!persist(next)) return;

    const index = POCKETS.indexOf(number);
    const rotation = ((-(index + 0.5) * SLOT - (angleRef.current % 360)) % 360 + 360) % 360;
    const nextAngle = angleRef.current + 360 * 5 + rotation;
    angleRef.current = nextAngle;
    setSpinning(true);
    requestAnimationFrame(() => setSpinAngle(nextAngle));
    spinTimer.current = window.setTimeout(() => setSpinning(false), SPIN_MS + 100);
  };

  const wheel = (
    <GameBoard label="LUCK roulette wheel">
      <g
        style={{ transform: `rotate(${spinAngle}deg)` }}
        className={spinning ? "luck-wheel spinning" : "luck-wheel"}
      >
        {POCKETS.map((number, index) => {
          const label = at((index + 0.5) * SLOT, R * 0.8);
          const color = colorOf(number);
          return (
            <g key={number}>
              <path d={wedgePath(index)} className={`luck-pocket ${color}`} />
              <text
                x={label.x}
                y={label.y}
                textAnchor="middle"
                dominantBaseline="central"
                transform={`rotate(${(index + 0.5) * SLOT} ${label.x} ${label.y})`}
                className="luck-pocket-number"
              >
                {number}
              </text>
            </g>
          );
        })}
        <circle cx={CX} cy={CY} r={HUB} className="luck-hub" />
        <text x={CX} y={CY + 6} textAnchor="middle" className="luck-hub-label">LUCK</text>
      </g>
      <circle cx={CX} cy={CY} r={R} className="luck-rim" />
      <polygon points={`${CX - 9},${CY - R - 14} ${CX + 9},${CY - R - 14} ${CX},${CY - R + 5}`} className="luck-pointer" />
    </GameBoard>
  );

  if (!saved) {
    return (
      <div className="game-content">
        <p className="game-prompt">Loading LUCK…</p>
        {storageError && <p className="luck-error" role="alert">{storageError}</p>}
        {wheel}
      </div>
    );
  }

  const bet = Number(betInput);
  const validBet = Number.isSafeInteger(bet) && bet >= 1 && bet <= saved.balance;
  const canFinish = saved.wagered >= saved.initial || saved.balance === 0;
  const last = saved.last;

  return (
    <div className="game-content">
      <p className="game-prompt">Place bets on red, black, or green. You must wager your starting points to finish.</p>
      {wheel}
      <div className="luck-dashboard" aria-live="polite">
        <div><span>Points</span><strong>{formatPoints(saved.balance)}</strong></div>
        <div><span>Wagered</span><strong>{formatPoints(saved.wagered)} / {formatPoints(saved.initial)}</strong></div>
      </div>
      <div className="luck-controls">
        <label className="luck-bet-label" htmlFor="luck-bet">Bet amount</label>
        <input
          id="luck-bet"
          className="guess-input luck-bet-input"
          type="number"
          inputMode="numeric"
          min="1"
          max={saved.balance}
          step="1"
          value={betInput}
          disabled={spinning || saved.balance === 0}
          onChange={(event) => setBetInput(event.target.value)}
        />
        <div className="luck-color-bets" role="group" aria-label="Choose a roulette color to bet on">
          {COLORS.map((color) => (
            <button
              key={color}
              type="button"
              className={`luck-color-bet ${color}`}
              disabled={!validBet || spinning || Boolean(storageError)}
              onClick={() => placeBet(color)}
            >
              <span>{COLOR_NAME[color]}</span>
              <small>{ODDS[color]}</small>
            </button>
          ))}
        </div>
        <p className="luck-last-result" aria-live="polite">
          {storageError
            ? storageError
            : spinning
              ? "The wheel is spinning…"
              : last
                ? `${last.number} ${COLOR_NAME[last.color]} | ${last.net >= 0 ? "+" : ""}${formatPoints(last.net)} points`
                : "Choose a color to place your first bet."}
        </p>
        <button
          type="button"
          className="primary-button"
          disabled={!canFinish || spinning}
          onClick={() => onComplete(saved.balance, `Final points: ${formatPoints(saved.balance)}.`)}
        >
          Done
        </button>
      </div>
    </div>
  );
}
