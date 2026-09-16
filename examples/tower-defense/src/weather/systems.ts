import type { World } from 'koota';
import { IsRain } from '../rain/traits';
import { Clock } from '../game/traits';
import { Scenario } from '../setup/traits';
import { Velocity } from '../transform/traits';
import { weatherActions } from './actions';
import { Weather } from './traits';

export function updateWind(world: World) {
  const config = world.get(Scenario)!;
  const phase = world.get(Clock)!.elapsed * 0.7 * config.windSpeed;
  // A broad figure eight with smaller overlapping waves keeps the rain flowing.
  weatherActions(world).setWind(
    (Math.sin(phase) * 6 + Math.sin(phase * 2.1) * 1.5) * config.windStrength,
    (Math.sin(phase * 2) * 3.5 + Math.sin(phase * 0.6)) * config.windStrength
  );
  return 1;
}

// Apply the change in wind so velocities follow the pattern without accumulating speed.
export function applyWind(world: World) {
  const weather = world.get(Weather)!;
  const x = weather.x - weather.appliedX;
  const z = weather.z - weather.appliedZ;
  let count = 0;
  for (const {
    stores: [velocity],
    indices,
  } of world.query(IsRain, Velocity).getPages()) {
    for (let i = 0; i < indices.length; i++) {
      const index = indices[i];
      velocity.x[index] += x;
      velocity.z[index] += z;
    }
    count += indices.length;
  }
  world.set(Weather, { appliedX: weather.x, appliedZ: weather.z });
  return count;
}
