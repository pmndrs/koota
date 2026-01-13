import { useWorld } from 'koota/react';
import { useAnimationFrame } from './utils/use-animation-frame';
import { updateTime } from './systems/update-time';
import { syncThreeObjects } from './systems/sync-three-objects';

/**
 * Frameloop runs all systems outside of R3F's render loop.
 * This allows the editor to be run headless (without rendering).
 */
export function Frameloop() {
    const world = useWorld();

    useAnimationFrame(() => {
        updateTime(world);
        syncThreeObjects(world);
    });

    return null;
}
