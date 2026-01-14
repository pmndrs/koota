import { trait } from 'koota';

export const Forces = trait({
    coherence: () => ({ x: 0, y: 0, z: 0 }),
    separation: () => ({ x: 0, y: 0, z: 0 }),
    alignment: () => ({ x: 0, y: 0, z: 0 }),
    avoidEdges: () => ({ x: 0, y: 0, z: 0 }),
});
