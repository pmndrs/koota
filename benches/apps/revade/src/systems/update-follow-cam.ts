import {World} from "koota";
import {IsActiveCamera} from "../traits/is-active-camera.ts";
import {IsPlayer, Time, Transform} from "../traits";
import {damp} from "three/src/math/MathUtils";
import {Vector3} from "three";




const dampedPos = new Vector3(0, 0, 50);

export const UpdateFollowCam = ({world}: { world: World }) => {
  const camEntity = world.queryFirst(Transform, IsActiveCamera);
  if (camEntity === undefined) return;

  const playerEntity = world.queryFirst(Transform, IsPlayer);
  if (playerEntity === undefined) return;

  const {delta} = world.get(Time);
  
  const playerPosition = playerEntity.get(Transform).position;
  const camPosition = camEntity.get(Transform).position;

  dampedPos.x = damp(camPosition.x, playerPosition.x, 120, delta);
  dampedPos.y = damp(camPosition.y, playerPosition.y, 120, delta);
  camPosition.copy(dampedPos);
};