// Based on work by Hendrik Mans: https://github.com/hmans/miniplex/tree/main/apps/demo

import { PerspectiveCamera } from '@react-three/drei';
import { Canvas, useFrame } from '@react-three/fiber';
import { Entity } from 'koota';
import { useQuery, useWorld } from 'koota/react';
import { memo, StrictMode, useLayoutEffect, useRef } from 'react';
import * as THREE from 'three';
import { useActions } from './actions';
import { schedule } from './systems/schedule';
import { Movement, Transform, IsEnemy } from './traits';
import { between } from './utils/between';
import { useStats } from './utils/use-stats';

export function App() {
	return (
		<Canvas>
			<StrictMode>
				<color attach="background" args={['#111']} />
				<ambientLight intensity={0.2} />
				<directionalLight position={[10, 10, 10]} intensity={0.4} />

				<PerspectiveCamera position={[0, 0, 50]} makeDefault />

				<Player />
				<Enemies />

				<Simulation />
			</StrictMode>
		</Canvas>
	);
}

function Enemies() {
	const enemies = useQuery(IsEnemy, Transform);
	return enemies.map((enemy) => <Enemy key={enemy.id()} entity={enemy} />);
}

const Enemy = memo(({ entity }: { entity: Entity }) => {
	const meshRef = useRef<THREE.Mesh>(null);

	useLayoutEffect(() => {
		if (!meshRef.current) return;

		// Set initial position and orientation
		meshRef.current.position.set(between(-50, 50), between(-50, 50), 0);
		meshRef.current.quaternion.random();

		// Sync transform with the trait
		entity.set(Transform, {
			position: meshRef.current.position,
			rotation: meshRef.current.rotation,
			quaternion: meshRef.current.quaternion,
		});

		entity.set(Movement, { maxSpeed: between(5, 10) });
	}, []);

	return (
		<mesh ref={meshRef}>
			<dodecahedronGeometry />
			<meshStandardMaterial color="white" wireframe emissive={'white'} emissiveIntensity={1} />
		</mesh>
	);
});

function Player() {
	const meshRef = useRef<THREE.Mesh>(null);
	const { spawnPlayer } = useActions();

	useLayoutEffect(() => {
		if (!meshRef.current) return;
		const player = spawnPlayer({
			position: meshRef.current.position,
			rotation: meshRef.current.rotation,
			quaternion: meshRef.current.quaternion,
		});

		player.set(Movement, { maxSpeed: 50, damping: 0.99 });

		return () => player.destroy();
	}, [spawnPlayer]);

	return (
		<mesh ref={meshRef}>
			<boxGeometry />
			<meshStandardMaterial color="orange" wireframe emissive={'orange'} />
		</mesh>
	);
}

// Simulation runs a schedule.
function Simulation() {
	const world = useWorld();
	const statsApi = useStats({
		enemies: () => world.query(IsEnemy).length,
	});

	useFrame(() => {
		statsApi.measure(() => {
			schedule.run({ world });
		});
		statsApi.updateStats();
	});

	return null;
}
