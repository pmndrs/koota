import type { World } from 'koota';
import { Transform, Ref } from '../traits/index';

export function syncToRefs(world: World): void {
	world.query(Transform, Ref).updateEach(([transform, ref]) => {
		if (!ref) return;
		ref.position.copy(transform.position);
		ref.rotation.copy(transform.rotation);
		ref.scale.copy(transform.scale);
	});
}
