import {trait} from "koota";
import {Vector3} from "three";

export const ScoreFade = trait({
  position: () => new Vector3(),
  timeLeft: 0,
  maxTime: 2
});