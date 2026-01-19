import type { World } from 'koota';
import { Position, Rotation, Scale, Color, Ref } from '../traits';

export function syncToDOM(world: World) {
    world.query(Position, Rotation, Scale, Color, Ref).updateEach(([pos, rot, scale, color, ref]) => {
        if (!ref) return;

        ref.style.transform = `translate(${pos.x}px, ${pos.y}px) rotate(${rot.angle}deg) scale(${scale.x}, ${scale.y})`;
        ref.style.backgroundColor = color.fill;
    });
}
