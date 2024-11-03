// Based on work by Hendrik Mans: https://github.com/hmans/miniplex/tree/main/apps/demo

import { PerspectiveCamera } from '@react-three/drei';
import { Canvas, useFrame } from '@react-three/fiber';
import { Entity } from 'koota';
import { useQuery, useWorld } from 'koota/react';
import { memo, StrictMode, useEffect, useLayoutEffect, useRef, useState } from 'react';
import * as THREE from 'three';
import { useActions } from './actions';
import { schedule } from './systems/schedule';
import { Movement, Transform, IsEnemy, Bullet, Input } from './traits';
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

				<PlayerRenderer />
				<Enemies />
				<Bullets />

				<Simulation />
			</StrictMode>
		</Canvas>
	);
}

function Enemies() {
	const enemies = useQuery(IsEnemy, Transform);
	return enemies.map((enemy) => <EnemyRenderer key={enemy.id()} entity={enemy} />);
}

const EnemyRenderer = memo(({ entity }: { entity: Entity }) => {
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

export function PlayerRenderer() {
	const ref = useRef<THREE.Group>(null);
	const playerRef = useRef<Entity | null>(null);
	const world = useWorld();
	const [isThrusting, setIsThrusting] = useState(false);

	useEffect(() => {
		const unsub = world.onChange(Input, (entity) => {
			if (entity.id() !== playerRef.current?.id()) return;
			if (entity.get(Input).length() > 0) setIsThrusting(true);
			else setIsThrusting(false);
		});
		return () => {
			unsub();
		};
	}, []);

	const { spawnPlayer } = useActions();

	useLayoutEffect(() => {
		if (!ref.current) return;
		const player = spawnPlayer({
			position: ref.current.position,
			rotation: ref.current.rotation,
			quaternion: ref.current.quaternion,
		});
		playerRef.current = player;

		player.set(Movement, { maxSpeed: 50, damping: 0.99 });

		return () => player.destroy();
	}, [spawnPlayer]);

	return (
		<group ref={ref}>
			<mesh>
				<boxGeometry />
				<meshStandardMaterial color="orange" wireframe emissive={'orange'} />
			</mesh>
			{isThrusting && <Thruster />}
		</group>
	);
}

function Thruster() {
	const meshRef = useRef<THREE.Mesh>(null);

	useFrame(({ clock }) => {
		if (!meshRef.current) return;
		// Create a pulsing effect by using sin wave
		const scale = 0.8 + Math.sin(clock.elapsedTime * 10) * 0.2;
		meshRef.current.scale.setY(scale);
		meshRef.current.position.y = -(1 - scale) / 2;
	});

	return (
		<group position={[0, -1, 0]} rotation={[0, 0, 3.14]}>
			<mesh ref={meshRef}>
				<coneGeometry args={[0.3, 1, 8]} />
				<meshStandardMaterial
					color="#ff4400"
					wireframe
					emissive="#ff4400"
					emissiveIntensity={2}
				/>
			</mesh>
		</group>
	);
}

function Bullets() {
	const bullets = useQuery(Bullet, Transform);
	return bullets.map((bullet) => <BulletRenderer key={bullet.id()} entity={bullet} />);
}

const BulletRenderer = memo(({ entity }: { entity: Entity }) => {
	const meshRef = useRef<THREE.Mesh>(null);

	useLayoutEffect(() => {
		if (!meshRef.current) return;

		// Copy current values
		const { position, rotation, quaternion } = entity.get(Transform);
		meshRef.current.position.copy(position);
		meshRef.current.rotation.copy(rotation);
		meshRef.current.quaternion.copy(quaternion);

		// Sync transform with the trait
		entity.set(Transform, {
			position: meshRef.current.position,
			rotation: meshRef.current.rotation,
			quaternion: meshRef.current.quaternion,
		});
	}, []);

	return (
		<mesh ref={meshRef} scale={0.2}>
			<sphereGeometry />
			<meshStandardMaterial color="red" wireframe emissive={'red'} />
		</mesh>
	);
});

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
