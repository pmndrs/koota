import {World} from 'koota';
import {useActions} from '../actions';
import {Input, IsEnemy, IsPlayer, SpatialHashMap, Time, Transform} from '../traits';
import {Vector3} from "three";
import {CrossedEventHorizon} from "../traits/crossed-event-horizon.ts";

let canShoot = true;
const SHOOT_COOLDOWN = 0.1; // seconds

let cooldownTimer = 0;
let shootTicker = 0;

export const handleShooting = ({world}: { world: World }) => {
  const {delta} = world.get(Time);
  const {spawnBullet, spawnBomb} = useActions.get(world);
  const spatialHashMap = world.get(SpatialHashMap);

  // Update cooldown
  if (!canShoot) {
    cooldownTimer += delta;
    if (cooldownTimer >= SHOOT_COOLDOWN) {
      canShoot = true;
      cooldownTimer = 0;
    }
  }

  // Check for shooting input
  if (canShoot) {
    const player = world.queryFirst(IsPlayer, Transform, Input)!;
    if (!player || !player.get(Input).isFiring) {
      return;
    }

    const {position} = player.get(Transform);


    shootTicker++;
    let megaShot = false;
    if (false && shootTicker > 50) {
      shootTicker = 0;
      megaShot = true;
    }

    if (megaShot) {
      let angle = 0;
      const max = 25;
      for (let i = 0; i < max; i++) {
        spawnBomb(position, new Vector3(Math.cos(angle) * 10000, Math.sin(angle) * 10000, 0));
        angle = (i / max) * 2 * Math.PI;
      }
    }


    const nearbyEntities = spatialHashMap.getNearbyEntities(
      position.x,
      position.y,
      position.z,
      3
    );

    const filtered = nearbyEntities.filter(e => e.has(IsEnemy) && !e.has(CrossedEventHorizon));

    const distances = filtered.map((e) => ({e, dist: e.get(Transform).position.distanceToSquared(position)}));
    distances.sort((a, b) => a.dist - b.dist);

    if (filtered.length > 0) {
      for (let i = 0; i < Math.min(3, filtered.length); i++) {
        const target = distances[i].e;
        spawnBullet(position, target.get(Transform).position);
      }
    }

    else {
      const playerRot = player.get(Transform).rotation;
      //player.get
      const x = -Math.sin(playerRot.z + Math.PI / 48);
      const y = Math.cos(playerRot.z + Math.PI / 48);
      spawnBullet(position, new Vector3(x * 100000, y * 100000, 0));

      const x2 = -Math.sin(playerRot.z - Math.PI / 48);
      const y2 = Math.cos(playerRot.z - Math.PI / 48);
      spawnBullet(position, new Vector3(x2 * 100000, y2 * 100000, 0));
    }

    canShoot = false;


    /*const bulletRotation = (filtered.length > 0)
      ? (() => {
        const distances = filtered.map((e) => ({e, dist: e.get(Transform).position.distanceToSquared(position)}));
        return distances.sort((a, b) => a.dist - b.dist)[0].e;
      })()
      : player.get(Movement).velocity.clone().normalize();*/

    /*if (player && player.get(Input).isFiring) {
      spawnBullet(position, bulletRottation,);
      canShoot = false;
    }*/
  }
};
