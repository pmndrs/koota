import { Canvas, useFrame } from '@react-three/fiber';
import {
	Circle,
	Color,
	CONSTANTS,
	DummyComponents,
	init,
	Mass,
	Position,
	randInRange,
	recycleBodies as recycleBodiesSim,
	schedule,
	setInitial,
	Velocity,
	world,
} from '@sim/add-remove';
import { useSchedule } from 'directed/react';
import { createSpawner } from 'extras';
import { Entity, koota, useComponent, useWorld, World } from 'koota/react';
import { StrictMode, useLayoutEffect, useMemo } from 'react';
import * as THREE from 'three';
import { SpawnId } from './components/SpawnId';
import { fragmentShader, vertexShader } from './shaders/particleShader';
import { recycleBodies } from './systems/recycleBodies';
import { syncThreeObjects } from './systems/syncThreeObjects';
import { useStats } from './use-stats';

export const BodySpawner = createSpawner(Body);

console.log(BodySpawner);

export function App() {
	const frustumSize = 500;
	const aspect = window.innerWidth / window.innerHeight;

	// Add a system to sync the instanced mesh with component data.
	useSchedule(schedule, syncThreeObjects, { after: 'update' });
	// Would be nice to just replace recycleBodies here.
	useSchedule(schedule, recycleBodies, { tag: 'end', after: 'update' });

	useLayoutEffect(() => {
		// Remove init systems
		if (schedule.has(init)) schedule.remove(init);
		if (schedule.has(setInitial)) schedule.remove(setInitial);
		if (schedule.has(recycleBodiesSim)) schedule.remove(recycleBodiesSim);
		schedule.build();
	}, []);

	return (
		<World world={world}>
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
					<Bodies />
					<BodySpawner.Emitter initial={CONSTANTS.BODIES} />
					<Simulation />
				</StrictMode>
			</Canvas>
		</World>
	);
}

function Bodies() {
	const { geo, mat } = useMemo(() => {
		const particleCount = CONSTANTS.BODIES;

		// Create BufferGeometry for particles
		const geo = new THREE.BufferGeometry();
		const positions = new Float32Array(particleCount * 3); // x, y, z for each particle
		const colors = new Float32Array(particleCount * 4); // r, g, b, a for each particle
		const sizes = new Float32Array(particleCount); // size for each particle

		geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
		geo.setAttribute('color', new THREE.BufferAttribute(colors, 4));
		geo.setAttribute('size', new THREE.BufferAttribute(sizes, 1));

		const mat = new THREE.ShaderMaterial({
			vertexShader: vertexShader(),
			fragmentShader: fragmentShader(),
			transparent: true,
		});

		return { geo, mat };
	}, []);

	return <koota.points args={[geo, mat]} />;
}

function Body({ _sid }: { _sid: number }) {
	const count = useMemo(() => Math.floor(Math.random() * CONSTANTS.MAX_COMPS_PER_ENTITY), []);

	const components = useMemo(() => {
		const components: Koota.Component[] = [];

		for (let i = 0; i < count; i++) {
			components.push(DummyComponents[Math.floor(Math.random() * DummyComponents.length)]);
		}

		return components;
	}, [count]);

	const [position] = useComponent(Position, {
		x: randInRange(-400, 400),
		y: 100,
		z: randInRange(-50, 50),
	});

	const [velocity] = useComponent(Velocity, () => {
		const angle = randInRange(0, Math.PI * 2);
		const speed = randInRange(0, 50);

		return {
			x: Math.cos(angle) * speed,
			y: Math.sin(angle) * speed,
		};
	});

	const [color] = useComponent(Color, {
		r: randInRange(0, 255),
		g: randInRange(0, 255),
		b: randInRange(0, 255),
	});

	const [mass] = useComponent(Mass, { value: count + 1 });
	const [circle] = useComponent(Circle, { radius: mass.value });

	// const { sid } = useSpawner();

	return (
		<Entity
			components={[
				position,
				mass,
				velocity,
				circle,
				color,
				SpawnId({ value: _sid }),
				...components,
			]}
		/>
	);
}

// Simulation runs a schedule.
function Simulation() {
	const world = useWorld();
	const statsApi = useStats({
		Bodies: () => CONSTANTS.BODIES,
		'Max comps per entity': () => CONSTANTS.MAX_COMPS_PER_ENTITY,
		Drain: () => CONSTANTS.DRAIN,
	});

	useFrame(() => {
		statsApi.measure(() => {
			schedule.run({ world });
		});
		statsApi.updateStats();
	});

	return null;
}
