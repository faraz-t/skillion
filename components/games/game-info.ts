import type { GameType } from "@/lib/skillion";

export type GameInfo = {
  how: string;
};

export const GAME_INFO: Record<GameType, GameInfo> = {
  count: {
    how: "Count the number of moving dots and the number of still dots.",
  },
  pizza: {
    how: "Increase or decrease the pizza slice by the shown number of degrees.",
  },
  split: {
    how: "Cut off the given percentage.",
  },
  timer: {
    how: "Try to stop the slowly fading stopwatch at the right time.",
  },
  middle: {
    how: "Tap the center of gravity of all the circles. ",
  },
  "number-line": {
    how: "Place the number where it belongs on a line from a thousand to a billion (log scale).",
  },
  mines: {
    how: "Invisible mines will briefly flash; try to remember where they were and travel to the goalpost.",
  },
  wheel: {
    how: "The wheel spins and goes dark at a random time; try to remember the number.",
  },
  tempo: {
    how: "Tap at the right pace.",
  },
  scramble: {
    how: "Memorize the letters, then unscramble the word.",
  },
  "sweet-spot": {
    how: "Stop the moving slider at the right spot.",
  },
  perimeter: {
    how: "Draw a shape with the same perimeter as the given line.",
  },
  color: {
    how: "Memorize the color, then recreate it.",
  },
  landing: {
    how: "Try to predict the trajectory of the ball and tap where it will land.",
  },
  lazers: {
    how: "Select a fixed point inside the box, then avoid the reflecting lazers.",
  },
  traveller: {
    how: "Draw one continuous route through every yellow tile in the grid.",
  },
  fill: {
    how: "Water pours into an oddly shaped glass; stop it at the given volume.",
  },
  sonar: {
    how: "Send three sonar pings, then locate the hidden target.",
  },
  echo: {
    how: "A line moves randomly across the screen, pay close attention and recreate it.",
  },
  unfold: {
    how: "A paper is folded twice, then holes are punched; tap where the holes will be after the paper is unfolded twice.",
  },
  reaction: {
    how: "A tile flashes in a 3×3 grid ten times; click each one as quickly as you can, or press the corresponding keyboard button.",
  },
  convergence: {
    how: "Hold to fly up, release to drop; the tunnel keeps closing in, so fly as far as you can before you crash.",
  },
  hovercraft: {
    how: "Tap to jump and grab as many yellow dots as you can before time runs out.",
  },
  prismatic: {
    how: "Tap the mirrors to rotate them and guide a beam through the grid into the target. Less rotations = higher score.",
  },
  pillar: {
    how: "Drop the sliding row onto the tower as accurately as possible.",
  },
  luck: {
    how: "You have passed 25 tests of SKILL.\n\nNow, it is time for the ultimate test...\n\nLUCK.",
  },
};
