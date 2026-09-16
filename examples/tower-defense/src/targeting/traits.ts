import { trait, type Entity } from 'koota';

export const TargetCandidates = trait(() => ({ priority: [] as readonly Entity[] }));
export const TargetGrid = trait(() => ({ cells: [] as Entity[][], priority: new Set<Entity>() }));
export const TargetChanges = trait(() => [] as { tower: Entity; target?: Entity }[]);
