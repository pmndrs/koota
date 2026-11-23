import { Position, Repulse } from '@examples/n-body';
import { createRemoved, type World, getEntityId } from 'koota';
import * as THREE from 'three';
import { InstancedMesh } from '../traits/InstancedMesh';

const Removed = createRemoved();
const zeroScaleMatrix = new THREE.Matrix4().makeScale(0, 0, 0);

export function cleanupBodies({ world }: { world: World }) {
  const instanceEntity = world.queryFirst(InstancedMesh);
  if (instanceEntity === undefined) return;

  const instancedMesh = world.get(instanceEntity, InstancedMesh)!.object;

  world.query(Removed(Repulse, Position)).forEach((e) => {
    instancedMesh.setMatrixAt(getEntityId(e), zeroScaleMatrix);
  });

  instancedMesh.instanceMatrix.needsUpdate = true;
}
