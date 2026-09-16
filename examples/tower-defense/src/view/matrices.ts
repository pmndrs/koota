import { mat4, quat, vec3, type Mat4, type Quat, type Vec3 } from 'math';
import type { Camera, Object3D } from 'three';

// Three's matrices are column-major arrays, so pmndrs can write them directly.
export function createMatrixUpdater() {
  const previous = new WeakMap<
    Object3D,
    { position: Vec3; rotation: Quat; scale: Vec3; parent: Object3D | null }
  >();

  function updateObject(object: Object3D, parentChanged = false) {
    object.matrixAutoUpdate = false;
    object.matrixWorldAutoUpdate = false;
    const { position, quaternion, scale } = object;
    let cached = previous.get(object);
    const localChanged =
      !cached ||
      position.x !== cached.position[0] ||
      position.y !== cached.position[1] ||
      position.z !== cached.position[2] ||
      quaternion.x !== cached.rotation[0] ||
      quaternion.y !== cached.rotation[1] ||
      quaternion.z !== cached.rotation[2] ||
      quaternion.w !== cached.rotation[3] ||
      scale.x !== cached.scale[0] ||
      scale.y !== cached.scale[1] ||
      scale.z !== cached.scale[2];
    const worldChanged = localChanged || parentChanged || object.parent !== cached?.parent;
    if (!cached) {
      cached = {
        position: vec3.create(),
        rotation: quat.create(),
        scale: vec3.create(),
        parent: object.parent,
      };
      previous.set(object, cached);
    }
    if (localChanged) {
      vec3.set(cached.position, position.x, position.y, position.z);
      quat.set(cached.rotation, quaternion.x, quaternion.y, quaternion.z, quaternion.w);
      vec3.set(cached.scale, scale.x, scale.y, scale.z);
      mat4.fromRotationTranslationScale(
        object.matrix.elements as Mat4,
        cached.rotation,
        cached.position,
        cached.scale
      );
    }
    if (worldChanged) {
      if (object.parent)
        mat4.multiply(
          object.matrixWorld.elements as Mat4,
          object.parent.matrixWorld.elements as Mat4,
          object.matrix.elements as Mat4
        );
      else mat4.copy(object.matrixWorld.elements as Mat4, object.matrix.elements as Mat4);
      if ((object as Camera).isCamera)
        mat4.invert(
          (object as Camera).matrixWorldInverse.elements as Mat4,
          object.matrixWorld.elements as Mat4
        );
      cached.parent = object.parent;
    }
    object.matrixWorldNeedsUpdate = false;
    return worldChanged;
  }

  function updateTree(object: Object3D, parentChanged = false) {
    const changed = updateObject(object, parentChanged);
    for (const child of object.children) updateTree(child, changed);
  }

  // Controls and shadows explicitly update their unparented cameras as well.
  function bindCamera(camera: Camera) {
    const { updateMatrixWorld, updateWorldMatrix, matrixAutoUpdate, matrixWorldAutoUpdate } = camera;
    camera.updateMatrixWorld = camera.updateWorldMatrix = () => {
      updateTree(camera);
    };
    updateTree(camera);
    return () => {
      camera.updateMatrixWorld = updateMatrixWorld;
      camera.updateWorldMatrix = updateWorldMatrix;
      camera.matrixAutoUpdate = matrixAutoUpdate;
      camera.matrixWorldAutoUpdate = matrixWorldAutoUpdate;
    };
  }

  return { updateTree, bindCamera };
}
