import { createActions } from 'koota';
import { randomActions } from '../setup/actions';
import { Scenario } from '../setup/traits';
import { Position, Velocity } from '../transform/traits';
import { IsRain } from './traits';

export const rainActions = createActions((world) => ({
  spawnRain: () => {
    const { next } = randomActions(world);
    const count = world.get(Scenario)!.rainCount;
    // One shared weather field is displayed over whichever lane is in view.
    for (let i = 0; i < count; i++) {
      world.spawn(
        IsRain,
        Position({ x: (next() - 0.5) * 54, y: 0.25 + next() * 16, z: (next() - 0.5) * 24 }),
        Velocity({ x: -2.4 + next() * 0.8, y: -12 - next() * 3, z: -1 + next() * 0.4 })
      );
    }
    return count;
  },
}));
