import type { World } from 'koota';
import { Dragging, Hand, OrderedCards, Position, Time, Viewport, ZIndex } from '../traits';
import { dampedLerp } from '../utils/lerp';

const POSITION_DAMPING = 1 - Math.pow(0.001, 1 / 60); // smooth transition

export function updateHandLayout(world: World) {
	const { delta } = world.get(Time)!;
	const viewport = world.get(Viewport)!;

	world.query(Hand, OrderedCards).updateEach(([hand, cards]) => {
		const fanSpread = hand.fanSpreadDeg; // degrees
		const fanRadius = hand.fanRadius; // pixels
		const cardHeight = 250;
		const centerIndex = (cards.length - 1) / 2;
		const angleStep = cards.length > 1 ? fanSpread / (cards.length - 1) : 0;

		const centerX = viewport.width / 2;
		const centerY = viewport.height + fanRadius - cardHeight / 2;

		for (let i = 0; i < cards.length; i++) {
			const card = cards[i];

			// Assign z-index based on card order
			card.set(ZIndex, { value: i });

			// Skip cards being dragged - they're positioned by updateDragging
			if (card.has(Dragging)) continue;

			const angle = (i - centerIndex) * angleStep;
			const angleRad = (angle * Math.PI) / 180;

			const targetX = centerX + Math.sin(angleRad) * fanRadius;
			const targetY = centerY - Math.cos(angleRad) * fanRadius;

			const pos = card.get(Position)!;

			// If no position set yet (first frame), snap to target
			if (pos.x === 0 && pos.y === 0) {
				card.set(Position, { x: targetX, y: targetY, z: 0 });
			} else {
				card.set(Position, {
					x: dampedLerp(pos.x, targetX, POSITION_DAMPING, delta),
					y: dampedLerp(pos.y, targetY, POSITION_DAMPING, delta),
					z: pos.z,
				});
			}
		}
	});
}
