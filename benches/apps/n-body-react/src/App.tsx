import { Canvas, useFrame } from '@react-three/fiber';
import {
	Acceleration,
	Circle,
	Color,
	CONSTANTS,
	init,
	IsCentralMass,
	Mass,
	Position,
	randInRange,
	schedule,
	setInitial,
	Velocity,
	world,
} from '@sim/n-body';
import { ComponentProp, Entity, sweet, useComponent, useWorld, World } from '@sweet-ecs/react';
import { useSchedule } from 'directed/react';
import { Spawner } from 'extras';
import { StrictMode, useLayoutEffect } from 'react';
import * as THREE from 'three';
import { syncThreeObjects } from './systems/syncThreeObjects';
import { useStats } from './use-stats';

const BodySpawner = new Spawner(Body);

export function App() {
	const frustumSize = 7000;
	const aspect = window.innerWidth / window.innerHeight;

	// Add a system to sync the instanced mesh with component data.
	useSchedule(schedule, syncThreeObjects, { after: 'update' });

	useLayoutEffect(() => {
		// Remove init systems
		if (schedule.has(init)) schedule.remove(init);
		if (schedule.has(setInitial)) schedule.remove(setInitial);
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
					<BodySpawner.Emitter initial={CONSTANTS.NBODIES - 1} />
					<CentralMass />
					<Simulation />
				</StrictMode>
			</Canvas>
		</World>
	);
}

function Bodies() {
	const geo = new THREE.CircleGeometry(CONSTANTS.MAX_RADIUS / 1.5, 12);
	const mat = new THREE.MeshBasicMaterial();

	return <sweet.instancedMesh args={[geo, mat, CONSTANTS.NBODIES]} />;
}

function Body({ components = [] }: { components: ComponentProp[] }) {
	const [position] = useComponent(Position, {
		x: randInRange(-4000, 4000),
		y: randInRange(-100, 100),
	});

	const [mass] = useComponent(Mass, {
		value: CONSTANTS.BASE_MASS + randInRange(0, CONSTANTS.VAR_MASS),
	});

	const [velocity] = useComponent(Velocity, () =>
		calcStableVelocity(position.x, position.y, mass.value)
	);

	const [circle] = useComponent(Circle, () => ({
		radius: CONSTANTS.MAX_RADIUS * (mass.value / (CONSTANTS.BASE_MASS + CONSTANTS.VAR_MASS)) + 1,
	}));

	return (
		<Entity components={[position, mass, velocity, circle, Acceleration, Color, ...components]} />
	);
}

function CentralMass() {
	const [position] = useComponent(Position);
	const [velocity] = useComponent(Velocity);
	const [mass] = useComponent(Mass, { value: CONSTANTS.CENTRAL_MASS });
	const [circle] = useComponent(Circle, { radius: CONSTANTS.MAX_RADIUS / 1.5 });

	return (
		<Entity components={[IsCentralMass, position, velocity, mass, circle, Acceleration, Color]} />
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

function calcStableVelocity(x: number, y: number, mass: number) {
	const radius = Math.sqrt(x ** 2 + y ** 2);
	const normX = x / radius;
	const normY = y / radius;

	// Perpendicular vector for circular orbit
	const vecRotX = -normY;
	const vecRotY = normX;

	const v = Math.sqrt(CONSTANTS.INITIAL_C / radius / mass / CONSTANTS.SPEED);
	return { x: vecRotX * v, y: vecRotY * v };
}
