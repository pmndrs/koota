import { Not, type World } from 'koota';
import { clamp } from 'math';
import { Armor, Bounty, Health, IsDead, IsEnemy, Shield } from '../enemy/traits';
import { Clock, Game } from '../game/traits';
import { statusActions } from '../status/actions';
import { forNearbyEnemies } from '../targeting/systems';
import { Appearance, Position, Velocity } from '../transform/traits';
import { projectileActions } from './actions';
import { Blast, DamageHits, Debris, DebrisQueue, Impacts, Projectile } from './traits';

export function moveProjectiles(world: World) {
  const { delta } = world.get(Clock)!;
  const impacts = world.get(Impacts)!;
  const projectiles = world.query(Projectile, Position, Velocity);
  projectiles.updateEach(
    ([projectile, position, velocity], entity) => {
      const startX = position.x;
      const startY = position.y;
      const startZ = position.z;
      position.x += velocity.x * delta;
      position.y += velocity.y * delta;
      position.z += velocity.z * delta;
      projectile.life -= delta;
      let hit = false;
      const dx = position.x - startX;
      const dy = position.y - startY;
      const dz = position.z - startZ;
      const lengthSquared = dx * dx + dy * dy + dz * dz;
      forNearbyEnemies(world, projectile.lane, position.x, 1 + Math.abs(dx), (enemy) => {
        if (hit) return;
        const target = enemy.get(Position)!;
        const fraction = clamp(
          ((target.x - startX) * dx + (target.y - startY) * dy + (target.z - startZ) * dz) /
            Math.max(0.0001, lengthSquared),
          0,
          1
        );
        if (
          (target.x - startX - dx * fraction) ** 2 +
            (target.y - startY - dy * fraction) ** 2 +
            (target.z - startZ - dz * fraction) ** 2 <
          0.65 ** 2
        )
          hit = true;
      });
      if (hit || position.y <= 0.2) {
        impacts.push({
          x: position.x,
          y: Math.max(0.2, position.y),
          z: position.z,
          lane: projectile.lane,
          kind: projectile.kind,
          damage: projectile.damage,
          radius: projectile.radius,
          level: projectile.level,
        });
        entity.destroy();
      } else if (projectile.life <= 0) entity.destroy();
    },
    { changeDetection: 'never' }
  );
  return projectiles.length;
}

export function findExplosionVictims(world: World) {
  const impacts = world.get(Impacts)!;
  const hits = world.get(DamageHits)!;
  let count = 0;
  for (const impact of impacts) {
    forNearbyEnemies(world, impact.lane, impact.x, impact.radius, (enemy) => {
      const position = enemy.get(Position)!;
      if ((position.x - impact.x) ** 2 + (position.z - impact.z) ** 2 <= impact.radius ** 2) {
        hits.push({ target: enemy, kind: impact.kind, damage: impact.damage, level: impact.level });
        count++;
      }
    });
    world.spawn(
      Position({ x: impact.x, y: 0.2, z: impact.z }),
      Blast({ radius: impact.radius, kind: impact.kind })
    );
  }
  impacts.length = 0;
  return count;
}

export function applyDamage(world: World) {
  const hits = world.get(DamageHits)!;
  const elapsed = world.get(Clock)!.elapsed;
  const { queueEffect } = statusActions(world);
  let count = 0;
  for (const hit of hits) {
    if (!world.has(hit.target) || hit.target.has(IsDead)) continue;
    const health = hit.target.get(Health)!;
    if (health.current <= 0) continue;
    const armor = hit.target.get(Armor)!;
    let damage =
      hit.damage *
      (1 - (hit.kind === 'cannon' ? armor.physical : hit.kind === 'flame' ? armor.fire : armor.cold));
    const shield = hit.target.get(Shield);
    if (shield) {
      const absorbed = Math.min(shield.current, damage);
      damage -= absorbed;
      hit.target.set(Shield, { current: shield.current - absorbed, lastHit: elapsed });
    }
    hit.target.set(Health, { current: health.current - damage });
    if (hit.kind === 'flame')
      queueEffect({ target: hit.target, kind: 'burning', duration: 0.9, strength: 9 * hit.level });
    if (hit.kind === 'frost')
      queueEffect({ target: hit.target, kind: 'slowed', duration: 0.3, strength: 0.35 });
    count++;
  }
  hits.length = 0;
  return count;
}

export function collectCasualties(world: World) {
  const game = world.get(Game)!;
  const debris = world.get(DebrisQueue)!;
  let count = 0;
  world
    .query(IsEnemy, Health, Position, Bounty, Appearance, Not(IsDead))
    .readEach(([health, position, bounty, appearance], entity) => {
      if (health.current > 0) return;
      entity.add(IsDead);
      game.gold += bounty.gold;
      game.kills++;
      debris.push({ x: position.x, y: position.y, z: position.z, color: appearance.color });
      count++;
    });
  return count;
}

export function destroyDeadEnemies(world: World) {
  const casualties = world.query(IsDead);
  for (const entity of casualties) entity.destroy();
  return casualties.length;
}

export function spawnDebris(world: World) {
  const queue = world.get(DebrisQueue)!;
  const actions = projectileActions(world);
  let count = 0;
  for (const point of queue) count += actions.spawnDebris(point.x, point.y, point.z, point.color);
  queue.length = 0;
  return count;
}

export function animateDebris(world: World) {
  const { delta } = world.get(Clock)!;
  let count = 0;
  world.query(Debris, Position, Velocity).updateEach(
    ([debris, position, velocity], entity) => {
      debris.remaining -= delta;
      velocity.y -= 9.8 * delta;
      position.x += velocity.x * delta;
      position.y += velocity.y * delta;
      position.z += velocity.z * delta;
      if (debris.remaining <= 0 || position.y < 0) entity.destroy();
      count++;
    },
    { changeDetection: 'never' }
  );
  world.query(Blast).updateEach(
    ([blast], entity) => {
      blast.age += delta;
      if (blast.age >= blast.duration) entity.destroy();
      count++;
    },
    { changeDetection: 'never' }
  );
  return count;
}
