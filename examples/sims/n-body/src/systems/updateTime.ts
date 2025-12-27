import type { World } from 'koota';
import { Time } from '../traits/Time';

export const updateTime = ({ world }: { world: World }) => {
	const time = world.get(Time)!;

	if (time.last === 0) time.last = performance.now();

	const now = performance.now();
	const delta = now - time.last;

	time.delta = Math.min(delta / 1000, 1 / 30);
	time.last = now;

	world.set(Time, time);
};
