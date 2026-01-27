import type { World } from 'koota';
import { Position, Rotation, Scale, Color, Ref, RemotelyTransformedBy } from '../traits';

export function syncToDOM(world: World) {
    world
        .query(Position, Rotation, Scale, Color, Ref)
        .updateEach(([pos, rot, scale, color, ref], entity) => {
            // Check if this shape is being remotely transformed
            let x = pos.x;
            let y = pos.y;
            let angle = rot.angle;
            let scaleX = scale.x;
            let scaleY = scale.y;

            // if (entity.has(RemotelyTransformedBy('*'))) {
            //     const transform = entity.get(RemotelyTransformedBy('*'));
            //     if (transform) {
            //         x += transform.deltaX;
            //         y += transform.deltaY;
            //         scaleX *= transform.scaleX;
            //         scaleY *= transform.scaleY;
            //         angle += transform.rotation;
            //     }
            // }

            if (entity.has(RemotelyTransformedBy('*'))) {
                console.log('has remotely transformed by', entity.id());
            }

            // Looking into changing how this works in Koota
            const transformingUser = entity.targetFor(RemotelyTransformedBy);
            if (transformingUser) {
                const transform = entity.get(RemotelyTransformedBy(transformingUser));

                console.log('transforming user', transformingUser.id(), transform);

                if (transform) {
                    x += transform.deltaX;
                    y += transform.deltaY;
                    scaleX *= transform.scaleX;
                    scaleY *= transform.scaleY;
                    angle += transform.rotation;
                }
            }

            ref.style.transform = `translate(${x}px, ${y}px) rotate(${angle}deg) scale(${scaleX}, ${scaleY})`;
            ref.style.backgroundColor = color.fill;
        });
}
