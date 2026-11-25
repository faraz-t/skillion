"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { makeRng } from "@/lib/skillion";
import { Countdown, GameBoard } from "./game-board";
import { GameResult } from "./game-result";
import type { GameProps, Outcome } from "./types";

// One flat bank; each difficulty draws from the words whose length falls in its band.
const WORD_BANK = `
BALANCE JOURNEY PICTURE KITCHEN CAPTAIN LIBRARY PERFECT HARVEST MYSTERY TRIUMPH QUARTER MACHINE
VOLCANO WEATHER CHAPTER CURRENCY DIAMOND EVENING FOREIGN GRAVITY HOLIDAY IMAGINE JUSTICE LEOPARD
MORNING NETWORK PRESENT QUALITY ROMANCE SILENCE TEACHER UNIFORM VILLAGE WARRIOR
ELEPHANT MOUNTAIN BIRTHDAY SANDWICH PAINTING LANGUAGE HOSPITAL KEYBOARD GARDENER ARGUMENT BACKYARD
CALENDAR DAUGHTER FESTIVAL NOTEBOOK MAGAZINE STRATEGY TREASURE UMBRELLA VACATION WILDLIFE
CHOCOLATE BUTTERFLY ADVENTURE UNIVERSAL SEPTEMBER LIGHTNING TELEPHONE PINEAPPLE EMERGENCY GENERATOR
HAPPINESS KNOWLEDGE LANDSCAPE OPERATION PASSENGER BLUEPRINT CELEBRATE DANGEROUS ELEVATION FURNITURE
GOVERNMENT HURRICANE
STRAWBERRY BASKETBALL PLAYGROUND WATERMELON APPRECIATE ASTRONOMER DISCOVERY ADVENTURER BEAUTIFULLY
CATERPILLAR CROCODILE DICTIONARY EXPERIMENT FIREWORKS HEADQUARTERS IMPORTANCE INDIVIDUAL KNOWLEDGEABLE
GRANDFATHER UNDERGROUND CELEBRATION ADVENTUROUS ARCHAEOLOGY BREAKTHROUGH CHAMPIONSHIP THANKSGIVING
ARCHITECTURE REFRIGERATOR PROFESSIONAL PHOTOGRAPHER ENCYCLOPEDIA CONSTRUCTION DISAPPOINTED
ELECTRICITY EXPEDITION FRIENDSHIPS GEOGRAPHICAL HELICOPTER IMPOSSIBLE
CONSTELLATION EXTRAORDINARY INTERNATIONAL UNDERSTANDING COMMUNICATION CONGRATULATIONS CHARACTERISTIC
ENTREPRENEURSHIP INCOMPREHENSIBLE MISUNDERSTANDING UNCONSTITUTIONAL RESPONSIBILITIES ENVIRONMENTALIST
PSYCHOLOGICAL PHILOSOPHICAL SUSTAINABILITY CONSCIOUSNESS ACCOMMODATIONS DISPROPORTIONATE
DEMONSTRATION ADMINISTRATION COMPREHENSION DETERMINATION DISAPPOINTMENT INVESTIGATION OPPORTUNITIES
REPRESENTATIVE RECOMMENDATION TRANSPORTATION UNFORGETTABLE UNPREDICTABLE REVOLUTIONARY
ACCOUNTABILITY CONTEMPORARY COLLABORATION ENTHUSIASTICALLY EXTRATERRESTRIAL IMAGINATIVE
INTELLIGENCE INTERPRETATION MATHEMATICIAN MULTIPLICATION NEIGHBOURHOOD PHARMACEUTICAL
PROFESSIONALISM RESPONSIBILITY SOPHISTICATED SPECTACULARLY TRANSFORMATION UNBELIEVABLE UNCOMFORTABLE
`.split(/\s+/).filter(Boolean);

/** [min, max] word length for each difficulty row. */
const LENGTH_BANDS: [number, number][] = [[7, 8], [8, 9], [9, 11], [11, 13], [13, 16]];

const wordsFor = (difficulty: number) => {
  const [min, max] = LENGTH_BANDS[Math.min(difficulty, LENGTH_BANDS.length - 1)];
  return WORD_BANK.filter((w) => w.length >= min && w.length <= max);
};

function levenshtein(a: string, b: string) {
  const row = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i += 1) {
    let prev = row[0];
    row[0] = i;
    for (let j = 1; j <= b.length; j += 1) {
      const tmp = row[j];
      row[j] = Math.min(row[j] + 1, row[j - 1] + 1, prev + (a[i - 1] === b[j - 1] ? 0 : 1));
      prev = tmp;
    }
  }
  return row[b.length];
}

function Tiles({ letters, y, size, status, rows = 1 }: { letters: string; y: number; size: number; status?: boolean[]; rows?: number }) {
  const perRow = Math.ceil(letters.length / rows);
  const gap = 4;
  return (
    <>
      {letters.split("").map((letter, i) => {
        const row = Math.floor(i / perRow);
        const inRow = row === rows - 1 ? letters.length - perRow * row : perRow;
        const x = 180 - (inRow * (size + gap) - gap) / 2 + (i - row * perRow) * (size + gap);
        const top = y + row * (size + gap);
        const cls = status ? (status[i] ? "letter-tile ok" : "letter-tile bad") : "letter-tile";
        return (
          <g key={i}>
            <rect x={x} y={top} width={size} height={size} className={cls} />
            <text x={x + size / 2} y={top + size / 2} textAnchor="middle" dominantBaseline="central" className="letter-text" fontSize={size * 0.55}>
              {letter}
            </text>
          </g>
        );
      })}
    </>
  );
}

export default function ScrambleGame({ difficulty, seed, maxPoints, onComplete }: GameProps) {
  const { word, scrambled } = useMemo(() => {
    const rng = makeRng(`${seed}:scramble:${difficulty}`);
    const list = wordsFor(difficulty);
    const answer = list[Math.floor(rng() * list.length)];
    let letters = answer.split("");
    for (let attempt = 0; attempt < 60; attempt += 1) {
      const shuffled = answer.split("");
      for (let i = shuffled.length - 1; i > 0; i -= 1) {
        const j = Math.floor(rng() * (i + 1));
        [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
      }
      const fixed = shuffled.filter((ch, i) => ch === answer[i]).length;
      letters = shuffled;
      if (fixed <= 1 && shuffled.join("") !== answer) break;
    }
    return { word: answer, scrambled: letters.join("") };
  }, [seed, difficulty]);

  // Longer words need longer to take in.
  const showFor = Math.max(4, 4 + word.length * 0.4 - difficulty * 0.5);
  const [phase, setPhase] = useState<"ready" | "showing" | "guessing">("ready");
  const [guess, setGuess] = useState("");
  const [result, setResult] = useState<Outcome | null>(null);
  const timer = useRef<number | null>(null);

  useEffect(() => () => {
    if (timer.current !== null) window.clearTimeout(timer.current);
  }, []);

  const submit = () => {
    const attempt = guess.trim().toUpperCase();
    if (!attempt) return;
    const similarity = Math.max(0, 1 - levenshtein(attempt, word) / Math.max(word.length, attempt.length));
    const accuracy = Math.pow(similarity, 1.5);
    setResult({
      accuracy,
      detail: attempt === word
        ? `Unscrambled: ${word}.`
        : `You wrote ${attempt}. The word was ${word} — ${Math.round(similarity * 100)}% similar.`,
    });
  };

  const attempt = guess.trim().toUpperCase();
  const longest = Math.max(word.length, attempt.length);
  const revealRows = longest > 10 ? 2 : 1;
  const revealSize = Math.min(32, Math.floor(330 / Math.ceil(longest / revealRows)) - 4);
  const flashRows = word.length > 8 ? 2 : 1;
  const flashSize = Math.min(40, Math.floor(330 / Math.ceil(word.length / flashRows)) - 4);
  const board = result ? (
    <GameBoard label="Unscramble">
      <text x="180" y="100" textAnchor="middle" className="board-label" fontSize="13">ANSWER</text>
      <Tiles letters={word} y={112} size={revealSize} rows={revealRows} />
      <text x="180" y="208" textAnchor="middle" className="board-label" fontSize="13">YOURS</text>
      <Tiles
        letters={attempt.padEnd(1, "·")}
        y={220}
        size={revealSize}
        rows={revealRows}
        status={attempt.split("").map((ch, i) => ch === word[i])}
      />
    </GameBoard>
  ) : (
    <GameBoard label="Unscramble">
      {phase === "showing" && <Tiles letters={scrambled} y={flashRows === 2 ? 360 / 2 - flashSize - 2 : 180 - flashSize / 2} size={flashSize} rows={flashRows} />}
      {phase === "guessing" && <text x="180" y="205" textAnchor="middle" className="board-question">?</text>}
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
        {phase === "guessing"
          ? <>Type the <strong>unscrambled word</strong>. The closer you are, the more you score.</>
          : <>A scrambled word flashes up. Remember it, then <strong>unscramble</strong> it.</>}
      </p>
      {phase === "showing" ? <Countdown seconds={showFor} /> : <div className="countdown idle" aria-hidden="true" />}
      {board}
      {phase === "guessing" && (
        <input
          className="guess-input word"
          type="text"
          autoFocus
          autoCapitalize="characters"
          autoComplete="off"
          autoCorrect="off"
          spellCheck={false}
          maxLength={word.length + 2}
          placeholder={"·".repeat(word.length)}
          value={guess}
          onChange={(event) => setGuess(event.target.value.replace(/[^a-zA-Z]/g, ""))}
          onKeyDown={(event) => { if (event.key === "Enter") submit(); }}
        />
      )}
      <button
        type="button"
        className="primary-button"
        data-start={phase === "ready" ? "" : undefined}
        disabled={phase === "showing" || (phase === "guessing" && guess === "")}
        onClick={() => {
          if (phase === "ready") {
            setPhase("showing");
            timer.current = window.setTimeout(() => setPhase("guessing"), showFor * 1000);
          } else if (phase === "guessing") {
            submit();
          }
        }}
      >
        {phase === "ready" ? "Show the word" : phase === "guessing" ? "Lock in" : "Memorize…"}
      </button>
    </div>
  );
}
