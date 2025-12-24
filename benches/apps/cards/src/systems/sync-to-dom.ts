import type { World } from 'koota';
import { Dragging, Hand, OrderedCards, Position, Ref, Rotation, Scale } from '../traits';

export function syncToDOM(world: World) {
	// Iterate through OrderedCards directly to get correct z-index from order
	world.query(OrderedCards, Hand).updateEach(([cards]) => {
		cards.forEach((entity, index) => {
			const ref = entity.get(Ref);
			if (!ref) return;

			const position = entity.get(Position);
			const rotation = entity.get(Rotation);
			const scale = entity.get(Scale);
			if (!position || !rotation || !scale) return;

			const isDragging = entity.has(Dragging);

			// Z-index directly from iteration order
			const zIndex = isDragging ? 1000 : index;

			// Apply 2D positioning first, then 3D effects within perspective to avoid distortion
			ref.style.transform = `translate(${position.x}px, ${position.y}px) perspective(1000px) translateZ(${position.z}px) scale3d(${scale.x}, ${scale.y}, ${scale.z}) rotateX(${rotation.x}deg) rotateY(${rotation.y}deg)`;
			ref.style.zIndex = zIndex.toString();
		});
	});
}
