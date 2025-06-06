import { CONSTANTS } from '@sim/n-body';
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
	const geometry = new THREE.CircleGeometry(CONSTANTS.MAX_RADIUS / 1.5, 12);
	const material = new THREE.MeshBasicMaterial({ color: new THREE.Color().setRGB(1, 1, 1) });
	const instancedMesh = new THREE.InstancedMesh(geometry, material, CONSTANTS.NBODIES + 200);

	// Set initial scale to zero
	for (let i = 0; i < instancedMesh.count; i++) instancedMesh.setMatrixAt(i, zeroScaleMatrix);

	scene.add(instancedMesh);
	world.spawn(InstancedMesh({ object: instancedMesh }));

	// Compile Three shaders.
	renderer.compile(scene, camera);

	inited = true;
}
