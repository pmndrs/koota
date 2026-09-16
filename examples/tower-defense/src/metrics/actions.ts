import type { World } from 'koota';
import { IsDead } from '../enemy/traits';
import { Metrics, type Workload } from './traits';

export function recordMeasurement(
  world: World,
  name: string,
  workload: Workload,
  milliseconds: number
) {
  const metrics = world.get(Metrics)!;
  if (!metrics.enabled) return;
  const item = metrics.systems.get(name);
  if (item) {
    item.calls++;
    item.meanMs += (milliseconds - item.meanMs) / Math.min(item.calls, 120);
  } else {
    metrics.systems.set(name, { workload, meanMs: milliseconds, calls: 1 });
  }
}

export function measureSystem(
  world: World,
  name: string,
  workload: Workload,
  system: (world: World) => number,
  structural = false
) {
  if (!world.get(Metrics)!.enabled) return system(world);
  const start = performance.now();
  const work = system(world);
  // Commit deferred query removals inside the stage that caused them.
  if (structural) world.query(IsDead);
  recordMeasurement(world, name, workload, performance.now() - start);
  return work;
}
