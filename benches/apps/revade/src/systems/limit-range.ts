import { World } from "koota";
import {IsPlayer, Transform} from "../traits";


const minX = -45;
const maxX = 45;
const minY = -45 / 2.5;
const maxY = 45 / 2.5;

export const limitRange = ({world}: {world: World}) => {

  const player = world.queryFirst(IsPlayer, Transform);
  if (!player) return;


  return;

  const pos = player.get(Transform).position;

  if (pos.x < minX) {
    pos.x = maxX;
  }

  if (pos.x > maxX) {
    pos.x = minX
  }

  if (pos.y < minY) {
    pos.y = maxY;
  }

  if (pos.y > maxX) {
    pos.y = minY
  }





}