export type GameProps = {
  difficulty: number;
  seed: string;
  maxPoints: number;
  onComplete: (accuracy: number, detail: string) => void;
};

export type Outcome = { accuracy: number; detail: string };

export type Point = { x: number; y: number };
