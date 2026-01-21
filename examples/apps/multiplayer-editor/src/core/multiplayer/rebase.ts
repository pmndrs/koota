import type { World } from 'koota';
import type { Op } from '../ops/types';
import { applyOp } from '../ops/apply';
import type { Checkpoint } from './protocol';
import { applyCheckpoint } from './checkpoint';

export function rebaseWorld(
    world: World,
    checkpoint: Checkpoint,
    authoritativeOps: Op[],
    pendingOps: Op[]
) {
    applyCheckpoint(world, checkpoint);

    for (const op of authoritativeOps) {
        applyOp(world, op);
    }

    for (const op of pendingOps) {
        applyOp(world, op);
    }
}
