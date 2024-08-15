import { CONSTANTS } from '@sim/n-body';
import { World } from '@sweet-ecs/core';
import * as THREE from 'three';
import { InstancedMesh } from '../components/InstancedMesh';
import { scene } from '../scene';
import { camera, renderer } from '../main';

let inited = false;

export function init({ world }: { world: World }) {
	if (inited) return;

	// Init the instances meshes for Three.
	const entity = world.create();

	// I'm not sure why it matters, but you can't set iniitial radius to 1 or everything is invisible.
	const geometry = new THREE.CircleGeometry(CONSTANTS.MAX_RADIUS / 1.5, 12);
	const material = new THREE.MeshBasicMaterial({ color: new THREE.Color().setRGB(1, 1, 1) });
	const instancedMesh = new THREE.InstancedMesh(geometry, material, CONSTANTS.NBODIES);

	scene.add(instancedMesh);
	world.add(entity, InstancedMesh.with({ object: instancedMesh }));

	// Compile Three shaders.
	renderer.compile(scene, camera);

	inited = true;
}
