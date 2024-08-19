import { CONSTANTS } from '@sim/n-body';
import * as THREE from 'three';
import { InstancedMesh } from '../components/InstancedMesh';
import { camera, renderer } from '../main';
import { scene } from '../scene';

let inited = false;

export function init({ world }: { world: Koota.World }) {
	if (inited) return;

	// I'm not sure why it matters, but you can't set iniitial radius to 1 or everything is invisible.
	const geometry = new THREE.CircleGeometry(CONSTANTS.MAX_RADIUS / 1.5, 12);
	const material = new THREE.MeshBasicMaterial({ color: new THREE.Color().setRGB(1, 1, 1) });
	const instancedMesh = new THREE.InstancedMesh(geometry, material, CONSTANTS.NBODIES + 200);

	scene.add(instancedMesh);
	world.create(InstancedMesh.with({ object: instancedMesh }));

	// Compile Three shaders.
	renderer.compile(scene, camera);

	inited = true;
}
