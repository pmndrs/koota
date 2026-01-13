import type { World } from 'koota';
import { Time } from '../traits';

export function updateTime(world: World) {
	const time = world.get(Time);
	if (!time) return;

	const now = performance.now();
	const delta = time.last > 0 ? (now - time.last) / 1000 : 0;

	world.set(Time, {
		current: now,
		last: now,
		delta: Math.min(delta, 0.1), // Cap at 100ms to avoid spiral
	});
}
