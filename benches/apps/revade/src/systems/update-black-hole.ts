import {createAdded, createRemoved, Not, World} from "koota";
import {IsPlayer, Movement, Time, Transform} from "../traits";
import {BlackHole} from "../traits/black-hole.ts";
import {TMesh} from "../traits/mesh-trait.ts";
import {Color, MeshBasicMaterial, Vector3} from "three";
import {CrossedEventHorizon} from "../traits/crossed-event-horizon.ts";
import {mapLinear} from "three/src/math/MathUtils";


let totalTime = 0;
const maxDistance = 25;
const timeScale = 0.1;
const forceVec = new Vector3();
const tempVec = new Vector3();
const eventHorizonRadiusSq = 30;
const fallenInColor = new Color("gold");
const normalColor = new Color("white");

const Added = createAdded();
const Removed = createRemoved();

export const UpdateBlackHole = ({world}: { world: World }) => {
  const {delta} = world.get(Time);
  totalTime += delta;

  // move the black hole through space
  world.query(Transform, BlackHole).updateEach(([transform]) => {
    const T = totalTime * timeScale;
    const scale = 2 / (3 - Math.cos(T));
    transform.position.x = scale * maxDistance * Math.cos(T);
    transform.position.y = scale * maxDistance * Math.sin(2 * T) / 2;
  });

  // --------------------------------------------------------------------------


  // apply black hole forces to all bodies (except the black holes themselves)
  world.query(Transform, Movement, Not(BlackHole)).updateEach(([bodyTransform, movement], bodyEntity) => {
    // prepare a resulting force vector
    forceVec.set(0, 0, 0);
    let crossedEventHorizon = false;

    // we sum up the forces for every black hole
    
    world.query(Transform, BlackHole).updateEach(([transform, {mass}], blackHoleEntity) => {

      const deltaVec = tempVec.copy(transform.position).sub(bodyTransform.position);
      const distSq = deltaVec.lengthSq();

      if (!crossedEventHorizon && distSq < eventHorizonRadiusSq) {
        crossedEventHorizon = true;
        bodyEntity.add(CrossedEventHorizon({blackHoleEntity}));
      }
      deltaVec.normalize();
      forceVec.add(deltaVec.setLength(mass / distSq));
    });



    if (!crossedEventHorizon) {
      bodyEntity.remove(CrossedEventHorizon);
    }

    // add it to the movement
    movement.force.add(forceVec);
  });

  // --------------------------------------------------------------------------


  // check if any bodies crossed the event horizon

  world.query(TMesh, Added(CrossedEventHorizon)).updateEach(([mesh]) => {
    (mesh.material as MeshBasicMaterial).color = fallenInColor;
  });
  world.query(TMesh, Removed(CrossedEventHorizon)).updateEach(([mesh]) => {
    (mesh.material as MeshBasicMaterial).color = normalColor;
  });

  world.query(Transform, CrossedEventHorizon, Not(IsPlayer)).updateEach(([transform, {blackHoleEntity}], entity) => {

    const blackHoleRadiusSq = blackHoleEntity.get(BlackHole).radius ** 2;
    const blackHolePos = blackHoleEntity.get(Transform).position;
    const distSq = blackHolePos.distanceToSquared(transform.position);
    const scale = Math.max(0, mapLinear(distSq, 0, eventHorizonRadiusSq, 0, 1));

    if (distSq <= blackHoleRadiusSq) {
      entity.destroy();
    } else {
      transform.scale.set(scale, scale, scale);
    }

  });


}