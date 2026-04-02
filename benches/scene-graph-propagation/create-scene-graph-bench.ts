import {
    createChanged,
    createWorld,
    ordered,
    relation,
    trait,
    type Entity,
    type World,
} from 'koota';
import { CONFIG } from './config.ts';

/**
 * Builds a large synthetic scene graph and benchmarks the common propagation pattern:
 * dirty a fixed subset of nodes, walk upward to collect ancestor state, then push
 * updated totals downward through each dirty node's descendants.
 *
 * To keep runs comparable, the dirty system precomputes deterministic batches whose
 * estimated traversal cost is balanced by depth and subtree size. That preserves the
 * same mixed leaf/group propagation case without the large per-iteration swings that
 * come from dirtying entities in raw creation order.
 */
export type SceneGraphVariant = 'child-of-exclusive' | 'child-of-not-exclusive' | 'ordered-relation';

export type SceneGraphContext = {
    world: World;
    dirty: (ctx: { world: World }) => void;
    propagate: (ctx: { world: World }) => void;
};

type SceneGraphBuild = {
    allEntities: Entity[];
    depthByEntityId: number[];
    subtreeSizeByEntityId: number[];
};

const deterministicValue = (index: number) => (index * 37) % 65;

function createTraits(variant: SceneGraphVariant) {
    const ChildOf =
        variant === 'child-of-not-exclusive' ? relation() : relation({ exclusive: true });
    const OrderedChildren = variant === 'ordered-relation' ? ordered(ChildOf) : null;
    const IsGroup = trait();
    const IsObject = trait();
    const Value = trait({ value: 0 });
    const TotalValue = trait({ value: 0 });

    return { ChildOf, OrderedChildren, IsGroup, IsObject, Value, TotalValue };
}

type Traits = ReturnType<typeof createTraits>;

function analyzeGraph(root: Entity, childrenByEntityId: Entity[][]) {
    const depthByEntityId: number[] = [];
    const subtreeSizeByEntityId: number[] = [];

    const visit = (entity: Entity, depth: number): number => {
        depthByEntityId[entity.id()] = depth;

        let subtreeSize = 1;
        const children = childrenByEntityId[entity.id()];
        if (children) {
            for (let i = 0; i < children.length; i++) {
                subtreeSize += visit(children[i], depth + 1);
            }
        }

        subtreeSizeByEntityId[entity.id()] = subtreeSize;
        return subtreeSize;
    };

    visit(root, 0);

    return { depthByEntityId, subtreeSizeByEntityId };
}

function buildGraph(world: World, traits: Traits): SceneGraphBuild {
    const { ChildOf, OrderedChildren, IsGroup, IsObject, Value, TotalValue } = traits;
    const { targetEntityCount, bottomLeafFraction, groupChildrenCycle, objectChildrenCycle } =
        CONFIG;
    const cap = targetEntityCount;
    const allEntities: Entity[] = [];
    const childrenByEntityId: Entity[][] = [];

    const spawnGroup = (index: number) => {
        const group = OrderedChildren
            ? world.spawn(IsGroup, OrderedChildren, Value({ value: deterministicValue(index) }))
            : world.spawn(IsGroup, Value({ value: deterministicValue(index) }));
        allEntities.push(group);
        return group;
    };

    const spawnLeaf = (index: number) => {
        const leaf = world.spawn(IsObject, Value({ value: deterministicValue(index) }), TotalValue);
        allEntities.push(leaf);
        return leaf;
    };

    const linkChildToParent = (child: Entity, parent: Entity) => {
        child.add(ChildOf(parent));
        (childrenByEntityId[parent.id()] ??= []).push(child);
    };

    let groupCycle = 0;
    let objectCycle = 0;
    let created = 0;
    let pending: Entity[] = [];

    const nextGroupCount = (remaining: number) => {
        const count = groupChildrenCycle[groupCycle++ % groupChildrenCycle.length];
        return Math.min(count, remaining);
    };

    const nextObjectCount = (remaining: number) => {
        const count = objectChildrenCycle[objectCycle++ % objectChildrenCycle.length];
        return Math.min(count, remaining);
    };

    const bottomLeafCount = Math.floor(cap * bottomLeafFraction);
    for (let i = 0; i < bottomLeafCount && created < cap; i++) {
        pending.push(spawnLeaf(created++));
    }

    while (pending.length > 1 && created < cap) {
        const nextPending: Entity[] = [];
        let pendingIndex = 0;

        while (pendingIndex < pending.length && created < cap) {
            const adoptCount = nextGroupCount(pending.length - pendingIndex);
            const group = spawnGroup(created++);

            for (let i = 0; i < adoptCount && pendingIndex < pending.length; i++) {
                linkChildToParent(pending[pendingIndex++], group);
            }

            const sprinkleCount = created < cap ? nextObjectCount(cap - created) : 0;
            for (let i = 0; i < sprinkleCount && created < cap; i++) {
                linkChildToParent(spawnLeaf(created++), group);
            }

            nextPending.push(group);
        }

        for (; pendingIndex < pending.length; pendingIndex++) {
            nextPending.push(pending[pendingIndex]);
        }

        pending = nextPending;
    }

    const root =
        pending.length === 1
            ? pending[0]
            : OrderedChildren
              ? world.spawn(IsGroup, OrderedChildren, Value({ value: 0 }))
              : world.spawn(IsGroup, Value({ value: 0 }));

    if (pending.length > 1) {
        for (let i = 0; i < pending.length; i++) {
            linkChildToParent(pending[i], root);
        }
    }

    if (created < cap) {
        const groups = world.query(IsGroup);
        let groupIndex = 0;
        while (created < cap) {
            linkChildToParent(spawnLeaf(created++), groups[groupIndex++ % groups.length]);
        }
    }

    const { depthByEntityId, subtreeSizeByEntityId } = analyzeGraph(root, childrenByEntityId);

    return { allEntities, depthByEntityId, subtreeSizeByEntityId };
}

function getEntityTraversalCost(
    entity: Entity,
    depthByEntityId: number[],
    subtreeSizeByEntityId: number[]
) {
    return subtreeSizeByEntityId[entity.id()] + depthByEntityId[entity.id()];
}

function selectLightestBatch(dirtyBatches: Entity[][], dirtyBatchCosts: number[], dirtyCount: number) {
    let bestBatchIndex = 0;

    for (let i = 1; i < dirtyBatches.length; i++) {
        if (dirtyBatches[i].length >= dirtyCount) continue;
        if (dirtyBatches[bestBatchIndex].length >= dirtyCount) {
            bestBatchIndex = i;
            continue;
        }
        if (dirtyBatchCosts[i] < dirtyBatchCosts[bestBatchIndex]) {
            bestBatchIndex = i;
        }
    }

    return bestBatchIndex;
}

function createDirtyBatches(
    allEntities: Entity[],
    dirtyCount: number,
    depthByEntityId: number[],
    subtreeSizeByEntityId: number[]
) {
    const batchCount = Math.max(1, Math.ceil(allEntities.length / dirtyCount));
    const dirtyBatches = Array.from({ length: batchCount }, () => [] as Entity[]);
    const dirtyBatchCosts = Array.from({ length: batchCount }, () => 0);
    const candidates = allEntities
        .map((entity) => ({
            entity,
            cost: getEntityTraversalCost(entity, depthByEntityId, subtreeSizeByEntityId),
        }))
        .sort((a, b) => b.cost - a.cost || a.entity - b.entity);

    // Greedy bin packing keeps each frame's total propagation cost close,
    // while cycling through fixed precomputed batches preserves determinism.
    for (let i = 0; i < candidates.length; i++) {
        const candidate = candidates[i];
        const batchIndex = selectLightestBatch(dirtyBatches, dirtyBatchCosts, dirtyCount);
        dirtyBatches[batchIndex].push(candidate.entity);
        dirtyBatchCosts[batchIndex] += candidate.cost;
    }

    // Top up any short batch with the cheapest entities so each frame dirties the same count.
    let fillerIndex = candidates.length - 1;
    for (let i = 0; i < dirtyBatches.length; i++) {
        while (dirtyBatches[i].length < dirtyCount) {
            dirtyBatches[i].push(candidates[fillerIndex].entity);
            fillerIndex = fillerIndex > 0 ? fillerIndex - 1 : candidates.length - 1;
        }
    }

    return dirtyBatches;
}

function createDirtySystem(
    allEntities: Entity[],
    Value: Traits['Value'],
    depthByEntityId: number[],
    subtreeSizeByEntityId: number[]
) {
    const dirtyCount = Math.max(1, Math.floor(allEntities.length * CONFIG.dirtyFraction));
    const dirtyBatches = createDirtyBatches(
        allEntities,
        dirtyCount,
        depthByEntityId,
        subtreeSizeByEntityId
    );

    let dirtyBatchIndex = 0;
    let frame = 0;

    return () => {
        const dirtyBatch = dirtyBatches[dirtyBatchIndex];

        for (let i = 0; i < dirtyBatch.length; i++) {
            const entity = dirtyBatch[i];
            entity.set(Value, { value: (frame + entity.id()) % 65 });
        }

        dirtyBatchIndex = (dirtyBatchIndex + 1) % dirtyBatches.length;
        frame++;
    };
}

function createPropagateSystem(traits: Pick<Traits, 'ChildOf' | 'OrderedChildren' | 'Value' | 'TotalValue'>) {
    const { ChildOf, OrderedChildren, Value, TotalValue } = traits;
    const Changed = createChanged();

    const collectAncestorSum = (entity: Entity) => {
        let sum = 0;
        let current = entity.targetFor(ChildOf);
        while (current) {
            sum += current.get(Value)!.value;
            current = current.targetFor(ChildOf);
        }
        return sum;
    };

    const propagateUnordered = (world: World, entity: Entity, ancestorSum: number) => {
        const total = ancestorSum + entity.get(Value)!.value;

        if (entity.has(TotalValue)) {
            entity.set(TotalValue, { value: total });
        }

        const children = world.query(ChildOf(entity));
        for (let i = 0; i < children.length; i++) {
            propagateUnordered(world, children[i], total);
        }
    };

    const propagateOrdered = (entity: Entity, ancestorSum: number) => {
        const total = ancestorSum + entity.get(Value)!.value;

        if (entity.has(TotalValue)) {
            entity.set(TotalValue, { value: total });
        }

        const children = entity.get(OrderedChildren!);
        if (!children) return;

        for (let i = 0; i < children.length; i++) {
            propagateOrdered(children[i], total);
        }
    };

    return ({ world }: { world: World }) => {
        const dirtyEntities = world.query(Changed(Value));
        for (let i = 0; i < dirtyEntities.length; i++) {
            const entity = dirtyEntities[i];
            const ancestorSum = collectAncestorSum(entity);
            if (OrderedChildren) {
                propagateOrdered(entity, ancestorSum);
            } else {
                propagateUnordered(world, entity, ancestorSum);
            }
        }
    };
}

export function createSceneGraphContext(variant: SceneGraphVariant): SceneGraphContext {
    const world = createWorld();
    const traits = createTraits(variant);
    const { allEntities, depthByEntityId, subtreeSizeByEntityId } = buildGraph(world, traits);

    const dirtyImpl = createDirtySystem(
        allEntities,
        traits.Value,
        depthByEntityId,
        subtreeSizeByEntityId
    );
    const propagate = createPropagateSystem(traits);

    return {
        world,
        dirty: () => dirtyImpl(),
        propagate,
    };
}
