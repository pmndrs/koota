import type { World } from 'koota';
import { enemyActions } from '../enemy/actions';
import { IsEnemy } from '../enemy/traits';
import { Clock, Game } from '../game/traits';
import { Scenario } from '../setup/traits';
import { Wave } from './traits';

export function spawnEnemyGroups(world: World) {
  const wave = world.get(Wave)!;
  const config = world.get(Scenario)!;
  const elapsed = world.get(Clock)!.elapsed;
  if (wave.finished || elapsed < wave.nextGroupAt) return 0;
  if (wave.number === 0 || wave.intermission) {
    wave.number++;
    wave.emittedPerLane = 0;
    wave.intermission = false;
    world.get(Game)!.message = `Wave ${wave.number} incoming`;
  }
  if (wave.emittedPerLane >= config.enemiesPerLane) {
    if (world.query(IsEnemy).length > 0) return 0;
    if (wave.number >= config.waveCount) {
      wave.finished = true;
      return 0;
    }
    wave.intermission = true;
    wave.nextGroupAt = elapsed + 4;
    world.get(Game)!.message = 'Wave cleared · reinforce your defenses';
    return 0;
  }
  const count = Math.min(config.groupSize, config.enemiesPerLane - wave.emittedPerLane);
  const { spawnGroup } = enemyActions(world);
  for (let lane = 0; lane < config.lanes; lane++) spawnGroup(lane, count, wave.number);
  wave.emittedPerLane += count;
  wave.nextGroupAt = elapsed + config.spawnInterval;
  return count * config.lanes;
}
