import { Canvas, useFrame } from '@react-three/fiber';
import { CONSTANTS, schedule, world } from '@sim/n-body';
import { ComponentProp, sweet, useWorld, World } from '@sweet-ecs/react';
import { useSchedule } from 'directed/react';
import { StrictMode, useMemo } from 'react';
import * as THREE from 'three';
import { syncThreeObjects } from './systems/syncThreeObjects';
import { useStats } from './use-stats';

export function App() {
	const frustumSize = 7000;
	const aspect = window.innerWidth / window.innerHeight;

	// Add a system to sync the instanced mesh with component data.
	useSchedule(schedule, syncThreeObjects, { after: 'update' });

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
					<Simulation />
				</StrictMode>
			</Canvas>
		</World>
	);
}

// View is added automatically.
function Bodies({ components = [] }: { components?: ComponentProp[] }) {
	const geo = useMemo(() => new THREE.CircleGeometry(CONSTANTS.MAX_RADIUS / 1.5, 12), []);
	const mat = useMemo(() => new THREE.MeshBasicMaterial(), []);

	return <sweet.instancedMesh args={[geo, mat, CONSTANTS.NBODIES]} components={components} />;
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
