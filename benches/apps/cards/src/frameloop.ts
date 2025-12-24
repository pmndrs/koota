import { useWorld } from 'koota/react';
import { useEffect } from 'react';
import { dampVelocity } from './systems/damp-velocity';
import { syncToDOM } from './systems/sync-to-dom';
import { updateCardOrder } from './systems/update-card-order';
import { updateDragging } from './systems/update-dragging';
import { updateHandLayout } from './systems/update-hand-layout';
import { updateTime } from './systems/update-time';
import { updateTransform } from './systems/update-transform';
import { Pointer, Viewport } from './traits';
import { useAnimationFrame } from './utils/use-animation-frame';

export function Frameloop() {
	const world = useWorld();

	// Run our frameloop!
	useAnimationFrame(() => {
		updateTime(world);
		updateDragging(world);
		dampVelocity(world);
		updateTransform(world);
		updateCardOrder(world);
		updateHandLayout(world);
		syncToDOM(world);
	});

	// Sync viewport size to the world
	useEffect(() => {
		const updateViewport = () => {
			world.set(Viewport, { width: window.innerWidth, height: window.innerHeight });
		};

		updateViewport();
		window.addEventListener('resize', updateViewport);

		return () => {
			window.removeEventListener('resize', updateViewport);
		};
	}, [world]);

	// Sync pointer input to the world
	useEffect(() => {
		const handlePointerMove = (e: PointerEvent) => {
			world.set(Pointer, { x: e.clientX, y: e.clientY });
		};

		window.addEventListener('pointermove', handlePointerMove);

		return () => {
			window.removeEventListener('pointermove', handlePointerMove);
		};
	}, [world]);

	return null;
}
