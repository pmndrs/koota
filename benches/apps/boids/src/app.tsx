// Based on work by Hendrik Mans: https://github.com/hmans/miniplex/tree/main/apps/demo

import { Canvas, useFrame } from '@react-three/fiber';
import { useWorld } from 'koota/react';
import { StrictMode, useCallback, useLayoutEffect, useRef } from 'react';
import { useStats } from './utils/use-stats';
import { schedule } from './systems/schedule';
import { OrbitControls, PerspectiveCamera } from '@react-three/drei';
import { useActions } from './actions';
import * as THREE from 'three';
import { between } from './utils/between';
import { Entity } from 'koota';
import { InstancedMesh } from './traits/instanced-mesh';

const COUNT = 1000;

export function App() {
	const { spawnBoid, destroyAllBoids } = useActions();

	useLayoutEffect(() => {
		for (let i = 0; i < COUNT; i++) {
			const position = new THREE.Vector3().randomDirection().multiplyScalar(between(0, 10));
			const velocity = new THREE.Vector3().randomDirection();
			spawnBoid(position, velocity);
		}

		return () => {
			destroyAllBoids();
			console.log('destroyed', COUNT, 'boids');
		};
	}, [spawnBoid, destroyAllBoids]);

	return (
		<Canvas>
			<StrictMode>
				<ambientLight intensity={0.2} />
				<directionalLight position={[1, 2, 3]} intensity={0.8} />

				<PerspectiveCamera makeDefault position={[0, 0, 50]} />
				<OrbitControls />

				<Boids />

				<Simulation />
			</StrictMode>
		</Canvas>
	);
}

function Boids() {
	const world = useWorld();
	const geo = new THREE.IcosahedronGeometry();
	const mat = new THREE.MeshStandardMaterial({ color: 'hotpink' });

	const entityRef = useRef<Entity | undefined>(undefined);

	const setInitial = useCallback(
		(node: THREE.InstancedMesh) => {
			if (node) {
				if (entityRef.current) return;

				// Set initial scale to zero
				for (let i = 0; i < node.count; i++) {
					node.setMatrixAt(i, new THREE.Matrix4().makeScale(0, 0, 0));
				}

				entityRef.current = world.spawn(InstancedMesh({ object: node }));
			} else if (entityRef.current) {
				entityRef.current.destroy();
				entityRef.current = undefined;
			}
		},
		[world]
	);

	return <instancedMesh ref={setInitial} args={[geo, mat, COUNT]} />;
}

// Simulation runs a schedule.
function Simulation() {
	const world = useWorld();
	const statsApi = useStats({});

	useFrame(() => {
		statsApi.measure(() => {
			schedule.run({ world });
		});
		statsApi.updateStats();
	});

	return null;
}
