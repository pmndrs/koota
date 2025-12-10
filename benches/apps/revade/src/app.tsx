// Based on work by Hendrik Mans: https://github.com/hmans/miniplex/tree/main/apps/demo

import { PerspectiveCamera } from '@react-three/drei';
import { Canvas, useFrame } from '@react-three/fiber';
import { Not, type Entity } from 'koota';
import { Devtools } from 'koota/devtools/react';
import { useQuery, useQueryFirst, useTrait, useTraitEffect, useWorld } from 'koota/react';
import { memo, useCallback, useMemo, useRef, useState } from 'react';
import * as THREE from 'three';
import { Frameloop } from './frameloop';
import { Startup } from './startup';
import { Bullet, Explosion, Input, IsEnemy, IsPlayer, IsShieldVisible, Transform } from './traits';
import { useDevtoolsHighlight } from './utils/use-devtools-highlight';

export function App() {
	const world = useWorld();

	return (
		<>
			<Devtools world={world} />

			<Canvas>
				<color attach="background" args={['#111']} />
				<ambientLight intensity={0.2} />
				<directionalLight position={[10, 10, 10]} intensity={0.4} />

				<PerspectiveCamera position={[0, 0, 50]} makeDefault />

				<PlayerRenderer />
				<EnemyRenderer />
				<BulletRenderer />
				<ExplosionRenderer />
			</Canvas>

			<Frameloop />
			<Startup />
		</>
	);
}

function EnemyRenderer() {
	const enemies = useQuery(IsEnemy, Transform, Not(Explosion));
	return enemies.map((enemy) => <EnemyView key={enemy.id()} entity={enemy} />);
}

const EnemyView = ({ entity }: { entity: Entity }) => {
	const groupRef = useRef<THREE.Group>(null);
	const scaleRef = useRef(0);
	const highlight = useDevtoolsHighlight(entity);

	const handleInit = useCallback(
		(group: THREE.Group | null) => {
			if (!entity.isAlive() || !group) return;

			groupRef.current = group;

			entity.set(Transform, (prev) => ({
				position: group.position.copy(prev.position),
				rotation: group.rotation.copy(prev.rotation),
				quaternion: group.quaternion.copy(prev.quaternion),
			}));
		},
		[entity]
	);

	useFrame((_, delta) => {
		if (!groupRef.current) return;
		const progress = Math.min(scaleRef.current + delta * 2, 1);
		const eased = 1 - (1 - progress) ** 3;
		scaleRef.current = progress;
		groupRef.current.scale.setScalar(eased);
	});

	return (
		<group ref={handleInit}>
			<mesh>
				<dodecahedronGeometry />
				<meshBasicMaterial
					color={highlight.color ?? 'white'}
					wireframe
					transparent
					opacity={highlight.opacity}
				/>
			</mesh>
		</group>
	);
};

function PlayerRenderer() {
	const player = useQueryFirst(IsPlayer, Transform, Not(Explosion));
	return player && <PlayerView entity={player} />;
}

const PlayerView = ({ entity }: { entity: Entity }) => {
	const [isThrusting, setIsThrusting] = useState(false);
	const highlight = useDevtoolsHighlight(entity);

	useTraitEffect(entity, Input, (input) => {
		if (input && input.length() > 0) setIsThrusting(true);
		else setIsThrusting(false);
	});

	const isShieldVisible = useTrait(entity, IsShieldVisible);

	const handleInit = useCallback(
		(group: THREE.Group | null) => {
			if (!entity.isAlive() || !group) return;

			entity.set(Transform, {
				position: group.position,
				rotation: group.rotation,
				quaternion: group.quaternion,
			});
		},
		[entity]
	);

	return (
		<group ref={handleInit}>
			<mesh>
				<boxGeometry />
				<meshBasicMaterial
					color={highlight.color ?? 'orange'}
					wireframe
					transparent
					opacity={highlight.opacity}
				/>
			</mesh>
			{isThrusting && <ThrusterView />}
			{isShieldVisible && <ShieldView />}
		</group>
	);
};

function ShieldView() {
	return (
		<mesh>
			<sphereGeometry args={[1.1, 8, 8]} />
			<meshBasicMaterial color="blue" wireframe />
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
	return explosions.map((explosion) => <ExplosionView key={explosion.id()} entity={explosion} />);
}

function ExplosionView({ entity }: { entity: Entity }) {
	const groupRef = useRef<THREE.Group>(null);
	const particleCount = entity.get(Explosion)!.count;

	const handleInit = useCallback(
		(group: THREE.Group | null) => {
			if (!entity.isAlive() || !group) return;
			groupRef.current = group;
			group.position.copy(entity.get(Transform)!.position);
		},
		[entity]
	);

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
		<group ref={handleInit}>
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
	const bullets = useQuery(Bullet, Transform, Not(Explosion));
	return bullets.map((bullet) => <BulletView key={bullet.id()} entity={bullet} />);
}

const BulletView = memo(({ entity }: { entity: Entity }) => {
	const highlight = useDevtoolsHighlight(entity);

	const handleInit = useCallback(
		(group: THREE.Group | null) => {
			if (!entity.isAlive() || !group) return;

			entity.set(Transform, (prev) => ({
				position: group.position.copy(prev.position),
				quaternion: group.quaternion.copy(prev.quaternion),
				rotation: group.rotation.copy(prev.rotation),
			}));
		},
		[entity]
	);

	return (
		<group ref={handleInit}>
			<mesh scale={0.2}>
				<sphereGeometry />
				<meshBasicMaterial
					color={highlight.color ?? 'red'}
					wireframe
					transparent
					opacity={highlight.opacity}
				/>
			</mesh>
		</group>
	);
});
