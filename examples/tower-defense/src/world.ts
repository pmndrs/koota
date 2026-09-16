import { createWorld } from 'koota';
import { rainActions } from './rain/actions';
import { IsDead } from './enemy/traits';
import { gameActions } from './game/actions';
import { Clock, Game } from './game/traits';
import { Metrics } from './metrics/traits';
import { DamageHits, DebrisQueue, Impacts } from './projectile/traits';
import { resolveSetup, type SetupOptions } from './setup/setups';
import { Random, Scenario } from './setup/traits';
import { StatusHits } from './status/traits';
import { TargetCandidates, TargetChanges, TargetGrid } from './targeting/traits';
import { BuildPads } from './tower/traits';
import { composeLocalMatrices, propagateWorldTransforms } from './transform/systems';
import { Wave } from './wave/traits';
import { Weather } from './weather/traits';

export function createGame(options: SetupOptions = {}) {
  const config = resolveSetup(options);
  const world = createWorld(
    Clock,
    Game,
    Scenario,
    Random({ a: config.seed >>> 0 }),
    Metrics,
    Weather,
    Wave,
    StatusHits,
    Impacts,
    DamageHits,
    DebrisQueue,
    TargetCandidates,
    TargetChanges,
    TargetGrid,
    BuildPads
  );
  world.set(Scenario, config);
  const game = world.get(Game)!;
  game.automatic = config.automatic;
  game.health = game.maxHealth = Math.max(100, config.enemiesPerLane * 2) * config.lanes;
  game.gold = (config.towersPerLane * 80 + 180) * config.lanes;
  rainActions(world).spawnRain();
  if (config.automatic) gameActions(world).buildOpening();
  world.query(IsDead);
  composeLocalMatrices(world);
  propagateWorldTransforms(world);
  game.message = config.automatic
    ? 'Autobuild active · wave incoming'
    : 'Choose a tower, then click an empty pad';
  return world;
}
