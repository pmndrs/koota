import { createActions, type Entity } from 'koota';
import { Game } from '../game/traits';
import { randomActions } from '../setup/actions';
import { laneOrigin, pathPoint } from '../setup/setups';
import { Scenario } from '../setup/traits';
import { transformActions } from '../transform/actions';
import { Position } from '../transform/traits';
import {
  Armor,
  Bounty,
  EnemyKind,
  Health,
  IsEnemy,
  IsFireproof,
  Movement,
  Route,
  Shield,
} from './traits';

export const enemyActions = createActions((world) => ({
  spawnGroup: (lane: number, count: number, wave = 1, distance = 0): Entity[] => {
    const config = world.get(Scenario)!;
    const origin = laneOrigin(config, lane);
    const { next } = randomActions(world);
    const { spawnNode } = transformActions(world);
    const entities: Entity[] = [];
    for (let i = 0; i < count; i++) {
      const kind = Math.floor(next() * 4);
      const lateral = ((i % 8) - 3.5) * 0.58 + (next() - 0.5) * 0.08;
      const progress = distance + (Math.floor(i / 8) % 16) * 0.55 + next() * 0.15;
      const point = pathPoint(progress);
      const health = (kind === 1 ? 55 : kind === 3 ? 22 : 32) * (1 + (wave - 1) * 0.16);
      const x = origin.x + point.x;
      const z = origin.z + point.z + lateral;
      const entity = spawnNode(
        { x, y: 0.5, z },
        {
          sx: kind === 1 ? 0.9 : 0.65,
          sy: kind === 1 ? 1 : 0.7,
          sz: kind === 1 ? 0.9 : 0.65,
          color: kind === 2 ? '#e4a943' : kind === 1 ? '#824b77' : '#d56558',
        }
      );
      entity.add(
        IsEnemy,
        EnemyKind({ value: kind }),
        Position({ x, y: 0.5, z }),
        Health({ current: health, maximum: health }),
        Armor({
          physical: kind === 1 ? 0.3 : 0,
          fire: kind === 2 ? 1 : 0,
          cold: kind === 1 ? 0.2 : 0,
        }),
        Movement({
          speed:
            (kind === 3 ? 3.5 : kind === 1 ? 1.6 : 2.2) *
            (config.setup === 'target-turnover' ? 1.8 : 1),
          sway: kind === 3 ? 0.16 : 0.06,
          frequency: kind === 3 ? 8 : 4,
        }),
        Route({ lane, distance: progress, lateral }),
        Bounty({ gold: kind === 1 ? 9 : 5, baseDamage: kind === 1 ? 2 : 1 })
      );
      if (kind === 2) entity.add(IsFireproof);
      if (kind === 1) entity.add(Shield);
      entities.push(entity);
    }
    world.get(Game)!.spawned += count;
    return entities;
  },
}));
