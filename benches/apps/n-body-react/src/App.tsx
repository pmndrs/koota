import { Canvas, useFrame } from '@react-three/fiber';
import { CONSTANTS, init, schedule } from '@sim/n-body';
import { useSchedule } from 'directed/react';
import { createWorld, Entity, universe } from 'koota';
import { useActions, useWorld } from 'koota/react';
import { StrictMode, useLayoutEffect, useMemo, useRef } from 'react';
import * as THREE from 'three';
import { cleanupBodies } from './systems/cleanupRepulsors';
import { syncThreeObjects } from './systems/syncThreeObjects';
import { InstancedMesh } from './traits/InstancedMesh';
import { actions } from './actions';
import { useStats } from './use-stats';

function WorldGCGTest() {
	const world = useMemo(() => createWorld(), []);

	return null;
}

export function App() {
	const frustumSize = 7000;
	const aspect = window.innerWidth / window.innerHeight;
	const isPointerDown = useRef(false);

	const { spawnRepulsor, spawnBodies, spawnCentralMasses, destroyAllBodies } = useActions(actions);

	// Add a system to sync the instanced mesh with component data.
	useSchedule(schedule, syncThreeObjects, { after: 'update' });
	useSchedule(schedule, cleanupBodies, { after: syncThreeObjects });

	// Remove the init system from the schedule.
	useLayoutEffect(() => {
		schedule.remove(init);
		schedule.build();
	}, []);

	useLayoutEffect(() => {
		spawnCentralMasses(1);
		spawnBodies(CONSTANTS.NBODIES - 1);

		console.log(universe.worldIndex, universe.worlds);

		return () => {
			destroyAllBodies();
		};
	}, [destroyAllBodies, spawnBodies, spawnCentralMasses]);

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
			onPointerDown={(e) => {
				isPointerDown.current = true;
				spawnRepulsor(e, frustumSize);
			}}
			onPointerMove={(e) => {
				if (isPointerDown.current) spawnRepulsor(e, frustumSize);
			}}
			onPointerUp={() => {
				isPointerDown.current = false;
			}}
			onPointerOut={() => {
				isPointerDown.current = false;
			}}
		>
			<StrictMode>
				<Simulation />
				<Bodies />
			</StrictMode>
		</Canvas>
	);
}

function Bodies() {
	const world = useWorld();
	const geo = new THREE.CircleGeometry(CONSTANTS.MAX_RADIUS / 1.5, 12);
	const mat = new THREE.MeshBasicMaterial();

	return (
		<instancedMesh
			ref={(node) => {
				let entity: Entity | undefined;
				if (node) {
					// Set initial scale to zero
					for (let i = 0; i < node.count; i++) {
						node.setMatrixAt(i, new THREE.Matrix4().makeScale(0, 0, 0));
						node.setColorAt(i, new THREE.Color(1, 1, 1));
					}

					entity = world.spawn(InstancedMesh({ object: node }));
				} else if (entity) {
					entity.destroy();
				}
			}}
			args={[geo, mat, CONSTANTS.NBODIES + 500]}
		/>
	);
}

// Simulation runs a schedule.
function Simulation() {
	const world = useWorld();
	const statsApi = useStats({ Bodies: () => CONSTANTS.NBODIES });

	useFrame(() => {
		statsApi.measure(() => {
			schedule.run({ world });
		});
		statsApi.updateStats();
	});

	return null;
}
