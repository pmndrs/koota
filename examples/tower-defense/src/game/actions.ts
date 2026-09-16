import { createActions } from 'koota';
import { Scenario } from '../setup/traits';
import { towerActions } from '../tower/actions';
import type { TowerKind } from '../tower/traits';
import { Game } from './traits';

export const gameActions = createActions((world) => ({
  setPaused: (paused: boolean) => {
    world.get(Game)!.paused = paused;
  },
  setAutomatic: (automatic: boolean) => {
    world.get(Game)!.automatic = automatic;
  },
  buildOpening: () => {
    const config = world.get(Scenario)!;
    const { buildTower } = towerActions(world);
    for (let lane = 0; lane < config.lanes; lane++) {
      for (let i = 0; i < config.towersPerLane; i++) {
        const kind: TowerKind =
          config.setup === 'status-gauntlet'
            ? i % 2 === 0 || config.effectMode === 'single'
              ? 'frost'
              : 'flame'
            : i % 3 === 2
              ? 'cannon'
              : i % 3 === 1 && config.effectMode !== 'single'
                ? 'flame'
                : 'frost';
        buildTower(lane, (i * 5) % 16, kind);
      }
    }
  },
}));
