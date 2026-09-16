import { Not, type World } from 'koota';
import { Clock, Game } from '../game/traits';
import { laneOrigin, pathPoint } from '../setup/setups';
import { Scenario } from '../setup/traits';
import { Slowed } from '../status/traits';
import { LocalTransform, Position } from '../transform/traits';
import { Bounty, Health, IsDead, IsEnemy, Movement, Route, Shield } from './traits';

export function moveEnemies(world: World) {
  const { delta, elapsed } = world.get(Clock)!;
  const config = world.get(Scenario)!;
  const game = world.get(Game)!;
  const enemies = world.query(IsEnemy, Position, Route, Movement, LocalTransform, Not(IsDead));
  enemies.updateEach(
    ([position, route, movement, local], entity) => {
      if (entity.get(Health)!.current <= 0) return;
      route.distance += movement.speed * (entity.get(Slowed)?.multiplier ?? 1) * delta;
      const origin = laneOrigin(config, route.lane);
      const point = pathPoint(route.distance);
      position.x = origin.x + point.x;
      position.z = origin.z + point.z + route.lateral;
      movement.heading = Math.atan2(1, Math.cos(route.distance * 0.19) * 0.665);
      local.x = position.x;
      local.y = position.y + Math.sin(elapsed * movement.frequency + route.lateral) * movement.sway;
      local.z = position.z;
      local.yaw = movement.heading;
      if (route.distance >= 44) {
        game.health = Math.max(0, game.health - entity.get(Bounty)!.baseDamage);
        game.leaked++;
        entity.add(IsDead);
        entity.set(Health, { current: 0 });
      }
    },
    { changeDetection: 'never' }
  );
  return enemies.length;
}

export function rechargeEnemyShields(world: World) {
  const { elapsed, delta } = world.get(Clock)!;
  const shields = world.query(Shield, Not(IsDead));
  shields.updateEach(
    ([shield]) => {
      if (elapsed - shield.lastHit >= shield.delay)
        shield.current = Math.min(shield.maximum, shield.current + shield.recharge * delta);
    },
    { changeDetection: 'never' }
  );
  return shields.length;
}
