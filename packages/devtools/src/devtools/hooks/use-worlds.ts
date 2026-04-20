import type { World } from '@koota/core';
import { universe } from '@koota/core';
import { useRef, useState } from 'react';
import { useAnimationFrame } from './use-animation-frame';

/**
 * Returns the list of registered worlds. When explicit worlds are provided,
 * those are used directly. Otherwise polls the universe for registered worlds.
 */
export function useWorlds(explicit?: World[]): World[] {
	const [worlds, setWorlds] = useState<World[]>(() => {
		if (explicit) return explicit;
		return getRegisteredWorlds();
	});
	const prevKeyRef = useRef('');

	useAnimationFrame(() => {
		if (explicit) return;

		const current = getRegisteredWorlds();
		const key = current.map((w) => w.id).join(',');
		if (key !== prevKeyRef.current) {
			prevKeyRef.current = key;
			setWorlds(current);
		}
	});

	return explicit ?? worlds;
}

function getRegisteredWorlds(): World[] {
	const result: World[] = [];
	for (const ctx of universe.worlds) {
		if (ctx?.world) result.push(ctx.world);
	}
	return result;
}
