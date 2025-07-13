import { initStats } from '@app/bench-tools';
import { actions, CONFIG, schedule, world } from '@sim/boids';
import { trait } from 'koota';
import * as THREE from 'three';
import { scene } from './scene';
import './styles.css';
import { init } from './systems/init';
import { render } from './systems/render';
import { syncThreeObjects } from './systems/syncThreeObjects';

// Renderer
export const renderer = new THREE.WebGLRenderer({
	antialias: true,
	powerPreference: 'high-performance',
});
renderer.setSize(window.innerWidth, window.innerHeight);
document.body.appendChild(renderer.domElement);

// Camera
const aspect = window.innerWidth / window.innerHeight;
export const camera = new THREE.PerspectiveCamera(75, aspect, 0.1, 1000);

function onWindowResize() {
	const aspect = window.innerWidth / window.innerHeight;
	camera.aspect = aspect;
	camera.updateProjectionMatrix();
	renderer.setSize(window.innerWidth, window.innerHeight);
}

window.addEventListener('resize', onWindowResize);

// Camera position
camera.position.set(0, 0, 100);
camera.lookAt(0, 0, 0);

// Add view systems to the schedule
schedule.add(syncThreeObjects, { after: 'update' });
schedule.build();

// Add Three resources to the world
export const Three = trait({ renderer, camera, scene });
world.add(Three);

// Init stats
const { updateStats, measure, create } = initStats({ Boids: () => CONFIG.initialCount });
create();

// Init the scene
init({ world });

// Spawn the initial boids
const { spawnBoid } = actions(world);
for (let i = 0; i < CONFIG.initialCount; i++) {
	spawnBoid();
}

// Run the simulation
const main = async () => {
	measure(async () => {
		schedule.run({ world });
		render({ world });
		updateStats();
	});
	requestAnimationFrame(main);
};

requestAnimationFrame(main);
