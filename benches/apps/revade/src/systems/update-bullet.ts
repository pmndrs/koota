import {Not, World} from 'koota';
import * as THREE from 'three';
import {Bullet, IsPlayer, Movement, Time, Transform} from '../traits';
import {DirectionBased} from "../traits/direction-based.ts";

const tmpVec3 = new THREE.Vector3();
const dummy = new THREE.Object3D();

export const updateBullets = ({world}: { world: World }) => {
  const {delta} = world.get(Time);

  const player = world.queryFirst(IsPlayer, Movement);
  if (!player) return;
  const playerSpeed = player.get(Movement).velocity.clone().length() * 0.001;


  world.query(Bullet, Transform, Not(DirectionBased)).updateEach(([bullet, transform], entity) => {
    const deltaVec = tmpVec3.subVectors(bullet.target, transform.position);
    const len = deltaVec.length();

    dummy.position.copy(transform.position);
    dummy.lookAt(bullet.target);
    transform.rotation.copy(dummy.rotation);
    transform.rotation.y += Math.PI / 2;

    if (len < 10 || len > 10_000) {
      entity.add(DirectionBased);
      bullet.direction.copy(deltaVec).normalize();
      //return;
    }

    deltaVec.setLength(3 * playerSpeed + bullet.speed * delta * 0.4 + 3 * bullet.timeAlive / bullet.lifetime);
    transform.position.add(deltaVec);

    // Update lifetime
    bullet.timeAlive += delta;
    if (bullet.timeAlive >= bullet.lifetime) {
      entity.destroy();
      return;
    }
  });

  world.query(Bullet, Transform, DirectionBased).updateEach(([bullet, transform], entity) => {

    //const deltaVec = tmpVec3.subVectors(bullet.target, transform.position);
    //bullet.direction.copy(deltaVec).normalize();

    /*dummy.position.copy(transform.position);
    dummy.lookAt(bullet.target);
    transform.rotation.copy(dummy.rotation);
    transform.rotation.y += Math.PI / 2;*/

    dummy.position.copy(transform.position);
    dummy.lookAt(bullet.target);
    transform.rotation.copy(dummy.rotation);
    transform.rotation.y += Math.PI / 2;

    transform.position.add(tmpVec3.copy(bullet.direction).multiplyScalar(3 * playerSpeed + bullet.speed * delta * 0.4 + 3 * bullet.timeAlive / bullet.lifetime))

    // Update lifetime
    bullet.timeAlive += delta;
    if (bullet.timeAlive >= bullet.lifetime) {
      entity.destroy();
      return;
    }

  });


};
