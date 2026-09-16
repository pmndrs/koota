import { Not, Or, type Entity, type World } from 'koota';
import { clamp } from 'math';
import { Health, IsDead, IsEnemy, IsFireproof, Route } from '../enemy/traits';
import { Clock, Game } from '../game/traits';
import { laneOrigin } from '../setup/setups';
import { Scenario } from '../setup/traits';
import { Burning, Slowed } from '../status/traits';
import { Position } from '../transform/traits';
import { Targeting, Tower } from '../tower/traits';
import { TargetCandidates, TargetChanges, TargetGrid } from './traits';

// The result is the cannon's priority list, consumed by target selection.
export function findTargetCandidates(world: World) {
  const mode = world.get(Scenario)!.queryMode;
  const candidates =
    mode === 'required'
      ? world.query(IsEnemy, Position, Health)
      : mode === 'not'
        ? world.query(IsEnemy, Position, Health, Not(IsFireproof))
        : mode === 'or'
          ? world.query(IsEnemy, Position, Health, Or(Burning, Slowed))
          : world.query(IsEnemy, Position, Health, Not(IsFireproof), Or(Burning, Slowed));
  world.get(TargetCandidates)!.priority = candidates;
  return candidates.length;
}

export function updateTargetGrid(world: World) {
  const grid = world.get(TargetGrid)!;
  const config = world.get(Scenario)!;
  while (grid.cells.length < config.lanes * 12) grid.cells.push([]);
  for (const cell of grid.cells) cell.length = 0;
  grid.priority.clear();
  for (const entity of world.get(TargetCandidates)!.priority) grid.priority.add(entity);
  const enemies = world.query(IsEnemy, Route, Not(IsDead));
  enemies.readEach(([route], entity) => {
    grid.cells[route.lane * 12 + clamp(Math.floor(route.distance / 4), 0, 11)].push(entity);
  });
  return enemies.length;
}

export function forNearbyEnemies(
  world: World,
  lane: number,
  x: number,
  radius: number,
  visit: (entity: Entity) => void
) {
  const config = world.get(Scenario)!;
  const grid = world.get(TargetGrid)!;
  const distance = x - laneOrigin(config, lane).x + 22;
  const start = Math.max(0, Math.floor((distance - radius) / 4));
  const end = Math.min(11, Math.floor((distance + radius) / 4));
  for (let cell = start; cell <= end; cell++) {
    for (const entity of grid.cells[lane * 12 + cell] ?? []) {
      if (world.has(entity) && !entity.has(IsDead) && entity.get(Health)!.current > 0) visit(entity);
    }
  }
}

export function chooseTargets(world: World) {
  if (world.get(Clock)!.tick % 6 !== 0) return 0;
  const changes = world.get(TargetChanges)!;
  const grid = world.get(TargetGrid)!;
  const towers = world.query(Tower, Position);
  towers.readEach(([tower, position], entity) => {
    const current = entity.targetFor(Targeting);
    const targetPosition =
      current !== undefined &&
      world.has(current) &&
      !current.has(IsDead) &&
      current.get(Health)!.current > 0
        ? current.get(Position)
        : undefined;
    if (
      targetPosition &&
      (position.x - targetPosition.x) ** 2 + (position.z - targetPosition.z) ** 2 <= tower.range ** 2
    )
      return;
    let target: Entity | undefined;
    let score = -Infinity;
    forNearbyEnemies(world, tower.lane, position.x, tower.range, (candidate) => {
      if (tower.kind === 'flame' && candidate.has(IsFireproof)) return;
      const point = candidate.get(Position)!;
      if ((point.x - position.x) ** 2 + (point.z - position.z) ** 2 > tower.range ** 2) return;
      const priority =
        candidate.get(Route)!.distance +
        (tower.kind === 'cannon' && grid.priority.has(candidate) ? 100 : 0);
      if (priority > score) {
        target = candidate;
        score = priority;
      }
    });
    if (target !== current) changes.push({ tower: entity, target });
  });
  return towers.length;
}

export function updateTargetRelations(world: World) {
  const changes = world.get(TargetChanges)!;
  let edges = 0;
  for (const change of changes) {
    if (!world.has(change.tower)) continue;
    const current = change.tower.targetFor(Targeting);
    const target =
      change.target !== undefined && world.has(change.target) && !change.target.has(IsDead)
        ? change.target
        : undefined;
    if (current === target) continue;
    if (current !== undefined) {
      change.tower.remove(Targeting(current));
      edges++;
    }
    if (target !== undefined) {
      change.tower.add(Targeting(target));
      edges++;
    }
  }
  changes.length = 0;
  world.get(Game)!.targetChanges += edges;
  return edges;
}
