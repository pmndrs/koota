import type { World } from 'koota';
import { Position, Rotation, Scale, ThreeRef } from '../traits';

/**
 * Syncs ECS transform data to Three.js objects.
 * This is a view-layer system - it bridges ECS state to the renderer.
 */
export function syncThreeObjects(world: World) {
	world
		.query(ThreeRef, Position, Rotation, Scale)
		.updateEach(([ref, position, rotation, scale]) => {
			if (!ref) return;

			ref.position.set(position.x, position.y, position.z);
			ref.quaternion.set(rotation.x, rotation.y, rotation.z, rotation.w);
			ref.scale.set(scale.x, scale.y, scale.z);
		});
}
