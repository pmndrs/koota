import type { World } from 'koota';
import { RemoteCursor } from '../traits';
import { lerp } from '../utils/lerp';

// Interpolation factor - higher = faster catch-up (0-1 range, applied per frame)
const LERP_FACTOR = 0.3;

// Snap threshold - if close enough, just snap to target
const SNAP_THRESHOLD_POS = 0.5;

export function interpolateRemoteCursors(world: World) {
    // Interpolate cursors
    world.query(RemoteCursor).updateEach(([cursor]) => {
        if (cursor.x !== cursor.targetX || cursor.y !== cursor.targetY) {
            cursor.x = lerp(cursor.x, cursor.targetX, LERP_FACTOR, SNAP_THRESHOLD_POS);
            cursor.y = lerp(cursor.y, cursor.targetY, LERP_FACTOR, SNAP_THRESHOLD_POS);
        }
    });
}
