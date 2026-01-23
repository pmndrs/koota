import { useWorld } from 'koota/react';
import { useEffect } from 'react';
import { updateTime } from '../core/systems/update-time';
import { updateDragging } from '../core/systems/update-dragging';
import { syncToDOM } from '../core/systems/sync-to-dom';
import { interpolateRemote } from '../core/systems/interpolate-remote';
import { Pointer } from '../core/traits';
import { useAnimationFrame } from '../utils/use-animation-frame';

export function Frameloop() {
    const world = useWorld();

    // Run systems every frame
    useAnimationFrame(() => {
        updateTime(world);
        updateDragging(world);
        interpolateRemote(world);
        syncToDOM(world);
    });

    // Sync pointer position to world
    useEffect(() => {
        const handlePointerMove = (e: PointerEvent) => {
            world.set(Pointer, { x: e.clientX, y: e.clientY });
        };

        window.addEventListener('pointermove', handlePointerMove);
        return () => window.removeEventListener('pointermove', handlePointerMove);
    }, [world]);

    return null;
}
