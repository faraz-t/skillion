export type GameType =
  | "count"
  | "pizza"
  | "split"
  | "timer"
  | "middle"
  | "number-line"
  | "mines"
  | "wheel"
  | "tempo"
  | "scramble"
  | "sweet-spot"
  | "perimeter"
  | "color"
  | "landing"
  | "lazers"
  | "traveller"
  | "fill"
  | "sonar"
  | "echo"
  | "unfold"
  | "reaction"
  | "convergence"
  | "hovercraft"
  | "prismatic"
  | "pillar";

export type GameDefinition = {
  type: GameType;
  name: string;
};

export type CellResult = {
  points: number;
  accuracy: number;
};

export const TITLE = "Million Grid";
export const ROW_VALUES = [30000, 35000, 40000, 45000, 50000];
export const FINALE_VALUE = 100000;
export const UNLOCK_THRESHOLDS = [0, 100000, 200000, 400000, 550000, 850000];
export const SHAPE = 2;

export const GAME_POOL: GameDefinition[] = [
  { type: "count", name: "Count" },
  { type: "pizza", name: "Pizza" },
  { type: "split", name: "Split" },
  { type: "timer", name: "Stopwatch" },
  { type: "middle", name: "Gravity" },
  { type: "number-line", name: "Number line" },
  { type: "mines", name: "Minefield" },
  { type: "wheel", name: "The Wheel" },
  { type: "tempo", name: "Tempo" },
  { type: "scramble", name: "Unscramble" },
  { type: "sweet-spot", name: "Sweet spot" },
  { type: "perimeter", name: "Perimeter" },
  { type: "color", name: "Color match" },
  { type: "landing", name: "Crash Landing" },
  { type: "lazers", name: "Lazer Tag" },
  { type: "traveller", name: "Traveller" },
  { type: "fill", name: "Waterfall" },
  { type: "sonar", name: "Echolocation" },
  { type: "echo", name: "Mirroring" },
  { type: "unfold", name: "Unfold" },
  { type: "reaction", name: "Reaction" },
  { type: "convergence", name: "Convergence" },
  { type: "hovercraft", name: "Hovercraft" },
  { type: "prismatic", name: "Prismatic" },
  { type: "pillar", name: "PILLAR" },
];

export const FINALE_GAME: GameDefinition = {
  type: "number-line",
  name: "???",
};

export function hashSeed(seed: string): number {
  let hash = 1779033703 ^ seed.length;
  for (let i = 0; i < seed.length; i += 1) {
    hash = Math.imul(hash ^ seed.charCodeAt(i), 3432918353);
    hash = (hash << 13) | (hash >>> 19);
  }
  hash = Math.imul(hash ^ (hash >>> 16), 2246822507);
  hash = Math.imul(hash ^ (hash >>> 13), 3266489909);
  return (hash ^ (hash >>> 16)) >>> 0;
}

export function makeRng(seed: string) {
  let value = hashSeed(seed);
  return () => {
    value |= 0;
    value = (value + 0x6d2b79f5) | 0;
    let mixed = Math.imul(value ^ (value >>> 15), 1 | value);
    mixed =
      mixed +
      Math.imul(mixed ^ (mixed >>> 7), 61 | mixed) ^
      mixed;
    return (((mixed ^ (mixed >>> 14)) >>> 0) / 4294967296);
  };
}

export function getDailySeed(date = new Date()) {
  return [
    date.getFullYear(),
    String(date.getMonth() + 1).padStart(2, "0"),
    String(date.getDate()).padStart(2, "0"),
  ].join("-");
}

export function buildDailyGames(seed: string): GameDefinition[] {
  const rng = makeRng(`${seed}:games`);
  const pool = [...GAME_POOL];

  for (let i = pool.length - 1; i > 0; i -= 1) {
    const j = Math.floor(rng() * (i + 1));
    [pool[i], pool[j]] = [pool[j], pool[i]];
  }

  if (pool.length >= 25) {
    return pool.slice(0, 25);
  }

  const games: GameDefinition[] = [...pool];
  while (games.length < 25) {
    const deck = [...pool];
    for (let i = deck.length - 1; i > 0; i -= 1) {
      const j = Math.floor(rng() * (i + 1));
      [deck[i], deck[j]] = [deck[j], deck[i]];
    }
    games.push(...deck);
  }

  return games.slice(0, 25);
}

export function accuracyFromError(error: number, half: number) {
  return Math.pow(0.5, Math.pow(error / half, SHAPE));
}

export function formatPoints(value: number) {
  return Math.round(value).toLocaleString("en-US");
}
