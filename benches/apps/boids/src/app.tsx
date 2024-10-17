// Based on work by Hendrik Mans: https://github.com/hmans/miniplex/tree/main/apps/demo

import { OrbitControls, PerspectiveCamera } from '@react-three/drei';
import { Canvas, useFrame } from '@react-three/fiber';
import { Entity } from 'koota';
import { useWorld } from 'koota/react';
import { StrictMode, useCallback, useLayoutEffect, useRef } from 'react';
import * as THREE from 'three';
import { useActions } from './actions';
import { schedule } from './systems/schedule';
import { SpatialHashMap } from './traits';
import { InstancedMesh } from './traits/instanced-mesh';
import { between } from './utils/between';
import { useStats } from './utils/use-stats';

const COUNT = 1000;

export function App() {
	const world = useWorld();
	const { spawnBoid, destroyAllBoids } = useActions();

	useLayoutEffect(() => {
		for (let i = 0; i < COUNT; i++) {
			const position = new THREE.Vector3().randomDirection().multiplyScalar(between(0, 10));
			const velocity = new THREE.Vector3().randomDirection();
			spawnBoid(position, velocity);
		}

		return () => {
			destroyAllBoids();
			// Reset the spatial hash map.
			const { value: spatialHashMap } = world.get(SpatialHashMap);
			spatialHashMap?.reset();
		};
	}, [spawnBoid, destroyAllBoids, world]);

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

function useEntityRef<T = any>(callback: (node: T, entity: Entity) => void) {
	const world = useWorld();
	const entityRef = useRef<Entity>(null!);

	return useCallback(
		(node: T) => {
			if (node) {
				if (entityRef.current) entityRef.current.destroy();
				entityRef.current = world.spawn();
				callback(node, entityRef.current);
			} else if (entityRef.current) {
				entityRef.current.destroy();
			}
		},
		[world]
	);
}

function Boids() {
	const geo = new THREE.IcosahedronGeometry();
	const mat = new THREE.MeshStandardMaterial({ color: 'hotpink' });

	const entityRef = useEntityRef<THREE.InstancedMesh>((node, entity) => {
		// Set initial scale to zero
		for (let i = 0; i < node.count; i++) {
			node.setMatrixAt(i, new THREE.Matrix4().makeScale(0, 0, 0));
		}
		entity.add(InstancedMesh({ object: node }));
	});

	return <instancedMesh ref={entityRef} args={[geo, mat, COUNT + COUNT * 2]} />;
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
