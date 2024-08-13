import { Canvas } from '@react-three/fiber';
import { CONSTANTS, schedule, world } from '@sim/n-body';
import { Component } from '@sweet-ecs/core';
import * as Sweet from '@sweet-ecs/react';
import { useWorld, sweet } from '@sweet-ecs/react';
import { useSchedule } from 'directed/react';
import { useMemo } from 'react';
import * as THREE from 'three';
import { syncThreeObjects } from './systems/syncThreeObjects';
import { useRaf } from './use-raf';
import { useStats } from './use-stats';

export function App() {
	const frustumSize = 7000;
	const aspect = window.innerWidth / window.innerHeight;

	// Add a system to sync the instanced mesh with component data.
	useSchedule(schedule, syncThreeObjects, { after: 'update' });

	return (
		<Sweet.World world={world}>
			<Simulation />
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
				<Bodies />
			</Canvas>
		</Sweet.World>
	);
}

// View is added automatically.
function Bodies({ components = [] }: { components?: (typeof Component | Component)[] }) {
	const geo = useMemo(() => new THREE.CircleGeometry(CONSTANTS.MAX_RADIUS / 1.5, 12), []);
	const mat = useMemo(() => new THREE.MeshBasicMaterial(), []);

	return <sweet.instancedMesh args={[geo, mat, CONSTANTS.NBODIES]} components={components} />;
}

// Simulation runs a schedule.
function Simulation() {
	const world = useWorld();
	const statsApi = useStats({ Bodies: () => CONSTANTS.NBODIES });

	useRaf(async () => {
		await statsApi.measure(async () => {
			await schedule.run({ world });
		});
		statsApi.updateStats();
	}, [world, statsApi]);

	return null;
}

// Alternatie Bodies with the view added manually via ref callback.

// function Bodies({ components = [] }: { components?: (typeof Component | Component)[] }) {
// 	const geo = useMemo(() => new THREE.CircleGeometry(CONSTANTS.MAX_RADIUS / 1.5, 12), []);
// 	const mat = useMemo(() => new THREE.MeshBasicMaterial(), []);
// 	const view = useMemo(() => new Sweet.InstancedMesh(null!), []);

// 	return (
// 		<Sweet.Entity components={[...components, view]}>
// 			<instancedMesh
// 				ref={(instance) => {
// 					if (instance) view.object = instance;
// 				}}
// 				args={[geo, mat, CONSTANTS.NBODIES]}
// 			/>
// 		</Sweet.Entity>
// 	);
// }
