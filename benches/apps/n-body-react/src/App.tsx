import { Canvas } from '@react-three/fiber';
import { schedule } from '@sim/n-body';
import { Entity, useComponent, useEntity, useWorld, World } from '@sweet-ecs/react';
import { useSchedule } from 'directed/react';
import { StrictMode, useLayoutEffect } from 'react';
import { syncThreeObjects } from './systems/syncThreeObjects';
import { define } from '@sweet-ecs/core';

const Position = define({ x: 0, y: 0 });

export function App() {
	const frustumSize = 7000;
	const aspect = window.innerWidth / window.innerHeight;

	// Add a system to sync the instanced mesh with component data.
	useSchedule(schedule, syncThreeObjects, { after: 'update' });

	return (
		<Canvas
			orthographic
			camera={{
				left: (-frustumSize * aspect) / 2,
				right: (frustumSize * aspect) / 2,
				top: frustumSize / 2,
				bottom: -frustumSize / 2,
				near: 0.1,
				far: 500,
				position: [0, 0, 100],
			}}
		>
			<StrictMode>
				<World>
					<Body />
				</World>
			</StrictMode>
		</Canvas>
	);
}

function Body() {
	const world = useWorld();
	const [position] = useComponent(Position);

	return (
		<Entity
			ref={(node) => {
				console.log(node, world.entities.length);
			}}
			components={[position]}
		>
			<Test />
		</Entity>
	);
}

function Test() {
	const entity = useEntity();

	useLayoutEffect(() => {
		console.log('entity', entity.current);
	}, [entity]);

	return <mesh />;
}

// let isResolved = false;
// const promise = new Promise((resolve) => {
// 	setTimeout(() => {
// 		isResolved = true;
// 		resolve(null);
// 	}, 1000);
// });

// function SuspendingComponent() {
// 	if (!isResolved) throw promise;

// 	const world = useWorld();
// 	console.log(world.isInitialized);
// 	console.log(universe.worlds.length);

// 	useLayoutEffect(() => {
// 		console.log('SC');
// 		console.log(world.isInitialized);
// 		console.log(universe.worlds.length);
// 	}, []);

// 	return null;
// }
