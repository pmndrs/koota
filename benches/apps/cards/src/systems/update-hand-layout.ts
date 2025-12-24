import type { World } from 'koota';
import { Dragging, IsHand, OrderedCards, Position, Time, Velocity, Viewport } from '../traits';
import { lerp } from '../utils/lerp';

export function updateHandLayout(world: World) {
	const { delta } = world.get(Time)!;
	const viewport = world.get(Viewport)!;
	const lerpAlpha = 1 - Math.pow(0.001, delta); // Smooth transition for position
	const velocityDamping = 1 - Math.pow(0.0001, delta); // Faster damping for velocity

	world.query(IsHand, OrderedCards).forEach((hand) => {
		const cards = hand.get(OrderedCards);
		if (!cards) return;

		const fanSpread = 60; // degrees
		const fanRadius = 600; // pixels
		const cardHeight = 250;
		const centerIndex = (cards.length - 1) / 2;
		const angleStep = cards.length > 1 ? fanSpread / (cards.length - 1) : 0;

		const centerX = viewport.width / 2;
		const centerY = viewport.height + fanRadius - cardHeight / 2;

		cards.forEach((card, index) => {
			if (card.has(Dragging)) return;

			// Dampen velocity for non-dragging cards
			const velocity = card.get(Velocity)!;
			card.set(Velocity, {
				x: lerp(velocity.x, 0, velocityDamping),
				y: lerp(velocity.y, 0, velocityDamping),
			});

			const angle = (index - centerIndex) * angleStep;
			const angleRad = (angle * Math.PI) / 180;

			const targetX = centerX + Math.sin(angleRad) * fanRadius;
			const targetY = centerY - Math.cos(angleRad) * fanRadius;

			const pos = card.get(Position)!;

			// If no position set yet (first frame), snap to target
			if (pos.x === 0 && pos.y === 0) {
				card.set(Position, { x: targetX, y: targetY });
			} else {
				card.set(Position, {
					x: lerp(pos.x, targetX, lerpAlpha),
					y: lerp(pos.y, targetY, lerpAlpha),
				});
			}
		});
	});
}

