import type { World } from 'koota';
import { Time } from '../traits/index';

export function updateTime(world: World): void {
	const now = performance.now();
	const time = world.get(Time)!;
	const delta = time.current > 0 ? (now - time.current) / 1000 : 0;
	world.set(Time, { current: now, delta });
}
