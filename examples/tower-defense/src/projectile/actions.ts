import { createActions } from 'koota';
import type { Mat4 } from 'math';
import { Game } from '../game/traits';
import { randomActions } from '../setup/actions';
import { Position, Velocity } from '../transform/traits';
import type { TowerKind } from '../tower/traits';
import { Debris, Projectile } from './traits';

export const projectileActions = createActions((world) => ({
  fire: (
    matrix: Mat4,
    weapon: { kind: TowerKind; lane: number; damage: number; splash: number; level: number }
  ) => {
    const entity = world.spawn(
      Position({ x: matrix[12], y: matrix[13], z: matrix[14] }),
      Velocity({ x: matrix[8] * 32, y: matrix[9] * 32, z: matrix[10] * 32 }),
      Projectile({
        kind: weapon.kind,
        lane: weapon.lane,
        damage: weapon.damage,
        radius: weapon.splash,
        level: weapon.level,
      })
    );
    world.get(Game)!.shots++;
    return entity;
  },
  spawnDebris: (x: number, y: number, z: number, color: string) => {
    const { next } = randomActions(world);
    for (let i = 0; i < 3; i++) {
      world.spawn(
        Position({ x, y, z }),
        Velocity({ x: (next() - 0.5) * 5, y: 2 + next() * 3, z: (next() - 0.5) * 5 }),
        Debris({ color })
      );
    }
    world.get(Game)!.debrisSpawned += 3;
    return 3;
  },
}));
