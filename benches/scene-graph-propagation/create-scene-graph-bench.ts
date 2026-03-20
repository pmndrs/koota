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

export type SceneGraphVariant = 'child-of-exclusive' | 'child-of-not-exclusive' | 'ordered-relation';

export type SceneGraphContext = {
    world: World;
    dirty: (ctx: { world: World }) => void;
    propagate: (ctx: { world: World }) => void;
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

function buildGraph(world: World, traits: Traits): Entity[] {
    const { ChildOf, OrderedChildren, IsGroup, IsObject, Value, TotalValue } = traits;
    const { targetEntityCount, bottomLeafFraction, groupChildrenCycle, objectChildrenCycle } =
        CONFIG;
    const cap = targetEntityCount;
    const allEntities: Entity[] = [];

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
                pending[pendingIndex++].add(ChildOf(group));
            }

            const sprinkleCount = created < cap ? nextObjectCount(cap - created) : 0;
            for (let i = 0; i < sprinkleCount && created < cap; i++) {
                spawnLeaf(created++).add(ChildOf(group));
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
            pending[i].add(ChildOf(root));
        }
    }

    if (created < cap) {
        const groups = world.query(IsGroup);
        let groupIndex = 0;
        while (created < cap) {
            spawnLeaf(created++).add(ChildOf(groups[groupIndex++ % groups.length]));
        }
    }

    return allEntities;
}

function createDirtySystem(allEntities: Entity[], Value: Traits['Value']) {
    let dirtyOffset = 0;
    let frame = 0;

    return () => {
        const count = Math.max(1, Math.floor(allEntities.length * CONFIG.dirtyFraction));

        for (let i = 0; i < count; i++) {
            const index = (dirtyOffset + i) % allEntities.length;
            allEntities[index].set(Value, { value: (frame + index) % 65 });
        }

        dirtyOffset = (dirtyOffset + count) % allEntities.length;
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
    const allEntities = buildGraph(world, traits);

    const dirtyImpl = createDirtySystem(allEntities, traits.Value);
    const propagate = createPropagateSystem(traits);

    return {
        world,
        dirty: () => dirtyImpl(),
        propagate,
    };
}
