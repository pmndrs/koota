import type { Entity, World } from '@koota/core';

export function isWorld(target: Entity | World): target is World {
    return typeof (target as World)?.spawn === 'function';
}
