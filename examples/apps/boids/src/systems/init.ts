import { CONFIG } from '@sim/boids';
import type { World } from 'koota';
import * as THREE from 'three';
import { camera, renderer } from '../main';
import { scene } from '../scene';
import { InstancedMesh } from '../traits/InstancedMesh';

let inited = false;

const zeroScaleMatrix = new THREE.Matrix4().makeScale(0, 0, 0);

export function init({ world }: { world: World }) {
	if (inited) return;

	// I'm not sure why it matters, but you can't set iniitial radius to 1 or everything is invisible.
	const geometry = new THREE.SphereGeometry(1, 12, 12);
	const material = new THREE.MeshBasicMaterial({ color: new THREE.Color().setRGB(1, 1, 1) });
	const instancedMesh = new THREE.InstancedMesh(geometry, material, CONFIG.initialCount + 200);

	// Set initial scale to zero
	for (let i = 0; i < instancedMesh.count; i++) instancedMesh.setMatrixAt(i, zeroScaleMatrix);

	scene.add(instancedMesh);
	world.spawn(InstancedMesh({ object: instancedMesh }));

	// Compile Three shaders.
	renderer.compile(scene, camera);

	inited = true;
}
