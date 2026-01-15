import type { World } from 'koota';
import { Dragging, Hand, HeldBy, OrderedCards, Position, Viewport } from '../traits';
import { arcXForIndex } from '../utils/arc-x-for-index';

export function updateCardOrder(world: World) {
    const viewport = world.get(Viewport)!;

    world.query(Hand, OrderedCards).updateEach(([hand, cards], handEntity) => {
        // Find the card being dragged in this hand
        const draggingCard = world.queryFirst(Dragging, HeldBy(handEntity));
        if (!draggingCard) return;

        const draggingPos = draggingCard.get(Position)!;
        const currentIndex = cards.indexOf(draggingCard);

        const relativeX = draggingPos.x - viewport.width / 2;

        const centerIndex = (cards.length - 1) / 2;
        const angleStep = cards.length > 1 ? hand.fanSpreadDeg / (cards.length - 1) : 0;

        let bestIndex = currentIndex;
        let minDistance = Infinity;

        for (let i = 0; i < cards.length; i++) {
            const arcX = arcXForIndex(i, centerIndex, angleStep, hand.fanRadius);
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
