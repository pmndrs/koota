import type { World } from 'koota';
import { RemoteCursor, RemotelyTransformedBy } from '../traits';
import { lerp } from '../utils/lerp';

// Interpolation factor - higher = faster catch-up (0-1 range, applied per frame)
const LERP_FACTOR = 0.3;

// Snap threshold - if close enough, just snap to target
const SNAP_THRESHOLD_POS = 0.5;
const SNAP_THRESHOLD_SCALE = 0.01;
const SNAP_THRESHOLD_ROTATION = 0.1;

export function interpolateRemote(world: World) {
    // Interpolate cursors
    world.query(RemoteCursor).updateEach(([cursor]) => {
        if (cursor.x !== cursor.targetX || cursor.y !== cursor.targetY) {
            cursor.x = lerp(cursor.x, cursor.targetX, LERP_FACTOR, SNAP_THRESHOLD_POS);
            cursor.y = lerp(cursor.y, cursor.targetY, LERP_FACTOR, SNAP_THRESHOLD_POS);
        }
    });

    // Interpolate remote transforms on shapes
    world.query(RemotelyTransformedBy('*')).updateEach(([], entity) => {
        const user = entity.targetFor(RemotelyTransformedBy);
        if (!user) return;

        const transform = entity.get(RemotelyTransformedBy(user));
        if (!transform) return;

        const needsUpdate =
            transform.deltaX !== transform.targetDeltaX ||
            transform.deltaY !== transform.targetDeltaY ||
            transform.scaleX !== transform.targetScaleX ||
            transform.scaleY !== transform.targetScaleY ||
            transform.rotation !== transform.targetRotation;

        if (needsUpdate) {
            entity.set(RemotelyTransformedBy(user), {
                ...transform,
                deltaX: lerp(transform.deltaX, transform.targetDeltaX, LERP_FACTOR, SNAP_THRESHOLD_POS),
                deltaY: lerp(transform.deltaY, transform.targetDeltaY, LERP_FACTOR, SNAP_THRESHOLD_POS),
                scaleX: lerp(transform.scaleX, transform.targetScaleX, LERP_FACTOR, SNAP_THRESHOLD_SCALE),
                scaleY: lerp(transform.scaleY, transform.targetScaleY, LERP_FACTOR, SNAP_THRESHOLD_SCALE),
                rotation: lerp(
                    transform.rotation,
                    transform.targetRotation,
                    LERP_FACTOR,
                    SNAP_THRESHOLD_ROTATION
                ),
            });
        }
    });
}
