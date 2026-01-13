import { useWorld } from 'koota/react';
import { useAnimationFrame } from './utils/use-animation-frame';
import { updateTime } from './systems/updateTime';
import { syncToRefs } from './systems/syncToRefs';

export function Frameloop() {
	const world = useWorld();

	useAnimationFrame(() => {
		updateTime(world);
		syncToRefs(world);
	});

	return null;
}
