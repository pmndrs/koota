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

// Camera position
camera.position.set(0, 0, 100);
camera.lookAt(0, 0, 0);

function updateAvoidEdgesDistance() {
	const distance = camera.position.z;
	const vFov = (camera.fov * Math.PI) / 180;
	const visibleHeight = 2 * distance * Math.tan(vFov / 2);
	const visibleWidth = visibleHeight * camera.aspect;
	// Use the smaller dimension with some padding
	CONFIG.avoidEdgesMaxDistance = (Math.min(visibleWidth, visibleHeight) / 2) * 0.9;
}

function onWindowResize() {
	camera.aspect = window.innerWidth / window.innerHeight;
	camera.updateProjectionMatrix();
	renderer.setSize(window.innerWidth, window.innerHeight);
	updateAvoidEdgesDistance();
}

window.addEventListener('resize', onWindowResize);
updateAvoidEdgesDistance();

// Add view systems to the schedule
schedule.add(syncThreeObjects, { after: 'update' });
schedule.build();

// Add Three resources to the world
export const Three = trait(() => ({ renderer, camera, scene }));
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
