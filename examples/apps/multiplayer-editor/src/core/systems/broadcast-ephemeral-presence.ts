import type { World } from 'koota';
import { IsCanvas, IsHovering, IsLocal, IsSelected, Pointer, StableId, User } from '../traits';
import { sendEphemeralPresence } from '../multiplayer/ephemeral';

let lastKey: string | null = null;

export function broadcastEphemeralPresence(world: World) {
    const selectionIds: number[] = [];
    world.query(IsSelected, StableId).readEach(([stableId]) => selectionIds.push(stableId.id));
    selectionIds.sort((a, b) => a - b);

    const name = world.queryFirst(IsLocal, User)?.get(User)?.name;

    const pointer = world.queryFirst(IsCanvas, IsHovering, Pointer)?.get(Pointer);
    if (!pointer) return;

    const cursor = { x: pointer.x, y: pointer.y };
    const selectionKey = selectionIds.join(',');
    const cursorKey = `${pointer.x},${pointer.y}`;
    const key = `${cursorKey}|${selectionKey}|${name ?? ''}`;

    if (key === lastKey) return;
    lastKey = key;

    sendEphemeralPresence(cursor, selectionIds, name);
}
