import type { World } from 'koota';
import { Bullet, IsDying, IsEnemy, SpatialHashMap, Transform } from '../traits';

export function updateBulletCollisions(world: World) {
  const spatialHashMap = world.get(SpatialHashMap)!;

  world
    .query(Bullet, Transform)
    .select(Transform)
    .each(({ position }, entity) => {
      const nearbyEntities = spatialHashMap.getNearbyEntities(position.x, position.y, position.z, 2);

      const hitEnemy = nearbyEntities.find(
        (entity) => entity.has(IsEnemy) && entity.get(Transform)!.position.distanceTo(position) < 1
      );

      if (hitEnemy !== undefined) {
        // Mark the bullet and the enemy, later systems react and destroy them
        hitEnemy.add(IsDying);
        entity.add(IsDying);
      }
    });
}
