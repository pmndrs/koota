import type { World } from 'koota';
import { IsCanvas, IsCanvasHovering, IsLocal, IsSelected, Pointer, StableId, User } from '../traits';
import { sendEphemeralPresence } from '../multiplayer/ephemeral';

let lastKey: string | null = null;

export function sendEphemeralPresenceSystem(world: World) {
    const selectionIds: number[] = [];
    world.query(IsSelected, StableId).readEach(([stableId]) => selectionIds.push(stableId.id));
    selectionIds.sort((a, b) => a - b);

    let name: string | undefined;
    world.query(IsLocal, User).readEach(([user]) => {
        if (!name) name = user.name;
    });

    let cursorX: number | null = null;
    let cursorY: number | null = null;
    world.query(IsCanvas, IsCanvasHovering).readEach((_, entity) => {
        if (cursorX !== null && cursorY !== null) return;
        const pointer = entity.get(Pointer);
        if (pointer) {
            cursorX = pointer.x;
            cursorY = pointer.y;
        }
    });

    const cursor = cursorX !== null && cursorY !== null ? { x: cursorX, y: cursorY } : null;
    const selectionKey = selectionIds.join(',');
    const cursorKey = cursor ? `${cursorX},${cursorY}` : 'null';
    const key = `${cursorKey}|${selectionKey}|${name ?? ''}`;
    if (key === lastKey) return;
    lastKey = key;

    sendEphemeralPresence(cursor, selectionIds, name);
}
