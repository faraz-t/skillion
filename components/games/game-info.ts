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
    how: "A clock starts, then disappears. Try to stop it at the right time.",
  },
  middle: {
    how: "Multiple circles will appear. Tap their center of gravity.",
  },
  "number-line": {
    how: "Place the number where it belongs on a line from a thousand to a billion (log scale).",
  },
  mines: {
    how: "Invisible mines will briefly flash. Try to remember where they were and travel to the goalpost.",
  },
  wheel: {
    how: "The wheel begins to spin, then goes dark at a random moment. Keep track of the number under the pointer.",
  },
  tempo: {
    how: "Tap at the right pace.",
  },
  scramble: {
    how: "A scrambled word appears briefly. Remember it, then type the unscrambled word.",
  },
  "sweet-spot": {
    how: "A dot sweeps back and forth. Stop it at the right moment.",
  },
  perimeter: {
    how: "You’ll see a line. Draw the shape so its perimeter matches that line’s length.",
  },
  color: {
    how: "Memorize the color, then recreate it.",
  },
  landing: {
    how: "A flying ball vanishes mid-air. Mark where it would have landed.",
  },
  lazers: {
    how: "Select a fixed point inside the box, then avoid the reflecting lazers.",
  },
  traveller: {
    how: "Draw one continuous route through every yellow tile in the grid.",
  },
  fill: {
    how: "Water pours into an oddly shaped glass. Stop it at the given volume.",
  },
  sonar: {
    how: "Send three sonar pings, then locate the hidden target.",
  },
  echo: {
    how: "A line moves on a random path. Redraw it from memory.",
  },
  unfold: {
    how: "A paper is folded twice, then holes are punched. Tap where the holes will be after the paper is unfolded twice.",
  },
  reaction: {
    how: "A tile flashes in a 3×3 grid ten times. Click each one as quickly as you can, or press the corresponding keyboard button.",
  },
  convergence: {
    how: "Hold to fly up, release to drop. The tunnel keeps closing in, so fly as far as you can before you crash.",
  },
  hovercraft: {
    how: "You fly sideways at a steady speed and bounce off the walls. Tap to hop and grab as many yellow dots as you can before time runs out.",
  },
  prismatic: {
    how: "Tap the mirrors to rotate them and guide a beam through the grid into the target. Fewer rotations score higher.",
  },
  pillar: {
    how: "Drop the sliding row onto the tower. Overhangs are cut away, so land in the center to keep your full width.",
  },
  luck: {
    how: "You have passed 25 tests of skill.\n\nNow, it is time for the ultimate test",
  },
};
