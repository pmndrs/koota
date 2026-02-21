import { CONFIG } from '@bench/scene-graph-propagation';
import { Value } from '../traits';
import { allEntities } from './init';

let dirtyOffset = 0;
let frame = 0;

export const dirty = () => {
    const count = Math.max(1, Math.floor(allEntities.length * CONFIG.dirtyFraction));

    for (let i = 0; i < count; i++) {
        const idx = (dirtyOffset + i) % allEntities.length;
        allEntities[idx].set(Value, { value: (frame + idx) % 65 });
    }

    dirtyOffset = (dirtyOffset + count) % allEntities.length;
    frame++;
};