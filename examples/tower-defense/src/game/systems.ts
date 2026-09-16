import type { World } from 'koota';
import { IsEnemy } from '../enemy/traits';
import { Scenario } from '../setup/traits';
import { towerActions } from '../tower/actions';
import { BuildPads } from '../tower/traits';
import { Wave } from '../wave/traits';
import { Clock, Game } from './traits';

export function runAutoBuilder(world: World) {
  const game = world.get(Game)!;
  const { tick } = world.get(Clock)!;
  if (!game.automatic || tick % 720 !== 0) return 0;
  const config = world.get(Scenario)!;
  const pads = world.get(BuildPads)!;
  const actions = towerActions(world);
  const index = (Math.floor(tick / 720) - 1) % 16;
  let count = 0;
  for (let lane = 0; lane < config.lanes; lane++) {
    const tower = pads.get(lane * 16 + ((index * 5) % 16));
    if (tower) count += Number(actions.upgradeTower(tower));
    else if (
      actions.buildTower(
        lane,
        (index * 5) % 16,
        index % 3 === 0
          ? 'cannon'
          : index % 3 === 1 && config.effectMode !== 'single'
            ? 'flame'
            : 'frost'
      )
    )
      count++;
  }
  return count;
}

export function checkOutcome(world: World) {
  const game = world.get(Game)!;
  if (game.health <= 0) {
    game.phase = 'lost';
    game.message = 'The line fell. Adjust your defenses and try again.';
  } else if (world.get(Wave)!.finished && world.query(IsEnemy).length === 0) {
    game.phase = 'won';
    game.message = 'All waves cleared. The line held.';
  }
  return 1;
}
