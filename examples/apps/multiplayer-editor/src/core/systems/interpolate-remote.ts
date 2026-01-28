import type { World } from 'koota';
import {
    RemoteCursor,
    Position,
    Rotation,
    Scale,
    EditingPosition,
    EditingRotation,
    EditingScale,
    IsRemoteDragging,
} from '../traits';
import { lerp, angleLerp } from '../utils/lerp';

// Shared interpolation settings - cursor and shapes use the same values
// so they appear visually synced when a remote user drags
const LERP_FACTOR = 0.3; // Higher = faster catch-up (0-1 range, applied per frame)
const SNAP_THRESHOLD_POS = 0.5; // Snap when within this distance
const SNAP_THRESHOLD_SCALE = 0.01;
const SNAP_THRESHOLD_ANGLE = 0.5;

/**
 * Interpolates all remote visuals: cursors and shape drags.
 * Uses shared lerp settings so cursor and dragged shapes stay in sync.
 */
export function interpolateRemote(world: World) {
    // Cursor position
    world.query(RemoteCursor).updateEach(([cursor]) => {
        if (cursor.x !== cursor.targetX || cursor.y !== cursor.targetY) {
            cursor.x = lerp(cursor.x, cursor.targetX, LERP_FACTOR, SNAP_THRESHOLD_POS);
            cursor.y = lerp(cursor.y, cursor.targetY, LERP_FACTOR, SNAP_THRESHOLD_POS);
        }
    });

    // Shape position (same lerp as cursor for visual sync)
    world.query(Position, EditingPosition, IsRemoteDragging).updateEach(([pos, edit]) => {
        if (pos.x !== edit.targetX || pos.y !== edit.targetY) {
            pos.x = lerp(pos.x, edit.targetX, LERP_FACTOR, SNAP_THRESHOLD_POS);
            pos.y = lerp(pos.y, edit.targetY, LERP_FACTOR, SNAP_THRESHOLD_POS);
        }
    });

    // Shape rotation
    world.query(Rotation, EditingRotation, IsRemoteDragging).updateEach(([rot, edit]) => {
        if (rot.angle !== edit.targetAngle) {
            rot.angle = angleLerp(rot.angle, edit.targetAngle, LERP_FACTOR, SNAP_THRESHOLD_ANGLE);
        }
    });

    // Shape scale
    world.query(Scale, EditingScale, IsRemoteDragging).updateEach(([scale, edit]) => {
        if (scale.x !== edit.targetX || scale.y !== edit.targetY) {
            scale.x = lerp(scale.x, edit.targetX, LERP_FACTOR, SNAP_THRESHOLD_SCALE);
            scale.y = lerp(scale.y, edit.targetY, LERP_FACTOR, SNAP_THRESHOLD_SCALE);
        }
    });
}
