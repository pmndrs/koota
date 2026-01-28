import type { Entity } from 'koota';
import { IsTombstoned } from '../traits';

export function isActive(entity: Entity | null | undefined): entity is Entity {
    return !!entity && entity.isAlive() && !entity.has(IsTombstoned);
}

export function getActiveByStableId(
    history: { entities: Map<number, Entity> },
    id: number
): Entity | null {
    const entity = history.entities.get(id);
    return isActive(entity) ? entity : null;
}
