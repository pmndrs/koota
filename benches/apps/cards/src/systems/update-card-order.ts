import type { World } from 'koota';
import { Dragging, IsHand, OrderedCards, Position, Viewport } from '../traits';

export function updateCardOrder(world: World) {
	const viewport = world.get(Viewport)!;

	world.query(IsHand, OrderedCards).forEach((hand) => {
		const cards = hand.get(OrderedCards);
		if (!cards) return;

		// Find the card being dragged in this hand
		const draggingCard = cards.find((c) => c.has(Dragging));
		if (!draggingCard) return;

		const draggingPos = draggingCard.get(Position)!;
		const currentIndex = cards.indexOf(draggingCard);

		const centerX = viewport.width / 2;
		const relativeX = draggingPos.x - centerX;

		const fanSpread = 60;
		const fanRadius = 600;
		const centerIndex = (cards.length - 1) / 2;
		const angleStep = cards.length > 1 ? fanSpread / (cards.length - 1) : 0;

		let bestIndex = 0;
		let minDistance = Infinity;

		for (let i = 0; i < cards.length; i++) {
			const angle = (i - centerIndex) * angleStep;
			const angleRad = (angle * Math.PI) / 180;
			const arcX = Math.sin(angleRad) * fanRadius;
			const distance = Math.abs(arcX - relativeX);
			if (distance < minDistance) {
				minDistance = distance;
				bestIndex = i;
			}
		}

		if (bestIndex !== currentIndex) {
			cards.moveTo(draggingCard, bestIndex);
		}
	});
}

