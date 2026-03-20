import type { Entity, World } from 'koota';
import { CONFIG } from '../../scene-graph-propagation/config.ts';
import { ChildOf, IsGroup, IsObject, OrderedChildren, TotalValue, Value } from '../traits';

export let root: Entity;
export let resultingDepth = 0;
export const allEntities: Entity[] = [];

const deterministicValue = (index: number) => (index * 37) % 65;

const spawnGroup = (world: World, index: number) => {
    const group = world.spawn(IsGroup, OrderedChildren, Value({ value: deterministicValue(index) }));
    allEntities.push(group);
    return group;
};

const spawnLeaf = (world: World, index: number) => {
    const leaf = world.spawn(IsObject, Value({ value: deterministicValue(index) }), TotalValue);
    allEntities.push(leaf);
    return leaf;
};

const buildGraph = (world: World) => {
    const { targetEntityCount, bottomLeafFraction, groupChildrenCycle, objectChildrenCycle } = CONFIG;
    const cap = targetEntityCount;

    let groupCycle = 0;
    let objectCycle = 0;
    let created = 0;
    let depth = 0;

    const nextGroupCount = (remaining: number) => {
        const count = groupChildrenCycle[groupCycle++ % groupChildrenCycle.length];
        return Math.min(count, remaining);
    };

    const nextObjectCount = (remaining: number) => {
        const count = objectChildrenCycle[objectCycle++ % objectChildrenCycle.length];
        return Math.min(count, remaining);
    };

    // Phase 1: allocate bottom leaves
    let pending: Entity[] = [];
    const bottomLeafCount = Math.floor(cap * bottomLeafFraction);

    for (let i = 0; i < bottomLeafCount && created < cap; i++) {
        pending.push(spawnLeaf(world, created++));
    }

    // Phase 2: group upward, sprinkling extra leaves per group
    while (pending.length > 1 && created < cap) {
        depth++;
        const nextPending: Entity[] = [];
        let i = 0;

        while (i < pending.length && created < cap) {
            const adoptCount = nextGroupCount(pending.length - i);
            const group = spawnGroup(world, created++);

            for (let j = 0; j < adoptCount && i < pending.length; j++) {
                pending[i++].add(ChildOf(group));
            }

            const sprinkleCount = created < cap ? nextObjectCount(cap - created) : 0;
            for (let j = 0; j < sprinkleCount && created < cap; j++) {
                spawnLeaf(world, created++).add(ChildOf(group));
            }

            nextPending.push(group);
        }

        for (; i < pending.length; i++) nextPending.push(pending[i]);
        pending = nextPending;
    }

    // Phase 3: attach final root
    if (pending.length === 1) {
        root = pending[0];
    } else {
        root = world.spawn(IsGroup, OrderedChildren, Value({ value: 0 }));
        for (const entity of pending) entity.add(ChildOf(root));
    }

    // Phase 4: fill remaining budget as leaves across existing groups
    if (created < cap) {
        const groups = world.query(IsGroup);
        let gi = 0;
        while (created < cap) {
            spawnLeaf(world, created++).add(ChildOf(groups[gi++ % groups.length]));
        }
    }

    return depth;
};

export const init = ({ world }: { world: World }) => {
    resultingDepth = buildGraph(world);
};