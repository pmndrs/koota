import type { Entity, World } from 'koota';
import * as THREE from 'three';
import { IsEnemy, IsPlayer, Movement, ShieldVisibility, SpatialHashMap, Transform } from '../traits';

const collisionRadius = 2;
const pushStrength = 0.1;
const pushForce = new THREE.Vector3();

export function pushEnemies(world: World) {
  const spatialHashMap = world.get(SpatialHashMap)!;

  world.query(IsPlayer, Transform, Movement).each(({ position }, { velocity }, player) => {
    // Get nearby entities
    const nearbyEntities = spatialHashMap.getNearbyEntities(
      position.x,
      position.y,
      position.z,
      collisionRadius
    );

    // Filter for enemies within collision range
    const collidingEnemies: Entity[] = nearbyEntities.filter((entity) => {
      return (
        world.has(entity, IsEnemy) &&
        world.get(entity, Transform)!.position.distanceTo(position) <= collisionRadius
      );
    });

    // Apply push force to colliding enemies
    for (const enemy of collidingEnemies) {
      const enemyTransform = world.get(enemy, Transform);
      const enemyMovement = world.get(enemy, Movement);

      if (!enemyTransform || !enemyMovement) continue;

      // Calculate push direction (away from player)
      pushForce
        .copy(enemyTransform.position)
        .sub(position)
        .normalize()
        .multiplyScalar(velocity.length() * pushStrength);

      // Apply push force to enemy
      enemyMovement.force.add(pushForce);
    }

    if (collidingEnemies.length > 0) {
      if (!world.has(player, ShieldVisibility)) world.add(player, ShieldVisibility);
      else world.set(player, ShieldVisibility, { current: 0 });
    }
  });
}
