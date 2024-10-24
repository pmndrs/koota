// Based on work by Hendrik Mans: https://github.com/hmans/miniplex/tree/main/apps/demo

import { OrbitControls, PerspectiveCamera } from '@react-three/drei';
import { Canvas, useFrame } from '@react-three/fiber';
import { Entity } from 'koota';
import { useQuery, useWorld } from 'koota/react';
import { memo, StrictMode, useCallback, useLayoutEffect } from 'react';
import * as THREE from 'three';
import { useActions } from './actions';
import { schedule } from './systems/schedule';
import { BoidsConfig, Position, SpatialHashMap, Velocity } from './traits';
import { Mesh } from './traits';
import { between } from './utils/between';
import { useStats } from './utils/use-stats';

export function App() {
	const world = useWorld();
	const { spawnBoid, destroyAllBoids } = useActions();

	useLayoutEffect(() => {
		const { initialCount: count } = world.get(BoidsConfig);

		for (let i = 0; i < count; i++) {
			const position = new THREE.Vector3().randomDirection().multiplyScalar(between(0, 10));
			const velocity = new THREE.Vector3().randomDirection();
			spawnBoid(position, velocity);
		}

		return () => {
			destroyAllBoids();
			// Reset the spatial hash map.
			const spatialHashMap = world.get(SpatialHashMap);
			spatialHashMap?.reset();
		};
	}, [spawnBoid, destroyAllBoids, world]);

	return (
		<>
			<div style={{ position: 'absolute', top: 0, right: 0, zIndex: 1 }}>
				<SpawnButton />
				<DestroyButton />
			</div>
			<Canvas>
				<StrictMode>
					<ambientLight intensity={Math.PI * 0.2} />
					<directionalLight position={[1, 2, 3]} intensity={0.8} />

					<PerspectiveCamera makeDefault position={[0, 0, 50]} />
					<OrbitControls />

					<Boids />

					<Simulation />
				</StrictMode>
			</Canvas>
		</>
	);
}

function Boids() {
	const boids = useQuery(Position, Velocity);
	return (
		<>
			{boids.map((boid) => (
				<Boid key={boid.id()} entity={boid} />
			))}
		</>
	);
}

const Boid = memo(({ entity }: { entity: Entity }) => {
	const entityRef = useCallback(
		(node: THREE.Mesh) => {
			if (node) entity?.add(Mesh(node));
			else entity?.remove(Mesh);
		},
		[entity]
	);

	return (
		<mesh ref={entityRef} scale={0.5}>
			<icosahedronGeometry />
			<meshStandardMaterial color="hotpink" />
		</mesh>
	);
});

// Simulation runs a schedule.
function Simulation() {
	const world = useWorld();
	const statsApi = useStats({ count: () => world.query(Position).length });

	useFrame(() => {
		statsApi.measure(() => {
			schedule.run({ world });
		});
		statsApi.updateStats();
	});

	return null;
}

function SpawnButton() {
	const { spawnBoid } = useActions();
	return (
		<button
			onClick={() => {
				const position = new THREE.Vector3().randomDirection().multiplyScalar(between(0, 10));
				const velocity = new THREE.Vector3().randomDirection();
				spawnBoid(position, velocity);
			}}
		>
			Spawn Boid
		</button>
	);
}

function DestroyButton() {
	const { destroyRandomBoid } = useActions();
	return <button onClick={destroyRandomBoid}>Destroy Boid</button>;
}
