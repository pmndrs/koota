import { useContext } from 'react';
import type { World } from '@koota/core';
import { WorldContext } from './world-context';

export function useWorld(): World {
    const world = useContext(WorldContext);

    if (!world) {
        throw new Error('Koota: useWorld must be used within a WorldProvider');
    }

    return world;
}
