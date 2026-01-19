import type { World } from 'koota';
import { Dragging, Pointer, Position } from '../traits';

export function updateDragging(world: World) {
    const pointer = world.get(Pointer);
    if (!pointer) return;

    world.query(Position, Dragging).updateEach(([pos, dragging]) => {
        pos.x = pointer.x - dragging.offsetX;
        pos.y = pointer.y - dragging.offsetY;
    });
}
