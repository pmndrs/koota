import type { World } from 'koota';
import { Time } from '../traits';

export function updateTime(world: World) {
	const now = performance.now();
	const time = world.get(Time)!;
	const delta = Math.min((now - time.last) / 1000, 0.1);
	world.set(Time, { last: now, delta });
}

