import { initStats } from '@app/bench-tools';
import { CONSTANTS, schedule, world } from '@sim/n-body';
import { trait } from 'koota';
import * as THREE from 'three';
import { scene } from './scene';
import './styles.css';
import { cleanupBodies } from './systems/cleanupRepulsors';
import { init } from './systems/init';
import { render } from './systems/render';
import { spawnRepulsor } from './systems/spawnRepulsor';
import { syncThreeObjects } from './systems/syncThreeObjects';

// Renderer
export const renderer = new THREE.WebGLRenderer({
    antialias: true,
    powerPreference: 'high-performance',
});
renderer.setSize(window.innerWidth, window.innerHeight);
document.body.appendChild(renderer.domElement);

// Camera
const frustumSize = 8000;
const aspect = window.innerWidth / window.innerHeight;
export const camera = new THREE.OrthographicCamera(
    (-frustumSize * aspect) / 2,
    (frustumSize * aspect) / 2,
    frustumSize / 2,
    -frustumSize / 2,
    0.1,
    500
);
camera.userData.frustumSize = frustumSize;
camera.userData.aspect = aspect;

function onWindowResize() {
    const aspect = window.innerWidth / window.innerHeight;
    const frustumSize = camera.userData.frustumSize;

    camera.left = (-frustumSize * aspect) / 2;
    camera.right = (frustumSize * aspect) / 2;
    camera.top = frustumSize / 2;
    camera.bottom = -frustumSize / 2;
    camera.updateProjectionMatrix();

    renderer.setSize(window.innerWidth, window.innerHeight);

    camera.userData.aspect = aspect;
}

window.addEventListener('resize', onWindowResize);

// Camera position
camera.position.set(0, 0, 100);
camera.lookAt(0, 0, 0);

// Add view systems to the schedule
schedule.add(syncThreeObjects, { after: 'update' });
schedule.add(cleanupBodies, { after: syncThreeObjects });
// schedule.add(render);
schedule.add(init, { tag: 'init' });
schedule.build();

// Add Three resources to the world
export const Three = trait(() => ({ renderer, camera, scene }));
world.add(Three);

// Init stats
const { updateStats, measure, create } = initStats({ Bodies: () => CONSTANTS.NBODIES });
create();

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

// Pointer events for spawning repulsors.
let isPointerDown = false;

renderer.domElement.addEventListener('pointerdown', (e) => {
    isPointerDown = true;
    spawnRepulsor(e, frustumSize);
});

renderer.domElement.addEventListener('pointermove', (e) => {
    if (isPointerDown) {
        spawnRepulsor(e, frustumSize);
    }
});

renderer.domElement.addEventListener('pointerup', () => {
    isPointerDown = false;
});

renderer.domElement.addEventListener('pointerout', () => {
    isPointerDown = false;
});
