// Based on work by Hendrik Mans: https://github.com/hmans/miniplex/tree/main/apps/demo

import { PerspectiveCamera } from '@react-three/drei';
import { Canvas, useFrame } from '@react-three/fiber';
import type { Entity } from 'koota';
import { IsDevtoolsHovered, IsDevtoolsSelected, IsDevtoolsHighlighting } from 'koota/devtools';
import { Devtools } from 'koota/devtools/react';
import {
	useActions,
	useQuery,
	useQueryFirst,
	useTag,
	useTrait,
	useTraitEffect,
	useWorld,
} from 'koota/react';
import { memo, StrictMode, useCallback, useLayoutEffect, useMemo, useRef, useState } from 'react';
import * as THREE from 'three';
import { actions } from './actions';
import { schedule } from './systems/schedule';

import {
	Bullet,
	Explosion,
	Input,
	IsEnemy,
	IsPlayer,
	IsShieldVisible,
	Movement,
	Transform,
} from './traits';
import { between } from './utils/between';
import { useStats } from './utils/use-stats';

export function App() {
	const world = useWorld();

	return (
		<>
			<Devtools world={world} />

			<Canvas>
				<StrictMode>
					<color attach="background" args={['#111']} />
					<ambientLight intensity={0.2} />
					<directionalLight position={[10, 10, 10]} intensity={0.4} />

					<PerspectiveCamera position={[0, 0, 50]} makeDefault />

					<Player />
					<EnemyRenderer />
					<BulletRenderer />
					<ExplosionRenderer />

					<Simulation />
				</StrictMode>
			</Canvas>
		</>
	);
}

function EnemyRenderer() {
	const enemies = useQuery(IsEnemy, Transform);
	return (
		<>
			{enemies.map((enemy) => (
				<EnemyView key={enemy.id()} entity={enemy} />
			))}
		</>
	);
}

const EnemyView = memo(({ entity }: { entity: Entity }) => {
	const world = useWorld();
	const groupRef = useRef<THREE.Group>(null);
	const meshRef = useRef<THREE.Mesh>(null);
	const scaleRef = useRef(0);
	const isHovered = useTag(entity, IsDevtoolsHovered);
	const isSelected = useTag(entity, IsDevtoolsSelected);
	const isAnythingHighlighted = useTag(world, IsDevtoolsHighlighting);
	const isThisHighlighted = isHovered || isSelected;
	const shouldFade = isAnythingHighlighted && !isThisHighlighted;

	// Set initial values and sync with the entity
	useLayoutEffect(() => {
		if (!groupRef.current || !meshRef.current) return;

		// Set initial position and orientation
		groupRef.current.position.set(between(-50, 50), between(-50, 50), 0);
		meshRef.current.quaternion.random();

		// Sync transform with the trait
		// NOTE: We map position to the GROUP, but rotation to the MESH
		entity.set(Transform, {
			position: groupRef.current.position,
			rotation: meshRef.current.rotation,
			quaternion: meshRef.current.quaternion,
		});

		entity.set(Movement, { maxSpeed: between(5, 10) });
	}, []);

	useFrame((_, delta) => {
		if (!groupRef.current) return;
		const progress = Math.min(scaleRef.current + delta * 2, 1);
		// Apply easing - this uses cubic easing out
		const eased = 1 - (1 - progress) ** 3;
		scaleRef.current = progress;

		// Apply devtools feedback scale to the GROUP
		const devtoolsScale = isThisHighlighted ? 1.05 : 1;
		groupRef.current.scale.setScalar(eased * devtoolsScale);
	});

	// Determine color based on devtools state
	const color = isSelected ? '#ffff00' : isHovered ? '#00ffff' : 'white';

	return (
		<group ref={groupRef}>
			<mesh ref={meshRef} renderOrder={isThisHighlighted ? 100 : 0}>
				<dodecahedronGeometry />
				<meshBasicMaterial
					color={color}
					wireframe
					transparent
					opacity={shouldFade ? 0.15 : 1}
					depthTest={isThisHighlighted ? false : true}
				/>
			</mesh>
			{isHovered && !isSelected && <DevtoolsHighlight color="#00ffff" />}
			{isSelected && <DevtoolsHighlight color="#ffff00" />}
		</group>
	);
});

function Player() {
	const player = useQueryFirst(IsPlayer, Transform);
	const { spawnPlayer } = useActions(actions);

	useLayoutEffect(() => {
		const entity = spawnPlayer();
		return () => entity?.destroy();
	}, [spawnPlayer]);

	return <>{player && <PlayerView entity={player} maxSpeed={50} damping={0.99} thrust={2} />}</>;
}

const PlayerView = memo(
	({
		entity,
		maxSpeed = 50,
		damping = 0.99,
		thrust = 2,
	}: {
		entity: Entity;
		maxSpeed?: number;
		damping?: number;
		thrust?: number;
	}) => {
		const world = useWorld();
		const ref = useRef<THREE.Group>(null);

		// Thrusting state
		const [isThrusting, setIsThrusting] = useState(false);

		// Devtools feedback
		const isHovered = useTag(entity, IsDevtoolsHovered);
		const isSelected = useTag(entity, IsDevtoolsSelected);
		const isAnythingHighlighted = useTag(world, IsDevtoolsHighlighting);
		const isThisHighlighted = isHovered || isSelected;
		const shouldFade = isAnythingHighlighted && !isThisHighlighted;

		console.log('isAnythingHighlighted', isAnythingHighlighted);

		useTraitEffect(entity, Input, (input) => {
			if (input && input.length() > 0) setIsThrusting(true);
			else setIsThrusting(false);
		});

		// Shield visibility state
		const isShieldVisible = useTrait(entity, IsShieldVisible);

		// Set initial values and sync with the entity
		useLayoutEffect(() => {
			if (!ref.current) return;

			entity.set(Transform, {
				position: ref.current.position,
				rotation: ref.current.rotation,
				quaternion: ref.current.quaternion,
			});
			entity.set(Movement, { maxSpeed, damping, thrust });
		}, [entity]);

		// Determine color and scale based on devtools state
		const color = isSelected ? '#ffff00' : isHovered ? '#00ffff' : 'orange';
		const scale = isThisHighlighted ? 1.05 : 1;

		return (
			<group ref={ref}>
				<mesh scale={scale} renderOrder={isThisHighlighted ? 100 : 0}>
					<boxGeometry />
					<meshBasicMaterial
						color={color}
						wireframe
						transparent
						opacity={shouldFade ? 0.15 : 1}
						depthTest={isThisHighlighted ? false : true}
					/>
				</mesh>
				{isThrusting && <ThrusterView />}
				{isShieldVisible && <ShieldView />}
				{isHovered && !isSelected && <DevtoolsHighlight color="#00ffff" />}
				{isSelected && <DevtoolsHighlight color="#ffff00" />}
			</group>
		);
	}
);

function ShieldView() {
	return (
		<mesh>
			<sphereGeometry args={[1.1, 8, 8]} />
			<meshBasicMaterial color="blue" wireframe />
		</mesh>
	);
}

function DevtoolsHighlight({ color }: { color: string }) {
	return (
		<mesh position={[0, 0, -0.5]} renderOrder={999}>
			<circleGeometry args={[1.3, 32]} />
			<meshBasicMaterial
				color={color}
				transparent
				opacity={0.3}
				depthTest={false}
				depthWrite={false}
			/>
		</mesh>
	);
}

function ThrusterView() {
	const meshRef = useRef<THREE.Mesh>(null);

	useFrame(({ clock }) => {
		if (!meshRef.current) return;
		// Create a pulsing effect by using a sine wave
		const scale = 0.8 + Math.sin(clock.elapsedTime * 10) * 0.2;
		meshRef.current.scale.setY(scale);
		meshRef.current.position.y = -(1 - scale) / 2;
	});

	return (
		<group position={[0, -1, 0]} rotation={[0, 0, 3.14]}>
			<mesh ref={meshRef}>
				<coneGeometry args={[0.3, 1, 8]} />
				<meshBasicMaterial color="#ff4400" wireframe />
			</mesh>
		</group>
	);
}

function ExplosionRenderer() {
	const explosions = useQuery(Explosion, Transform);
	return (
		<>
			{explosions.map((explosion) => (
				<ExplosionView key={explosion.id()} entity={explosion} />
			))}
		</>
	);
}

function ExplosionView({ entity }: { entity: Entity }) {
	const groupRef = useRef<THREE.Group>(null);
	const particleCount = entity.get(Explosion)!.count;

	// Create particles once with their initial state
	const particles = useMemo(() => {
		const velocities = entity.get(Explosion)!.velocities;
		const randomOffset = Math.random() * Math.PI * 2;

		return Array.from({ length: particleCount }, (_, i) => {
			const angle = randomOffset + (i / particleCount) * Math.PI * 2;
			velocities.push(new THREE.Vector3(Math.cos(angle), Math.sin(angle), 0));

			return { id: `${entity.id()}-${i}` };
		});
	}, []);

	useLayoutEffect(() => {
		if (!groupRef.current) return;
		groupRef.current.position.copy(entity.get(Transform)!.position);
	}, []);

	useFrame((_, delta) => {
		if (!groupRef.current) return;
		const explosion = entity.get(Explosion);
		if (!explosion) return;
		const { duration, current, velocities } = explosion;
		const progress = current / duration;
		const meshes = groupRef.current.children as THREE.Mesh[];

		particles.forEach((_, i) => {
			const mesh = meshes[i];
			if (!mesh) return;
			mesh.position.add(velocities[i].clone().multiplyScalar(delta * 40));

			const scale = Math.max(0, 1 - progress);
			mesh.scale.setScalar(scale);
			(mesh.material as THREE.MeshBasicMaterial).opacity = scale;
		});
	});

	return (
		<group ref={groupRef}>
			{particles.map((particle) => (
				<mesh key={particle.id}>
					<sphereGeometry args={[0.2, 8, 8]} />
					<meshBasicMaterial color={[1, 0.5, 0]} transparent />
				</mesh>
			))}
		</group>
	);
}

function BulletRenderer() {
	const bullets = useQuery(Bullet, Transform);
	return (
		<>
			{bullets.map((bullet) => (
				<BulletView key={bullet.id()} entity={bullet} />
			))}
		</>
	);
}

const BulletView = memo(({ entity }: { entity: Entity }) => {
	const world = useWorld();
	const groupRef = useRef<THREE.Group>(null);
	const meshRef = useRef<THREE.Mesh>(null);
	const isHovered = useTag(entity, IsDevtoolsHovered);
	const isSelected = useTag(entity, IsDevtoolsSelected);
	const isAnythingHighlighted = useTag(world, IsDevtoolsHighlighting);
	const isThisHighlighted = isHovered || isSelected;
	const shouldFade = isAnythingHighlighted && !isThisHighlighted;

	// Set initial values and sync with the entity
	const handleInit = useCallback(() => {
		if (!groupRef.current || !meshRef.current || !entity.isAlive()) return;

		entity.set(Transform, (prev) => ({
			position: groupRef.current!.position.copy(prev.position),
			quaternion: meshRef.current!.quaternion.copy(prev.quaternion),
			rotation: meshRef.current!.rotation.copy(prev.rotation),
		}));
	}, []);

	// Run init when refs are ready
	useLayoutEffect(handleInit, [handleInit]);

	const color = isSelected ? '#ffff00' : isHovered ? '#00ffff' : 'red';
	const devtoolsScale = isThisHighlighted ? 1.05 : 1;
	// Move base scale (0.2) to the group
	const scale = 0.2 * devtoolsScale;

	return (
		<group ref={groupRef} scale={scale}>
			<mesh ref={meshRef} renderOrder={isThisHighlighted ? 100 : 0}>
				<sphereGeometry />
				<meshBasicMaterial
					color={color}
					wireframe
					transparent
					opacity={shouldFade ? 0.15 : 1}
					depthTest={isThisHighlighted ? false : true}
				/>
			</mesh>
			{isHovered && !isSelected && <DevtoolsHighlight color="#00ffff" />}
			{isSelected && <DevtoolsHighlight color="#ffff00" />}
		</group>
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
