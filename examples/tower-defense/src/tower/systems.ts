import type { World } from 'koota';
import { deltaAngle } from 'math';
import { Health, IsDead } from '../enemy/traits';
import { Clock } from '../game/traits';
import { projectileActions } from '../projectile/actions';
import { LocalTransform, Position, WorldMatrix } from '../transform/traits';
import { Targeting, Tower, TowerParts } from './traits';

export function animateTowerParts(world: World) {
  const { delta, elapsed } = world.get(Clock)!;
  const towers = world.query(Tower, TowerParts, Position);
  towers.updateEach(
    ([tower, parts, position], entity) => {
      tower.cooldown = Math.max(0, tower.cooldown - delta);
      tower.recoil = Math.max(0, tower.recoil - delta * 3);
      const target = entity.targetFor(Targeting);
      const point = target !== undefined && world.has(target) ? target.get(Position) : undefined;
      const platform = parts.platform.get(LocalTransform)!;
      const mount = parts.mount.get(LocalTransform)!;
      if (point) {
        const yaw = Math.atan2(point.x - position.x, point.z - position.z);
        const difference = deltaAngle(platform.yaw, yaw);
        platform.yaw += difference * Math.min(1, delta * 14);
        mount.pitch = -Math.atan2(
          point.y - 1.25,
          Math.hypot(point.x - position.x, point.z - position.z)
        );
      } else platform.yaw += delta * 0.2;
      parts.platform.set(LocalTransform, platform);
      parts.mount.set(LocalTransform, mount);
      for (const barrel of parts.barrels)
        barrel.set(LocalTransform, { z: 0.65 - tower.recoil * 0.3 });
      parts.radar.set(LocalTransform, { yaw: elapsed * 1.6 });
    },
    { changeDetection: 'never' }
  );
  return towers.length;
}

export function fireWeapons(world: World) {
  const { fire } = projectileActions(world);
  let shots = 0;
  world.query(Tower, TowerParts, Position).updateEach(
    ([tower, parts, position], entity) => {
      if (tower.cooldown > 0) return;
      const target = entity.targetFor(Targeting);
      if (
        target === undefined ||
        !world.has(target) ||
        target.has(IsDead) ||
        target.get(Health)!.current <= 0
      )
        return;
      const point = target.get(Position)!;
      if ((point.x - position.x) ** 2 + (point.z - position.z) ** 2 > tower.range ** 2) return;
      const yaw = Math.atan2(point.x - position.x, point.z - position.z);
      const current = parts.platform.get(LocalTransform)!.yaw;
      if (Math.abs(deltaAngle(current, yaw)) > 0.12) return;
      fire(parts.muzzles[world.get(Clock)!.tick % 2].get(WorldMatrix)!, tower);
      tower.cooldown = tower.interval;
      tower.recoil = 1;
      shots++;
    },
    { changeDetection: 'never' }
  );
  return shots;
}
