"use client";

import type { ComponentType } from "react";
import type { GameType } from "@/lib/skillion";
import type { GameProps } from "./types";
import PizzaGame from "./pizza-game";
import ColorGame from "./color-game";
import ConvergenceGame from "./convergence-game";
import CountGame from "./count-game";
import EchoGame from "./echo-game";
import FillGame from "./fill-game";
import HovercraftGame from "./hovercraft-game";
import LandingGame from "./landing-game";
import LazersGame from "./lazers-game";
import MiddleGame from "./middle-game";
import MinesGame from "./mines-game";
import NumberLineGame from "./number-line-game";
import PerimeterGame from "./perimeter-game";
import ReactionGame from "./reaction-game";
import ScrambleGame from "./scramble-game";
import SonarGame from "./sonar-game";
import SplitGame from "./split-game";
import SweetSpotGame from "./sweet-spot-game";
import TempoGame from "./tempo-game";
import TimerGame from "./timer-game";
import TravellerGame from "./traveller-game";
import UnfoldGame from "./unfold-game";
import WheelGame from "./wheel-game";

export type AnyGameType = GameType;

export const GAME_COMPONENTS: Record<AnyGameType, ComponentType<GameProps>> = {
  count: CountGame,
  pizza: PizzaGame,
  split: SplitGame,
  timer: TimerGame,
  middle: MiddleGame,
  "number-line": NumberLineGame,
  mines: MinesGame,
  wheel: WheelGame,
  tempo: TempoGame,
  scramble: ScrambleGame,
  "sweet-spot": SweetSpotGame,
  perimeter: PerimeterGame,
  color: ColorGame,
  landing: LandingGame,
  lazers: LazersGame,
  traveller: TravellerGame,
  fill: FillGame,
  sonar: SonarGame,
  echo: EchoGame,
  unfold: UnfoldGame,
  reaction: ReactionGame,
  convergence: ConvergenceGame,
  hovercraft: HovercraftGame,
};
