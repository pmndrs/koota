import type { World } from 'koota';
import { Dragging, IsHand, OrderedCards, Position, Ref, Velocity } from '../traits';

const CARD_WIDTH = 180;
const CARD_HEIGHT = 250;

export function syncToDOM(world: World) {
	// Iterate through OrderedCards directly to get correct z-index from order
	world.query(IsHand, OrderedCards).forEach((hand) => {
		const cards = hand.get(OrderedCards);
		if (!cards) return;

		cards.forEach((entity, index) => {
			const ref = entity.get(Ref);
			if (!ref) return;

			const position = entity.get(Position);
			const velocity = entity.get(Velocity);
			if (!position || !velocity) return;

			const isDragging = entity.has(Dragging);

			// Z-index directly from iteration order
			const zIndex = isDragging ? 1000 : index;

			// Derive transforms from velocity
			const lift = isDragging ? 50 : 0;
			const scale = isDragging ? 1.05 : 1.0;
			const speedSq = velocity.x * velocity.x + velocity.y * velocity.y;
			const shouldSnapNeutral = !isDragging && speedSq < 25; // ~5px/s threshold

			const tiltX = shouldSnapNeutral ? 0 : Math.max(-20, Math.min(20, -velocity.y * 0.015));
			const tiltY = shouldSnapNeutral ? 0 : Math.max(-20, Math.min(20, velocity.x * 0.015));

			ref.style.position = 'fixed';
			ref.style.left = `${position.x - CARD_WIDTH / 2}px`;
			ref.style.top = `${position.y - CARD_HEIGHT / 2}px`;

			// 3D Transform derived from velocity
			ref.style.transform = `perspective(1000px) translateZ(${lift}px) scale(${scale}) rotateX(${tiltX}deg) rotateY(${tiltY}deg)`;
			ref.style.zIndex = zIndex.toString();
		});
	});
}

