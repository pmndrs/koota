import { useAnimationFrame } from '../utils/use-animation-frame';
import { useWorld } from 'koota/react';
import { useEffect } from 'react';
import { systems , traits } from '../sim'

const {Pointer, Wall} = traits

const {
	updateTime, updateTimers, updateDragging, 
	applyFriction, moveBodies, updateBallCollision, 
	collideWithWalls, updateIdleStatus, updateIdleWobble,
	updateScaleSpring, syncBallTransform
} = systems



export function FrameLoop() {
	const world = useWorld();

	useAnimationFrame(() => {
		updateTime(world);
		updateTimers(world);
		updateDragging(world);
		applyFriction(world);
		moveBodies(world);
		updateBallCollision(world);
		collideWithWalls(world);
		updateIdleStatus(world);
		updateIdleWobble(world);
		updateScaleSpring(world);
		syncBallTransform(world);
	});

	// Sync pointer from window to world
	useEffect(() => {
		const handler = (event: PointerEvent) => {
			world.set(Pointer, { x: event.clientX, y: event.clientY });
		};
		window.addEventListener('pointermove', handler, { capture: true });
		return () => window.removeEventListener('pointermove', handler, { capture: true });
	}, [world]);

	// Sync wall size to the window size
	useEffect(() => {
		const set = () => {
			world.set(Wall, { width: window.innerWidth, height: window.innerHeight });
		};
		set();
		window.addEventListener('resize', set);
		return () => window.removeEventListener('resize', set);
	}, [world]);

	return null;
}
