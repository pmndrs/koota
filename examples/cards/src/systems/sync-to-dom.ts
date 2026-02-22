import type { World } from 'koota';
import { Card, Dragging, Position, Ref, Rotation, Scale, ZIndex } from '../traits';

export function syncToDOM(world: World) {
    /**
     * Use a flat query to sync the DOM elements of all cards.
     * We could query for OrderedCards and then loop over each hand and then loop over each card,
     * but this demonstrates how you can flatten the query to get all the cards at once by
     * using the ZIndex trait to store the relevant data directly on the card entity.
     */
    world
        .query(Card, Position, Rotation, Scale, Ref, ZIndex)
        .updateEach(([card, position, rotation, scale, ref, zIndex], entity) => {
            if (!ref) return;

            const isDragging = entity.has(Dragging);

            // Override z-index for dragging cards
            const finalZIndex = isDragging ? 1000 : zIndex.value;

            // Apply 2D positioning first, then 3D effects within perspective to avoid distortion
            ref.style.transform = `translate(${position.x}px, ${position.y}px) perspective(1000px) translateZ(${position.z}px) scale3d(${scale.x}, ${scale.y}, ${scale.z}) rotateX(${rotation.x}deg) rotateY(${rotation.y}deg)`;
            ref.style.zIndex = finalZIndex.toString();
        });
}
