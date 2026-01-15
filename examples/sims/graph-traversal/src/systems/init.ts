import type { Entity, World } from 'koota';
import { CONFIG } from '../config';
import { ChildOf } from '../traits';

export let root: Entity;

function buildGraph(world: World, parent: Entity, currentDepth: number) {
    if (currentDepth >= CONFIG.depth) return;

    for (let i = 0; i < CONFIG.childrenPerNode; i++) {
        const child = world.spawn(ChildOf(parent));
        buildGraph(world, child, currentDepth + 1);
    }
}

export function init({ world }: { world: World }) {
    root = world.spawn();
    buildGraph(world, root, 0);

    console.log(
        `Graph constructed: ${world.entities.length} nodes (depth: ${CONFIG.depth}, children per node: ${CONFIG.childrenPerNode})`
    );
}
