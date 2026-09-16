import type { World } from 'koota';
import { Armor, Health, IsDead, IsFireproof } from '../enemy/traits';
import { Clock, Game } from '../game/traits';
import { Burning, Slowed, StatusHits } from './traits';

export function applyStatusEffects(world: World) {
  const hits = world.get(StatusHits)!;
  const game = world.get(Game)!;
  let additions = 0;
  for (const hit of hits) {
    if (!world.has(hit.target) || hit.target.has(IsDead)) continue;
    const armor = hit.target.get(Armor)!;
    if (hit.kind === 'burning') {
      if (hit.target.has(IsFireproof)) continue;
      const current = hit.target.get(Burning);
      const data = {
        remaining: Math.max(current?.remaining ?? 0, hit.duration),
        damagePerSecond: hit.strength * (1 - armor.fire),
      };
      if (current) {
        hit.target.set(Burning, data);
        game.effectsRefreshed++;
      } else {
        hit.target.add(Burning(data));
        additions++;
      }
    } else {
      const current = hit.target.get(Slowed);
      const data = {
        remaining: Math.max(current?.remaining ?? 0, hit.duration * (1 - armor.cold)),
        multiplier: hit.strength,
      };
      if (current) {
        hit.target.set(Slowed, data);
        game.effectsRefreshed++;
      } else {
        hit.target.add(Slowed(data));
        additions++;
      }
    }
  }
  hits.length = 0;
  game.effectsAdded += additions;
  return additions;
}

export function tickStatusEffects(world: World) {
  const { delta } = world.get(Clock)!;
  let count = 0;
  world.query(Burning, Health).updateEach(
    ([burning, health]) => {
      health.current -= burning.damagePerSecond * Math.min(delta, burning.remaining);
      burning.remaining -= delta;
      count++;
    },
    { changeDetection: 'never' }
  );
  world.query(Slowed).updateEach(
    ([slowed]) => {
      slowed.remaining -= delta;
      count++;
    },
    { changeDetection: 'never' }
  );
  return count;
}

export function expireStatusEffects(world: World) {
  let removals = 0;
  world.query(Burning).readEach(([burning], entity) => {
    if (burning.remaining <= 0) {
      entity.remove(Burning);
      removals++;
    }
  });
  world.query(Slowed).readEach(([slowed], entity) => {
    if (slowed.remaining <= 0) {
      entity.remove(Slowed);
      removals++;
    }
  });
  world.get(Game)!.effectsRemoved += removals;
  return removals;
}
