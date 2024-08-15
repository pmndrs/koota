import { Circle, Color, Position } from '@sim/n-body';
import { World } from '@sweet-ecs/core';
import * as Sweet from '@sweet-ecs/react';
import * as THREE from 'three';

const normalize = (x: number, min: number, max: number) => (x - min) / (max - min);

const dummy = new THREE.Object3D();
const dummyColor = new THREE.Color();

export const syncThreeObjects = ({ world }: { world: World }) => {
	const ents = world.query(Position, Circle, Color);
	const instanceEnt = world.query(Sweet.InstancedMesh)[0];
	const [position, circle, color] = world.get(Position, Circle, Color);

	if (instanceEnt === undefined) return;

	const instancedMesh = world.get(Sweet.InstancedMesh).object[instanceEnt];

	for (let i = 0; i < ents.length; i++) {
		const e = ents[i];

		dummy.position.set(position.x[e], position.y[e], 0);

		const radius = normalize(circle.radius[e], 0, 60);
		dummy.scale.set(radius, radius, radius);

		dummy.updateMatrix();

		instancedMesh.setMatrixAt(i, dummy.matrix);

		const r = normalize(color.r[e], 0, 255);
		const g = normalize(color.g[e], 0, 255);
		const b = normalize(color.b[e], 0, 255);
		dummyColor.setRGB(r, g, b);
		instancedMesh.setColorAt(i, dummyColor);
	}

	instancedMesh.instanceMatrix.needsUpdate = true;
	instancedMesh.instanceColor!.needsUpdate = true;
};
