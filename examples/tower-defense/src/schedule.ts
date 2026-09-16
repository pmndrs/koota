import type { World } from 'koota';
import { moveRain } from './rain/systems';
import { moveEnemies, rechargeEnemyShields } from './enemy/systems';
import { checkOutcome, runAutoBuilder } from './game/systems';
import { Clock, Game } from './game/traits';
import { measureSystem } from './metrics/actions';
import { Metrics } from './metrics/traits';
import {
  animateDebris,
  applyDamage,
  collectCasualties,
  destroyDeadEnemies,
  findExplosionVictims,
  moveProjectiles,
  spawnDebris,
} from './projectile/systems';
import { applyStatusEffects, expireStatusEffects, tickStatusEffects } from './status/systems';
import {
  chooseTargets,
  findTargetCandidates,
  updateTargetGrid,
  updateTargetRelations,
} from './targeting/systems';
import { animateTowerParts, fireWeapons } from './tower/systems';
import { composeLocalMatrices, propagateWorldTransforms } from './transform/systems';
import { spawnEnemyGroups } from './wave/systems';
import { applyWind, updateWind } from './weather/systems';

export function stepGame(world: World, force = false) {
  const game = world.get(Game)!;
  if (game.phase !== 'running' || (game.paused && !force)) return false;
  const metrics = world.get(Metrics)!;
  const start = metrics.enabled ? performance.now() : 0;
  const clock = world.get(Clock)!;
  world.set(Clock, { tick: clock.tick + 1, elapsed: (clock.tick + 1) / 60, delta: 1 / 60 });

  measureSystem(world, 'spawn-enemy-group', 'structural', spawnEnemyGroups, true);
  runAutoBuilder(world);
  tickStatusEffects(world);
  measureSystem(world, 'expire-status-effects', 'churn', expireStatusEffects, true);
  moveEnemies(world);
  rechargeEnemyShields(world);
  measureSystem(world, 'find-target-candidates', 'terms', findTargetCandidates);
  updateTargetGrid(world);
  chooseTargets(world);
  measureSystem(world, 'update-target-relations', 'graph', updateTargetRelations, true);
  animateTowerParts(world);
  measureSystem(world, 'compose-local-matrices', 'traversal', composeLocalMatrices);
  measureSystem(world, 'propagate-world-transforms', 'traversal', propagateWorldTransforms);
  fireWeapons(world);
  moveProjectiles(world);
  findExplosionVictims(world);
  applyDamage(world);
  measureSystem(world, 'apply-status-effects', 'churn', applyStatusEffects, true);
  collectCasualties(world);
  measureSystem(world, 'destroy-dead-enemies', 'structural', destroyDeadEnemies, true);
  measureSystem(world, 'spawn-debris', 'structural', spawnDebris, true);
  animateDebris(world);
  updateWind(world);
  measureSystem(world, 'apply-wind', 'bulk', applyWind);
  measureSystem(world, 'move-rain', 'iteration', moveRain);
  checkOutcome(world);

  if (metrics.enabled) {
    metrics.ticks++;
    metrics.frameMs += (performance.now() - start - metrics.frameMs) / Math.min(metrics.ticks, 120);
  }
  return true;
}
